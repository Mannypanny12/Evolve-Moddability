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

function baseRegistration(overrides = {}){
    return {
        id: 'example:calculation/output',
        validateInputs(inputs){ return inputs; },
        calculateBase(inputs){ return inputs.base; },
        ...overrides,
    };
}

function modifier(id, order, operation, operand, overrides = {}){
    return {
        id,
        calculationId: 'example:calculation/output',
        order,
        operation,
        operand: typeof operand === 'function' ? operand : () => operand,
        ...overrides,
    };
}

test('M4B applies mixed modifier operations in deterministic order and preserves calculate/explain parity', async () => {
    const { createCalculationEngine } = await modules();
    const engine = createCalculationEngine({
        registrations: [baseRegistration()],
        modifiers: [
            modifier('example:modifier/cap', 40, 'cap', 50),
            modifier('example:modifier/add', 10, 'add', 5),
            modifier('example:modifier/floor', 30, 'floor', 60),
            modifier('example:modifier/multiply', 20, 'multiply', 2),
        ],
    });
    const context = { id: 'example:calculation/output', inputs: { base: 10 } };

    assert.equal(engine.calculate(context).value, 50);
    const explained = engine.explain(context);
    assert.equal(explained.value, 50);
    assert.deepEqual(explained.trace.steps, [
        { kind: 'base', before: null, after: 10 },
        { kind: 'modifier', modifierId: 'example:modifier/add', operation: 'add', order: 10, applied: true, operand: 5, before: 10, after: 15 },
        { kind: 'modifier', modifierId: 'example:modifier/multiply', operation: 'multiply', order: 20, applied: true, operand: 2, before: 15, after: 30 },
        { kind: 'modifier', modifierId: 'example:modifier/floor', operation: 'floor', order: 30, applied: true, operand: 60, before: 30, after: 60 },
        { kind: 'modifier', modifierId: 'example:modifier/cap', operation: 'cap', order: 40, applied: true, operand: 50, before: 60, after: 50 },
    ]);
    assert.equal(Object.isFrozen(explained.trace.steps), true);
    assert.equal(explained.trace.steps.every(Object.isFrozen), true);
});

test('M4B equal-order modifiers use canonical modifier ID as the deterministic tie-breaker', async () => {
    const { createCalculationEngine } = await modules();
    const registrations = [baseRegistration()];
    const a = modifier('alpha:modifier/add', 100, 'add', 5);
    const z = modifier('zeta:modifier/multiply', 100, 'multiply', 2);

    const first = createCalculationEngine({ registrations, modifiers: [z, a] });
    const second = createCalculationEngine({ registrations, modifiers: [a, z] });
    const context = { id: 'example:calculation/output', inputs: { base: 10 } };

    assert.equal(first.calculate(context).value, 30);
    assert.equal(second.calculate(context).value, 30);
    assert.deepEqual(
        first.explain(context).trace.steps.slice(1).map(step => step.modifierId),
        ['alpha:modifier/add', 'zeta:modifier/multiply']
    );
});

test('M4B conditional modifiers record skipped contributors without evaluating their operand', async () => {
    const { createCalculationEngine } = await modules();
    let operandCalls = 0;
    const engine = createCalculationEngine({
        registrations: [baseRegistration()],
        modifiers: [modifier('othermod:modifier/conditional', 10, 'multiply', () => {
            operandCalls++;
            return 3;
        }, {
            applies(inputs){ return inputs.enabled; },
        })],
    });

    const context = { id: 'example:calculation/output', inputs: { base: 10, enabled: false } };
    assert.equal(engine.calculate(context).value, 10);
    assert.equal(operandCalls, 0);
    assert.deepEqual(engine.explain(context).trace.steps[1], {
        kind: 'modifier',
        modifierId: 'othermod:modifier/conditional',
        operation: 'multiply',
        order: 10,
        applied: false,
        operand: null,
        before: 10,
        after: 10,
    });
    assert.equal(operandCalls, 0);
});

test('M4B permits cross-namespace contribution and explicit target-owned override', async () => {
    const { createCalculationEngine } = await modules();
    const engine = createCalculationEngine({
        registrations: [baseRegistration({ allowOverride: true })],
        modifiers: [modifier('thirdparty:modifier/replacement', 10, 'override', 42)],
    });
    assert.equal(
        engine.calculate({ id: 'example:calculation/output', inputs: { base: 10 } }).value,
        42
    );
});

test('M4B normal calculations remain exact M4A-style results when no modifiers exist', async () => {
    const { createCalculationEngine } = await modules();
    const engine = createCalculationEngine({ registrations: [baseRegistration()] });
    const context = { id: 'example:calculation/output', inputs: { base: -0 } };

    assert.deepEqual(engine.calculate(context), {
        calculationId: 'example:calculation/output',
        value: 0,
        trace: null,
    });
    assert.deepEqual(engine.explain(context).trace.steps, [
        { kind: 'base', before: null, after: 0 },
    ]);
});
