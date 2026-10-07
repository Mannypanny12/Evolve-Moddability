'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/common.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [common, result, identity] = await Promise.all([commonPromise, resultPromise, identityPromise]);
    return { ...common, ...result, ...identity };
}

async function expectCommandDataInvalid(value, expectedPath){
    const { canonicalizeCommandData, EngineContractError } = await modules();
    assert.throws(
        () => canonicalizeCommandData(value, 'payload'),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_COMMAND_DATA');
            if (expectedPath !== undefined) assert.equal(error.details?.path, expectedPath);
            return true;
        }
    );
}

test('M3A1 command IDs reuse canonical content identity and require command type', async () => {
    const { assertCommandId, EngineContractError } = await modules();
    assert.equal(assertCommandId('evolve:command/evolution/dna'), 'evolve:command/evolution/dna');
    assert.throws(
        () => assertCommandId('evolve:technology/evolution/dna'),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_ID'
    );
    assert.throws(
        () => assertCommandId('Not Canonical'),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_ID'
    );
});

test('M3A1 command data canonicalizes deterministically, detaches, freezes and normalizes -0', async () => {
    const { canonicalizeCommandPayload } = await modules();
    const input = { z: [{ right: -0, left: 1 }], a: { beta: 2, alpha: 1 } };
    const output = canonicalizeCommandPayload(input);

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

test('M3A1 command data accepts null-prototype objects but emits normal frozen data objects', async () => {
    const { canonicalizeCommandPayload } = await modules();
    const input = Object.create(null);
    input.z = 2;
    input.a = Object.create(null);
    input.a.ok = true;

    const output = canonicalizeCommandPayload(input);
    assert.deepEqual(output, { a: { ok: true }, z: 2 });
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(Object.getPrototypeOf(output.a), Object.prototype);
    assert.equal(Object.isFrozen(output), true);
    assert.equal(Object.isFrozen(output.a), true);
});

test('M3A1 command data rejects non-data values, exotic objects, accessors, hidden/symbol fields, sparse arrays and array subclasses', async () => {
    await expectCommandDataInvalid(undefined, 'payload');
    await expectCommandDataInvalid(() => 1, 'payload');
    await expectCommandDataInvalid(Symbol('x'), 'payload');
    await expectCommandDataInvalid(1n, 'payload');
    await expectCommandDataInvalid(NaN, 'payload');
    await expectCommandDataInvalid(new Date(0), 'payload');

    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'danger', {
        enumerable: true,
        get(){ getterCalls++; return 1; },
    });
    await expectCommandDataInvalid(accessor, 'payload.danger');
    assert.equal(getterCalls, 0);

    const hidden = {};
    Object.defineProperty(hidden, 'secret', { value: 1, enumerable: false });
    await expectCommandDataInvalid(hidden, 'payload.secret');

    const symbolKeyed = { ok: true };
    symbolKeyed[Symbol('secret')] = 1;
    await expectCommandDataInvalid(symbolKeyed, 'payload');

    const sparse = new Array(2);
    sparse[1] = 1;
    await expectCommandDataInvalid(sparse, 'payload[0]');

    const extra = [1];
    extra.extra = true;
    await expectCommandDataInvalid(extra, 'payload.extra');

    class CommandArray extends Array {}
    await expectCommandDataInvalid(new CommandArray(1), 'payload');
});

test('M3A1 command data rejects cycles and shared object or array identity', async () => {
    const cyclic = {};
    cyclic.self = cyclic;
    await expectCommandDataInvalid(cyclic, 'payload.self');

    const shared = { amount: 1 };
    await expectCommandDataInvalid({ a: shared, b: shared }, 'payload.b');

    const sharedArray = [1, 2];
    await expectCommandDataInvalid({ a: sharedArray, b: sharedArray }, 'payload.b');
});

test('M3A1 command data rejects excessive nesting and reports unambiguous paths for unusual keys', async () => {
    const { canonicalizeCommandData, MAX_COMMAND_DATA_NESTING_DEPTH, EngineContractError } = await modules();
    let value = {};
    for (let index = 0; index <= MAX_COMMAND_DATA_NESTING_DEPTH; index++) value = { child: value };
    assert.throws(
        () => canonicalizeCommandData(value, 'payload'),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND_DATA' &&
            error.details?.maxDepth === MAX_COMMAND_DATA_NESTING_DEPTH
    );

    const strange = { 'a.b': undefined };
    assert.throws(
        () => canonicalizeCommandData(strange, 'payload'),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND_DATA' &&
            error.details?.path === 'payload["a.b"]'
    );
});

test('M3A1 hostile inspection failures fail closed', async () => {
    const hostile = new Proxy({}, {
        getPrototypeOf(){ throw new Error('nope'); },
    });
    await expectCommandDataInvalid(hostile, 'payload');
});

test('M3A1 payload root must be an object even though result data may be any inert command data', async () => {
    const { canonicalizeCommandPayload, commandSucceeded, EngineContractError } = await modules();
    assert.throws(
        () => canonicalizeCommandPayload([]),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_PAYLOAD'
    );
    assert.throws(
        () => canonicalizeCommandPayload('x'),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_PAYLOAD'
    );

    const outcome = commandSucceeded(['ok', 2]);
    assert.equal(Object.isFrozen(outcome), true);
    assert.equal(Object.isFrozen(outcome.data), true);
});

test('M3A1 success outcomes normalize to one closed frozen result shape', async () => {
    const { normalizeCommandOutcome } = await modules();
    const result = normalizeCommandOutcome(
        'evolve:command/test/success',
        { status: 'succeeded', data: { z: 2, a: [1] } }
    );

    assert.deepEqual(result, {
        commandId: 'evolve:command/test/success',
        status: 'succeeded',
        data: { a: [1], z: 2 },
        reasons: [],
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.data), true);
    assert.equal(Object.isFrozen(result.reasons), true);
});

test('M3A1 result normalization independently requires a canonical command ID', async () => {
    const { normalizeCommandOutcome, EngineContractError } = await modules();
    assert.throws(
        () => normalizeCommandOutcome('evolve:technology/not-a-command', { status: 'succeeded', data: null }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_ID'
    );
});

test('M3A1 rejected outcomes require machine-readable reasons and no localized message field', async () => {
    const { normalizeCommandOutcome, EngineContractError } = await modules();
    const result = normalizeCommandOutcome(
        'evolve:command/test/reject',
        { status: 'rejected', reasons: [{ code: 'blocked.test', details: { required: 2, actual: 1 } }] }
    );

    assert.equal(result.status, 'rejected');
    assert.equal(result.data, null);
    assert.deepEqual(result.reasons, [{ code: 'blocked.test', details: { actual: 1, required: 2 } }]);
    assert.equal(Object.isFrozen(result.reasons[0]), true);
    assert.equal(Object.isFrozen(result.reasons[0].details), true);

    assert.throws(
        () => normalizeCommandOutcome('evolve:command/test/reject', { status: 'rejected', reasons: [] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT'
    );
    assert.throws(
        () => normalizeCommandOutcome('evolve:command/test/reject', {
            status: 'rejected',
            reasons: [{ code: 'blocked.test', details: null, message: 'Nope' }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT'
    );
    assert.throws(
        () => normalizeCommandOutcome('evolve:command/test/reject', {
            status: 'rejected',
            reasons: [{ code: 'Bad Code', details: null }],
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT'
    );
});

test('M3A1 result contract rejects overloaded legacy-style callback results', async () => {
    const { normalizeCommandOutcome, EngineContractError } = await modules();
    for (const value of [true, false, 0, 1, null, undefined]){
        assert.throws(
            () => normalizeCommandOutcome('evolve:command/test/legacy', value),
            error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT'
        );
    }
});
