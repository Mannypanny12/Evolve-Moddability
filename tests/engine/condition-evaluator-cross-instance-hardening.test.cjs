'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

test('M3B review hardening forbids nested evaluation across separate evaluator instances and releases the shared lock', async () => {
    const [{ createConditionEvaluator }, { EngineContractError }] = await Promise.all([
        evaluatorPromise,
        identityPromise,
    ]);

    const second = createConditionEvaluator({
        registrations: [{
            kind: 'test.second',
            validateParams(){ return {}; },
            evaluate(){ return { status: 'satisfied', reasons: [] }; },
        }],
    });

    const first = createConditionEvaluator({
        registrations: [{
            kind: 'test.first',
            validateParams(){ return {}; },
            evaluate(){
                return second.evaluate({ kind: 'test.second', params: {} });
            },
        }],
    });

    assert.throws(
        () => first.evaluate({ kind: 'test.first', params: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'CONDITION_EVALUATION_REENTRANCY'
    );

    assert.deepEqual(
        second.evaluate({ kind: 'test.second', params: {} }),
        { status: 'satisfied', reasons: [] }
    );
});
