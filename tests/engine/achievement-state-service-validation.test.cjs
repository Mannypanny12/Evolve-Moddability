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

function assertUntouched(runtime){
    assert.deepEqual(runtime.store.read().achievements, {});
    assert.equal(runtime.store.getRevision(), 0);
    assert.equal(runtime.store.getLastChange(), null);
}

test('M2D2b2 mutation commands validate canonical achievement identity before transaction entry', async () => {
    const { createGameStateRuntime } = await modules();

    for (const achievementId of [
        'trade',
        'evolve:resource/food',
        'Evolve:achievement/trade',
        'evolve:achievement/',
    ]){
        const runtime = createGameStateRuntime();
        await expectCode(
            () => runtime.achievements.advance({
                achievementId,
                rank: 1,
                advanceBase: true,
            }),
            'INVALID_ACHIEVEMENT_STATE_ID'
        );
        assertUntouched(runtime);
    }
});

test('M2D2b2 mutation commands reject invalid rank values while retaining the structural >5 policy', async () => {
    const { createGameStateRuntime } = await modules();

    for (const rank of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]){
        const runtime = createGameStateRuntime();
        await expectCode(
            () => runtime.achievements.advance({
                achievementId: 'evolve:achievement/trade',
                rank,
                advanceBase: true,
            }),
            'INVALID_ACHIEVEMENT_STATE_RANK'
        );
        assertUntouched(runtime);
    }
});

test('M2D2b2 advanceBase is mandatory boolean intent rather than truthy policy', async () => {
    const { createGameStateRuntime } = await modules();

    for (const advanceBase of [undefined, null, 0, 1, 'true']){
        const runtime = createGameStateRuntime();
        const command = {
            achievementId: 'evolve:achievement/trade',
            rank: 1,
        };
        if (advanceBase !== undefined){
            command.advanceBase = advanceBase;
        }

        await expectCode(
            () => runtime.achievements.advance(command),
            'INVALID_ACHIEVEMENT_STATE_MUTATION'
        );
        assertUntouched(runtime);
    }
});

test('M2D2b2 unknown and Standard universes fail closed for explicit universe-track mutations', async () => {
    const { createGameStateRuntime } = await modules();

    for (const universe of ['standard', 'bigbang', 'future']){
        const advanceRuntime = createGameStateRuntime();
        await expectCode(
            () => advanceRuntime.achievements.advance({
                achievementId: 'evolve:achievement/trade',
                rank: 1,
                advanceBase: true,
                universe,
            }),
            'INVALID_ACHIEVEMENT_UNIVERSE'
        );
        assertUntouched(advanceRuntime);

        const removeRuntime = createGameStateRuntime();
        await expectCode(
            () => removeRuntime.achievements.removeUniverseRank({
                achievementId: 'evolve:achievement/trade',
                universe,
            }),
            'INVALID_ACHIEVEMENT_UNIVERSE'
        );
        assertUntouched(removeRuntime);
    }
});

test('M2D2b2 removeUniverseRank command validation is closed and accessor-safe', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();

    for (const value of [undefined, null, [], 'bad', 4]){
        await expectCode(
            () => runtime.achievements.removeUniverseRank(value),
            'INVALID_ACHIEVEMENT_STATE_MUTATION'
        );
    }

    await expectCode(
        () => runtime.achievements.removeUniverseRank({
            achievementId: 'evolve:achievement/trade',
            universe: 'evil',
            extra: true,
        }),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );

    const symbolCommand = {
        achievementId: 'evolve:achievement/trade',
        universe: 'evil',
    };
    symbolCommand[Symbol('hidden')] = true;
    await expectCode(
        () => runtime.achievements.removeUniverseRank(symbolCommand),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );

    let getterCalls = 0;
    const accessor = {
        achievementId: 'evolve:achievement/trade',
    };
    Object.defineProperty(accessor, 'universe', {
        enumerable: true,
        get(){
            getterCalls++;
            return 'evil';
        },
    });
    await expectCode(
        () => runtime.achievements.removeUniverseRank(accessor),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    assert.equal(getterCalls, 0);
    assertUntouched(runtime);
});

test('M2D2b2 removeUniverseRank fails closed for throwing proxies before transaction entry', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();
    const hostile = new Proxy({}, {
        getPrototypeOf(){
            throw new Error('blocked');
        },
    });

    await expectCode(
        () => runtime.achievements.removeUniverseRank(hostile),
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    assertUntouched(runtime);
});

test('M2D2b2 mutation results and nested transaction diagnostics remain immutable', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();
    const result = runtime.achievements.advance({
        achievementId: 'evolve:achievement/trade',
        rank: 1,
        advanceBase: true,
        universe: 'evil',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.diagnostic), true);
    assert.equal(Object.isFrozen(result.diagnostic.changes), true);
    assert.equal(result.diagnostic.changes.every(Object.isFrozen), true);
});

test('M2D2b2 null-prototype command objects remain valid inert input', async () => {
    const { createGameStateRuntime } = await modules();
    const runtime = createGameStateRuntime();
    const command = Object.create(null);
    command.achievementId = 'evolve:achievement/trade';
    command.rank = 1;
    command.advanceBase = true;

    const result = runtime.achievements.advance(command);
    assert.equal(result.changed, true);
    assert.deepEqual(runtime.store.read().achievements['evolve:achievement/trade'], {
        rank: 1,
        universeRanks: {},
    });
});
