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

test('M2D2a defines GameState schema v2 with an explicit empty achievement domain', async () => {
    const { GAME_STATE_SCHEMA_VERSION, createEmptyGameState, validateGameState } = await modules();

    assert.equal(GAME_STATE_SCHEMA_VERSION, 2);
    assert.deepEqual(createEmptyGameState(), { schemaVersion: 2, achievements: {} });
    assert.deepEqual(
        validateGameState({ schemaVersion: 2, achievements: {} }),
        { achievements: {}, schemaVersion: 2 }
    );
});

test('M2D2a GameState validation returns detached mutable state rather than definition-style frozen data', async () => {
    const { createEmptyGameState, validateGameState } = await modules();
    const input = createEmptyGameState();
    const output = validateGameState(input);

    assert.notEqual(output, input);
    assert.notEqual(output.achievements, input.achievements);
    assert.equal(Object.isFrozen(output), false);
    assert.equal(Object.isFrozen(output.achievements), false);

    output.schemaVersion = 99;
    output.achievements['evolve:achievement/trade'] = { rank: 1, universeRanks: {} };
    assert.equal(input.schemaVersion, 2);
    assert.deepEqual(input.achievements, {});
});

test('M2D2a GameState root fails closed for missing, unknown, and unsupported schema fields', async () => {
    const { validateGameState } = await modules();

    await expectCode(() => validateGameState({}), 'INVALID_GAME_STATE_FIELD');
    await expectCode(() => validateGameState({ schemaVersion: 2 }), 'INVALID_GAME_STATE_FIELD');
    await expectCode(
        () => validateGameState({ schemaVersion: 2, achievements: {}, resources: {} }),
        'UNKNOWN_GAME_STATE_FIELD'
    );
    await expectCode(
        () => validateGameState({ schemaVersion: 1, achievements: {} }),
        'UNSUPPORTED_GAME_STATE_SCHEMA_VERSION'
    );
    await expectCode(
        () => validateGameState({ schemaVersion: 3, achievements: {} }),
        'UNSUPPORTED_GAME_STATE_SCHEMA_VERSION'
    );
    await expectCode(
        () => validateGameState({ schemaVersion: 1.5, achievements: {} }),
        'INVALID_GAME_STATE_FIELD'
    );
    await expectCode(
        () => validateGameState({ schemaVersion: 0, achievements: {} }),
        'INVALID_GAME_STATE_FIELD'
    );
});

test('M2D2a GameState root is inert and rejects accessor-backed schema metadata without invoking it', async () => {
    const { validateGameState } = await modules();
    let getterCalls = 0;
    const input = { achievements: {} };
    Object.defineProperty(input, 'schemaVersion', {
        enumerable: true,
        get(){
            getterCalls++;
            return 2;
        },
    });

    await expectCode(() => validateGameState(input), 'INVALID_STATE_VALUE');
    assert.equal(getterCalls, 0);
});
