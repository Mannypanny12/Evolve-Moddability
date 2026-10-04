'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const servicePromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-state-service.mjs')).href);
const stateStorePromise = import(pathToFileURL(path.join(root, 'src/engine/state/state-store.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [gameState, service, stateStore, identity] = await Promise.all([
        gameStatePromise,
        servicePromise,
        stateStorePromise,
        identityPromise,
    ]);
    return { ...gameState, ...service, ...stateStore, ...identity };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(
        fn,
        error => error instanceof EngineContractError && error.code === code,
        `expected EngineContractError ${code}`
    );
}

function stateWith(record){
    return {
        schemaVersion: 2,
        achievements: record === undefined ? {} : {
            'evolve:achievement/trade': record,
        },
    };
}

function hostileFieldValue(){
    let trapCalls = 0;
    const value = new Proxy({}, {
        get(){
            trapCalls++;
            throw new Error('field value must not be inspected');
        },
        getPrototypeOf(){
            trapCalls++;
            throw new Error('field value prototype must not be inspected');
        },
        ownKeys(){
            trapCalls++;
            throw new Error('field value keys must not be inspected');
        },
    });
    return {
        value,
        trapCalls: () => trapCalls,
    };
}

test('M2D2b2 review: hostile nested command field values are primitive-gated without proxy trap execution', async () => {
    const { createGameStateRuntime } = await modules();

    {
        const runtime = createGameStateRuntime();
        const hostile = hostileFieldValue();
        await expectCode(
            () => runtime.achievements.advance({
                achievementId: hostile.value,
                rank: 1,
                advanceBase: true,
            }),
            'INVALID_ACHIEVEMENT_STATE_ID'
        );
        assert.equal(hostile.trapCalls(), 0);
        assert.equal(runtime.store.getRevision(), 0);
    }

    {
        const runtime = createGameStateRuntime();
        const hostile = hostileFieldValue();
        await expectCode(
            () => runtime.achievements.advance({
                achievementId: 'evolve:achievement/trade',
                rank: hostile.value,
                advanceBase: true,
            }),
            'INVALID_ACHIEVEMENT_STATE_RANK'
        );
        assert.equal(hostile.trapCalls(), 0);
        assert.equal(runtime.store.getRevision(), 0);
    }

    {
        const runtime = createGameStateRuntime();
        const hostile = hostileFieldValue();
        await expectCode(
            () => runtime.achievements.advance({
                achievementId: 'evolve:achievement/trade',
                rank: 1,
                advanceBase: true,
                universe: hostile.value,
            }),
            'INVALID_ACHIEVEMENT_UNIVERSE'
        );
        assert.equal(hostile.trapCalls(), 0);
        assert.equal(runtime.store.getRevision(), 0);
    }

    {
        const runtime = createGameStateRuntime();
        const hostileId = hostileFieldValue();
        await expectCode(
            () => runtime.achievements.removeUniverseRank({
                achievementId: hostileId.value,
                universe: 'evil',
            }),
            'INVALID_ACHIEVEMENT_STATE_ID'
        );
        assert.equal(hostileId.trapCalls(), 0);

        const hostileUniverse = hostileFieldValue();
        await expectCode(
            () => runtime.achievements.removeUniverseRank({
                achievementId: 'evolve:achievement/trade',
                universe: hostileUniverse.value,
            }),
            'INVALID_ACHIEVEMENT_UNIVERSE'
        );
        assert.equal(hostileUniverse.trapCalls(), 0);
        assert.equal(runtime.store.getRevision(), 0);
    }
});

test('M2D2b2 review: repeat zero universe advancement is a state no-op with complete compatibility metadata', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({
        rank: 0,
        universeRanks: { evil: 0 },
    }));

    const result = runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 0,
        advanceBase: false,
        universe: 'evil',
    });

    assert.equal(result.changed, false);
    assert.equal(result.recordCreated, false);
    assert.equal(result.baseRankChanged, false);
    assert.equal(result.universeTrackCreated, false);
    assert.equal(result.universeRankChanged, false);
    assert.equal(result.previousUniverseTrackPresent, true);
    assert.equal(result.newUniverseTrackPresent, true);
    assert.equal(result.previousUniverseRank, 0);
    assert.equal(result.newUniverseRank, 0);
    assert.equal(result.diagnostic.committed, false);
    assert.equal(runtime.store.getRevision(), 0);
    assert.deepEqual(runtime.store.read().achievements['evolve:achievement/trade'], {
        rank: 0,
        universeRanks: { evil: 0 },
    });
});

test('M2D2b2 review: repeat base zero remains a no-op with base pre-state available to D3', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({
        rank: 0,
        universeRanks: {},
    }));

    const result = runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 0,
        advanceBase: true,
    });

    assert.equal(result.changed, false);
    assert.equal(result.recordCreated, false);
    assert.equal(result.baseRankChanged, false);
    assert.equal(result.previousBaseRank, 0);
    assert.equal(result.newBaseRank, 0);
    assert.equal(result.universe, null);
    assert.equal(result.previousUniverseTrackPresent, null);
    assert.equal(result.previousUniverseRank, null);
    assert.equal(runtime.store.getRevision(), 0);
});

test('M2D2b2 review: failed commit validation rolls back service writes and leaves the capability usable', async () => {
    const {
        createAchievementStateService,
        createStateStore,
        validateGameState,
        EngineContractError,
    } = await modules();

    const { store, mutationAuthority } = createStateStore({
        initialState: stateWith(),
        validateState(value){
            const validated = validateGameState(value);
            const trade = validated.achievements['evolve:achievement/trade'];
            if (trade && trade.rank === 2){
                throw new EngineContractError(
                    'TEST_REJECTED_ACHIEVEMENT_STATE',
                    'test validator rejects rank two'
                );
            }
            return validated;
        },
        writableFields: ['achievements'],
    });
    const mutationScope = mutationAuthority.createMutationScope({
        id: 'achievement-state',
        fields: ['achievements'],
    });
    const achievements = createAchievementStateService({ mutationScope });

    await expectCode(
        () => achievements.advance({
            achievementId: 'evolve:achievement/trade',
            rank: 2,
            advanceBase: true,
            universe: 'evil',
        }),
        'TEST_REJECTED_ACHIEVEMENT_STATE'
    );

    assert.deepEqual(store.read(), stateWith());
    assert.equal(store.getRevision(), 0);
    assert.equal(store.getLastChange(), null);

    const recovery = achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: true,
        universe: 'evil',
    });
    assert.equal(recovery.changed, true);
    assert.equal(store.getRevision(), 1);
    assert.deepEqual(store.read().achievements['evolve:achievement/trade'], {
        rank: 1,
        universeRanks: { evil: 1 },
    });
});

test('M2D2b2 review: failed universe removal validation rolls back deletion and preserves lastChange', async () => {
    const {
        createAchievementStateService,
        createStateStore,
        validateGameState,
        EngineContractError,
    } = await modules();

    let rejectMissingEvil = false;
    const initial = stateWith({ rank: 2, universeRanks: { evil: 1 } });
    const { store, mutationAuthority } = createStateStore({
        initialState: initial,
        validateState(value){
            const validated = validateGameState(value);
            const trade = validated.achievements['evolve:achievement/trade'];
            if (
                rejectMissingEvil
                && trade
                && !Object.prototype.hasOwnProperty.call(trade.universeRanks, 'evil')
            ){
                throw new EngineContractError(
                    'TEST_REJECTED_UNIVERSE_REMOVAL',
                    'test validator rejects removal'
                );
            }
            return validated;
        },
        writableFields: ['achievements'],
    });
    const mutationScope = mutationAuthority.createMutationScope({
        id: 'achievement-state',
        fields: ['achievements'],
    });
    const achievements = createAchievementStateService({ mutationScope });

    const committed = achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 2,
        advanceBase: true,
    });
    assert.equal(committed.changed, false);
    assert.equal(store.getLastChange(), null);

    rejectMissingEvil = true;
    await expectCode(
        () => achievements.removeUniverseRank({
            achievementId: 'evolve:achievement/trade',
            universe: 'evil',
        }),
        'TEST_REJECTED_UNIVERSE_REMOVAL'
    );

    assert.deepEqual(store.read(), initial);
    assert.equal(store.getRevision(), 0);
    assert.equal(store.getLastChange(), null);
});

test('M2D2b2 review: removeUniverseRank remains closure-bound when borrowed across runtimes', async () => {
    const { createGameStateRuntime } = await modules();
    const first = createGameStateRuntime(stateWith({
        rank: 1,
        universeRanks: { evil: 1 },
    }));
    const second = createGameStateRuntime(stateWith({
        rank: 4,
        universeRanks: { evil: 4 },
    }));

    const borrowed = first.achievements.removeUniverseRank;
    const result = borrowed.call(second.achievements, {
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    });

    assert.equal(result.changed, true);
    assert.deepEqual(first.store.read().achievements['evolve:achievement/trade'], {
        rank: 1,
        universeRanks: {},
    });
    assert.deepEqual(second.store.read().achievements['evolve:achievement/trade'], {
        rank: 4,
        universeRanks: { evil: 4 },
    });
    assert.equal(first.store.getRevision(), 1);
    assert.equal(second.store.getRevision(), 0);
});

test('M2D2b2 review: mutation result surface remains explicit and closed', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();
    const result = runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: true,
        universe: 'evil',
    });

    assert.deepEqual(Object.keys(result).sort(), [
        'achievementId',
        'baseRankChanged',
        'changed',
        'diagnostic',
        'newBaseRank',
        'newUniverseRank',
        'newUniverseTrackPresent',
        'operation',
        'previousBaseRank',
        'previousUniverseRank',
        'previousUniverseTrackPresent',
        'recordCreated',
        'universe',
        'universeRankChanged',
        'universeRankRemoved',
        'universeTrackCreated',
    ].sort());
    assert.equal(Object.isFrozen(result), true);
});
