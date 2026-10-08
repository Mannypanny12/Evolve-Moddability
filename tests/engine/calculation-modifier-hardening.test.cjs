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
        calculateBase(inputs){ return inputs.base ?? 1; },
        ...overrides,
    };
}

function modifier(overrides = {}){
    return {
        id: 'example:modifier/test',
        calculationId: 'example:calculation/output',
        order: 10,
        operation: 'multiply',
        operand(){ return 2; },
        ...overrides,
    };
}

test('M4B rejects duplicate IDs, unknown targets, invalid operations/orders and unauthorized override at construction', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const base = [registration()];

    assert.throws(
        () => createCalculationEngine({ registrations: base, modifiers: [modifier(), modifier()] }),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_MODIFIER_ID'
    );
    assert.throws(
        () => createCalculationEngine({ registrations: base, modifiers: [modifier({ calculationId: 'example:calculation/missing' })] }),
        error => error instanceof EngineContractError && error.code === 'UNKNOWN_MODIFIER_CALCULATION_ID'
    );
    assert.throws(
        () => createCalculationEngine({ registrations: base, modifiers: [modifier({ operation: 'divide' })] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_OPERATION'
    );
    assert.throws(
        () => createCalculationEngine({ registrations: base, modifiers: [modifier({ order: 1.5 })] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_ORDER'
    );
    assert.throws(
        () => createCalculationEngine({ registrations: base, modifiers: [modifier({ operation: 'override' })] }),
        error => error instanceof EngineContractError && error.code === 'MODIFIER_OVERRIDE_NOT_ALLOWED'
    );
    assert.throws(
        () => createCalculationEngine({ registrations: [registration({ allowOverride: 'yes' })] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_REGISTRATION'
    );
});

test('M4B requires strict boolean predicates and synchronous finite operands', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();

    for (const badApplies of [() => 1, () => null, () => 'true']){
        const engine = createCalculationEngine({ registrations: [registration()], modifiers: [modifier({ applies: badApplies })] });
        assert.throws(
            () => engine.calculate({ id: 'example:calculation/output', inputs: { base: 2 } }),
            error => error instanceof EngineContractError
                && error.code === 'INVALID_MODIFIER_APPLIES_RESULT'
                && error.details.phase === 'modify'
                && error.details.modifierId === 'example:modifier/test'
        );
    }

    const promiseOperand = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ operand(){ return Promise.resolve(2); } })],
    });
    assert.throws(
        () => promiseOperand.calculate({ id: 'example:calculation/output', inputs: { base: 2 } }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_MODIFIER_OPERAND'
            && error.details.phase === 'modify'
    );

    const infiniteOperand = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ operand(){ return Infinity; } })],
    });
    assert.throws(
        () => infiniteOperand.calculate({ id: 'example:calculation/output', inputs: { base: 2 } }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_OPERAND'
    );
});

test('M4B rejects arithmetic overflow and normalizes negative zero', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    const overflow = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ operand(){ return 2; } })],
    });
    assert.throws(
        () => overflow.calculate({ id: 'example:calculation/output', inputs: { base: Number.MAX_VALUE } }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_RESULT'
    );

    const negativeZero = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({ operation: 'multiply', operand(){ return -1; } })],
    });
    const result = negativeZero.calculate({ id: 'example:calculation/output', inputs: { base: 0 } });
    assert.equal(result.value, 0);
    assert.equal(Object.is(result.value, -0), false);
});

test('M4B forbids async/generator modifier callbacks and hidden registration fields', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    assert.throws(
        () => createCalculationEngine({
            registrations: [registration()],
            modifiers: [modifier({ operand: async () => 2 })],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_REGISTRATION'
    );
    assert.throws(
        () => createCalculationEngine({
            registrations: [registration()],
            modifiers: [modifier({ applies: function* (){ yield true; } })],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_REGISTRATION'
    );
    assert.throws(
        () => createCalculationEngine({
            registrations: [registration()],
            modifiers: [{ ...modifier(), hiddenState: {} }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_REGISTRATION'
    );
});

test('M4B modifier callbacks cannot nest calculation evaluation and the global evaluation lock recovers', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    let engine;
    engine = createCalculationEngine({
        registrations: [registration()],
        modifiers: [modifier({
            applies(){
                engine.calculate({ id: 'example:calculation/output', inputs: { base: 1 } });
                return true;
            },
        })],
    });

    assert.throws(
        () => engine.calculate({ id: 'example:calculation/output', inputs: { base: 2 } }),
        error => error instanceof EngineContractError
            && error.code === 'CALCULATION_REENTRANCY'
            && error.details.phase === 'modify'
            && error.details.modifierId === 'example:modifier/test'
    );

    const clean = createCalculationEngine({ registrations: [registration()] });
    assert.equal(clean.calculate({ id: 'example:calculation/output', inputs: { base: 3 } }).value, 3);
});

test('M4B rejects hostile modifier registration shapes without invoking accessors', async () => {
    const { createCalculationEngine, EngineContractError } = await modules();
    let getterCalls = 0;
    const hostile = modifier();
    Object.defineProperty(hostile, 'order', {
        enumerable: true,
        get(){
            getterCalls++;
            return 10;
        },
    });
    assert.throws(
        () => createCalculationEngine({ registrations: [registration()], modifiers: [hostile] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_MODIFIER_REGISTRATION'
    );
    assert.equal(getterCalls, 0);

    const sparse = new Array(1);
    assert.throws(
        () => createCalculationEngine({ registrations: [registration()], modifiers: sparse }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_ENGINE_CONFIG'
    );
});

test('M4B direct calculation-result construction enforces modifier trace continuity and arithmetic truthfulness', async () => {
    const { createCalculationResult, EngineContractError } = await modules();
    const baseOptions = {
        trace: true,
        inputs: { base: 10 },
        baseValue: 10,
    };

    assert.throws(
        () => createCalculationResult('example:calculation/output', 15, {
            ...baseOptions,
            modifierSteps: [{
                kind: 'modifier', modifierId: 'example:modifier/add', operation: 'add', order: 10,
                applied: true, operand: 5, before: 11, after: 16,
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_TRACE'
    );
    assert.throws(
        () => createCalculationResult('example:calculation/output', 15, {
            ...baseOptions,
            modifierSteps: [{
                kind: 'modifier', modifierId: 'example:modifier/add', operation: 'add', order: 10,
                applied: true, operand: 5, before: 10, after: 14,
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_TRACE'
    );
    assert.throws(
        () => createCalculationResult('example:calculation/output', 10, {
            ...baseOptions,
            modifierSteps: [{
                kind: 'modifier', modifierId: 'example:modifier/add', operation: 'add', order: 10,
                applied: false, operand: 5, before: 10, after: 10,
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_TRACE'
    );
});
