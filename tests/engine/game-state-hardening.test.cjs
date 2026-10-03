'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const stateCommonPromise = import(pathToFileURL(path.join(root, 'src/engine/state/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [stateCommon, identity] = await Promise.all([stateCommonPromise, identityPromise]);
    return { ...stateCommon, ...identity };
}

async function expectInvalid(value, expectedPath){
    const { canonicalizeStateValue, EngineContractError } = await modules();
    assert.throws(
        () => canonicalizeStateValue(value, 'state'),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_STATE_VALUE');
            if (expectedPath !== undefined){
                assert.equal(error.details?.path, expectedPath);
            }
            return true;
        }
    );
}

test('M2A state values canonicalize recursively into detached deterministic plain data', async () => {
    const { canonicalizeStateValue } = await modules();
    const nullProto = Object.create(null);
    nullProto.z = 3;
    nullProto.a = { b: [1, true, null, 'x'] };

    const output = canonicalizeStateValue(nullProto, 'state');

    assert.deepEqual(Object.keys(output), ['a', 'z']);
    assert.deepEqual(output, { a: { b: [1, true, null, 'x'] }, z: 3 });
    assert.notEqual(output, nullProto);
    assert.notEqual(output.a, nullProto.a);
    assert.notEqual(output.a.b, nullProto.a.b);

    nullProto.a.b[0] = 99;
    assert.equal(output.a.b[0], 1);
});

test('M2A state values normalize negative zero but reject non-finite numbers', async () => {
    const { canonicalizeStateValue } = await modules();
    assert.equal(Object.is(canonicalizeStateValue(-0, 'state'), -0), false);
    assert.equal(canonicalizeStateValue(-0, 'state'), 0);

    await expectInvalid(NaN, 'state');
    await expectInvalid(Infinity, 'state');
    await expectInvalid(-Infinity, 'state');
});

test('M2A state values reject non-data primitive types', async () => {
    await expectInvalid(undefined, 'state');
    await expectInvalid(1n, 'state');
    await expectInvalid(Symbol('state'), 'state');
    await expectInvalid(() => 1, 'state');
});

test('M2A state objects reject exotic prototypes, hidden fields, symbols, and accessors', async () => {
    await expectInvalid(new Date(0), 'state');
    await expectInvalid(new Map(), 'state');
    await expectInvalid(Object.create({ inherited: true }), 'state');

    const hidden = {};
    Object.defineProperty(hidden, 'secret', { value: 1, enumerable: false });
    await expectInvalid(hidden, 'state.secret');

    const symbolKeyed = { ok: true };
    symbolKeyed[Symbol('secret')] = 1;
    await expectInvalid(symbolKeyed, 'state');

    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'danger', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });
    await expectInvalid(accessor, 'state.danger');
    assert.equal(getterCalls, 0);
});

test('M2A state arrays must be normal dense data arrays without extra state fields', async () => {
    const sparse = new Array(2);
    sparse[1] = 'present';
    await expectInvalid(sparse, 'state[0]');

    const extra = [1];
    extra.extra = true;
    await expectInvalid(extra, 'state.extra');

    const accessor = [1];
    let getterCalls = 0;
    Object.defineProperty(accessor, '0', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });
    await expectInvalid(accessor, 'state[0]');
    assert.equal(getterCalls, 0);

    class StateArray extends Array {}
    await expectInvalid(new StateArray(1), 'state');
});

test('M2A state values reject cycles instead of silently truncating or serializing them', async () => {
    const value = {};
    value.self = value;
    await expectInvalid(value, 'state.self');
});

test('M2A canonicalization cannot be prototype-polluted by an own __proto__ data field', async () => {
    const { canonicalizeStateValue } = await modules();
    const input = {};
    Object.defineProperty(input, '__proto__', {
        value: { polluted: true },
        enumerable: true,
        writable: true,
        configurable: true,
    });

    const output = canonicalizeStateValue(input, 'state');
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(output, '__proto__'), true);
    assert.deepEqual(output.__proto__, { polluted: true });
});

test('M2A state inspection converts hostile proxy failures into structured contract errors', async () => {
    const { canonicalizeStateValue, EngineContractError } = await modules();
    const proxy = new Proxy({}, {
        ownKeys(){ throw new Error('boom'); },
    });

    assert.throws(
        () => canonicalizeStateValue(proxy, 'state'),
        error => error instanceof EngineContractError && error.code === 'INVALID_STATE_VALUE'
    );

    const revocable = Proxy.revocable([], {});
    revocable.revoke();
    assert.throws(
        () => canonicalizeStateValue(revocable.proxy, 'state'),
        error => error instanceof EngineContractError && error.code === 'INVALID_STATE_VALUE'
    );
});
