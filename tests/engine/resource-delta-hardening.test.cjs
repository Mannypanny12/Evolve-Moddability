'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const deltaPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-delta.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    return Object.assign({}, ...await Promise.all([deltaPromise, identityPromise]));
}

function bounded(value){
    return { mode: 'bounded', value };
}

test('M4C unclipped fractional operations never manufacture negative overflow or shortfall from floating-point subtraction', async () => {
    const { resolveResourceDelta } = await modules();
    const credited = resolveResourceDelta({
        startAmount: 0.1,
        capacity: bounded(10),
        operations: [{ kind: 'credit', amount: 0.2 }],
    });
    const debited = resolveResourceDelta({
        startAmount: 0.3,
        capacity: bounded(10),
        operations: [{ kind: 'debit', amount: 0.1 }],
    });

    assert.equal(credited.steps[0].overflow, 0);
    assert.equal(credited.overflow, 0);
    assert.equal(debited.steps[0].shortfall, 0);
    assert.equal(debited.shortfall, 0);
});

test('M4C direct resource-delta contract fails closed on accessors, symbols, exotic prototypes and hostile inspection', async () => {
    const { resolveResourceDelta, EngineContractError } = await modules();

    const accessor = {};
    Object.defineProperty(accessor, 'startAmount', {
        enumerable: true,
        get(){ throw new Error('must not execute'); },
    });
    Object.defineProperty(accessor, 'capacity', {
        enumerable: true,
        value: bounded(10),
    });
    Object.defineProperty(accessor, 'operations', {
        enumerable: true,
        value: [],
    });

    const symbolInput = {
        startAmount: 0,
        capacity: bounded(10),
        operations: [],
        [Symbol('hidden')]: true,
    };
    const exotic = Object.create({ inherited: true });
    Object.assign(exotic, {
        startAmount: 0,
        capacity: bounded(10),
        operations: [],
    });
    const hostile = new Proxy({}, {
        getPrototypeOf(){ throw new Error('hostile prototype'); },
    });

    for (const input of [accessor, symbolInput, exotic, hostile]){
        assert.throws(
            () => resolveResourceDelta(input),
            error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_DELTA'
        );
    }
});
