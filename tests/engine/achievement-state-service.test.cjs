'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [gameState, identity] = await Promise.all([gameStatePromise, identityPromise]);
    return { ...gameState, ...identity };
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

function trade(runtime){
    return runtime.store.read().achievements['evolve:achievement/trade'];
}

function advanceTrade(runtime, options = {}){
    return runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: true,
        ...options,
    });
}

test('M2D2b2 base advancement creates records, advances monotonically, and reports truthful changes', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const created = advanceTrade(runtime, { rank: 2 });
    assert.deepEqual(trade(runtime), { rank: 2, universeRanks: {} });
    assert.equal(created.changed, true);
    assert.equal(created.recordCreated, true);
    assert.equal(created.baseRankChanged, true);
    assert.equal(created.previousBaseRank, 0);
    assert.equal(created.newBaseRank, 2);
    assert.equal(created.universe, null);
    assert.equal(created.previousUniverseRank, null);
    assert.equal(created.newUniverseRank, null);
    assert.equal(created.diagnostic.committed, true);
    assert.equal(runtime.store.getRevision(), 1);
    assert.equal(Object.isFrozen(created), true);

    const equal = advanceTrade(runtime, { rank: 2 });
    assert.equal(equal.changed, false);
    assert.equal(equal.recordCreated, false);
    assert.equal(equal.baseRankChanged, false);
    assert.equal(equal.previousBaseRank, 2);
    assert.equal(equal.newBaseRank, 2);
    assert.equal(equal.diagnostic.committed, false);
    assert.equal(runtime.store.getRevision(), 1);

    const lower = advanceTrade(runtime, { rank: 1 });
    assert.equal(lower.changed, false);
    assert.equal(lower.baseRankChanged, false);
    assert.deepEqual(trade(runtime), { rank: 2, universeRanks: {} });
});

test('M2D2b2 rank-zero base advancement preserves structural achievement presence', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const first = advanceTrade(runtime, { rank: 0 });
    assert.deepEqual(trade(runtime), { rank: 0, universeRanks: {} });
    assert.equal(first.changed, true);
    assert.equal(first.recordCreated, true);
    assert.equal(first.baseRankChanged, false);
    assert.equal(runtime.store.getRevision(), 1);

    const second = advanceTrade(runtime, { rank: 0 });
    assert.equal(second.changed, false);
    assert.equal(second.recordCreated, false);
    assert.equal(second.baseRankChanged, false);
    assert.equal(runtime.store.getRevision(), 1);
});

test('M2D2b2 universe advancement preserves explicit zero tracks and advances monotonically', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({ rank: 3, universeRanks: {} }));

    const zero = advanceTrade(runtime, {
        rank: 0,
        advanceBase: false,
        universe: 'evil',
    });
    assert.deepEqual(trade(runtime), { rank: 3, universeRanks: { evil: 0 } });
    assert.equal(zero.changed, true);
    assert.equal(zero.universeTrackCreated, true);
    assert.equal(zero.universeRankChanged, false);
    assert.equal(zero.previousUniverseTrackPresent, false);
    assert.equal(zero.newUniverseTrackPresent, true);
    assert.equal(zero.previousUniverseRank, 0);
    assert.equal(zero.newUniverseRank, 0);

    const raised = advanceTrade(runtime, {
        rank: 2,
        advanceBase: false,
        universe: 'evil',
    });
    assert.equal(raised.universeTrackCreated, false);
    assert.equal(raised.universeRankChanged, true);
    assert.equal(raised.previousUniverseRank, 0);
    assert.equal(raised.newUniverseRank, 2);

    const lower = advanceTrade(runtime, {
        rank: 1,
        advanceBase: false,
        universe: 'evil',
    });
    assert.equal(lower.changed, false);
    assert.equal(lower.universeRankChanged, false);
    assert.equal(lower.previousUniverseRank, 2);
    assert.equal(lower.newUniverseRank, 2);
    assert.deepEqual(trade(runtime), { rank: 3, universeRanks: { evil: 2 } });
});

test('M2D2b2 universe-only advancement on an absent achievement creates base zero plus the universe track', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const result = advanceTrade(runtime, {
        rank: 2,
        advanceBase: false,
        universe: 'micro',
    });

    assert.deepEqual(trade(runtime), {
        rank: 0,
        universeRanks: { micro: 2 },
    });
    assert.equal(result.recordCreated, true);
    assert.equal(result.baseRankChanged, false);
    assert.equal(result.universeTrackCreated, true);
    assert.equal(result.universeRankChanged, true);
    assert.equal(result.previousBaseRank, 0);
    assert.equal(result.newBaseRank, 0);
    assert.equal(result.previousUniverseTrackPresent, false);
    assert.equal(result.newUniverseTrackPresent, true);
});

test('M2D2b2 combined base and universe advancement commits atomically in one revision', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const result = advanceTrade(runtime, {
        rank: 3,
        universe: 'evil',
    });

    assert.deepEqual(trade(runtime), {
        rank: 3,
        universeRanks: { evil: 3 },
    });
    assert.equal(result.changed, true);
    assert.equal(result.baseRankChanged, true);
    assert.equal(result.universeTrackCreated, true);
    assert.equal(result.universeRankChanged, true);
    assert.equal(result.diagnostic.revisionBefore, 0);
    assert.equal(result.diagnostic.revisionAfter, 1);
    assert.equal(runtime.store.getRevision(), 1);
});

test('M2D2b2 combined advancement treats base and universe tracks independently', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({
        rank: 4,
        universeRanks: { evil: 1 },
    }));

    const result = advanceTrade(runtime, {
        rank: 2,
        universe: 'evil',
    });

    assert.deepEqual(trade(runtime), {
        rank: 4,
        universeRanks: { evil: 2 },
    });
    assert.equal(result.changed, true);
    assert.equal(result.baseRankChanged, false);
    assert.equal(result.universeRankChanged, true);
    assert.equal(result.previousBaseRank, 4);
    assert.equal(result.newBaseRank, 4);
    assert.equal(result.previousUniverseRank, 1);
    assert.equal(result.newUniverseRank, 2);
});

test('M2D2b2 removeUniverseRank removes positive tracks and preserves all other achievement state', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({
        rank: 4,
        universeRanks: { evil: 3, heavy: 2 },
    }));

    const result = runtime.achievements.removeUniverseRank({
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    });

    assert.deepEqual(trade(runtime), {
        rank: 4,
        universeRanks: { heavy: 2 },
    });
    assert.equal(result.changed, true);
    assert.equal(result.universeRankRemoved, true);
    assert.equal(result.universeRankChanged, true);
    assert.equal(result.previousUniverseTrackPresent, true);
    assert.equal(result.newUniverseTrackPresent, false);
    assert.equal(result.previousUniverseRank, 3);
    assert.equal(result.newUniverseRank, 0);
    assert.equal(result.previousBaseRank, 4);
    assert.equal(result.newBaseRank, 4);
});

test('M2D2b2 removeUniverseRank treats explicit zero removal as structural change without numeric rank change', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({
        rank: 0,
        universeRanks: { evil: 0 },
    }));

    const result = runtime.achievements.removeUniverseRank({
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    });

    assert.deepEqual(trade(runtime), { rank: 0, universeRanks: {} });
    assert.equal(result.changed, true);
    assert.equal(result.universeRankRemoved, true);
    assert.equal(result.universeRankChanged, false);
    assert.equal(runtime.store.getRevision(), 1);
});

test('M2D2b2 removeUniverseRank is a no-op for missing tracks and missing records', async () => {
    const { createGameStateRuntime } = await modules();
    const existing = createGameStateRuntime(stateWith({ rank: 2, universeRanks: {} }));

    const missingTrack = existing.achievements.removeUniverseRank({
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    });
    assert.equal(missingTrack.changed, false);
    assert.equal(missingTrack.universeRankRemoved, false);
    assert.equal(existing.store.getRevision(), 0);
    assert.deepEqual(trade(existing), { rank: 2, universeRanks: {} });

    const absent = createGameStateRuntime();
    const missingRecord = absent.achievements.removeUniverseRank({
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    });
    assert.equal(missingRecord.changed, false);
    assert.equal(missingRecord.recordCreated, false);
    assert.equal(Object.prototype.hasOwnProperty.call(absent.store.read().achievements, 'evolve:achievement/trade'), false);
    assert.equal(absent.store.getRevision(), 0);
});

test('M2D2b2 no-op results carry their own fresh diagnostic without replacing store lastChange', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const committed = advanceTrade(runtime, { rank: 2 });
    const lastChange = runtime.store.getLastChange();
    assert.equal(lastChange, committed.diagnostic);

    const noOp = advanceTrade(runtime, { rank: 1 });
    assert.equal(noOp.changed, false);
    assert.equal(noOp.diagnostic.committed, false);
    assert.notEqual(noOp.diagnostic, lastChange);
    assert.equal(noOp.diagnostic.revisionBefore, 1);
    assert.equal(noOp.diagnostic.revisionAfter, 1);
    assert.deepEqual(noOp.diagnostic.changes, []);
    assert.equal(runtime.store.getLastChange(), lastChange);
});

test('M2D2b2 diagnostics preserve deterministic JSON-pointer escaping for canonical achievement IDs', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime(stateWith({ rank: 1, universeRanks: {} }));

    const result = advanceTrade(runtime, { rank: 2 });
    assert.deepEqual(result.diagnostic.changes, [
        {
            path: '/achievements/evolve:achievement~1trade/rank',
            kind: 'replace',
        },
    ]);
});

test('M2D2b2 accepts unresolved canonical achievement IDs and ranks above five without registry policy', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    const result = runtime.achievements.advance({
        achievementId: 'ancientmod:achievement/removed_content',
        rank: 9,
        advanceBase: true,
        universe: 'heavy',
    });

    assert.equal(result.changed, true);
    assert.deepEqual(runtime.store.read().achievements['ancientmod:achievement/removed_content'], {
        rank: 9,
        universeRanks: { heavy: 9 },
    });
});

test('M2D2b2 accepts MAX_SAFE_INTEGER and canonicalizes negative zero to ordinary zero', async () => {
    const { createGameStateRuntime } = await modules();
    const high = createGameStateRuntime();
    high.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: Number.MAX_SAFE_INTEGER,
        advanceBase: true,
    });
    assert.equal(trade(high).rank, Number.MAX_SAFE_INTEGER);

    const zero = createGameStateRuntime();
    const result = zero.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: -0,
        advanceBase: true,
    });
    assert.equal(Object.is(result.newBaseRank, -0), false);
    assert.equal(Object.is(trade(zero).rank, -0), false);
});

test('M2D2b2 rejects malformed advancement intent and standard as a universe track', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    await expectCode(
        () => runtime.achievements.advance({
            achievementId: 'evolve:achievement/trade',
            rank: 1,
            advanceBase: false,
        }),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    await expectCode(
        () => runtime.achievements.advance({
            achievementId: 'evolve:achievement/trade',
            rank: 1,
            advanceBase: true,
            universe: 'standard',
        }),
        'INVALID_ACHIEVEMENT_UNIVERSE'
    );
    await expectCode(
        () => runtime.achievements.removeUniverseRank({
            achievementId: 'evolve:achievement/trade',
            universe: 'standard',
        }),
        'INVALID_ACHIEVEMENT_UNIVERSE'
    );
    await expectCode(
        () => runtime.achievements.advance({
            achievementId: 'evolve:achievement/trade',
            rank: 1,
            advanceBase: true,
            universe: undefined,
        }),
        'INVALID_ACHIEVEMENT_UNIVERSE'
    );
});

test('M2D2b2 operation commands remain closed, plain, and accessor-safe', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    for (const value of [undefined, null, [], 'bad', 4]){
        await expectCode(
            () => runtime.achievements.advance(value),
            'INVALID_ACHIEVEMENT_STATE_MUTATION'
        );
    }

    await expectCode(
        () => runtime.achievements.advance({
            achievementId: 'evolve:achievement/trade',
            rank: 1,
            advanceBase: true,
            extra: true,
        }),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );

    const withSymbol = {
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: true,
    };
    withSymbol[Symbol('hidden')] = true;
    await expectCode(
        () => runtime.achievements.advance(withSymbol),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );

    let getterCalls = 0;
    const accessor = {
        achievementId: 'evolve:achievement/trade',
        advanceBase: true,
    };
    Object.defineProperty(accessor, 'rank', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });
    await expectCode(
        () => runtime.achievements.advance(accessor),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    assert.equal(getterCalls, 0);

    class Exotic {}
    const exotic = new Exotic();
    exotic.achievementId = 'evolve:achievement/trade';
    exotic.rank = 1;
    exotic.advanceBase = true;
    await expectCode(
        () => runtime.achievements.advance(exotic),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
});

test('M2D2b2 operation validation fails closed for throwing proxies without mutating state', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();
    const hostile = new Proxy({}, {
        getPrototypeOf(){
            throw new Error('blocked');
        },
    });

    await expectCode(
        () => runtime.achievements.advance(hostile),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    assert.deepEqual(runtime.store.read().achievements, {});
    assert.equal(runtime.store.getRevision(), 0);
    assert.equal(runtime.store.getLastChange(), null);
});

test('M2D2b2 service methods are closure-bound capabilities rather than this-bound authority', async () => {
    const { createGameStateRuntime } = await modules();
    const first = createGameStateRuntime();
    const second = createGameStateRuntime();

    const borrowed = first.achievements.advance;
    const result = borrowed.call(second.achievements, {
        achievementId: 'evolve:achievement/trade',
        rank: 2,
        advanceBase: true,
    });

    assert.equal(result.changed, true);
    assert.deepEqual(trade(first), { rank: 2, universeRanks: {} });
    assert.equal(Object.prototype.hasOwnProperty.call(second.store.read().achievements, 'evolve:achievement/trade'), false);
    assert.equal(first.store.getRevision(), 1);
    assert.equal(second.store.getRevision(), 0);
});
