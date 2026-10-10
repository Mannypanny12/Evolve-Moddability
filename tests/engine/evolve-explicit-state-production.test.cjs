'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const explicitPromise = import(pathToFileURL(path.join(root, 'src/content/evolve/calculations/explicit-state-production.mjs')).href);
const runtimePromise = import(pathToFileURL(path.join(root, 'src/application/evolve/production-calculation-runtime.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [engine, explicit, runtime, identity] = await Promise.all([
        enginePromise,
        explicitPromise,
        runtimePromise,
        identityPromise,
    ]);
    return { ...engine, ...explicit, ...runtime, ...identity };
}

async function explicitEngine(){
    const { createCalculationEngine, createExplicitStateProductionRegistrations } = await modules();
    return createCalculationEngine({
        registrations: createExplicitStateProductionRegistrations(),
        modifiers: [],
    });
}

test('M4E3 explicit-state production freezes exactly the reviewed 10 identities', async () => {
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids, createExplicitStateProductionRegistrations } = await modules();
    const expected = [
        'biodome', 'g_factory', 'vitreloy_plant', 'infernite_mine', 'titan_mine',
        'mining_pit', 'womling_mine', 'mining_ship', 'whaling_ship', 'asphodel_harvester',
    ];
    assert.deepEqual(Object.keys(ids), expected);
    const registrations = createExplicitStateProductionRegistrations();
    assert.equal(registrations.length, 10);
    assert.equal(Object.isFrozen(registrations), true);
    assert.deepEqual(registrations.map(entry => entry.id), expected.map(id => ids[id]));
});

test('M4E3 biodome and Titan mine preserve variant and high-pop semantics', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    assert.equal(engine.calculate({ id: ids.biodome, inputs: { variant: 'food', evilUniverse: false, highPopMultiplier: 1 } }).value, 0.25);
    assert.equal(engine.calculate({ id: ids.biodome, inputs: { variant: 'food', evilUniverse: true, highPopMultiplier: 1.5 } }).value, 0.15);
    assert.equal(engine.calculate({ id: ids.biodome, inputs: { variant: 'cat_food', evilUniverse: false, highPopMultiplier: 99 } }).value, 2);
    assert.equal(engine.calculate({ id: ids.biodome, inputs: { variant: 'lumber', evilUniverse: false, highPopMultiplier: 1.5 } }).value, 2.25);

    assert.equal(engine.calculate({ id: ids.titan_mine, inputs: { variant: 'adamantite', ratio: 90, highPopMultiplier: 1 } }).value, 0.018);
    assert.equal(engine.calculate({ id: ids.titan_mine, inputs: { variant: 'aluminium', ratio: 90, highPopMultiplier: 1 } }).value, 0.012);
    assert.equal(engine.calculate({ id: ids.titan_mine, inputs: { variant: 'adamantite', ratio: 50, highPopMultiplier: 2 } }).value, 0.02);
});

test('M4E3 g_factory preserves Truepath, Isolation and separate high-pop effects', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    const baseInputs = {
        truepath: false,
        isolation: false,
        titanColonistWorkers: 40,
        aiColonistContribution: 12,
        highPopProductionMultiplier: 1.4,
    };
    assert.equal(engine.calculate({ id: ids.g_factory, inputs: baseInputs }).value, 0.6);
    assert.equal(engine.calculate({ id: ids.g_factory, inputs: { ...baseInputs, truepath: true, isolation: true } }).value, 1.8);
    assert.equal(
        engine.calculate({ id: ids.g_factory, inputs: { ...baseInputs, truepath: true } }).value,
        0.05 * (40 + 12) * 1.4
    );
});

test('M4E3 government and suppression cases preserve legacy scalar arithmetic', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    assert.equal(engine.calculate({ id: ids.vitreloy_plant, inputs: { governmentType: 'other', highTechLevel: 99 } }).value, 0.18);
    assert.equal(engine.calculate({ id: ids.vitreloy_plant, inputs: { governmentType: 'corpocracy', highTechLevel: 15 } }).value, 0.18 * 1.3);
    assert.equal(engine.calculate({ id: ids.vitreloy_plant, inputs: { governmentType: 'corpocracy', highTechLevel: 16 } }).value, 0.18 * 1.4);
    assert.equal(engine.calculate({ id: ids.vitreloy_plant, inputs: { governmentType: 'socialist', highTechLevel: 0 } }).value, 0.18 * 1.1);
    assert.equal(engine.calculate({ id: ids.infernite_mine, inputs: { suppression: 0.62 } }).value, 0.31);
});

test('M4E3 mining pit preserves base table, modifier order and zero fallback', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    const common = {
        isolation: false,
        toughPercent: 20,
        ogreFathom: 0.5,
        fathomedToughPercent: 10,
        tauPitMining: true,
    };
    const expected = 0.74 * 1.2 * (1 + 0.1 * 0.5) * 1.18;
    assert.equal(engine.calculate({ id: ids.mining_pit, inputs: { variant: 'iron', ...common } }).value, expected);
    assert.equal(engine.calculate({ id: ids.mining_pit, inputs: { variant: 'materials', ...common, isolation: true } }).value, 0.12 * 1.2 * 1.05 * 1.18);
    assert.equal(engine.calculate({ id: ids.mining_pit, inputs: { variant: 'other', ...common } }).value, 0);
});

test('M4E3 Womling mine preserves multiplier order for every resource variant', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    const boost = (1 + 2 * 0.15) * 1.1 * 1.25;
    const expected = {
        unobtainium: 0.0305,
        uranium: 0.047,
        titanium: 0.616,
        copper: 1.191,
        iron: 1.377,
        aluminium: 1.544,
        neutronium: 0.382,
        iridium: 0.535,
    };
    for (const [variant, base] of Object.entries(expected)){
        assert.equal(engine.calculate({
            id: ids.womling_mine,
            inputs: { variant, womlingMiningLevel: 2, overlordRankFive: true, womlingGene: true },
        }).value, base * boost);
    }
});

test('M4E3 Tau ship support curve preserves threshold and exponent exactly', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    const noPatrol = { patrolExists: false, support: 100, maxSupport: 50 };
    assert.equal(engine.calculate({ id: ids.mining_ship, inputs: { ...noPatrol, tauOreMiningLevel: 2 } }).value, 0);
    assert.equal(engine.calculate({ id: ids.whaling_ship, inputs: noPatrol }).value, 0);

    const atCap = { patrolExists: true, support: 50, maxSupport: 50 };
    assert.equal(engine.calculate({ id: ids.mining_ship, inputs: { ...atCap, tauOreMiningLevel: 1 } }).value, 10);
    assert.equal(engine.calculate({ id: ids.mining_ship, inputs: { ...atCap, tauOreMiningLevel: 2 } }).value, 12);
    assert.equal(engine.calculate({ id: ids.whaling_ship, inputs: atCap }).value, 8);

    const over = { patrolExists: true, support: 100, maxSupport: 50 };
    const patrol = 1 - ((1 - 0.5) ** 1.4);
    assert.equal(engine.calculate({ id: ids.mining_ship, inputs: { ...over, tauOreMiningLevel: 2 } }).value, 12 * patrol);
    assert.equal(engine.calculate({ id: ids.whaling_ship, inputs: over }).value, 8 * patrol);
});

test('M4E3 Asphodel harvester preserves railway multiplication before Warlord override', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    const baseInputs = { hellLakeLevel: 7, railwayLevel: 20, warlord: false, corruptorExists: false, corruptorOn: 0 };
    assert.equal(engine.calculate({ id: ids.asphodel_harvester, inputs: baseInputs }).value, 0.075 * 1.2);
    assert.equal(engine.calculate({
        id: ids.asphodel_harvester,
        inputs: { ...baseInputs, warlord: true, corruptorExists: true, corruptorOn: 5 },
    }).value, 1.3);
});

test('M4E3 registrations reject malformed explicit facts and hostile objects', async () => {
    const engine = await explicitEngine();
    const { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids, EngineContractError } = await modules();
    assert.throws(
        () => engine.calculate({ id: ids.biodome, inputs: { variant: 'banana', evilUniverse: false, highPopMultiplier: 1 } }),
        EngineContractError
    );
    assert.throws(
        () => engine.calculate({ id: ids.mining_ship, inputs: { patrolExists: 1, support: 1, maxSupport: 1, tauOreMiningLevel: 1 } }),
        EngineContractError
    );
    assert.throws(
        () => engine.calculate({ id: ids.infernite_mine, inputs: { suppression: Infinity } }),
        EngineContractError
    );

    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'suppression', {
        enumerable: true,
        get(){ getterCalls += 1; return 1; },
    });
    assert.throws(() => engine.calculate({ id: ids.infernite_mine, inputs: hostile }), EngineContractError);
    assert.equal(getterCalls, 0);
});

test('M4E3 shared runtime composes the explicit-state family in the existing production engine', async () => {
    const { calculateProductionCalculation, EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    assert.equal(calculateProductionCalculation({
        id: ids.infernite_mine,
        inputs: { suppression: 0.8 },
    }), 0.4);
    assert.equal(calculateProductionCalculation({
        id: ids.whaling_ship,
        inputs: { patrolExists: true, support: 10, maxSupport: 10 },
    }), 8);
});
