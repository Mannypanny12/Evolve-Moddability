'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-result.mjs')).href);

async function modules(){
    const [engine, identity, result] = await Promise.all([enginePromise, identityPromise, resultPromise]);
    return { ...engine, ...identity, ...result };
}

function registration(overrides = {}){
    return {
        id: 'example:calculation/output',
        validateInputs(inputs){ return inputs; },
        calculateBase(inputs){ return inputs.base; },
        ...overrides,
    };
}

function modifier(overrides = {}){
    return {
        id: 'example:modifier/test',
        calculationId: 'example:calculation/output',
        order: 10,
        operation: 'add',
        operand(){ return 1; },
        ...overrides,
    };
}

function traceStep({
    modifierId,
    order,
    before,
    after,
    operand = 0,
    operation = 'add',
    applied = true,
}){
    return {
        kind: 'modifier',
        modifierId,
        operation,
        order,
        applied,
        operand: applied ? operand : null,
        before,
        after,
    };
}

test('M4B direct result construction rejects duplicate and non-deterministically ordered modifier traces', async () => {
    const { createCalculationResult, EngineContractError } = await modules();
    const base = { trace: true, inputs: { base: 10 }, baseValue: 10 };

    assert.throws(
        () => createCalculationResult('example:calculation/output', 12, {
            ...base,
            modifierSteps: [
                traceStep({ modifierId: 'example:modifier/repeated', order: 10, before: 10, after: 11, operand: 1 }),
                traceStep({ modifierId: 'example:modifier/repeated', order: 20, before: 11, after: 12, operand: 1 }),
            ],
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_TRACE'
            && /duplicate modifier/.test(error.message)
    );

    assert.throws(
        () => createCalculationResult('example:calculation/output', 12, {
            ...base,
            modifierSteps: [
                traceStep({ modifierId: 'zeta:modifier/second', order: 10, before: 10, after: 11, operand: 1 }),
                traceStep({ modifierId: 'alpha:modifier/first', order: 10, before: 11, after: 12, operand: 1 }),
            ],
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_TRACE'
            && /deterministic/.test(error.message)
    );

    assert.throws(
        () => createCalculationResult('example:calculation/output', 12, {
            ...base,
            modifierSteps: [
                traceStep({ modifierId: 'alpha:modifier/first', order: 20, before: 10, after: 11, operand: 1 }),
                traceStep({ modifierId: 'zeta:modifier/second', order: 10, before: 11, after: 12, operand: 1 }),
            ],
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_TRACE'
            && /deterministic/.test(error.message)
    );
});

test('M4B modifier callbacks receive detached deeply frozen validated inputs with undefined this', async () => {
    const { createCalculationEngine } = await modules();
    let validatorOutput;
    let observedInputs;
    let appliesThis;
    let operandThis;

    const engine = createCalculationEngine({
        registrations: [registration({
            validateInputs(inputs){
                validatorOutput = { base: inputs.base, nested: { enabled: inputs.nested.enabled } };
                return validatorOutput;
            },
        })],
        modifiers: [modifier({
            applies(inputs){
                appliesThis = this;
                observedInputs = inputs;
                return inputs.nested.enabled;
            },
            operand(inputs){
                operandThis = this;
                assert.strictEqual(inputs, observedInputs);
                return 2;
            },
        })],
    });

    const rawInputs = { base: 10, nested: { enabled: true } };
    const result = engine.calculate({ id: 'example:calculation/output', inputs: rawInputs });

    assert.equal(result.value, 12);
    assert.notStrictEqual(observedInputs, rawInputs);
    assert.notStrictEqual(observedInputs, validatorOutput);
    assert.equal(Object.isFrozen(observedInputs), true);
    assert.equal(Object.isFrozen(observedInputs.nested), true);
    assert.equal(appliesThis, undefined);
    assert.equal(operandThis, undefined);
});

test('M4B hostile applies thenables fail closed without invoking accessors', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    let getterCalls = 0;
    const thenable = {};
    Object.defineProperty(thenable, 'then', {
        get(){
            getterCalls++;
            return () => {};
        },
    });

    const engine = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ applies(){ return thenable; } })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/output', inputs: { base: 10 } }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_MODIFIER_APPLIES_RESULT'
            && error.details.phase === 'modify'
            && error.details.modifierId === 'example:modifier/test'
            && error.details.modifierPhase === 'applies'
    );
    assert.equal(getterCalls, 0);
});

test('M4B modifier callback failures retain calculation and modifier phase diagnostics', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const engine = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ operand(){ throw new Error('boom'); } })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/output', inputs: { base: 10 } }),
        error => error instanceof EngineContractError
            && error.code === 'MODIFIER_OPERAND_FAILURE'
            && error.details.calculationId === 'example:calculation/output'
            && error.details.phase === 'modify'
            && error.details.modifierId === 'example:modifier/test'
            && error.details.modifierPhase === 'operand'
    );
});

test('M4B operand callbacks cannot re-enter another calculation engine and the global lock recovers', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const other = createCalculationEngine({ registrations: [registration()] });
    const engine = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({
            operand(){
                other.calculate({ id: 'example:calculation/output', inputs: { base: 1 } });
                return 1;
            },
        })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/output', inputs: { base: 10 } }),
        error => error instanceof EngineContractError
            && error.code === 'CALCULATION_REENTRANCY'
            && error.details.phase === 'modify'
            && error.details.modifierPhase === 'operand'
    );

    assert.equal(other.calculate({ id: 'example:calculation/output', inputs: { base: 3 } }).value, 3);
});
