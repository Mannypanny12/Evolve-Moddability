'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/achievement-state-adapter.mjs')).href);
const readerPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/achievement-state-reader.mjs')).href);

test('M2D4 reader ignores compatibility-mirror drift and preserves zero-track presence', async () => {
    const [adapter, reader] = await Promise.all([adapterPromise, readerPromise]);
    const rootState = {
        stats: {
            achieve: {
                trade: { l: 3, e: 0 },
                explorer: { l: 1 },
            },
        },
    };
    adapter.bindLegacyAchievementState(rootState);

    assert.equal(reader.hasLegacyAchievement('trade'), true);
    assert.equal(reader.legacyAchievementRank('trade'), 3);
    assert.equal(reader.hasLegacyAchievementTrack('trade', 'e'), true);
    assert.equal(reader.legacyAchievementRank('trade', 'e'), 0);
    assert.equal(reader.hasLegacyAchievementTrack('trade', 'mg'), false);
    assert.equal(reader.legacyAchievementRank('trade', 'mg'), undefined);

    rootState.stats.achieve.trade.l = 5;
    rootState.stats.achieve.trade.e = 4;
    assert.equal(reader.legacyAchievementRank('trade'), 3);
    assert.equal(reader.legacyAchievementRank('trade', 'e'), 0);

    assert.equal(reader.legacyAchievementLevel(['trade', 'explorer']), 4);
    assert.equal(reader.legacyAchievementUniverseLevel('evil', ['trade', 'explorer']), 0);
    assert.equal(reader.legacyAchievementTotalRank('trade'), 3);
});

test('M2D4 reader keeps legacy track fallback inert and does not coerce hostile track keys', async () => {
    const [adapter, reader] = await Promise.all([adapterPromise, readerPromise]);
    const rootState = {
        stats: {
            achieve: {
                trade: { l: 3, e: 0 },
                explorer: { l: 1 },
            },
        },
    };
    adapter.bindLegacyAchievementState(rootState);

    assert.equal(reader.hasLegacyAchievement('missing'), false);
    assert.equal(reader.legacyAchievementRank('missing'), undefined);
    assert.equal(reader.hasLegacyAchievementTrack('missing', 'l'), false);
    assert.equal(reader.hasLegacyAchievementTrack('trade', 'l'), true);
    assert.equal(reader.hasLegacyAchievementTrack('trade', 'standard'), true);
    assert.equal(reader.legacyAchievementRank('trade', 'standard'), 3);
    assert.equal(reader.legacyAchievementUniverseLevel('bigbang', ['trade', 'explorer']), 4);

    let coerced = false;
    const hostileTrack = {
        toString(){
            coerced = true;
            throw new Error('M2D4 reader must not coerce track objects');
        },
    };

    assert.equal(reader.hasLegacyAchievementTrack('trade', hostileTrack), false);
    assert.equal(reader.legacyAchievementRank('trade', hostileTrack), undefined);
    assert.equal(reader.legacyAchievementUniverseLevel(hostileTrack, ['trade', 'explorer']), 4);
    assert.equal(coerced, false);
});
