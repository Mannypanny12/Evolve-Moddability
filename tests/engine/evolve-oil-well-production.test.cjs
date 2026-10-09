'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const enginePromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/calculation-engine.mjs')).href);
const oilWellPromise = import(pathToFileURL(path.join(root, 'src/content/evolve/calculations/oil-well-production.mjs')).href);
const runtimePromise = import(pathToFileURL(path.join(root, 'src/application/evolve/oil-well-production-runtime.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [engine, oilWell, runtime, identity] = await Promise.all([
        enginePromise,
        oilWellPromise,
        runtimePromise,
        identityPromise,
    ]);
    return { ...engine, ...oilWell, ...runtime, ...identity };
}

function legacyOilWellProduction(inputs){
    let oil = inputs.oilTechLevel >= 4 ? 0.48 : 0.4;
    if (inputs.oilTechLevel >= 7){
        oil *= 2;
    }
    else if (inputs.oilTechLevel >= 5){
        oil *= inputs.oilTechLevel >= 6 ? 1.75 : 1.25;
    }
    if (inputs.geologyBonus){
        oil *= inputs.geologyBonus + 1;
    }
    if (inputs.biomeOilMultiplier !== 1){
        oil *= inputs.biomeOilMultiplier;
    }
    if (inputs.dirtyJobsPercent){
        oil *= 1 + (inputs.dirtyJobsPercent / 100);
    }
    if (inputs.warlord){
        oil *= 1 + (inputs.pumpjackRank || 1) * 0.24;
    }
    return oil;
}

function representativeInputs(overrides = {}){
    return {
        oilTechLevel: 6,
        geologyBonus: 0.25,
        biomeOilMultiplier: 0.92,
        dirtyJobsPercent: 10,
        warlord: true,
        pumpjackRank: 3,
        ...overrides,
    };
}

test('M4D oil well calculation exactly matches the legacy multiplication order across a deterministic matrix', async () => {
    const { calculateOilWellProduction } = await modules();
    const techLevels = [0, 3, 4, 5, 6, 7, 8];
    const geologyBonuses = [0, 0.25, 1.5];
    const biomeMultipliers = [1, 1.1, 1.18, 0.9, 0.92];
    const dirtyJobsValues = [0, 10, 17.5];
    const warlordCases = [
        { warlord: false, pumpjackRank: 0 },
        { warlord: true, pumpjackRank: 0 },
        { warlord: true, pumpjackRank: 1 },
        { warlord: true, pumpjackRank: 4 },
    ];

    for (const oilTechLevel of techLevels){
        for (const geologyBonus of geologyBonuses){
            for (const biomeOilMultiplier of biomeMultipliers){
                for (const dirtyJobsPercent of dirtyJobsValues){
                    for (const warlordCase of warlordCases){
                        const inputs = {
                            oilTechLevel,
                            geologyBonus,
                            biomeOilMultiplier,
                            dirtyJobsPercent,
                            ...warlordCase,
                        };
                        assert.equal(calculateOilWellProduction(inputs), legacyOilWellProduction(inputs));
                    }
                }
            }
        }
    }
});

test('M4D oil well calculation preserves every technology threshold exactly', async () => {
    const { calculateOilWellProduction } = await modules();
    const expected = new Map([
        [3, 0.4],
        [4, 0.48],
        [5, 0.48 * 1.25],
        [6, 0.48 * 1.75],
        [7, 0.48 * 2],
    ]);
    for (const [oilTechLevel, value] of expected){
        assert.equal(calculateOilWellProduction(representativeInputs({
            oilTechLevel,
            geologyBonus: 0,
            biomeOilMultiplier: 1,
            dirtyJobsPercent: 0,
            warlord: false,
            pumpjackRank: 0,
        })), value);
    }
});

test('M4D Warlord pumpjack keeps the legacy zero-rank fallback to rank one', async () => {
    const { calculateOilWellProduction } = await modules();
    const base = representativeInputs({
        oilTechLevel: 0,
        geologyBonus: 0,
        biomeOilMultiplier: 1,
        dirtyJobsPercent: 0,
        warlord: true,
    });
    assert.equal(
        calculateOilWellProduction({ ...base, pumpjackRank: 0 }),
        0.4 * (1 + 0.24)
    );
    assert.equal(
        calculateOilWellProduction({ ...base, pumpjackRank: 3 }),
        0.4 * (1 + 3 * 0.24)
    );
});

test('M4D explain attributes the real vanilla modifiers in legacy order', async () => {
    const {
        createCalculationEngine,
        createOilWellProductionRegistration,
        createOilWellProductionModifiers,
        OIL_WELL_PRODUCTION_CALCULATION_ID,
    } = await modules();
    const engine = createCalculationEngine({
        registrations: [createOilWellProductionRegistration()],
        modifiers: createOilWellProductionModifiers(),
    });
    const inputs = representativeInputs();
    const result = engine.explain({ id: OIL_WELL_PRODUCTION_CALCULATION_ID, inputs });

    assert.equal(result.value, legacyOilWellProduction(inputs));
    assert.deepEqual(result.trace.steps.map(step => step.kind === 'base' ? 'base' : step.modifierId), [
        'base',
        'evolve:modifier/production/oil-well/technology',
        'evolve:modifier/production/oil-well/geology',
        'evolve:modifier/production/oil-well/biome',
        'evolve:modifier/production/oil-well/dirty-jobs',
        'evolve:modifier/production/oil-well/warlord',
    ]);
    assert.deepEqual(result.trace.steps.slice(1).map(step => step.operand), [
        1.75,
        1.25,
        0.92,
        1.1,
        1.72,
    ]);
    assert.equal(result.trace.steps.at(-1).after, result.value);
});

test('M4D skipped modifiers stay explicit in explain without evaluating operands', async () => {
    const {
        createCalculationEngine,
        createOilWellProductionRegistration,
        createOilWellProductionModifiers,
        OIL_WELL_PRODUCTION_CALCULATION_ID,
    } = await modules();
    const engine = createCalculationEngine({
        registrations: [createOilWellProductionRegistration()],
        modifiers: createOilWellProductionModifiers(),
    });
    const result = engine.explain({
        id: OIL_WELL_PRODUCTION_CALCULATION_ID,
        inputs: representativeInputs({
            oilTechLevel: 4,
            geologyBonus: 0,
            biomeOilMultiplier: 1,
            dirtyJobsPercent: 0,
            warlord: false,
            pumpjackRank: 0,
        }),
    });
    assert.equal(result.value, 0.48);
    for (const step of result.trace.steps.slice(1)){
        assert.equal(step.applied, false);
        assert.equal(step.operand, null);
        assert.equal(step.before, step.after);
    }
});

test('M4D first-party oil well inputs are closed, typed, finite, detached and fail closed on accessors', async () => {
    const { calculateOilWellProduction, EngineContractError } = await modules();
    assert.throws(
        () => calculateOilWellProduction({ ...representativeInputs(), hidden: 1 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_OIL_WELL_PRODUCTION_INPUTS'
    );
    assert.throws(
        () => calculateOilWellProduction({ ...representativeInputs(), warlord: 1 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_OIL_WELL_PRODUCTION_INPUTS'
    );
    assert.throws(
        () => calculateOilWellProduction({ ...representativeInputs(), geologyBonus: Infinity }),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA'
    );

    let getterCalls = 0;
    const hostile = representativeInputs();
    Object.defineProperty(hostile, 'oilTechLevel', {
        enumerable: true,
        get(){ getterCalls += 1; return 7; },
    });
    assert.throws(
        () => calculateOilWellProduction(hostile),
        error => error instanceof EngineContractError && error.code === 'INVALID_CALCULATION_DATA'
    );
    assert.equal(getterCalls, 0);

    const inputs = representativeInputs();
    const before = calculateOilWellProduction(inputs);
    inputs.oilTechLevel = 0;
    assert.notEqual(before, calculateOilWellProduction(inputs));
});
