'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [evaluator, common, identity] = await Promise.all([
        evaluatorPromise,
        commonPromise,
        identityPromise,
    ]);
    return { ...evaluator, ...common, ...identity };
}

function flagRegistration(state = {}){
    return {
        kind: 'test.flag',
        validateParams(params){
            if (typeof params.name !== 'string') throw new Error('name required');
            return { name: params.name };
        },
        evaluate(params){
            return state[params.name]
                ? { status: 'satisfied', reasons: [] }
                : {
                    status: 'failed',
                    reasons: [{ code: 'condition.test.flag_missing', details: { name: params.name } }],
                };
        },
    };
}

test('M3B1 hardening snapshots the whole condition tree and rejects cycles/shared identity', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const evaluator = createConditionEvaluator({ registrations: [flagRegistration()] });

    const cyclic = { kind: 'not' };
    cyclic.condition = cyclic;
    assert.throws(
        () => evaluator.evaluate(cyclic),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_DATA' &&
            error.details?.firstPath === 'condition'
    );

    const shared = { kind: 'test.flag', params: { name: 'x' } };
    assert.throws(
        () => evaluator.evaluate({ kind: 'all', conditions: [shared, shared] }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_DATA' &&
            error.details?.firstPath === 'condition.conditions[0]'
    );
});

test('M3B1 hardening converts hostile array inspection failures into EngineContractError', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const registrations = Proxy.revocable([], {});
    registrations.revoke();

    assert.throws(
        () => createConditionEvaluator({ registrations: registrations.proxy }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_EVALUATOR_CONFIG'
    );

    let reasonsProxy;
    const evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.hostile-result',
            validateParams(){ return {}; },
            evaluate(){ return { status: 'failed', reasons: reasonsProxy }; },
        }],
    });
    const reasons = Proxy.revocable([], {});
    reasonsProxy = reasons.proxy;
    reasons.revoke();

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.hostile-result', params: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_RESULT' &&
            error.details?.conditionPhase === 'result'
    );
});

test('M3B1 hardening bounds collection widths and compound fan-out before expensive traversal', async () => {
    const {
        createConditionEvaluator,
        EngineContractError,
        MAX_CONDITION_COLLECTION_LENGTH,
        MAX_CONDITION_OBJECT_FIELDS,
        MAX_COMPOUND_CONDITION_COUNT,
    } = await modules();

    assert.throws(
        () => createConditionEvaluator({ registrations: new Array(MAX_CONDITION_COLLECTION_LENGTH + 1) }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_EVALUATOR_CONFIG' &&
            error.details?.maxLength === MAX_CONDITION_COLLECTION_LENGTH
    );

    const evaluator = createConditionEvaluator({ registrations: [flagRegistration()] });
    const tooWideParams = {};
    for (let index = 0; index <= MAX_CONDITION_OBJECT_FIELDS; index++) tooWideParams[`f${index}`] = index;
    assert.throws(
        () => evaluator.evaluate({ kind: 'test.flag', params: tooWideParams }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_DATA' &&
            error.details?.maxFields === MAX_CONDITION_OBJECT_FIELDS
    );

    const children = Array.from({ length: MAX_COMPOUND_CONDITION_COUNT + 1 }, (_value, index) => ({
        kind: 'test.flag',
        params: { name: `x${index}` },
    }));
    assert.throws(
        () => evaluator.evaluate({ kind: 'all', conditions: children }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION' &&
            error.details?.maxLength === MAX_COMPOUND_CONDITION_COUNT
    );
});

test('M3B1 hardening rejects generator registrations at construction time', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();

    assert.throws(
        () => createConditionEvaluator({
            registrations: [{
                kind: 'test.generator-validator',
                *validateParams(){ yield {}; },
                evaluate(){ return { status: 'satisfied', reasons: [] }; },
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_REGISTRATION'
    );

    assert.throws(
        () => createConditionEvaluator({
            registrations: [{
                kind: 'test.generator-evaluator',
                validateParams(){ return {}; },
                *evaluate(){ yield { status: 'satisfied', reasons: [] }; },
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_REGISTRATION'
    );

    class InvalidEvaluator {}
    assert.throws(
        () => createConditionEvaluator({
            registrations: [{
                kind: 'test.class-evaluator',
                validateParams(){ return {}; },
                evaluate: InvalidEvaluator,
            }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_REGISTRATION'
    );
});

test('M3B1 hardening forbids nested evaluation and always releases the evaluation lock', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    let evaluator;
    let recurse = true;
    evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.reentrant',
            validateParams(){ return {}; },
            evaluate(){
                if (recurse){
                    recurse = false;
                    return evaluator.evaluate({ kind: 'test.reentrant', params: {} });
                }
                return { status: 'satisfied', reasons: [] };
            },
        }],
    });

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.reentrant', params: {} }),
        error => error instanceof EngineContractError && error.code === 'CONDITION_EVALUATION_REENTRANCY'
    );
    assert.deepEqual(
        evaluator.evaluate({ kind: 'test.reentrant', params: {} }),
        { status: 'satisfied', reasons: [] }
    );
});

test('M3B1 hardening enriches validator-output failures with condition context', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.invalid-validator-output',
            validateParams(){ return { bad: () => true }; },
            evaluate(){ return { status: 'satisfied', reasons: [] }; },
        }],
    });

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.invalid-validator-output', params: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_CONDITION_DATA' &&
            error.details?.conditionKind === 'test.invalid-validator-output' &&
            error.details?.conditionPath === 'condition' &&
            error.details?.conditionPhase === 'validate' &&
            error.details?.causeCode === 'INVALID_CONDITION_DATA'
    );
});

test('M3B1 hardening never invokes hostile EngineContractError accessors while enriching failures', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    let getterCalls = 0;
    const hostile = Object.create(EngineContractError.prototype);
    for (const field of ['code', 'message', 'details']){
        Object.defineProperty(hostile, field, {
            configurable: true,
            get(){ getterCalls++; throw new Error(`read ${field}`); },
        });
    }

    const evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.hostile-error',
            validateParams(){ return {}; },
            evaluate(){ throw hostile; },
        }],
    });

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.hostile-error', params: {} }),
        error => error instanceof EngineContractError && error.code === 'CONDITION_CONTRACT_FAILURE'
    );
    assert.equal(getterCalls, 0);
});

test('M3B1 hardening safely degrades uninspectable nested diagnostic details', async () => {
    const { createConditionEvaluator, EngineContractError } = await modules();
    const cause = new EngineContractError('TEST_INNER', 'inner', { ok: true });
    const hostileDetails = Proxy.revocable({}, {});
    cause.details = hostileDetails.proxy;
    hostileDetails.revoke();

    const evaluator = createConditionEvaluator({
        registrations: [{
            kind: 'test.hostile-details',
            validateParams(){ return {}; },
            evaluate(){ throw cause; },
        }],
    });

    assert.throws(
        () => evaluator.evaluate({ kind: 'test.hostile-details', params: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'TEST_INNER' &&
            error.details?.causeDetails === '<uninspectable>' &&
            error.details?.conditionKind === 'test.hostile-details' &&
            error.details?.conditionPhase === 'evaluate'
    );
});
