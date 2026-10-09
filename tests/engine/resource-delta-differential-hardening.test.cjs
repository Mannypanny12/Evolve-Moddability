'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const deltaPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-delta.mjs')).href);

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

const OPERATION_SEQUENCES = Object.freeze([
    Object.freeze([]),
    Object.freeze([{ kind: 'credit', amount: 0 }]),
    Object.freeze([{ kind: 'debit', amount: 0 }]),
    Object.freeze([{ kind: 'credit', amount: 1 }]),
    Object.freeze([{ kind: 'debit', amount: 1 }]),
    Object.freeze([{ kind: 'credit', amount: 5 }]),
    Object.freeze([{ kind: 'debit', amount: 5 }]),
    Object.freeze([{ kind: 'credit', amount: 100 }]),
    Object.freeze([{ kind: 'debit', amount: 100 }]),
    Object.freeze([{ kind: 'credit', amount: 5 }, { kind: 'debit', amount: 2 }]),
    Object.freeze([{ kind: 'debit', amount: 5 }, { kind: 'credit', amount: 2 }]),
    Object.freeze([{ kind: 'credit', amount: 100 }, { kind: 'debit', amount: 100 }]),
    Object.freeze([{ kind: 'debit', amount: 100 }, { kind: 'credit', amount: 100 }]),
    Object.freeze([{ kind: 'debit', amount: 2 }, { kind: 'debit', amount: 10 }, { kind: 'credit', amount: 20 }]),
    Object.freeze([{ kind: 'credit', amount: 20 }, { kind: 'debit', amount: 10 }, { kind: 'credit', amount: 2 }]),
]);

test('M4C resource-delta amount and working-ceiling semantics match the legacy buffer algorithm across a deterministic matrix', async () => {
    const { resolveResourceDelta } = await deltaPromise;
    const capacities = [bounded(0), bounded(1), bounded(5), bounded(100), { mode: 'unbounded' }];
    const starts = [0, 1, 5, 100];

    for (const capacity of capacities){
        for (const startAmount of starts){
            for (const operations of OPERATION_SEQUENCES){
                const input = { startAmount, capacity, operations };
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
                assert.equal(actual.overflow >= 0, true);
                assert.equal(actual.shortfall >= 0, true);
                for (const step of actual.steps){
                    assert.equal(step.overflow >= 0, true);
                    assert.equal(step.shortfall >= 0, true);
                }
            }
        }
    }
});
