'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/result.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [evaluator, result, common, identity] = await Promise.all([
        evaluatorPromise,
        resultPromise,
        commonPromise,
        identityPromise,
    ]);
    return { ...evaluator, ...result, ...common, ...identity };
}

function flagRegistration(state, observations = {}){
    return {
        kind: 'test.flag',
        validateParams(params){
            observations.validatorThis = this;
            observations.validatedParams = params;
            if (typeof params.name !== 'string') throw new Error('name required');
            return { name: params.name };
        },
        evaluate(params){
            observations.evaluatorThis = this;
            observations.evaluatedParams = params;
            observations.calls = (observations.calls || 0) + 1;
            if (state[params.name]){
                return { status: 'satisfied', reasons: [] };
            }
            return {
                status: 'failed',
                reasons: [{ code: 'condition.test.flag_missing', details: { name: params.name } }],
            };
        },
    };
}

test('M3B1 primitive conditions validate detached frozen params and return frozen structured outcomes', async () => {
    const { createConditionEvaluator } = await modules();
    const observations = {};
    const evaluator = createConditionEvaluator({ registrations: [flagRegistration({ ready: false }, observations)] });
    const params = { name: 'ready' };

    const result = evaluator.evaluate({ kind: 'test.flag', params });

    assert.equal(observations.validatorThis, undefined);
    assert.equal(observations.evaluatorThis, undefined);
    assert.equal(Object.isFrozen(observations.validatedParams), true);
    assert.equal(Object.isFrozen(observations.evaluatedParams), true);
    assert.notEqual(observations.validatedParams, params);
    assert.deepEqual(result, {
        status: 'failed',
        reasons: [{ code: 'condition.test.flag_missing', details: { name: 'ready' } }],
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.reasons), true);
    assert.equal(Object.isFrozen(result.reasons[0]), true);
    assert.equal(Object.isFrozen(result.reasons[0].details), true);

    params.name = 'changed';
    assert.equal(observations.evaluatedParams.name, 'ready');
});

test('M3B1 condition evaluator uses fixed unique non-reserved registrations', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const registration = flagRegistration({});

    assert.throws(
        () => createConditionEvaluator({ registrations: [registration, registration] }),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_CONDITION_KIND'
    );
    assert.throws(
        () => createConditionEvaluator({
            registrations: [{ ...registration, kind: 'all' }],
        }),
        error => error instanceof EngineContractError && error.code === 'RESERVED_CONDITION_KIND'
    );

    const evaluator = createConditionEvaluator({ registrations: [registration] });
    assert.deepEqual(evaluator.kinds(), ['all', 'any', 'not', 'test.flag']);
    assert.equal(evaluator.has('all'), true);
    assert.equal(evaluator.has('test.flag'), true);
    assert.equal(evaluator.has('test.other'), false);
    assert.deepEqual(Object.keys(evaluator), ['evaluate', 'has', 'kinds']);
    assert.equal(Object.isFrozen(evaluator), true);
});

test('M3B1 all evaluates every child and aggregates failure reasons in declaration order', async () => {
    const { createConditionEvaluator } = await modules();
    const observations = {};
    const evaluator = createConditionEvaluator({ registrations: [flagRegistration({ b: true }, observations)] });

    const result = evaluator.evaluate({
        kind: 'all',
        conditions: [
            { kind: 'test.flag', params: { name: 'a' } },
            { kind: 'test.flag', params: { name: 'b' } },
            { kind: 'test.flag', params: { name: 'c' } },
        ],
    });

    assert.equal(observations.calls, 3);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.reasons.map(reason => reason.details.name), ['a', 'c']);
});

test('M3B1 any short-circuits on success and preserves failed alternatives when every branch fails', async () => {
    const { createConditionEvaluator } = await modules();
    const successObservations = {};
    const successEvaluator = createConditionEvaluator({ registrations: [flagRegistration({ b: true }, successObservations)] });

    const success = successEvaluator.evaluate({
        kind: 'any',
        conditions: [
            { kind: 'test.flag', params: { name: 'a' } },
            { kind: 'test.flag', params: { name: 'b' } },
            { kind: 'test.flag', params: { name: 'c' } },
        ],
    });
    assert.equal(success.status, 'satisfied');
    assert.equal(successObservations.calls, 2);

    const failedEvaluator = createConditionEvaluator({ registrations: [flagRegistration({})] });
    const failed = failedEvaluator.evaluate({
        kind: 'any',
        conditions: [
            { kind: 'test.flag', params: { name: 'a' } },
            { kind: 'test.flag', params: { name: 'b' } },
        ],
    });

    assert.equal(failed.status, 'failed');
    assert.equal(failed.reasons.length, 1);
    assert.equal(failed.reasons[0].code, 'condition.any.failed');
    assert.deepEqual(
        failed.reasons[0].details.alternatives.map(item => [item.index, item.reasons[0].details.name]),
        [[0, 'a'], [1, 'b']]
    );
});

test('M3B1 not inverts condition satisfaction without leaking child failures as top-level requirements', async () => {
    const { createConditionEvaluator } = await modules();
    const evaluator = createConditionEvaluator({ registrations: [flagRegistration({ active: true })] });

    const failed = evaluator.evaluate({
        kind: 'not',
        condition: { kind: 'test.flag', params: { name: 'active' } },
    });
    assert.deepEqual(failed, {
        status: 'failed',
        reasons: [{ code: 'condition.not.failed', details: { conditionKind: 'test.flag' } }],
    });

    const satisfied = evaluator.evaluate({
        kind: 'not',
        condition: { kind: 'test.flag', params: { name: 'missing' } },
    });
    assert.deepEqual(satisfied, { status: 'satisfied', reasons: [] });
});

test('M3B1 condition definitions are closed inert trees', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const evaluator = createConditionEvaluator({ registrations: [flagRegistration({})] });

    const badCases = [
        { value: { kind: 'test.flag', params: { name: 'x' }, extra: true }, code: 'INVALID_CONDITION' },
        { value: { kind: 'all', conditions: [] }, code: 'INVALID_CONDITION' },
        { value: { kind: 'not' }, code: 'INVALID_CONDITION' },
        { value: { kind: 'unknown.kind', params: {} }, code: 'UNKNOWN_CONDITION_KIND' },
        { value: { kind: 'test.flag', params: { name: () => true } }, code: 'INVALID_CONDITION_DATA' },
    ];

    for (const item of badCases){
        assert.throws(
            () => evaluator.evaluate(item.value),
            error => error instanceof EngineContractError && error.code === item.code,
            `${item.code}: ${JSON.stringify(item.value, (_key, value) => typeof value === 'function' ? '<function>' : value)}`
        );
    }

    let getterCalls = 0;
    const params = {};
    Object.defineProperty(params, 'name', {
        enumerable: true,
        get(){ getterCalls++; return 'x'; },
    });
    assert.throws(
        () => evaluator.evaluate({ kind: 'test.flag', params }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_DATA'
    );
    assert.equal(getterCalls, 0);

    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(
        () => evaluator.evaluate({ kind: 'test.flag', params: cyclic }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_DATA'
    );
});

test('M3B1 rejects declared async functions and runtime Promise/thenable leakage', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();

    assert.throws(
        () => createConditionEvaluator({
            registrations: [{
                kind: 'test.async',
                async validateParams(params){ return params; },
                evaluate(){ return { status: 'satisfied', reasons: [] }; },
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_REGISTRATION'
    );

    const validatorPromise = createConditionEvaluator({
        registrations: [{
            kind: 'test.promise',
            validateParams(){ return Promise.resolve({}); },
            evaluate(){ return { status: 'satisfied', reasons: [] }; },
        }],
    });
    assert.throws(
        () => validatorPromise.evaluate({ kind: 'test.promise', params: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_PARAMS'
    );

    let thenGetterCalls = 0;
    const hostileThenable = {};
    Object.defineProperty(hostileThenable, 'then', {
        get(){ thenGetterCalls++; return () => {}; },
    });
    const outcomeThenable = createConditionEvaluator({
        registrations: [{
            kind: 'test.thenable',
            validateParams(){ return {}; },
            evaluate(){ return hostileThenable; },
        }],
    });
    assert.throws(
        () => outcomeThenable.evaluate({ kind: 'test.thenable', params: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_RESULT'
    );
    assert.equal(thenGetterCalls, 0);
});

test('M3B1 rejects malformed primitive outcomes and localized message fields', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.badresult',
            validateParams(){ return {}; },
            evaluate(){
                return {
                    status: 'failed',
                    reasons: [{ code: 'condition.test.failed', details: null, message: 'Nope' }],
                };
            },
        }],
    });

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.badresult', params: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_RESULT'
    );
});
