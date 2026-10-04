'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const selectorsPromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-selectors.mjs')).href);

test('M2D4 universe-track presence distinguishes missing from explicit zero', async () => {
    const { hasAchievementUniverseRank, achievementUniverseRank, achievementTotalRank } = await selectorsPromise;
    const state = {
        schemaVersion: 2,
        achievements: {
            'evolve:achievement/trade': {
                rank: 2,
                universeRanks: { evil: 0, heavy: 3 },
            },
        },
    };
    assert.equal(hasAchievementUniverseRank(state, 'evolve:achievement/trade', 'evil'), true);
    assert.equal(hasAchievementUniverseRank(state, 'evolve:achievement/trade', 'magic'), false);
    assert.equal(hasAchievementUniverseRank(state, 'evolve:achievement/missing', 'evil'), false);
    assert.equal(achievementUniverseRank(state, 'evolve:achievement/trade', 'evil'), 0);
    assert.equal(achievementTotalRank(state, 'evolve:achievement/trade'), 5);
});
