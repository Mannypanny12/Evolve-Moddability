'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const simplePromise = import(pathToFileURL(path.join(root, 'src/content/evolve/calculations/simple-production.mjs')).href);
const runtimePromise = import(pathToFileURL(path.join(root, 'src/application/evolve/production-calculation-runtime.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [engine, simple, runtime, identity] = await Promise.all([
        enginePromise,
        simplePromise,
        runtimePromise,
        identityPromise,
    ]);
    return { ...engine, ...simple, ...runtime, ...identity };
}

function expectedIds(){
    return [
        'transmitter', 'gas_mining', 'oil_extractor', 'elerium_ship', 'iridium_ship', 'iron_ship',
        'harvester', 'elerium_prospector', 'neutron_miner', 'bolognium_ship', 'excavator',
        'water_freighter', 'lander', 'orichalcum_mine', 'uranium_mine', 'neutronium_mine',
        'elerium_mine', 'shock_trooper', 'tank', 'tau_farm', 'refueling_station', 'ore_refinery',
        'whaling_station', 'mining_ship_ore', 'whaling_ship_oil', 'alien_outpost', 'shadow_mine',
    ];
}

async function simpleEngine(){
    const { createCalculationEngine, createSimpleProductionRegistrations } = await modules();
    return createCalculationEngine({
        registrations: createSimpleProductionRegistrations(),
        modifiers: [],
    });
}

test('M4E2 simple production family freezes exactly the reviewed 27 calculation identities', async () => {
    const { SIMPLE_PRODUCTION_CALCULATION_IDS, createSimpleProductionRegistrations } = await modules();
    assert.deepEqual(Object.keys(SIMPLE_PRODUCTION_CALCULATION_IDS), expectedIds());
    const registrations = createSimpleProductionRegistrations();
    assert.equal(registrations.length, 27);
    assert.equal(Object.isFrozen(registrations), true);
    assert.deepEqual(
        registrations.map(registration => registration.id),
        expectedIds().map(id => SIMPLE_PRODUCTION_CALCULATION_IDS[id])
    );
});

test('M4E2 constant scalar production values match the frozen legacy oracle exactly', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    const expected = new Map([
        ['transmitter', 2.5],
        ['elerium_prospector', 0.014],
        ['neutron_miner', 0.055],
        ['bolognium_ship', 0.008],
        ['excavator', 0.2],
        ['water_freighter', 1.25],
        ['orichalcum_mine', 0.08],
        ['uranium_mine', 0.025],
        ['neutronium_mine', 0.04],
        ['elerium_mine', 0.009],
        ['whaling_station', 12],
        ['alien_outpost', 0.01],
    ]);
    for (const [productionId, value] of expected){
        assert.equal(engine.calculate({ id: ids[productionId], inputs: {} }).value, value);
    }
});

test('M4E2 technology thresholds exactly match legacy gas, oil-extractor, asteroid-ship and refinery behavior', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    assert.equal(engine.calculate({ id: ids.gas_mining, inputs: { heliumUnlocked: false } }).value, 0.5);
    assert.equal(engine.calculate({ id: ids.gas_mining, inputs: { heliumUnlocked: true } }).value, 0.65);

    const oilExpected = new Map([
        [0, 0.4],
        [3, 0.4],
        [4, 0.48],
        [5, 0.48 * 1.25],
        [6, 0.48 * 1.75],
        [7, 0.48 * 2],
        [8, 0.48 * 2],
    ]);
    for (const [oilTechLevel, value] of oilExpected){
        assert.equal(engine.calculate({ id: ids.oil_extractor, inputs: { oilTechLevel } }).value, value);
    }

    const asteroidCases = [
        [5, [0.005, 0.055, 2]],
        [6, [0.0075, 0.08, 3]],
        [7, [0.009, 0.1, 4]],
        [8, [0.009, 0.1, 4]],
    ];
    for (const [asteroidTechLevel, expected] of asteroidCases){
        assert.equal(engine.calculate({ id: ids.elerium_ship, inputs: { asteroidTechLevel } }).value, expected[0]);
        assert.equal(engine.calculate({ id: ids.iridium_ship, inputs: { asteroidTechLevel } }).value, expected[1]);
        assert.equal(engine.calculate({ id: ids.iron_ship, inputs: { asteroidTechLevel } }).value, expected[2]);
    }

    assert.equal(engine.calculate({ id: ids.ore_refinery, inputs: { tauOreMiningUnlocked: false } }).value, 25);
    assert.equal(engine.calculate({ id: ids.ore_refinery, inputs: { tauOreMiningUnlocked: true } }).value, 40);
});

test('M4E2 exact completion gates preserve strict legacy equality at 100', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    for (const count of [99, 100, 101]){
        assert.equal(
            engine.calculate({ id: ids.lander, inputs: { crashedShipCount: count } }).value,
            count === 100 ? 0.005 : 0
        );
        assert.equal(
            engine.calculate({ id: ids.shock_trooper, inputs: { digsiteCount: count } }).value,
            count === 100 ? 0.0018 : 0
        );
        assert.equal(
            engine.calculate({ id: ids.tank, inputs: { digsiteCount: count } }).value,
            count === 100 ? 0.0018 : 0
        );
    }
});

test('M4E2 variant families exactly match every reviewed legacy scalar variant', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    assert.equal(engine.calculate({ id: ids.harvester, inputs: { variant: 'helium' } }).value, 0.85);
    assert.equal(engine.calculate({ id: ids.harvester, inputs: { variant: 'deuterium' } }).value, 0.15);

    const shadowExpected = { elerium: 0.02, infernite: 0.015, vitreloy: 0.22 };
    for (const [variant, value] of Object.entries(shadowExpected)){
        assert.equal(engine.calculate({ id: ids.shadow_mine, inputs: { variant } }).value, value);
    }
});

test('M4E2 isolation families exactly match both legacy branches', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();

    for (const isolation of [false, true]){
        assert.equal(engine.calculate({ id: ids.tau_farm, inputs: { variant: 'food', isolation } }).value, isolation ? 15 : 9);
        assert.equal(engine.calculate({ id: ids.tau_farm, inputs: { variant: 'lumber', isolation } }).value, isolation ? 12 : 5.5);
        assert.equal(engine.calculate({ id: ids.tau_farm, inputs: { variant: 'water', isolation } }).value, 0.35);
        assert.equal(engine.calculate({ id: ids.refueling_station, inputs: { isolation } }).value, isolation ? 18.5 : 9.35);
        assert.equal(engine.calculate({ id: ids.whaling_ship_oil, inputs: { isolation } }).value, isolation ? 0.78 : 0.42);

        const miningExpected = {
            iron: isolation ? 2.22 : 1.85,
            aluminium: isolation ? 2.22 : 1.85,
            iridium: isolation ? 0.42 : 0.35,
            neutronium: isolation ? 0.42 : 0.35,
            orichalcum: isolation ? 0.3 : 0.25,
            elerium: isolation ? 0.024 : 0.02,
        };
        for (const [variant, value] of Object.entries(miningExpected)){
            assert.equal(engine.calculate({ id: ids.mining_ship_ore, inputs: { variant, isolation } }).value, value);
        }
    }
});

test('M4E2 direct registrations reject invalid variants and malformed explicit facts', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids, EngineContractError } = await modules();

    const invalidCases = [
        { id: ids.harvester, inputs: { variant: 'banana' } },
        { id: ids.shadow_mine, inputs: { variant: 'oil' } },
        { id: ids.tau_farm, inputs: { variant: 'food', isolation: 1 } },
        { id: ids.gas_mining, inputs: { heliumUnlocked: 1 } },
        { id: ids.oil_extractor, inputs: { oilTechLevel: Infinity } },
        { id: ids.lander, inputs: { crashedShipCount: 100, hidden: true } },
    ];
    for (const request of invalidCases){
        assert.throws(
            () => engine.calculate(request),
            error => error instanceof EngineContractError
        );
    }

    let getterCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'oilTechLevel', {
        enumerable: true,
        get(){ getterCalls += 1; return 7; },
    });
    assert.throws(() => engine.calculate({ id: ids.oil_extractor, inputs: hostile }), EngineContractError);
    assert.equal(getterCalls, 0);
});

test('M4E2 simple explain traces remain numeric and contain one deterministic base step', async () => {
    const engine = await simpleEngine();
    const { SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    const result = engine.explain({ id: ids.oil_extractor, inputs: { oilTechLevel: 6 } });
    assert.equal(result.value, 0.48 * 1.75);
    assert.equal(result.trace.steps.length, 1);
    assert.equal(result.trace.steps[0].kind, 'base');
    assert.equal(result.trace.steps[0].after, result.value);
});

test('M4E2 shared production runtime composes the simple family without a second engine', async () => {
    const { calculateProductionCalculation, SIMPLE_PRODUCTION_CALCULATION_IDS: ids } = await modules();
    assert.equal(calculateProductionCalculation({ id: ids.transmitter, inputs: {} }), 2.5);
    assert.equal(calculateProductionCalculation({ id: ids.oil_extractor, inputs: { oilTechLevel: 7 } }), 0.96);
    assert.equal(calculateProductionCalculation({ id: ids.shadow_mine, inputs: { variant: 'vitreloy' } }), 0.22);
});
