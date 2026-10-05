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

function passPayload(payload){
    return payload;
}

test('M3A1 bus is sealed, deterministic and exposes no handler lookup or registration mutation', async () => {
    const { createCommandBus, commandSucceeded } = await modules();
    const bus = createCommandBus({
        registrations: [
            { id: 'evolve:command/zeta', validatePayload: passPayload, execute: () => commandSucceeded(null) },
            { id: 'evolve:command/alpha', validatePayload: passPayload, execute: () => commandSucceeded(null) },
        ],
    });

    assert.equal(Object.isFrozen(bus), true);
    assert.deepEqual(Object.keys(bus).sort(), ['dispatch', 'has', 'ids']);
    assert.deepEqual(bus.ids(), ['evolve:command/alpha', 'evolve:command/zeta']);
    assert.equal(Object.isFrozen(bus.ids()), true);
    assert.equal(bus.has('evolve:command/alpha'), true);
    assert.equal(bus.has('evolve:command/missing'), false);
    assert.equal('register' in bus, false);
    assert.equal('get' in bus, false);
    assert.equal('handlers' in bus, false);
});

test('M3A1 bus rejects duplicate, malformed, async and wrong-type registrations', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();
    const valid = { id: 'evolve:command/test', validatePayload: passPayload, execute: () => commandSucceeded(null) };

    assert.throws(
        () => createCommandBus({ registrations: [valid, valid] }),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_COMMAND_ID'
    );
    assert.throws(
        () => createCommandBus({ registrations: [{ ...valid, id: 'evolve:technology/test' }] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_ID'
    );
    assert.throws(
        () => createCommandBus({ registrations: [{ ...valid, validatePayload: async payload => payload }] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_REGISTRATION'
    );
    assert.throws(
        () => createCommandBus({ registrations: [{ ...valid, execute: async () => commandSucceeded(null) }] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_REGISTRATION'
    );
    assert.throws(
        () => createCommandBus({ registrations: [{ ...valid, extra: true }] }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_REGISTRATION'
    );
});

test('M3A1 dispatch validates a closed envelope, detaches payload and canonicalizes validator output', async () => {
    const { createCommandBus, commandSucceeded } = await modules();
    let seenByValidator;
    let seenByHandler;
    const original = { nested: { amount: 1 } };

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload(payload){
                seenByValidator = payload;
                assert.equal(Object.isFrozen(payload), true);
                assert.notEqual(payload, original);
                return { z: payload.nested.amount, a: { ok: true } };
            },
            execute(payload){
                seenByHandler = payload;
                assert.equal(Object.isFrozen(payload), true);
                assert.deepEqual(Object.keys(payload), ['a', 'z']);
                return commandSucceeded({ accepted: payload.z });
            },
        }],
    });

    const result = bus.dispatch({ id: 'evolve:command/test', payload: original });
    original.nested.amount = 99;

    assert.equal(seenByValidator.nested.amount, 1);
    assert.equal(seenByHandler.z, 1);
    assert.deepEqual(result, {
        commandId: 'evolve:command/test',
        status: 'succeeded',
        data: { accepted: 1 },
        reasons: [],
    });
});

test('M3A1 dispatch returns structured rejection instead of overloading booleans', async () => {
    const { createCommandBus, commandRejected } = await modules();
    const bus = createCommandBus({ registrations: [{
        id: 'evolve:command/test',
        validatePayload: passPayload,
        execute: () => commandRejected([{ code: 'not-ready', details: { required: 2, actual: 1 } }]),
    }] });

    const result = bus.dispatch({ id: 'evolve:command/test', payload: {} });
    assert.equal(result.status, 'rejected');
    assert.equal(result.commandId, 'evolve:command/test');
    assert.deepEqual(result.reasons, [{ code: 'not-ready', details: { actual: 1, required: 2 } }]);
});

test('M3A1 dispatch treats unknown IDs, malformed envelopes and invalid handler results as contract failures', async () => {
    const { createCommandBus, EngineContractError } = await modules();
    const bus = createCommandBus({ registrations: [{
        id: 'evolve:command/test',
        validatePayload: passPayload,
        execute: () => false,
    }] });

    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/missing', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'UNKNOWN_COMMAND_ID' && error.details?.phase === 'resolve'
    );
    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/test' }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND' && error.details?.phase === 'envelope'
    );
    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/test', payload: {}, extra: true }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND'
    );
    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/test', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT' && error.details?.phase === 'result'
    );
});

test('M3A1 validator and handler failures are phase-tagged deterministic contract errors', async () => {
    const { createCommandBus, EngineContractError } = await modules();

    const validatorBus = createCommandBus({ registrations: [{
        id: 'evolve:command/validator',
        validatePayload(){ throw new Error('boom'); },
        execute(){ throw new Error('unreachable'); },
    }] });
    assert.throws(
        () => validatorBus.dispatch({ id: 'evolve:command/validator', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'COMMAND_PAYLOAD_VALIDATOR_FAILURE' &&
            error.details?.commandId === 'evolve:command/validator' &&
            error.details?.phase === 'validate'
    );

    const handlerBus = createCommandBus({ registrations: [{
        id: 'evolve:command/handler',
        validatePayload: passPayload,
        execute(){ throw new Error('boom'); },
    }] });
    assert.throws(
        () => handlerBus.dispatch({ id: 'evolve:command/handler', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'COMMAND_HANDLER_FAILURE' &&
            error.details?.commandId === 'evolve:command/handler' &&
            error.details?.phase === 'execute'
    );
});

test('M3A1 rejects promise-like validator and handler results', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();
    const validatorBus = createCommandBus({ registrations: [{
        id: 'evolve:command/validator',
        validatePayload: () => Promise.resolve({}),
        execute: () => commandSucceeded(null),
    }] });
    assert.throws(
        () => validatorBus.dispatch({ id: 'evolve:command/validator', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_PAYLOAD'
    );

    const handlerBus = createCommandBus({ registrations: [{
        id: 'evolve:command/handler',
        validatePayload: passPayload,
        execute: () => Promise.resolve(commandSucceeded(null)),
    }] });
    assert.throws(
        () => handlerBus.dispatch({ id: 'evolve:command/handler', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'INVALID_COMMAND_RESULT'
    );
});

test('M3A1 forbids nested dispatch from validation or execution and always clears the lock', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();
    let bus;
    let mode = 'validate';
    bus = createCommandBus({ registrations: [{
        id: 'evolve:command/test',
        validatePayload(payload){
            if (mode === 'validate') bus.dispatch({ id: 'evolve:command/test', payload: {} });
            return payload;
        },
        execute(){
            if (mode === 'execute') bus.dispatch({ id: 'evolve:command/test', payload: {} });
            return commandSucceeded(null);
        },
    }] });

    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/test', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'COMMAND_DISPATCH_REENTRANCY'
    );

    mode = 'execute';
    assert.throws(
        () => bus.dispatch({ id: 'evolve:command/test', payload: {} }),
        error => error instanceof EngineContractError && error.code === 'COMMAND_DISPATCH_REENTRANCY'
    );

    mode = 'ok';
    assert.equal(bus.dispatch({ id: 'evolve:command/test', payload: {} }).status, 'succeeded');
});
