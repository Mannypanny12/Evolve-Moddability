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

test('M3A1 reentrancy lock spans all command bus instances', async () => {
    const { createCommandBus, commandSucceeded, EngineContractError } = await modules();

    const innerBus = createCommandBus({ registrations: [{
        id: 'evolve:command/inner',
        validatePayload: passPayload,
        execute: () => commandSucceeded(null),
    }] });

    let nested = true;
    const outerBus = createCommandBus({ registrations: [{
        id: 'evolve:command/outer',
        validatePayload: passPayload,
        execute(){
            if (nested) innerBus.dispatch({ id: 'evolve:command/inner', payload: {} });
            return commandSucceeded(null);
        },
    }] });

    assert.throws(
        () => outerBus.dispatch({ id: 'evolve:command/outer', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'COMMAND_DISPATCH_REENTRANCY' &&
            error.details?.phase === 'execute' &&
            error.details?.causePhase === 'dispatch'
    );

    nested = false;
    assert.equal(outerBus.dispatch({ id: 'evolve:command/outer', payload: {} }).status, 'succeeded');
    assert.equal(innerBus.dispatch({ id: 'evolve:command/inner', payload: {} }).status, 'succeeded');
});
