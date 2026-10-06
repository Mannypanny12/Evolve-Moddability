'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [bus, result, identity] = await Promise.all([busPromise, resultPromise, identityPromise]);
    return { ...bus, ...result, ...identity };
}

test('M3E1 prepare validates, canonicalizes and freezes a command without executing it', async () => {
    const { createCommandBus, commandSucceeded } = await modules();
    let validations = 0;
    let executions = 0;
    const originalPayload = { nested: { amount: 2 }, z: true };

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload(payload){
                validations++;
                return {
                    amount: payload.nested.amount,
                    nested: { accepted: true },
                };
            },
            execute(payload){
                executions++;
                return commandSucceeded({ amount: payload.amount });
            },
        }],
    });

    const prepared = bus.prepare({
        id: 'evolve:command/test',
        payload: originalPayload,
    });

    assert.equal(validations, 1);
    assert.equal(executions, 0);
    assert.deepEqual(Object.keys(prepared), ['id', 'payload']);
    assert.equal(prepared.id, 'evolve:command/test');
    assert.deepEqual(prepared.payload, {
        amount: 2,
        nested: { accepted: true },
    });
    assert.equal(Object.isFrozen(prepared), true);
    assert.equal(Object.isFrozen(prepared.payload), true);
    assert.equal(Object.isFrozen(prepared.payload.nested), true);
    assert.notEqual(prepared.payload, originalPayload);

    originalPayload.nested.amount = 99;
    assert.equal(prepared.payload.amount, 2);
});

test('M3E1 dispatch uses the same command preparation semantics before execution', async () => {
    const { createCommandBus, commandSucceeded } = await modules();
    const validatedPayloads = [];
    const executedPayloads = [];

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload(payload){
                const validated = { a: payload.z, nested: { ok: true } };
                validatedPayloads.push(validated);
                return validated;
            },
            execute(payload){
                executedPayloads.push(payload);
                return commandSucceeded(null);
            },
        }],
    });

    const raw = { id: 'evolve:command/test', payload: { z: 4 } };
    const prepared = bus.prepare(raw);
    const result = bus.dispatch(raw);

    assert.equal(result.status, 'succeeded');
    assert.equal(validatedPayloads.length, 2);
    assert.equal(executedPayloads.length, 1);
    assert.deepEqual(executedPayloads[0], prepared.payload);
    assert.deepEqual(Object.keys(executedPayloads[0]), ['a', 'nested']);
    assert.equal(Object.isFrozen(executedPayloads[0]), true);
    assert.equal(Object.isFrozen(executedPayloads[0].nested), true);
});

test('M3E1 prepare rejects malformed envelopes, unknown commands and invalid command-specific payloads', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();
    let executions = 0;

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload(payload){
                if (!Number.isSafeInteger(payload.amount) || payload.amount <= 0){
                    throw new EngineContractError(
                        'INVALID_TEST_AMOUNT',
                        'amount must be positive',
                        { path: 'command.payload.amount' }
                    );
                }
                return { amount: payload.amount };
            },
            execute(){
                executions++;
                return commandSucceeded(null);
            },
        }],
    });

    assert.throws(
        () => bus.prepare({ id: 'evolve:command/test' }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND' &&
            error.details?.phase === 'envelope'
    );
    assert.throws(
        () => bus.prepare({ id: 'evolve:command/missing', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'UNKNOWN_COMMAND_ID' &&
            error.details?.phase === 'resolve'
    );
    assert.throws(
        () => bus.prepare({ id: 'evolve:command/test', payload: { amount: 0 } }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_TEST_AMOUNT' &&
            error.details?.phase === 'validate'
    );
    assert.equal(executions, 0);
});

test('M3E1 prepare rejects async/thenable validator output without executing the handler', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();
    let executions = 0;

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: () => Promise.resolve({}),
            execute(){
                executions++;
                return commandSucceeded(null);
            },
        }],
    });

    assert.throws(
        () => bus.prepare({ id: 'evolve:command/test', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND_PAYLOAD' &&
            error.details?.phase === 'validate'
    );
    assert.equal(executions, 0);
});

test('M3E1 preparation participates in the module-wide no-nesting rule', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();

    const inner = createCommandBus({
        registrations: [{
            id: 'evolve:command/inner',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });

    let nested = true;
    const outer = createCommandBus({
        registrations: [{
            id: 'evolve:command/outer',
            validatePayload(payload){
                if (nested){
                    inner.prepare({ id: 'evolve:command/inner', payload: {} });
                }
                return payload;
            },
            execute: () => commandSucceeded(null),
        }],
    });

    assert.throws(
        () => outer.prepare({ id: 'evolve:command/outer', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'COMMAND_DISPATCH_REENTRANCY' &&
            error.details?.phase === 'validate' &&
            error.details?.causePhase === 'prepare'
    );

    nested = false;
    assert.equal(
        outer.prepare({ id: 'evolve:command/outer', payload: {} }).id,
        'evolve:command/outer'
    );
    assert.equal(
        inner.prepare({ id: 'evolve:command/inner', payload: {} }).id,
        'evolve:command/inner'
    );
});
