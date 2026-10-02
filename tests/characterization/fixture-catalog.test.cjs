'use strict';

const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const fixtures = require('../fixtures/fixture-loader.cjs');

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const requiredCoverage = [
    'evolution',
    'early-city',
    'pre-industrial',
    'industrial',
    'space',
    'interstellar',
    'portal',
    'hell',
    'late-game',
    'truepath',
    'tauceti',
    'challenge',
    'reset-ready',
    'build-queue',
    'research-queue',
    'power',
    'support',
    'crafting',
    'trade'
];

test('canonical initialized legacy base is frozen by fingerprint', () => {
    fixtures.assertBaseFingerprint(legacy);
});

test('fixture catalog has unique IDs and required progression/system coverage', () => {
    const definitions = fixtures.listFixtureDefinitions();
    const ids = definitions.map(definition => definition.id);
    assert.equal(new Set(ids).size, ids.length, 'fixture IDs must be unique');

    const coverage = new Set(definitions.flatMap(definition => definition.coverage));
    for (const tag of requiredCoverage){
        assert.ok(coverage.has(tag), `fixture coverage is missing required tag: ${tag}`);
    }

    const species = new Set();
    for (const definition of definitions){
        const state = fixtures.materializeFixture(definition, legacy);
        if (state.race && state.race.species){
            species.add(state.race.species);
        }
    }
    assert.ok(species.size >= 3, 'fixture catalog should contain at least three materially different species profiles');
});

for (const definition of fixtures.listFixtureDefinitions()){
    test(`fixture ${definition.id} validates and satisfies its invariants`, () => {
        const filePath = path.join('tests', 'fixtures', 'scenarios', `${definition.id}.json`);
        fixtures.validateDefinition(definition, filePath);

        const first = fixtures.materializeFixture(definition, legacy);
        const second = fixtures.materializeFixture(definition, legacy);

        fixtures.assertFixture(definition, first);
        assert.deepEqual(first, second, `${definition.id}: materialization must be deterministic`);

        first.__testMutation = true;
        assert.equal(second.__testMutation, undefined, `${definition.id}: materializations must be isolated`);
    });
}
