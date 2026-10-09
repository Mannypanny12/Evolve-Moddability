'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    PROD,
    MIGRATED_CONSTANT_IDS,
    MIGRATED_VARIANTS,
    MIGRATED_FACT_CASES,
    MIGRATED_ISOLATION_CASES,
    analyzeProdSource,
    findViolations,
} = require('./m4e2-simple-production-cutover-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const prodPath = path.join(root, ...PROD.split('/'));

function prodSource(){
    return fs.readFileSync(prodPath, 'utf8');
}

test('M4E2 migrated scalar cutover groups are routed through the shared calculation compatibility seam', () => {
    assert.equal(MIGRATED_CONSTANT_IDS.length, 12);
    assert.deepEqual(Object.keys(MIGRATED_VARIANTS), ['harvester', 'shadow_mine']);
    assert.deepEqual(Object.keys(MIGRATED_FACT_CASES), [
        'gas_mining',
        'oil_extractor',
        'elerium_ship',
        'iridium_ship',
        'iron_ship',
        'lander',
        'shock_trooper',
        'tank',
        'ore_refinery',
    ]);
    assert.deepEqual(Object.keys(MIGRATED_ISOLATION_CASES), [
        'tau_farm',
        'refueling_station',
        'mining_ship_ore',
        'whaling_ship_oil',
    ]);
    assert.equal(
        MIGRATED_CONSTANT_IDS.length
        + Object.keys(MIGRATED_VARIANTS).length
        + Object.keys(MIGRATED_FACT_CASES).length
        + Object.keys(MIGRATED_ISOLATION_CASES).length,
        27
    );
    assert.deepEqual(findViolations(root), []);
});

test('M4E2 cutover guard rejects reintroduced literal authority in a migrated constant case', () => {
    const mutated = prodSource().replace(
        "return simpleProduction('transmitter');",
        'return 2.5;'
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('transmitter') && value.includes('numeric production authority')), true);
    assert.equal(violations.some(value => value.includes('transmitter') && value.includes('canonical calculation')), true);
});

test('M4E2 cutover guard rejects loss of legacy undefined compatibility for variants', () => {
    const mutated = prodSource().replace(
        "if (val !== 'helium' && val !== 'deuterium') return;\n            ",
        ''
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('harvester') && value.includes('preserve legacy undefined')), true);
});

test('M4E2 cutover guard rejects a restored legacy val switch', () => {
    const mutated = prodSource().replace(
        "return simpleProduction('shadow_mine', { variant: val });",
        "switch (val){ case 'elerium': return 0.02; default: return; }"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('shadow_mine') && value.includes('legacy val switch')), true);
    assert.equal(violations.some(value => value.includes('shadow_mine') && value.includes('numeric production authority')), true);
});

test('M4E2 cutover guard rejects ambient state sneaking back into a migrated constant case', () => {
    const mutated = prodSource().replace(
        "return simpleProduction('alien_outpost');",
        "const hidden = global.tech['alien'];\n            return simpleProduction('alien_outpost') + hidden;"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('alien_outpost') && value.includes('ambient gameplay-state reads')), true);
});

test('M4E2 cutover guard rejects bypassing the compatibility helper', () => {
    const mutated = prodSource().replace(
        "return simpleProduction('whaling_station');",
        "return calculateProductionCalculation({ id: SIMPLE_PRODUCTION_CALCULATION_IDS.whaling_station, inputs: {} });"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('whaling_station') && value.includes('bypassing the compatibility helper')), true);
});

test('M4E2 cutover guard rejects threshold arithmetic returning to a fact-fed case', () => {
    const mutated = prodSource().replace(
        MIGRATED_FACT_CASES.oil_extractor,
        "return global.tech['oil'] >= 7 ? 0.96 : simpleProduction('oil_extractor', { oilTechLevel: global.tech['oil'] || 0 });"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('oil_extractor') && value.includes('threshold or completion logic')), true);
    assert.equal(violations.some(value => value.includes('oil_extractor') && value.includes('reviewed explicit fact')), true);
});

test('M4E2 cutover guard rejects completion gating returning to prod.js', () => {
    const mutated = prodSource().replace(
        MIGRATED_FACT_CASES.lander,
        "if (global.space.crashed_ship.count === 100){ return simpleProduction('lander', { crashedShipCount: 100 }); } return 0;"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('lander') && value.includes('threshold or completion logic')), true);
    assert.equal(violations.some(value => value.includes('lander') && value.includes('numeric production authority')), true);
});

test('M4E2 cutover guard rejects changing the reviewed explicit fact snapshot', () => {
    const mutated = prodSource().replace(
        MIGRATED_FACT_CASES.ore_refinery,
        "return simpleProduction('ore_refinery', { tauOreMiningUnlocked: Boolean(global.tech['tau_ore_mining']), hidden: global.tech['tau_farm'] });"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('ore_refinery') && value.includes('reviewed explicit fact')), true);
});

test('M4E2 Isolation cutover guard rejects loss of legacy undefined compatibility for mining ore variants', () => {
    const mutated = prodSource().replace(
        "if (val !== 'iron' && val !== 'aluminium' && val !== 'iridium' && val !== 'neutronium' && val !== 'orichalcum' && val !== 'elerium') return;\n            ",
        ''
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('mining_ship_ore') && value.includes('legacy variant/state-read compatibility')), true);
});

test('M4E2 Isolation cutover guard rejects numeric Isolation authority returning to prod.js', () => {
    const mutated = prodSource().replace(
        MIGRATED_ISOLATION_CASES.refueling_station,
        "return global.tech['isolation'] ? 18.5 : 9.35;"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('refueling_station') && value.includes('numeric production authority')), true);
    assert.equal(violations.some(value => value.includes('refueling_station') && value.includes('reviewed Isolation fact')), true);
});

test('M4E2 tau farm cutover preserves the legacy water path without reading Isolation', () => {
    const mutated = prodSource().replace(
        "isolation: val === 'water' ? false : Boolean(global.tech['isolation'])",
        "isolation: Boolean(global.tech['isolation'])"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('tau_farm') && value.includes('legacy variant/state-read compatibility')), true);
});

test('M4E2 Isolation cutover guard rejects an extra hidden state snapshot', () => {
    const mutated = prodSource().replace(
        MIGRATED_ISOLATION_CASES.whaling_ship_oil,
        "return simpleProduction('whaling_ship_oil', { isolation: Boolean(global.tech['isolation']), hidden: global.tech['tau_ore_mining'] });"
    );
    const violations = analyzeProdSource(mutated);
    assert.equal(violations.some(value => value.includes('whaling_ship_oil') && value.includes('reviewed Isolation fact')), true);
});
