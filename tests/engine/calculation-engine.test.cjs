'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [engine, identity] = await Promise.all([enginePromise, identityPromise]);
    return { ...engine, ...identity };
}

function workerRegistration(observations = {}){
    return {
        id: 'example:calculation/worker-output',
        validateInputs(inputs){
            observations.validatorThis = this;
            observations.validatorInputs = inputs;
            if (typeof inputs.workers !== 'number' || typeof inputs.outputPerWorker !== 'number'){
                throw new Error('numeric worker inputs required');
            }
            return {
                workers: inputs.workers,
                outputPerWorker: inputs.outputPerWorker,
            };
        },
        calculateBase(inputs){
            observations.calculatorThis = this;
            observations.calculatorInputs = inputs;
            observations.calls = (observations.calls || 0) + 1;
            return inputs.workers * inputs.outputPerWorker;
        },
    };
}

test('M4A named calculation uses detached frozen explicit inputs and returns a frozen scalar result', async () => {
    const { createCalculationEngine } = await modules();
    const observations = {};
    const engine = createCalculationEngine({ registrations: [workerRegistration(observations)] });
    const inputs = { workers: 4, outputPerWorker: 10 };

    const result = engine.calculate({
        id: 'example:calculation/worker-output',
        inputs,
    });

    assert.deepEqual(result, {
        calculationId: 'example:calculation/worker-output',
        value: 40,
        trace: null,
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(observations.validatorThis, undefined);
    assert.equal(observations.calculatorThis, undefined);
    assert.equal(Object.isFrozen(observations.validatorInputs), true);
    assert.equal(Object.isFrozen(observations.calculatorInputs), true);
    assert.notEqual(observations.validatorInputs, inputs);
    assert.notEqual(observations.calculatorInputs, observations.validatorInputs);

    inputs.workers = 999;
    assert.equal(observations.calculatorInputs.workers, 4);
});

test('M4A calculation engine exposes fixed unique calculation registrations in deterministic order', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const first = workerRegistration();
    const second = {
        ...workerRegistration(),
        id: 'example:calculation/alpha',
    };

    assert.throws(
        () => createCalculationEngine({ registrations: [first, first] }),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_CALCULATION_ID'
    );

    const engine = createCalculationEngine({ registrations: [first, second] });
    assert.deepEqual(engine.ids(), [
        'example:calculation/alpha',
        'example:calculation/worker-output',
    ]);
    assert.equal(Object.isFrozen(engine.ids()), true);
    assert.equal(engine.has('example:calculation/worker-output'), true);
    assert.equal(engine.has('example:calculation/missing'), false);
    assert.deepEqual(Object.keys(engine), ['calculate', 'explain', 'has', 'ids']);
    assert.equal(Object.isFrozen(engine), true);
});

test('M4A explain uses the same calculation path and emits one frozen base trace step', async () => {
    const { createCalculationEngine } = await modules();
    const observations = {};
    const engine = createCalculationEngine({ registrations: [workerRegistration(observations)] });
    const context = {
        id: 'example:calculation/worker-output',
        inputs: { workers: 4, outputPerWorker: 10 },
    };

    const calculated = engine.calculate(context);
    const explained = engine.explain(context);

    assert.equal(calculated.value, explained.value);
    assert.equal(observations.calls, 2);
    assert.deepEqual(explained, {
        calculationId: 'example:calculation/worker-output',
        value: 40,
        trace: {
            inputs: { outputPerWorker: 10, workers: 4 },
            steps: [{ kind: 'base', before: null, after: 40 }],
        },
    });
    assert.equal(Object.isFrozen(explained), true);
    assert.equal(Object.isFrozen(explained.trace), true);
    assert.equal(Object.isFrozen(explained.trace.inputs), true);
    assert.equal(Object.isFrozen(explained.trace.steps), true);
    assert.equal(Object.isFrozen(explained.trace.steps[0]), true);
    assert.equal(explained.trace.steps.at(-1).after, explained.value);
});

test('M4A calculations accept zero, negative, and fractional finite results and normalize negative zero', async () => {
    const { createCalculationEngine } = await modules();
    const values = [0, -2.5, 0.125, -0];
    for (let index = 0; index < values.length; index++){
        const id = `example:calculation/value-${index}`;
        const engine = createCalculationEngine({
            registrations: [{
                id,
                validateInputs(){ return {}; },
                calculateBase(){ return values[index]; },
            }],
        });
        const result = engine.calculate({ id, inputs: {} });
        assert.equal(result.value, Object.is(values[index], -0) ? 0 : values[index]);
        assert.equal(Object.is(result.value, -0), false);
    }
});

test('M4A calculation contexts are closed and calculation IDs reuse the canonical content-ID grammar', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const engine = createCalculationEngine({ registrations: [workerRegistration()] });

    assert.throws(
        () => engine.calculate({
            id: 'example:command/worker-output',
            inputs: { workers: 1, outputPerWorker: 1 },
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_ID'
    );
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/worker-output',
            inputs: { workers: 1, outputPerWorker: 1 },
            hiddenState: {},
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_CONTEXT'
    );
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/missing',
            inputs: {},
        }),
        error => error instanceof EngineContractError && error.code === 'UNKNOWN_CALCULATION_ID'
    );
});
