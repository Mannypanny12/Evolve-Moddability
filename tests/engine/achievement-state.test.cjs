'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const achievementStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-state.mjs')).href);
const selectorPromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-selectors.mjs')).href);
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [achievementState, selectors, gameState, identity] = await Promise.all([
        achievementStatePromise,
        selectorPromise,
        gameStatePromise,
        identityPromise,
    ]);
    return { ...achievementState, ...selectors, ...gameState, ...identity };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(
        fn,
        error => error instanceof EngineContractError && error.code === code,
        `expected EngineContractError ${code}`
    );
}

function populatedState(){
    return {
        schemaVersion: 2,
        achievements: {
            'evolve:achievement/trade': {
                rank: 7,
                universeRanks: {
                    evil: 8,
                    heavy: 2,
                },
            },
            'evolve:achievement/explorer': {
                rank: 3,
                universeRanks: {
                    evil: 2,
                    magic: 1,
                },
            },
            'evolve:achievement/legacy_unknown': {
                rank: 5,
                universeRanks: {
                    evil: 5,
                },
            },
            'evolve:achievement/zero_presence': {
                rank: 0,
                universeRanks: {},
            },
        },
    };
}

test('M2D2a achievement state accepts canonical achievement IDs and deterministic explicit rank tracks', async () => {
    const { validateGameState } = await modules();
    const input = {
        schemaVersion: 2,
        achievements: {
            'evolve:achievement/trade': {
                universeRanks: { micro: 4, evil: 2 },
                rank: 3,
            },
            'modpack:achievement/custom/path': {
                rank: 0,
                universeRanks: {},
            },
        },
    };

    const output = validateGameState(input);

    assert.deepEqual(output, {
        achievements: {
            'evolve:achievement/trade': {
                rank: 3,
                universeRanks: { evil: 2, micro: 4 },
            },
            'modpack:achievement/custom/path': {
                rank: 0,
                universeRanks: {},
            },
        },
        schemaVersion: 2,
    });
    assert.notEqual(output, input);
    assert.notEqual(output.achievements, input.achievements);
});

test('M2D2a stores unresolved canonical achievement IDs without requiring current registry membership', async () => {
    const { validateGameState } = await modules();
    const output = validateGameState({
        schemaVersion: 2,
        achievements: {
            'ancientmod:achievement/removed_content': {
                rank: 4,
                universeRanks: { antimatter: 2 },
            },
        },
    });

    assert.equal(output.achievements['ancientmod:achievement/removed_content'].rank, 4);
    assert.equal(output.achievements['ancientmod:achievement/removed_content'].universeRanks.antimatter, 2);
});

test('M2D2a achievement IDs fail closed for legacy keys, wrong content types, and malformed canonical IDs', async () => {
    const { validateGameState } = await modules();

    for (const id of [
        'trade',
        'evolve:resource/food',
        'Evolve:achievement/trade',
        'evolve:achievement/',
    ]){
        await expectCode(
            () => validateGameState({
                schemaVersion: 2,
                achievements: {
                    [id]: { rank: 1, universeRanks: {} },
                },
            }),
            'INVALID_ACHIEVEMENT_STATE_ID'
        );
    }
});

test('M2D2a achievement records are closed and reject malformed rank representation', async () => {
    const { validateGameState } = await modules();
    const id = 'evolve:achievement/trade';

    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1, universeRanks: {}, legacyAffix: 2 } },
        }),
        'UNKNOWN_GAME_STATE_FIELD'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1 } },
        }),
        'INVALID_GAME_STATE_FIELD'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: -1, universeRanks: {} } },
        }),
        'INVALID_ACHIEVEMENT_STATE_RANK'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1.5, universeRanks: {} } },
        }),
        'INVALID_ACHIEVEMENT_STATE_RANK'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1, universeRanks: { evil: -1 } } },
        }),
        'INVALID_ACHIEVEMENT_STATE_RANK'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1, universeRanks: { standard: 1 } } },
        }),
        'UNKNOWN_GAME_STATE_FIELD'
    );
    await expectCode(
        () => validateGameState({
            schemaVersion: 2,
            achievements: { [id]: { rank: 1, universeRanks: { evil: undefined } } },
        }),
        'INVALID_STATE_VALUE'
    );
});

test('M2D2a state validation preserves zero records and legacy-compatible ranks above five', async () => {
    const { validateGameState } = await modules();
    const state = validateGameState(populatedState());

    assert.deepEqual(state.achievements['evolve:achievement/zero_presence'], {
        rank: 0,
        universeRanks: {},
    });
    assert.equal(state.achievements['evolve:achievement/trade'].rank, 7);
    assert.equal(state.achievements['evolve:achievement/trade'].universeRanks.evil, 8);
});

test('M2D2a direct selectors distinguish presence from rank and normalize missing tracks to zero', async () => {
    const {
        validateGameState,
        hasAchievement,
        achievementRank,
        achievementUniverseRank,
    } = await modules();
    const state = validateGameState(populatedState());

    assert.equal(hasAchievement(state, 'evolve:achievement/zero_presence'), true);
    assert.equal(achievementRank(state, 'evolve:achievement/zero_presence'), 0);
    assert.equal(hasAchievement(state, 'evolve:achievement/missing'), false);
    assert.equal(achievementRank(state, 'evolve:achievement/missing'), 0);

    assert.equal(achievementUniverseRank(state, 'evolve:achievement/trade', 'standard'), 7);
    assert.equal(achievementUniverseRank(state, 'evolve:achievement/trade', 'evil'), 8);
    assert.equal(achievementUniverseRank(state, 'evolve:achievement/trade', 'heavy'), 2);
    assert.equal(achievementUniverseRank(state, 'evolve:achievement/trade', 'magic'), 0);
    assert.equal(achievementUniverseRank(state, 'evolve:achievement/missing', 'micro'), 0);
});

test('M2D2a derived selectors cap each contribution and count only explicit recognized achievement IDs', async () => {
    const {
        validateGameState,
        achievementLevel,
        achievementUniverseLevel,
    } = await modules();
    const state = validateGameState(populatedState());
    const recognized = [
        'evolve:achievement/trade',
        'evolve:achievement/explorer',
    ];

    assert.equal(achievementLevel(state, recognized), 8);
    assert.equal(achievementUniverseLevel(state, 'standard', recognized), 8);
    assert.equal(achievementUniverseLevel(state, 'evil', recognized), 7);
    assert.equal(achievementUniverseLevel(state, 'heavy', recognized), 2);
    assert.equal(achievementUniverseLevel(state, 'magic', recognized), 1);

    // The stored unresolved record has rank 5 but is deliberately not recognized.
    assert.equal(state.achievements['evolve:achievement/legacy_unknown'].rank, 5);
});

test('M2D2a derived selectors deduplicate recognized IDs and ignore recognized IDs absent from state', async () => {
    const { validateGameState, achievementLevel, achievementUniverseLevel } = await modules();
    const state = validateGameState(populatedState());
    const recognized = [
        'evolve:achievement/trade',
        'evolve:achievement/trade',
        'evolve:achievement/not_earned',
        'evolve:achievement/explorer',
    ];

    assert.equal(achievementLevel(state, recognized), 8);
    assert.equal(achievementUniverseLevel(state, 'evil', recognized), 7);
});

test('M2D2a selector inputs fail closed instead of inheriting legacy universe fallthrough', async () => {
    const {
        validateGameState,
        achievementUniverseRank,
        achievementLevel,
    } = await modules();
    const state = validateGameState(populatedState());

    await expectCode(
        () => achievementUniverseRank(state, 'evolve:achievement/trade', 'bigbang'),
        'INVALID_ACHIEVEMENT_UNIVERSE'
    );
    await expectCode(
        () => achievementLevel(state, 'evolve:achievement/trade'),
        'INVALID_ACHIEVEMENT_RECOGNIZED_IDS'
    );
    await expectCode(
        () => achievementLevel(state, ['evolve:resource/food']),
        'INVALID_ACHIEVEMENT_STATE_ID'
    );
});

test('M2D2a selectors compose through the read-only GameState store without introducing write authority', async () => {
    const {
        createGameStateStore,
        achievementRank,
        achievementUniverseLevel,
    } = await modules();
    const store = createGameStateStore(populatedState());

    assert.equal(store.select(achievementRank, 'evolve:achievement/trade'), 7);
    assert.equal(
        store.select(
            achievementUniverseLevel,
            'evil',
            ['evolve:achievement/trade', 'evolve:achievement/explorer']
        ),
        7
    );
    assert.equal(store.createMutationScope, undefined);
    assert.equal(store.getRevision(), 0);
    assert.equal(Object.isFrozen(store.read().achievements), true);
    assert.equal(Object.isFrozen(store.read().achievements['evolve:achievement/trade']), true);
});
