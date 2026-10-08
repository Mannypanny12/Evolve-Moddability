'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [result, identity] = await Promise.all([resultPromise, identityPromise]);
    return { ...result, ...identity };
}

function modifierStep(){
    return {
        kind: 'modifier',
        modifierId: 'example:modifier/add-one',
        operation: 'add',
        order: 10,
        applied: true,
        operand: 1,
        before: 10,
        after: 11,
    };
}

test('M4B direct result construction requires baseValue whenever modifierSteps are supplied', async () => {
    const { createCalculationResult, EngineContractError } = await modules();

    assert.throws(
        () => createCalculationResult('example:calculation/output', 11, {
            trace: true,
            inputs: { base: 10 },
            modifierSteps: [modifierStep()],
        }),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT_OPTIONS'
            && error.details.path === 'calculationResultOptions.baseValue'
    );

    const valid = createCalculationResult('example:calculation/output', 11, {
        trace: true,
        inputs: { base: 10 },
        baseValue: 10,
        modifierSteps: [modifierStep()],
    });
    assert.equal(valid.trace.steps[0].after, 10);
    assert.equal(valid.trace.steps[1].after, 11);
});

test('M4A-style base-only traces still infer the final value when modifierSteps are absent', async () => {
    const { createCalculationResult } = await modules();
    const result = createCalculationResult('example:calculation/output', 7, {
        trace: true,
        inputs: {},
    });

    assert.deepEqual(result.trace.steps, [
        { kind: 'base', before: null, after: 7 },
    ]);
});
