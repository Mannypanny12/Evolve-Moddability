'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    loadFixtureById,
    materializePersistedFixture
} = require('../fixtures/fixture-loader.cjs');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const fixture = loadFixtureById('early-civilization-human');

function freshState(universe = 'standard'){
    const state = materializePersistedFixture(fixture, legacy);
    state.race.universe = universe;
    state.stats.achieve = {};
    state.stats.feat = {};

    // Keep the real initialized settings object but make the achievement-message
    // state deterministic for unlockAchieve().
    state.settings.msgFilters.achievements.unlocked = false;
    state.settings.msgFilters.achievements.vis = false;
    state.settings.showAchieve = false;

    for (const flag of [
        'no_plasmid',
        'no_trade',
        'no_craft',
        'no_crispr',
        'weak_mastery',
        'nerfed',
        'badgenes'
    ]){
        delete state.race[flag];
    }

    return state;
}

function install(universe = 'standard'){
    legacy.installLegacyState(freshState(universe));
    return legacy.legacyState();
}

test('legacy universe affixes are a closed compact representation with standard as l', () => {
    assert.equal(legacy.achievementUniverseAffix('standard'), 'l');
    assert.equal(legacy.achievementUniverseAffix('evil'), 'e');
    assert.equal(legacy.achievementUniverseAffix('antimatter'), 'a');
    assert.equal(legacy.achievementUniverseAffix('heavy'), 'h');
    assert.equal(legacy.achievementUniverseAffix('micro'), 'm');
    assert.equal(legacy.achievementUniverseAffix('magic'), 'mg');

    // Unknown/future universe names currently fall through to the standard/base
    // affix rather than creating another stored achievement key.
    assert.equal(legacy.achievementUniverseAffix('bigbang'), 'l');
});

test('achievement rank cap starts at one, rises with challenge flags, and clamps at five', () => {
    const state = install();

    assert.equal(legacy.achievementRankCap(), 1);

    state.race.no_plasmid = 1;
    assert.equal(legacy.achievementRankCap(), 2);

    state.race.no_trade = 1;
    state.race.no_craft = 1;
    assert.equal(legacy.achievementRankCap(), 4);

    state.race.no_crispr = 1;
    assert.equal(legacy.achievementRankCap(), 5);

    state.race.weak_mastery = 1;
    state.race.nerfed = 1;
    state.race.badgenes = 1;
    assert.equal(legacy.achievementRankCap(), 5);
});

test('derived achievement levels clamp each stored rank to five without mutating legacy state', () => {
    const state = install('evil');
    state.stats.achieve.trade = { l: 7, e: 8 };
    state.stats.achieve.explorer = { l: 3, e: 2 };

    assert.deepEqual(legacy.achievementUniverseLevel('standard'), {
        aLvl: 8,
        uLvl: 8
    });
    assert.deepEqual(legacy.achievementUniverseLevel('evil'), {
        aLvl: 8,
        uLvl: 7
    });

    assert.deepEqual(state.stats.achieve, {
        trade: { l: 7, e: 8 },
        explorer: { l: 3, e: 2 }
    });
});

test('missing and explicitly undefined universe ranks are equivalent to zero for derived level', () => {
    const state = install('evil');
    state.stats.achieve.trade = { l: 2, e: undefined };
    state.stats.achieve.explorer = { l: 1 };

    assert.deepEqual(legacy.achievementUniverseLevel('evil'), {
        aLvl: 3,
        uLvl: 0
    });
});

test('standard unlock creates a base rank and uses the current achievement rank cap by default', () => {
    const state = install('standard');
    state.race.no_plasmid = 1;
    state.race.no_trade = 1;

    assert.equal(legacy.achievementRankCap(), 3);
    assert.equal(legacy.unlockAchievement('trade'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 3 });
});

test('non-micro unlock writes both base and current-universe progress', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, e: 2 });
});

test('achievement ranks are monotonic and an attempted lower rank does not downgrade either track', () => {
    const state = install('heavy');
    state.race.no_plasmid = 1;
    state.race.no_trade = 1;
    state.race.no_craft = 1;

    assert.equal(legacy.unlockAchievement('explorer', false, 4), true);
    assert.deepEqual(state.stats.achieve.explorer, { l: 4, h: 4 });

    assert.equal(legacy.unlockAchievement('explorer', false, 2), false);
    assert.deepEqual(state.stats.achieve.explorer, { l: 4, h: 4 });
});

test('requested rank above the active challenge cap is clamped before base and universe writes', () => {
    const state = install('antimatter');
    state.race.no_plasmid = 1;

    assert.equal(legacy.achievementRankCap(), 2);
    assert.equal(legacy.unlockAchievement('mass_extinction', false, 5), true);
    assert.deepEqual(state.stats.achieve.mass_extinction, { l: 2, a: 2 });
});

test('explicit l target suppresses a non-standard universe-specific write', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2, 'l'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2 });
});

test('explicit universe affix can target a universe other than the current run', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2, 'h'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, h: 2 });
});

test('micro normal unlock records only micro progress and returns false despite changing state', () => {
    const state = install('micro');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2), false);
    assert.deepEqual(state.stats.achieve.trade, { l: 0, m: 2 });
});

test('micro small unlock records both base and micro progress', () => {
    const state = install('micro');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', true, 2), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, m: 2 });
});

test('small achievement request outside micro is rejected before creating achievement state', () => {
    const state = install('standard');

    assert.equal(legacy.unlockAchievement('trade', true, 1), false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve, 'trade'), false);
});

test('rank zero preserves achievement-record presence even though no positive rank is earned', () => {
    const state = install('standard');

    assert.equal(legacy.unlockAchievement('trade', false, 0), false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve, 'trade'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 0 });
});
