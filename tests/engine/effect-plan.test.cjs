'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/effects/common.mjs')).href);
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/effects/effect-plan.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [common, plan, identity] = await Promise.all([commonPromise, planPromise, identityPromise]);
    return { ...common, ...plan, ...identity };
}

async function expectEffectDataInvalid(value, expectedPath){
    const { canonicalizeEffectData, EngineContractError } = await modules();
    assert.throws(
        () => canonicalizeEffectData(value, 'effectData'),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_EFFECT_DATA');
            if (expectedPath !== undefined) assert.equal(error.details?.path, expectedPath);
            return true;
        }
    );
}

test('M3C1 creates a detached frozen empty EffectPlan without execution authority', async () => {
    const { createEffectPlan } = await modules();
    const input = [];
    const plan = createEffectPlan(input);

    assert.deepEqual(plan, { operations: [] });
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.operations), true);
    assert.notEqual(plan.operations, input);

    input.push({ kind: 'future.operation' });
    assert.deepEqual(plan.operations, []);
    assert.deepEqual(Object.keys(plan), ['operations']);
});

test('M3C1 requires an explicit operation array so missing planner output fails closed', async () => {
    const { createEffectPlan, EngineContractError } = await modules();
    for (const create of [
        () => createEffectPlan(),
        () => createEffectPlan(undefined),
        () => createEffectPlan(null),
    ]){
        assert.throws(
            create,
            error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_PLAN'
        );
    }
    assert.deepEqual(createEffectPlan([]), { operations: [] });
});

test('M3C1 deliberately supports no gameplay operation kinds yet', async () => {
    const { createEffectPlan, EngineContractError } = await modules();
    assert.throws(
        () => createEffectPlan([{ kind: 'resource.grant' }]),
        error => error instanceof EngineContractError &&
            error.code === 'UNSUPPORTED_EFFECT_OPERATION_KIND' &&
            error.details?.kind === 'resource.grant'
    );
    assert.throws(
        () => createEffectPlan([{ kind: 'Bad Kind' }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_OPERATION_KIND'
    );
    assert.throws(
        () => createEffectPlan([{ kind: 'future.operation', amount: 1 }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_OPERATION'
    );
    assert.throws(
        () => createEffectPlan({}),
        error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_PLAN'
    );
});

test('M3C1 shared inert readers reject wrong container types before reflective proxy traps', async () => {
    const {
        readClosedEffectObject,
        readDenseEffectArray,
        EngineContractError,
    } = await modules();

    let objectProxyTrapCalls = 0;
    const objectProxy = new Proxy({}, {
        getPrototypeOf(){ objectProxyTrapCalls++; throw new Error('unexpected getPrototypeOf'); },
        ownKeys(){ objectProxyTrapCalls++; throw new Error('unexpected ownKeys'); },
        getOwnPropertyDescriptor(){ objectProxyTrapCalls++; throw new Error('unexpected descriptor'); },
    });
    assert.throws(
        () => readDenseEffectArray(objectProxy, 'effectPlan.operations', 'INVALID_EFFECT_PLAN'),
        error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_PLAN'
    );
    assert.equal(objectProxyTrapCalls, 0);

    let arrayProxyTrapCalls = 0;
    const arrayProxy = new Proxy([], {
        getPrototypeOf(){ arrayProxyTrapCalls++; throw new Error('unexpected getPrototypeOf'); },
        ownKeys(){ arrayProxyTrapCalls++; throw new Error('unexpected ownKeys'); },
        getOwnPropertyDescriptor(){ arrayProxyTrapCalls++; throw new Error('unexpected descriptor'); },
    });
    assert.throws(
        () => readClosedEffectObject(arrayProxy, {
            path: 'effect',
            allowed: [],
            code: 'INVALID_EFFECT_OPERATION',
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_EFFECT_OPERATION'
    );
    assert.equal(arrayProxyTrapCalls, 0);
});

test('M3C1 effect data canonicalizes deterministically, detaches, freezes and normalizes -0', async () => {
    const { canonicalizeEffectData } = await modules();
    const input = { z: [{ right: -0, left: 1 }], a: { beta: 2, alpha: 1 } };
    const output = canonicalizeEffectData(input);

    assert.deepEqual(Object.keys(output), ['a', 'z']);
    assert.deepEqual(Object.keys(output.a), ['alpha', 'beta']);
    assert.equal(Object.is(output.z[0].right, -0), false);
    assert.equal(Object.isFrozen(output), true);
    assert.equal(Object.isFrozen(output.a), true);
    assert.equal(Object.isFrozen(output.z), true);
    assert.notEqual(output, input);
    assert.notEqual(output.a, input.a);

    input.a.alpha = 99;
    assert.equal(output.a.alpha, 1);
});

test('M3C1 effect data accepts null-prototype objects but emits normal frozen objects', async () => {
    const { canonicalizeEffectData } = await modules();
    const input = Object.create(null);
    input.z = 2;
    input.a = Object.create(null);
    input.a.ok = true;

    const output = canonicalizeEffectData(input);
    assert.deepEqual(output, { a: { ok: true }, z: 2 });
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(Object.getPrototypeOf(output.a), Object.prototype);
    assert.equal(Object.isFrozen(output), true);
});

test('M3C1 effect data rejects executable values, exotic objects and numeric poison values', async () => {
    await expectEffectDataInvalid(undefined, 'effectData');
    await expectEffectDataInvalid(() => 1, 'effectData');
    await expectEffectDataInvalid(Symbol('x'), 'effectData');
    await expectEffectDataInvalid(1n, 'effectData');
    await expectEffectDataInvalid(NaN, 'effectData');
    await expectEffectDataInvalid(Infinity, 'effectData');
    await expectEffectDataInvalid(new Date(0), 'effectData');
    await expectEffectDataInvalid({ then(){} }, 'effectData.then');
});

test('M3C1 effect data rejects accessors, hidden/symbol fields, sparse arrays and array subclasses without invoking getters', async () => {
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'danger', {
        enumerable: true,
        get(){ getterCalls++; return 1; },
    });
    await expectEffectDataInvalid(accessor, 'effectData.danger');
    assert.equal(getterCalls, 0);

    const hidden = {};
    Object.defineProperty(hidden, 'secret', { value: 1, enumerable: false });
    await expectEffectDataInvalid(hidden, 'effectData.secret');

    const symbolKeyed = { ok: true };
    symbolKeyed[Symbol('secret')] = 1;
    await expectEffectDataInvalid(symbolKeyed, 'effectData');

    const sparse = new Array(2);
    sparse[1] = 1;
    await expectEffectDataInvalid(sparse, 'effectData[0]');

    const extra = [1];
    extra.extra = true;
    await expectEffectDataInvalid(extra, 'effectData.extra');

    class EffectArray extends Array {}
    await expectEffectDataInvalid(new EffectArray(1), 'effectData');
});

test('M3C1 effect data rejects cycles and shared object or array identity', async () => {
    const cyclic = {};
    cyclic.self = cyclic;
    await expectEffectDataInvalid(cyclic, 'effectData.self');

    const shared = { amount: 1 };
    await expectEffectDataInvalid({ a: shared, b: shared }, 'effectData.b');

    const sharedArray = [1, 2];
    await expectEffectDataInvalid({ a: sharedArray, b: sharedArray }, 'effectData.b');
});

test('M3C1 effect data enforces nesting, collection, object-width and total-node limits', async () => {
    const {
        canonicalizeEffectData,
        MAX_EFFECT_DATA_NESTING_DEPTH,
        MAX_EFFECT_COLLECTION_LENGTH,
        MAX_EFFECT_OBJECT_FIELDS,
        MAX_EFFECT_DATA_NODE_COUNT,
        EngineContractError,
    } = await modules();

    let nested = {};
    for (let index = 0; index <= MAX_EFFECT_DATA_NESTING_DEPTH; index++) nested = { child: nested };
    assert.throws(
        () => canonicalizeEffectData(nested),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_EFFECT_DATA' &&
            error.details?.maxDepth === MAX_EFFECT_DATA_NESTING_DEPTH
    );

    const tooLong = new Array(MAX_EFFECT_COLLECTION_LENGTH + 1).fill(0);
    assert.throws(
        () => canonicalizeEffectData(tooLong),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_EFFECT_DATA' &&
            error.details?.maxLength === MAX_EFFECT_COLLECTION_LENGTH
    );

    const tooWide = {};
    for (let index = 0; index <= MAX_EFFECT_OBJECT_FIELDS; index++) tooWide[`f${index}`] = index;
    assert.throws(
        () => canonicalizeEffectData(tooWide),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_EFFECT_DATA' &&
            error.details?.maxFields === MAX_EFFECT_OBJECT_FIELDS
    );

    const rowWidth = 128;
    const rowCount = Math.ceil(MAX_EFFECT_DATA_NODE_COUNT / (rowWidth + 1)) + 1;
    assert.equal(rowWidth <= MAX_EFFECT_COLLECTION_LENGTH, true);
    assert.equal(rowCount <= MAX_EFFECT_COLLECTION_LENGTH, true);
    const tooManyNodes = Array.from(
        { length: rowCount },
        () => new Array(rowWidth).fill(0)
    );
    assert.throws(
        () => canonicalizeEffectData(tooManyNodes),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_EFFECT_DATA' &&
            error.details?.nodeCount === MAX_EFFECT_DATA_NODE_COUNT + 1 &&
            error.details?.maxNodes === MAX_EFFECT_DATA_NODE_COUNT
    );
});

test('M3C1 effect data reports unambiguous paths and fails closed on hostile inspection', async () => {
    const { canonicalizeEffectData, EngineContractError } = await modules();
    assert.throws(
        () => canonicalizeEffectData({ 'a.b': undefined }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_EFFECT_DATA' &&
            error.details?.path === 'effectData["a.b"]'
    );

    const hostile = new Proxy({}, {
        getPrototypeOf(){ throw new Error('nope'); },
    });
    await expectEffectDataInvalid(hostile, 'effectData');
});
