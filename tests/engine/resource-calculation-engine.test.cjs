'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const primitivesPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-primitives.mjs')).href);

async function modules(){
    return Object.assign({}, ...await Promise.all([enginePromise, primitivesPromise]));
}

function registration(id, calculateBase, overrides = {}){
    return {
        id,
        validateInputs(inputs){ return inputs; },
        calculateBase,
        ...overrides,
    };
}

test('M4C numerical primitives compose through the existing M4A/M4B runner without a new engine surface', async () => {
    const {
        createCalculationEngine,
        calculateProduction,
        calculateConsumption,
        calculateCapacity,
        calculateStorageCapacity,
    } = await modules();

    const engine = createCalculationEngine({
        registrations: [
            registration('example:calculation/production', calculateProduction),
            registration('example:calculation/consumption', calculateConsumption),
            registration('example:calculation/capacity', calculateCapacity),
            registration('example:calculation/storage', calculateStorageCapacity),
        ],
        modifiers: [{
            id: 'example:modifier/double-production',
            calculationId: 'example:calculation/production',
            order: 10,
            operation: 'multiply',
            operand(){ return 2; },
        }],
    });

    assert.equal(engine.calculate({
        id: 'example:calculation/production',
        inputs: { contributions: [2, 3] },
    }).value, 10);
    assert.equal(engine.calculate({
        id: 'example:calculation/consumption',
        inputs: { contributions: [2, 3] },
    }).value, 5);
    assert.equal(engine.calculate({
        id: 'example:calculation/capacity',
        inputs: { baseCapacity: 100, additions: [25, 50] },
    }).value, 175);
    assert.equal(engine.calculate({
        id: 'example:calculation/storage',
        inputs: { quantity: 4, capacityPerUnit: 250 },
    }).value, 1000);

    assert.deepEqual(Object.keys(engine), ['calculate', 'explain', 'has', 'ids']);
    assert.equal(Object.isFrozen(engine), true);
});

test('M4C calculate and explain retain ordinary M4B modifier trace semantics', async () => {
    const { createCalculationEngine, calculateProduction } = await modules();
    const engine = createCalculationEngine({
        registrations: [registration('example:calculation/production', calculateProduction)],
        modifiers: [{
            id: 'example:modifier/double-production',
            calculationId: 'example:calculation/production',
            order: 10,
            operation: 'multiply',
            operand(){ return 2; },
        }],
    });
    const context = {
        id: 'example:calculation/production',
        inputs: { contributions: [2, 3] },
    };

    const calculated = engine.calculate(context);
    const explained = engine.explain(context);

    assert.equal(calculated.value, 10);
    assert.equal(calculated.trace, null);
    assert.equal(explained.value, 10);
    assert.deepEqual(explained.trace.inputs, { contributions: [2, 3] });
    assert.deepEqual(explained.trace.steps, [
        { kind: 'base', before: null, after: 5 },
        {
            kind: 'modifier',
            modifierId: 'example:modifier/double-production',
            operation: 'multiply',
            order: 10,
            applied: true,
            operand: 2,
            before: 5,
            after: 10,
        },
    ]);
});
