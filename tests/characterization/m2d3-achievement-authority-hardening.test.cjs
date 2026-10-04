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

function freshLegacyState(universe = 'standard'){
    const state = materializePersistedFixture(fixture, legacy);
    state.race.universe = universe;
    state.stats.achieve = {};
    state.stats.feat = {};
    return state;
}

function errorCode(expected){
    return error => {
        assert.equal(error && error.code, expected);
        return true;
    };
}

async function sourceAdapter(){
    return import('../../src/legacy/bridge/achievement-state-adapter.mjs');
}

test('M2D3 failed setGlobal rebinding leaves both the active legacy root and authoritative runtime unchanged', () => {
    const first = freshLegacyState('evil');
    first.stats.achieve.trade = { l: 2, e: 1 };
    legacy.installLegacyState(first);

    const activeRoot = legacy.legacyState();
    const activeAuthority = legacy.authoritativeAchievementState();

    const invalid = freshLegacyState('heavy');
    invalid.stats.achieve.explorer = { l: -1, h: 1 };

    assert.throws(
        () => legacy.installLegacyState(invalid),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_RANK')
    );
    assert.strictEqual(legacy.legacyState(), activeRoot);
    assert.deepEqual(legacy.authoritativeAchievementState(), activeAuthority);
});

test('M2D3 hydration rejects accessor-backed legacy records without invoking getters', async () => {
    const adapter = await sourceAdapter();
    let getterCalls = 0;
    const record = {};
    Object.defineProperty(record, 'l', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 1;
        }
    });
    const root = { stats: { achieve: { trade: record } } };

    assert.throws(
        () => adapter.bindLegacyAchievementState(root),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_STATE')
    );
    assert.equal(getterCalls, 0);
});

test('M2D3 advancement commands are closed and accessor-safe before mutation', async () => {
    const adapter = await sourceAdapter();
    const root = { stats: { achieve: { trade: { l: 1 } } } };
    adapter.bindLegacyAchievementState(root);
    const before = adapter.achievementStateSnapshot();

    let getterCalls = 0;
    const accessorCommand = {
        rank: 2,
        advanceBase: true,
        universeAffix: null,
    };
    Object.defineProperty(accessorCommand, 'achievement', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 'trade';
        }
    });

    assert.throws(
        () => adapter.advanceLegacyAchievement(accessorCommand),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_MUTATION')
    );
    assert.equal(getterCalls, 0);
    assert.deepEqual(adapter.achievementStateSnapshot(), before);

    assert.throws(
        () => adapter.advanceLegacyAchievement({
            achievement: 'trade',
            rank: 2,
            advanceBase: true,
            universeAffix: null,
            unexpectedAuthority: true,
        }),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_MUTATION')
    );
    assert.deepEqual(adapter.achievementStateSnapshot(), before);
});

test('M2D3 aggregate options reject accessors without invoking them or changing authority', async () => {
    const adapter = await sourceAdapter();
    const root = { stats: { achieve: { trade: { l: 1, e: 1 } } } };
    adapter.bindLegacyAchievementState(root);
    const before = adapter.achievementStateSnapshot();

    let getterCalls = 0;
    const options = {};
    Object.defineProperty(options, 'preserveUndefined', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return true;
        }
    });

    assert.throws(
        () => adapter.removeLegacyAchievementUniverseRank('trade', 'e', options),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_MUTATION')
    );
    assert.equal(getterCalls, 0);
    assert.deepEqual(adapter.achievementStateSnapshot(), before);
});

test('M2D3 projection preflight rejects a locked mirror before authoritative mutation', async () => {
    const adapter = await sourceAdapter();
    const root = { stats: { achieve: { trade: { l: 1 } } } };
    adapter.bindLegacyAchievementState(root);
    const before = adapter.achievementStateSnapshot();
    const lockedLedger = root.stats.achieve;
    Object.freeze(lockedLedger);
    Object.defineProperty(root.stats, 'achieve', {
        value: lockedLedger,
        enumerable: true,
        writable: false,
        configurable: false,
    });

    assert.throws(
        () => adapter.advanceLegacyAchievement({
            achievement: 'trade',
            rank: 2,
            advanceBase: true,
            universeAffix: null,
        }),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_PROJECTION')
    );
    assert.deepEqual(adapter.achievementStateSnapshot(), before);
    assert.deepEqual(root.stats.achieve.trade, { l: 1 });
});

test('M2D3 repairs a replaceable invalid mirror from authority during the next mutation', async () => {
    const adapter = await sourceAdapter();
    const root = { stats: { achieve: { trade: { l: 1 } } } };
    adapter.bindLegacyAchievementState(root);
    root.stats.achieve = null;

    const result = adapter.advanceLegacyAchievement({
        achievement: 'trade',
        rank: 2,
        advanceBase: true,
        universeAffix: null,
    });

    assert.equal(result.engineChanged, true);
    assert.deepEqual(root.stats.achieve, { trade: { l: 2 } });
    assert.deepEqual(
        adapter.achievementStateSnapshot().achievements['evolve:achievement/trade'],
        { rank: 2, universeRanks: {} }
    );
});

test('M2D3 failed binding cannot replace an already-valid authoritative runtime', async () => {
    const adapter = await sourceAdapter();
    const first = { stats: { achieve: { trade: { l: 2 } } } };
    adapter.bindLegacyAchievementState(first);
    const before = adapter.achievementStateSnapshot();

    const lockedLedger = {};
    Object.defineProperty(lockedLedger, 'explorer', {
        value: { l: 3 },
        enumerable: true,
        writable: false,
        configurable: false,
    });
    const secondStats = {};
    Object.defineProperty(secondStats, 'achieve', {
        value: lockedLedger,
        enumerable: true,
        writable: false,
        configurable: false,
    });
    const second = { stats: secondStats };

    assert.throws(
        () => adapter.bindLegacyAchievementState(second),
        errorCode('INVALID_LEGACY_ACHIEVEMENT_PROJECTION')
    );
    assert.deepEqual(adapter.achievementStateSnapshot(), before);
});
