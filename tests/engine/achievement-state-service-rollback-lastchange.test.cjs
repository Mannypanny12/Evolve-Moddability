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

test('M2D2b2 review: rejected removal preserves a prior committed diagnostic and revision', async () => {
    const {
        createAchievementStateService,
        createStateStore,
        validateGameState,
        EngineContractError,
    } = await modules();

    let rejectMissingEvil = false;
    const initialState = {
        schemaVersion: 2,
        achievements: {
            'evolve:achievement/trade': {
                rank: 2,
                universeRanks: { evil: 1 },
            },
        },
    };

    const { store, mutationAuthority } = createStateStore({
        initialState,
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

    const prior = achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: false,
        universe: 'heavy',
    });
    assert.equal(prior.changed, true);
    assert.equal(store.getRevision(), 1);
    assert.equal(store.getLastChange(), prior.diagnostic);
    const lastChange = store.getLastChange();

    rejectMissingEvil = true;
    assert.throws(
        () => achievements.removeUniverseRank({
            achievementId: 'evolve:achievement/trade',
            universe: 'evil',
        }),
        error => error instanceof EngineContractError
            && error.code === 'TEST_REJECTED_UNIVERSE_REMOVAL'
    );

    assert.deepEqual(store.read().achievements['evolve:achievement/trade'], {
        rank: 2,
        universeRanks: { evil: 1, heavy: 1 },
    });
    assert.equal(store.getRevision(), 1);
    assert.equal(store.getLastChange(), lastChange);
});
