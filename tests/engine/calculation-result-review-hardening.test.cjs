'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [result, identity] = await Promise.all([resultPromise, identityPromise]);
    return { ...result, ...identity };
}

test('M4A calculation result options are closed inert data and never invoke accessors', async () => {
    const { createCalculationResult, EngineContractError } = await modules();

    let getterCalls = 0;
    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'trace', {
        enumerable: true,
        get(){
            getterCalls++;
            return true;
        },
    });

    assert.throws(
        () => createCalculationResult('example:calculation/options', 1, accessorOptions),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT_OPTIONS'
    );
    assert.equal(getterCalls, 0);

    assert.throws(
        () => createCalculationResult(
            'example:calculation/options',
            1,
            { trace: false, hiddenState: {} }
        ),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT_OPTIONS'
    );
    assert.throws(
        () => createCalculationResult(
            'example:calculation/options',
            1,
            { trace: 'yes', inputs: {} }
        ),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT_OPTIONS'
    );
    assert.throws(
        () => createCalculationResult(
            'example:calculation/options',
            1,
            { trace: true }
        ),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_CALCULATION_RESULT_OPTIONS'
    );

    assert.deepEqual(
        createCalculationResult(
            'example:calculation/options',
            3,
            { trace: true, inputs: { x: 1 } }
        ),
        {
            calculationId: 'example:calculation/options',
            value: 3,
            trace: {
                inputs: { x: 1 },
                steps: [{ kind: 'base', before: null, after: 3 }],
            },
        }
    );
});
