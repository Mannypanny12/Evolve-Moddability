'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    PROD,
    MIGRATED_CONSTANT_IDS,
    MIGRATED_VARIANTS,
    analyzeProdSource,
    findViolations,
} = require('./m4e2-simple-production-cutover-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const prodPath = path.join(root, ...PROD.split('/'));

function prodSource(){
    return fs.readFileSync(prodPath, 'utf8');
}

test('M4E2 first scalar cutover group is routed through the shared calculation compatibility seam', () => {
    assert.equal(MIGRATED_CONSTANT_IDS.length, 12);
    assert.deepEqual(Object.keys(MIGRATED_VARIANTS), ['harvester', 'shadow_mine']);
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

test('M4E2 cutover guard rejects ambient state sneaking back into a migrated case', () => {
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
