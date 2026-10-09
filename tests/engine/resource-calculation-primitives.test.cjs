'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const primitivesPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-primitives.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/common.mjs')).href);

async function modules(){
    return Object.assign({}, ...await Promise.all([primitivesPromise, identityPromise, commonPromise]));
}

test('M4C production and consumption sum explicit non-negative contributions', async () => {
    const { calculateProduction, calculateConsumption } = await modules();

    assert.equal(calculateProduction({ contributions: [10, 4, 2] }), 16);
    assert.equal(calculateConsumption({ contributions: [3, 2] }), 5);
    assert.equal(calculateProduction({ contributions: [] }), 0);
    assert.equal(calculateConsumption({ contributions: [] }), 0);
    assert.equal(Object.is(calculateProduction({ contributions: [-0] }), -0), false);
});

test('M4C capacity keeps base capacity separate from additive storage or other capacity sources', async () => {
    const { calculateCapacity, calculateStorageCapacity } = await modules();

    assert.equal(calculateStorageCapacity({ quantity: 4, capacityPerUnit: 250 }), 1000);
    assert.equal(calculateCapacity({ baseCapacity: 100, additions: [50, 25, 1000] }), 1175);
    assert.equal(calculateCapacity({ baseCapacity: 0, additions: [] }), 0);
});

test('M4C resource primitives reject negative, non-finite, sparse, oversized and open inputs', async () => {
    const {
        calculateProduction,
        calculateConsumption,
        calculateCapacity,
        calculateStorageCapacity,
        EngineContractError,
        MAX_CALCULATION_COLLECTION_LENGTH,
    } = await modules();

    assert.throws(
        () => calculateProduction({ contributions: [1, -1] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_PRODUCTION'
    );
    assert.throws(
        () => calculateConsumption({ contributions: [Infinity] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_CONSUMPTION'
    );
    assert.throws(
        () => calculateCapacity({ baseCapacity: NaN, additions: [] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_CAPACITY_CALCULATION'
    );
    assert.throws(
        () => calculateStorageCapacity({ quantity: 1, capacityPerUnit: -1 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_STORAGE_CALCULATION'
    );
    assert.throws(
        () => calculateProduction({ contributions: [1], hidden: true }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_PRODUCTION'
    );

    const sparse = new Array(2);
    sparse[0] = 1;
    assert.throws(
        () => calculateProduction({ contributions: sparse }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_PRODUCTION'
    );

    const oversized = new Array(MAX_CALCULATION_COLLECTION_LENGTH + 1).fill(1);
    assert.throws(
        () => calculateProduction({ contributions: oversized }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_PRODUCTION'
    );
});

test('M4C resource primitives reject arithmetic overflow rather than leaking Infinity', async () => {
    const {
        calculateProduction,
        calculateCapacity,
        calculateStorageCapacity,
        EngineContractError,
    } = await modules();

    assert.throws(
        () => calculateProduction({ contributions: [Number.MAX_VALUE, Number.MAX_VALUE] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_PRODUCTION'
    );
    assert.throws(
        () => calculateCapacity({ baseCapacity: Number.MAX_VALUE, additions: [Number.MAX_VALUE] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_CAPACITY_CALCULATION'
    );
    assert.throws(
        () => calculateStorageCapacity({ quantity: Number.MAX_VALUE, capacityPerUnit: 2 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_STORAGE_CALCULATION'
    );
});
