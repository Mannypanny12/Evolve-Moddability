'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const deltaPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-delta.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/common.mjs')).href);

async function modules(){
    return Object.assign({}, ...await Promise.all([deltaPromise, identityPromise, commonPromise]));
}

function bounded(value){
    return { mode: 'bounded', value };
}

function legacyResolveReference({ startAmount, capacity, operations }){
    let amount = startAmount;
    let tempMax = capacity.mode === 'bounded' ? capacity.value : -1;
    if (tempMax > 0){
        tempMax += startAmount;
    }
    const steps = [];

    for (const operation of operations){
        const before = amount;
        const workingCapacityBefore = capacity.mode === 'bounded' ? tempMax : null;
        const delta = operation.kind === 'credit' ? operation.amount : -operation.amount;
        let count = amount + delta;
        if (count > tempMax && tempMax >= 0){
            count = tempMax;
        }
        else if (count < 0){
            count = 0;
        }
        amount = count;
        if (delta < 0 && tempMax >= 0){
            tempMax = Math.max(0, tempMax + delta);
        }
        steps.push({
            before,
            after: amount,
            workingCapacityBefore,
            workingCapacityAfter: capacity.mode === 'bounded' ? tempMax : null,
        });
    }

    const bufferedEndAmount = amount;
    const endAmount = capacity.mode === 'bounded' && amount > capacity.value
        ? capacity.value
        : amount;
    return { bufferedEndAmount, endAmount, steps };
}

test('M4C bounded resolution preserves legacy produce-then-consume buffering at capacity', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 100,
        capacity: bounded(100),
        operations: [
            { kind: 'credit', amount: 10 },
            { kind: 'debit', amount: 10 },
        ],
    });

    assert.equal(result.bufferedEndAmount, 100);
    assert.equal(result.endAmount, 100);
    assert.equal(result.requestedDelta, 0);
    assert.equal(result.operationAppliedDelta, 0);
    assert.equal(result.netAppliedDelta, 0);
    assert.equal(result.overflow, 0);
    assert.equal(result.shortfall, 0);
    assert.equal(result.finalCapacityDiscard, 0);
    assert.equal(result.steps[0].workingCapacityBefore, 200);
    assert.equal(result.steps[0].after, 110);
    assert.equal(result.steps[1].workingCapacityAfter, 190);
});

test('M4C ordered deltas are never pre-netted', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 0,
        capacity: bounded(100),
        operations: [
            { kind: 'debit', amount: 10 },
            { kind: 'credit', amount: 10 },
        ],
    });

    assert.equal(result.requestedDelta, 0);
    assert.equal(result.shortfall, 10);
    assert.equal(result.operationAppliedDelta, 10);
    assert.equal(result.netAppliedDelta, 10);
    assert.equal(result.endAmount, 10);
    assert.deepEqual(result.steps.map(step => step.after), [0, 10]);
});

test('M4C debits reduce the bounded working ceiling by the requested debit just like legacy modRes tracking', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 3,
        capacity: bounded(100),
        operations: [
            { kind: 'debit', amount: 5 },
            { kind: 'credit', amount: 100 },
        ],
    });

    assert.equal(result.steps[0].shortfall, 2);
    assert.equal(result.steps[0].workingCapacityBefore, 103);
    assert.equal(result.steps[0].workingCapacityAfter, 98);
    assert.equal(result.steps[1].after, 98);
    assert.equal(result.steps[1].overflow, 2);
    assert.equal(result.endAmount, 98);
});

test('M4C distinguishes requested, operation-applied, final-applied, overflow and final capacity discard', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 100,
        capacity: bounded(100),
        operations: [
            { kind: 'credit', amount: 150 },
        ],
    });

    assert.equal(result.requestedDelta, 150);
    assert.equal(result.operationAppliedDelta, 100);
    assert.equal(result.bufferedEndAmount, 200);
    assert.equal(result.overflow, 50);
    assert.equal(result.finalCapacityDiscard, 100);
    assert.equal(result.endAmount, 100);
    assert.equal(result.netAppliedDelta, 0);
});

test('M4C final capacity cleanup handles pre-existing amounts above a reduced bound', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 150,
        capacity: bounded(100),
        operations: [],
    });

    assert.equal(result.bufferedEndAmount, 150);
    assert.equal(result.finalCapacityDiscard, 50);
    assert.equal(result.endAmount, 100);
    assert.equal(result.netAppliedDelta, -50);
});

test('M4C bounded zero capacity is explicit and follows the legacy zero-buffer branch', async () => {
    const { resolveResourceDelta } = await modules();
    const boundedZero = resolveResourceDelta({
        startAmount: 5,
        capacity: bounded(0),
        operations: [{ kind: 'credit', amount: 10 }],
    });
    const unbounded = resolveResourceDelta({
        startAmount: 5,
        capacity: { mode: 'unbounded' },
        operations: [{ kind: 'credit', amount: 10 }],
    });

    assert.equal(boundedZero.steps[0].workingCapacityBefore, 0);
    assert.equal(boundedZero.steps[0].after, 0);
    assert.equal(boundedZero.steps[0].appliedDelta, -5);
    assert.equal(boundedZero.bufferedEndAmount, 0);
    assert.equal(boundedZero.operationAppliedDelta, -5);
    assert.equal(boundedZero.overflow, 15);
    assert.equal(boundedZero.endAmount, 0);
    assert.equal(boundedZero.finalCapacityDiscard, 0);
    assert.equal(unbounded.endAmount, 15);
    assert.equal(unbounded.overflow, 0);
    assert.equal(unbounded.finalCapacityDiscard, 0);
    assert.equal(unbounded.steps[0].workingCapacityBefore, null);
});

test('M4C bounded-zero debit applies the legacy upper clamp before the zero floor', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 5,
        capacity: bounded(0),
        operations: [
            { kind: 'debit', amount: 2 },
            { kind: 'credit', amount: 10 },
        ],
    });

    assert.equal(result.steps[0].before, 5);
    assert.equal(result.steps[0].after, 0);
    assert.equal(result.steps[0].appliedDelta, -5);
    assert.equal(result.steps[0].shortfall, 0);
    assert.equal(result.steps[0].workingCapacityAfter, 0);
    assert.equal(result.steps[1].before, 0);
    assert.equal(result.steps[1].after, 0);
    assert.equal(result.steps[1].overflow, 10);
    assert.equal(result.endAmount, 0);
});

test('M4C ordered resolution differentially matches the legacy resetResBuffer/modRes amount and ceiling semantics', async () => {
    const { resolveResourceDelta } = await modules();
    const cases = [
        {
            startAmount: 100,
            capacity: bounded(100),
            operations: [{ kind: 'credit', amount: 10 }, { kind: 'debit', amount: 10 }],
        },
        {
            startAmount: 0,
            capacity: bounded(100),
            operations: [{ kind: 'debit', amount: 10 }, { kind: 'credit', amount: 10 }],
        },
        {
            startAmount: 3,
            capacity: bounded(100),
            operations: [{ kind: 'debit', amount: 5 }, { kind: 'credit', amount: 100 }],
        },
        {
            startAmount: 5,
            capacity: bounded(0),
            operations: [{ kind: 'credit', amount: 10 }],
        },
        {
            startAmount: 5,
            capacity: bounded(0),
            operations: [{ kind: 'debit', amount: 2 }, { kind: 'credit', amount: 10 }],
        },
        {
            startAmount: 5,
            capacity: bounded(0),
            operations: [{ kind: 'debit', amount: 10 }, { kind: 'credit', amount: 10 }],
        },
        {
            startAmount: 5,
            capacity: { mode: 'unbounded' },
            operations: [{ kind: 'credit', amount: 10 }, { kind: 'debit', amount: 3 }],
        },
    ];

    for (const input of cases){
        const expected = legacyResolveReference(input);
        const actual = resolveResourceDelta(input);
        assert.equal(actual.bufferedEndAmount, expected.bufferedEndAmount);
        assert.equal(actual.endAmount, expected.endAmount);
        assert.deepEqual(
            actual.steps.map(step => ({
                before: step.before,
                after: step.after,
                workingCapacityBefore: step.workingCapacityBefore,
                workingCapacityAfter: step.workingCapacityAfter,
            })),
            expected.steps
        );
    }
});

test('M4C debit shortfall is a structured gameplay result rather than a contract error', async () => {
    const { resolveResourceDelta } = await modules();
    const result = resolveResourceDelta({
        startAmount: 3,
        capacity: bounded(100),
        operations: [{ kind: 'debit', amount: 5 }],
    });

    assert.equal(result.endAmount, 0);
    assert.equal(result.shortfall, 2);
    assert.equal(result.steps[0].appliedDelta, -3);
    assert.equal(result.steps[0].shortfall, 2);
});

test('M4C delta results are deeply frozen inert evidence', async () => {
    const { resolveResourceDelta } = await modules();
    const raw = {
        startAmount: 1,
        capacity: bounded(5),
        operations: [{ kind: 'credit', amount: 2 }],
    };
    const result = resolveResourceDelta(raw);

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.capacity), true);
    assert.equal(Object.isFrozen(result.steps), true);
    assert.equal(Object.isFrozen(result.steps[0]), true);
    assert.notStrictEqual(result.capacity, raw.capacity);
    assert.notStrictEqual(result.steps[0], raw.operations[0]);
});

test('M4C delta contracts reject malformed capacities, operations and arithmetic overflow', async () => {
    const {
        resolveResourceDelta,
        EngineContractError,
        MAX_CALCULATION_COLLECTION_LENGTH,
    } = await modules();

    const invalidCases = [
        { startAmount: -1, capacity: bounded(10), operations: [] },
        { startAmount: 0, capacity: { mode: 'bounded' }, operations: [] },
        { startAmount: 0, capacity: { mode: 'unbounded', value: 10 }, operations: [] },
        { startAmount: 0, capacity: { mode: 'mystery' }, operations: [] },
        { startAmount: 0, capacity: bounded(10), operations: [{ kind: 'credit', amount: -1 }] },
        { startAmount: 0, capacity: bounded(10), operations: [{ kind: 'mystery', amount: 1 }] },
        { startAmount: 0, capacity: bounded(10), operations: [{ kind: 'credit', amount: 1, hidden: true }] },
        { startAmount: 0, capacity: bounded(10), operations: [], hidden: true },
    ];
    for (const input of invalidCases){
        assert.throws(
            () => resolveResourceDelta(input),
            error => error instanceof EngineContractError
                && (error.code === 'INVALID_RESOURCE_DELTA' || error.code === 'INVALID_RESOURCE_CAPACITY')
        );
    }

    const sparse = new Array(2);
    sparse[0] = { kind: 'credit', amount: 1 };
    assert.throws(
        () => resolveResourceDelta({ startAmount: 0, capacity: bounded(10), operations: sparse }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_DELTA'
    );

    const oversized = new Array(MAX_CALCULATION_COLLECTION_LENGTH + 1).fill(null)
        .map(() => ({ kind: 'credit', amount: 0 }));
    assert.throws(
        () => resolveResourceDelta({ startAmount: 0, capacity: bounded(10), operations: oversized }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_DELTA'
    );

    assert.throws(
        () => resolveResourceDelta({
            startAmount: Number.MAX_VALUE,
            capacity: bounded(Number.MAX_VALUE),
            operations: [],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_DELTA'
    );

    assert.throws(
        () => resolveResourceDelta({
            startAmount: Number.MAX_VALUE,
            capacity: { mode: 'unbounded' },
            operations: [{ kind: 'credit', amount: Number.MAX_VALUE }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_DELTA'
    );
});
