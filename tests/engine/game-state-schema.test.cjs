'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [gameState, identity] = await Promise.all([gameStatePromise, identityPromise]);
    return { ...gameState, ...identity };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(fn, error => error instanceof EngineContractError && error.code === code);
}

test('M2A defines an explicit minimal GameState root without cloning legacy global', async () => {
    const { GAME_STATE_SCHEMA_VERSION, createEmptyGameState, validateGameState } = await modules();

    assert.equal(GAME_STATE_SCHEMA_VERSION, 1);
    assert.deepEqual(createEmptyGameState(), { schemaVersion: 1 });
    assert.deepEqual(validateGameState({ schemaVersion: 1 }), { schemaVersion: 1 });
});

test('M2A GameState validation returns detached mutable state rather than definition-style frozen data', async () => {
    const { createEmptyGameState, validateGameState } = await modules();
    const input = createEmptyGameState();
    const output = validateGameState(input);

    assert.notEqual(output, input);
    assert.equal(Object.isFrozen(output), false);

    output.schemaVersion = 99;
    assert.equal(input.schemaVersion, 1);
});

test('M2A GameState root fails closed for missing, unknown, and unsupported schema fields', async () => {
    const { validateGameState } = await modules();

    await expectCode(() => validateGameState({}), 'INVALID_GAME_STATE_FIELD');
    await expectCode(() => validateGameState({ schemaVersion: 1, resources: {} }), 'UNKNOWN_GAME_STATE_FIELD');
    await expectCode(() => validateGameState({ schemaVersion: 2 }), 'UNSUPPORTED_GAME_STATE_SCHEMA_VERSION');
    await expectCode(() => validateGameState({ schemaVersion: 1.5 }), 'INVALID_GAME_STATE_FIELD');
    await expectCode(() => validateGameState({ schemaVersion: 0 }), 'INVALID_GAME_STATE_FIELD');
});

test('M2A GameState root is inert and rejects accessor-backed schema metadata without invoking it', async () => {
    const { validateGameState } = await modules();
    let getterCalls = 0;
    const input = {};
    Object.defineProperty(input, 'schemaVersion', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });

    await expectCode(() => validateGameState(input), 'INVALID_STATE_VALUE');
    assert.equal(getterCalls, 0);
});
