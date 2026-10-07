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

function registration(overrides = {}){
    return {
        id: 'example:calculation/hardening',
        validateInputs(inputs){ return inputs; },
        calculateBase(){ return 1; },
        ...overrides,
    };
}

test('M4A rejects non-finite and non-numeric base results as hard contract failures', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    for (const value of [NaN, Infinity, -Infinity, '1', null, undefined]){
        const engine = createCalculationEngine({
            registrations: [registration({ calculateBase(){ return value; } })],
        });
        assert.throws(
            () => engine.calculate({ id: 'example:calculation/hardening', inputs: {} }),
            error => error instanceof EngineContractError
                && error.code === 'INVALID_CALCULATION_RESULT'
                && error.details.calculationId === 'example:calculation/hardening'
                && error.details.phase === 'result'
        );
    }
});

test('M4A rejects declared async, generators, classes, and runtime thenable leakage', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();

    for (const invalid of [async function(){}, function*(){ yield 1; }, class Invalid {}]){
        assert.throws(
            () => createCalculationEngine({ registrations: [registration({ validateInputs: invalid })] }),
            error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_REGISTRATION'
        );
        assert.throws(
            () => createCalculationEngine({ registrations: [registration({ calculateBase: invalid })] }),
            error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_REGISTRATION'
        );
    }

    const validateThenable = createCalculationEngine({
        registrations: [registration({ validateInputs(){ return Promise.resolve({}); } })],
    });
    assert.throws(
        () => validateThenable.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_INPUTS'
            && error.details.phase === 'validate'
    );

    const calculateThenable = createCalculationEngine({
        registrations: [registration({ calculateBase(){ return Promise.resolve(1); } })],
    });
    assert.throws(
        () => calculateThenable.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT'
            && error.details.phase === 'calculate'
    );
});

test('M4A enriches unexpected validator/evaluator failures with stable calculation phase context', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();

    const validatorFailure = createCalculationEngine({
        registrations: [registration({ validateInputs(){ throw new Error('broken validator'); } })],
    });
    assert.throws(
        () => validatorFailure.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'CALCULATION_INPUT_VALIDATOR_FAILURE'
            && error.details.calculationId === 'example:calculation/hardening'
            && error.details.phase === 'validate'
    );

    const evaluatorFailure = createCalculationEngine({
        registrations: [registration({ calculateBase(){ throw new Error('broken evaluator'); } })],
    });
    assert.throws(
        () => evaluatorFailure.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError
            && error.code === 'CALCULATION_EVALUATOR_FAILURE'
            && error.details.calculationId === 'example:calculation/hardening'
            && error.details.phase === 'calculate'
    );
});

test('M4A rejects same-instance and cross-instance nested evaluation and recovers the global evaluation lock', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();

    let first;
    const nested = registration({
        calculateBase(){
            return first.calculate({ id: 'example:calculation/hardening', inputs: {} }).value;
        },
    });
    first = createCalculationEngine({ registrations: [nested] });
    assert.throws(
        () => first.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError && error.code === 'CALCULATION_REENTRANCY'
    );

    const second = createCalculationEngine({
        registrations: [registration({
            id: 'example:calculation/second',
            calculateBase(){ return 2; },
        })],
    });
    const cross = createCalculationEngine({
        registrations: [registration({
            calculateBase(){
                return second.explain({ id: 'example:calculation/second', inputs: {} }).value;
            },
        })],
    });
    assert.throws(
        () => cross.calculate({ id: 'example:calculation/hardening', inputs: {} }),
        error => error instanceof EngineContractError && error.code === 'CALCULATION_REENTRANCY'
    );

    const recovered = second.calculate({ id: 'example:calculation/second', inputs: {} });
    assert.equal(recovered.value, 2);
});

test('M4A rejects hostile, cyclic, repeated-identity, sparse, symbol-keyed, accessor-backed and function inputs', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const engine = createCalculationEngine({ registrations: [registration()] });
    const evaluate = inputs => engine.calculate({ id: 'example:calculation/hardening', inputs });

    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => evaluate(cyclic), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');

    const shared = {};
    assert.throws(() => evaluate({ a: shared, b: shared }), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');

    const sparse = new Array(2);
    sparse[1] = 1;
    assert.throws(() => evaluate({ sparse }), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');

    const symbolic = {};
    symbolic[Symbol('hidden')] = 1;
    assert.throws(() => evaluate(symbolic), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');

    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'danger', {
        enumerable: true,
        get(){ getterCalls++; return 1; },
    });
    assert.throws(() => evaluate(accessor), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');
    assert.equal(getterCalls, 0);

    assert.throws(() => evaluate({ fn(){} }), error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA');
});

test('M4A input canonicalization has a bounded nesting depth', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const engine = createCalculationEngine({ registrations: [registration()] });
    const rootInput = {};
    let cursor = rootInput;
    for (let index = 0; index < 140; index++){
        cursor.next = {};
        cursor = cursor.next;
    }
    assert.throws(
        () => engine.calculate({ id: 'example:calculation/hardening', inputs: rootInput }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA'
    );
});
