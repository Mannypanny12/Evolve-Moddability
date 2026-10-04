'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);

test('M2D2b2 combined rank-zero advancement atomically creates both record and explicit universe track', async () => {
    const { createGameStateRuntime } = await gameStatePromise;
    const runtime = createGameStateRuntime();

    const result = runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 0,
        advanceBase: true,
        universe: 'evil',
    });

    assert.deepEqual(runtime.store.read().achievements['evolve:achievement/trade'], {
        rank: 0,
        universeRanks: { evil: 0 },
    });
    assert.equal(result.changed, true);
    assert.equal(result.recordCreated, true);
    assert.equal(result.baseRankChanged, false);
    assert.equal(result.universeTrackCreated, true);
    assert.equal(result.universeRankChanged, false);
    assert.equal(result.previousBaseRank, 0);
    assert.equal(result.newBaseRank, 0);
    assert.equal(result.previousUniverseTrackPresent, false);
    assert.equal(result.newUniverseTrackPresent, true);
    assert.equal(result.previousUniverseRank, 0);
    assert.equal(result.newUniverseRank, 0);
    assert.equal(result.diagnostic.revisionBefore, 0);
    assert.equal(result.diagnostic.revisionAfter, 1);
    assert.equal(runtime.store.getRevision(), 1);
});
