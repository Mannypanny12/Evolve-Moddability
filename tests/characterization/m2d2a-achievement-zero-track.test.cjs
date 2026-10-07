'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    loadFixtureById,
    materializePersistedFixture,
} = require('../fixtures/fixture-loader.cjs');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const fixture = loadFixtureById('early-civilization-human');

function install(universe){
    const state = materializePersistedFixture(fixture, legacy);
    state.race.universe = universe;
    state.stats.achieve = {};
    state.stats.feat = {};
    state.settings.msgFilters.achievements.unlocked = false;
    state.settings.msgFilters.achievements.vis = false;
    state.settings.showAchieve = false;
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

test('legacy rank-zero non-standard unlock preserves an explicit zero-valued universe track', () => {
    const state = install('evil');

    assert.equal(legacy.unlockAchievement('trade', false, 0), false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve, 'trade'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve.trade, 'e'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 0, e: 0 });

    assert.deepEqual(legacy.achievementUniverseLevel('evil'), {
        aLvl: 0,
        uLvl: 0,
    });
});
