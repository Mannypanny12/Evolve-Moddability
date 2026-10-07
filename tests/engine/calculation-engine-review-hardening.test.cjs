'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-result.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [engine, result, common, identity] = await Promise.all([
        enginePromise,
        resultPromise,
        commonPromise,
        identityPromise,
    ]);
    return { ...engine, ...result, ...common, ...identity };
}

function registration(overrides = {}){
    return {
        id: 'example:calculation/review-hardening',
        validateInputs(inputs){ return inputs; },
        calculateBase(){ return 1; },
        ...overrides,
    };
}

test('M4A direct result construction enforces canonical calculation identity', async () => {
    const { createCalculationResult, EngineContractError } = await modules();

    for (const invalidId of [
        'example:command/not-a-calculation',
        'Example:calculation/not-canonical',
        null,
    ]){
        assert.throws(
            () => createCalculationResult(invalidId, 1),
            error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_ID'
        );
    }

    assert.deepEqual(
        createCalculationResult('example:calculation/direct-result', 2),
        {
            calculationId: 'example:calculation/direct-result',
            value: 2,
            trace: null,
        }
    );
});

test('M4A revalidates hostile validator output before the evaluator can observe it', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    let getterCalls = 0;
    let evaluatorCalls = 0;
    const validated = {};
    Object.defineProperty(validated, 'danger', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });

    const engine = createCalculationEngine({
        registrations: [registration({
            validateInputs(){ return validated; },
            calculateBase(){
                evaluatorCalls++;
                return 1;
            },
        })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/review-hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_DATA'
            && error.details.phase === 'validate'
    );
    assert.equal(getterCalls, 0);
    assert.equal(evaluatorCalls, 0);
});

test('M4A thenable inspection rejects accessor-backed then without executing it', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    let thenGetterCalls = 0;
    const validated = {};
    Object.defineProperty(validated, 'then', {
        enumerable: true,
        get(){
            thenGetterCalls++;
            return () => {};
        },
    });

    const engine = createCalculationEngine({
        registrations: [registration({ validateInputs(){ return validated; } })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/review-hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_INPUTS'
            && error.details.phase === 'validate'
    );
    assert.equal(thenGetterCalls, 0);
});

test('M4A rejects exotic and hostile input objects and releases the evaluation lock afterward', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const engine = createCalculationEngine({ registrations: [registration()] });

    const exotic = Object.create({ inherited: true });
    exotic.value = 1;
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/review-hardening',
            inputs: { exotic },
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_DATA'
            && error.details.phase === 'context'
    );

    let prototypeTrapCalls = 0;
    const hostile = new Proxy({}, {
        getPrototypeOf(){
            prototypeTrapCalls++;
            throw new Error('hostile prototype trap');
        },
    });
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/review-hardening',
            inputs: hostile,
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_DATA'
            && error.details.phase === 'context'
    );
    assert.equal(prototypeTrapCalls > 0, true);

    assert.equal(
        engine.calculate({ id: 'example:calculation/review-hardening', inputs: {} }).value,
        1
    );
});

test('M4A enforces collection and object-field limits in addition to nesting depth', async () => {
    const {
        createCalculationEngine,
        EngineContractError,
        MAX_CALCULATION_COLLECTION_LENGTH,
        MAX_CALCULATION_OBJECT_FIELDS,
    } = await modules();
    const engine = createCalculationEngine({ registrations: [registration()] });

    const oversizedArray = new Array(MAX_CALCULATION_COLLECTION_LENGTH + 1).fill(0);
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/review-hardening',
            inputs: { oversizedArray },
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_DATA'
            && error.details.phase === 'context'
    );

    const oversizedObject = {};
    for (let index = 0; index <= MAX_CALCULATION_OBJECT_FIELDS; index++){
        oversizedObject[`field${index}`] = index;
    }
    assert.throws(
        () => engine.calculate({
            id: 'example:calculation/review-hardening',
            inputs: oversizedObject,
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_DATA'
            && error.details.phase === 'context'
    );
});

test('M4A engine construction rejects hidden registration fields and sparse registration arrays', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();

    assert.throws(
        () => createCalculationEngine({
            registrations: [{ ...registration(), hiddenState: {} }],
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_REGISTRATION'
    );

    const sparseRegistrations = new Array(1);
    assert.throws(
        () => createCalculationEngine({ registrations: sparseRegistrations }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_ENGINE_CONFIG'
    );
});
