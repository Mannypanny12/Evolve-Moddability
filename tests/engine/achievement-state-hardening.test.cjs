'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const selectorPromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-selectors.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [gameState, selectors, identity] = await Promise.all([
        gameStatePromise,
        selectorPromise,
        identityPromise,
    ]);
    return { ...gameState, ...selectors, ...identity };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(
        fn,
        error => error instanceof EngineContractError && error.code === code,
        `expected EngineContractError ${code}`
    );
}

test('M2D2a preserves present zero-valued universe tracks instead of normalizing them away', async () => {
    const { validateGameState, achievementUniverseRank } = await modules();
    const id = 'evolve:achievement/trade';
    const state = validateGameState({
        schemaVersion: 2,
        achievements: {
            [id]: {
                rank: 0,
                universeRanks: { evil: 0 },
            },
        },
    });

    assert.equal(Object.prototype.hasOwnProperty.call(state.achievements[id].universeRanks, 'evil'), true);
    assert.equal(state.achievements[id].universeRanks.evil, 0);
    assert.equal(achievementUniverseRank(state, id, 'evil'), 0);

    const absent = validateGameState({
        schemaVersion: 2,
        achievements: {
            [id]: {
                rank: 0,
                universeRanks: {},
            },
        },
    });
    assert.equal(Object.prototype.hasOwnProperty.call(absent.achievements[id].universeRanks, 'evil'), false);
    assert.equal(achievementUniverseRank(absent, id, 'evil'), 0);
});

test('M2D2a accepts the safe-integer rank boundary and rejects values beyond it', async () => {
    const { validateGameState } = await modules();
    const id = 'evolve:achievement/trade';
    const state = validateGameState({
        schemaVersion: 2,
        achievements: {
            [id]: {
                rank: Number.MAX_SAFE_INTEGER,
                universeRanks: { evil: Number.MAX_SAFE_INTEGER },
            },
        },
    });

    assert.equal(state.achievements[id].rank, Number.MAX_SAFE_INTEGER);
    assert.equal(state.achievements[id].universeRanks.evil, Number.MAX_SAFE_INTEGER);

    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: {
                [id]: {
                    rank: Number.MAX_SAFE_INTEGER + 1,
                    universeRanks: {},
                },
            },
        }),
        'INVALID_ACHIEVEMENT_STATE_RANK'
    );
});

test('M2D2a nested achievement accessors are rejected without invocation', async () => {
    const { validateGameState } = await modules();
    const id = 'evolve:achievement/trade';
    let rankGetterCalls = 0;
    const record = { universeRanks: {} };
    Object.defineProperty(record, 'rank', {
        enumerable: true,
        get(){
            rankGetterCalls++;
            return 1;
        },
    });

    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: record },
        }),
        'INVALID_STATE_VALUE'
    );
    assert.equal(rankGetterCalls, 0);
});

test('M2D2a achievement containers reject arrays instead of accepting object-shaped substitutes', async () => {
    const { validateGameState } = await modules();
    const id = 'evolve:achievement/trade';

    await expectCode(
        () => validateGameState({ schemaVersion: 2, achievements: [] }),
        'INVALID_ACHIEVEMENT_STATE'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: [] },
        }),
        'INVALID_STATE_VALUE'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: {
                [id]: { rank: 1, universeRanks: [] },
            },
        }),
        'INVALID_STATE_VALUE'
    );
});

test('M2D2a recognized-ID selector inputs reject accessor-backed arrays without invoking them', async () => {
    const { validateGameState, achievementLevel } = await modules();
    const state = validateGameState({ schemaVersion: 2, achievements: {} });
    const recognized = ['evolve:achievement/trade'];
    let getterCalls = 0;
    Object.defineProperty(recognized, '0', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 'evolve:achievement/trade';
        },
    });

    await expectCode(
        () => achievementLevel(state, recognized),
        'INVALID_STATE_VALUE'
    );
    assert.equal(getterCalls, 0);
});
