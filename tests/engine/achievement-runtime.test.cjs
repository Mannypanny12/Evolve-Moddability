'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const servicePromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-state-service.mjs')).href);
const selectorsPromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-selectors.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [gameState, service, selectors, identity] = await Promise.all([
        gameStatePromise,
        servicePromise,
        selectorsPromise,
        identityPromise,
    ]);
    return { ...gameState, ...service, ...selectors, ...identity };
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
                rank: 3,
                universeRanks: { evil: 2 },
            },
        },
    };
}

const READ_STORE_KEYS = [
    'getLastChange',
    'getRevision',
    'read',
    'select',
    'snapshot',
];
const ACHIEVEMENT_SERVICE_KEYS = [
    'advance',
    'removeUniverseRank',
];

test('M2D2b2 keeps createGameStateStore as the same read-only capability surface', async () => {
    const { createGameStateStore, achievementRank } = await modules();
    const store = createGameStateStore(populatedState());

    assert.deepEqual(Object.keys(store).sort(), READ_STORE_KEYS);
    assert.equal(store.createMutationScope, undefined);
    assert.equal(store.transaction, undefined);
    assert.equal(store.mutationAuthority, undefined);
    assert.equal(store.select(achievementRank, 'evolve:achievement/trade'), 3);
    assert.equal(store.getRevision(), 0);
    assert.equal(Object.isFrozen(store), true);
    assert.equal(Object.isFrozen(store.read()), true);
    assert.equal(Object.isFrozen(store.read().achievements), true);
});

test('M2D2b2 runtime exposes only read store plus the two achievement-domain mutations', async () => {
    const { createGameStateRuntime, achievementRank } = await modules();
    const runtime = createGameStateRuntime(populatedState());

    assert.deepEqual(Object.keys(runtime).sort(), ['achievements', 'store']);
    assert.equal(Object.isFrozen(runtime), true);

    assert.deepEqual(Object.keys(runtime.store).sort(), READ_STORE_KEYS);
    assert.equal(runtime.store.createMutationScope, undefined);
    assert.equal(runtime.store.transaction, undefined);
    assert.equal(runtime.store.mutationAuthority, undefined);
    assert.equal(runtime.store.select(achievementRank, 'evolve:achievement/trade'), 3);
    assert.equal(runtime.store.getRevision(), 0);

    assert.equal(Object.isFrozen(runtime.achievements), true);
    assert.deepEqual(Object.keys(runtime.achievements).sort(), ACHIEVEMENT_SERVICE_KEYS);
    assert.equal(runtime.achievements.transaction, undefined);
    assert.equal(runtime.achievements.createMutationScope, undefined);
    assert.equal(runtime.achievements.mutationAuthority, undefined);
});

test('M2D2b2 achievement service accepts only the dedicated achievements mutation capability shape', async () => {
    const { createAchievementStateService } = await modules();
    const transaction = () => undefined;

    const service = createAchievementStateService({
        mutationScope: Object.freeze({
            id: 'achievement-state',
            fields: Object.freeze(['achievements']),
            transaction,
        }),
    });
    assert.equal(Object.isFrozen(service), true);
    assert.deepEqual(Object.keys(service).sort(), ACHIEVEMENT_SERVICE_KEYS);

    await expectCode(
        () => createAchievementStateService({
            mutationScope: { id: 'resource-state', fields: ['achievements'], transaction },
        }),
        'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
    );
    await expectCode(
        () => createAchievementStateService({
            mutationScope: { id: 'achievement-state', fields: ['achievements', 'resources'], transaction },
        }),
        'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
    );
    await expectCode(
        () => createAchievementStateService({
            mutationScope: { id: 'achievement-state', fields: ['achievements'] },
        }),
        'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
    );
});

test('M2D2b2 runtime instances own isolated stores and expose no cross-runtime generic authority', async () => {
    const { createGameStateRuntime } = await modules();
    const first = createGameStateRuntime(populatedState());
    const second = createGameStateRuntime();

    assert.notEqual(first, second);
    assert.notEqual(first.store, second.store);
    assert.notEqual(first.achievements, second.achievements);
    assert.equal(first.store.read().achievements['evolve:achievement/trade'].rank, 3);
    assert.deepEqual(second.store.read().achievements, {});
    assert.equal(first.store.getRevision(), 0);
    assert.equal(second.store.getRevision(), 0);
});
