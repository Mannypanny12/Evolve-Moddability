'use strict';

const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const fixtures = require('../fixtures/fixture-loader.cjs');
const { LEGACY_CADENCE } = require('../simulation/legacy-cadence.cjs');

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

test('legacy adapter cadence matches the frozen harness contract', () => {
    assert.deepEqual(legacy.legacyCadence(), {
        mainMs: LEGACY_CADENCE.mainPeriodMs,
        midRatio: LEGACY_CADENCE.midRatio,
        longRatio: LEGACY_CADENCE.longRatio
    });
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
        const state = fixtures.materializePersistedFixture(definition, legacy);
        if (state.race && state.race.species){
            species.add(state.race.species);
        }
    }
    assert.ok(species.size >= 3, 'fixture catalog should contain at least three materially different species profiles');
});

test('game loops refuse to run before explicit simulation hydration', async () => {
    await assert.rejects(
        legacy.runGameLoops(1),
        /must be hydrated before running game loops/
    );
});

test('installing a persisted fixture clones it into isolated runtime state', () => {
    const definition = fixtures.loadFixtureById('early-civilization-human');
    const persisted = fixtures.materializePersistedFixture(definition, legacy);
    const before = fixtures.fingerprint(persisted);

    const runtimeState = legacy.installLegacyState(persisted);

    assert.notStrictEqual(runtimeState, persisted, 'runtime state must not reuse the persisted fixture object');
    assert.notStrictEqual(legacy.legacyState(), persisted, 'global runtime must not reuse the persisted fixture object');

    legacy.legacyState().__runtimeMutation = true;

    assert.equal(persisted.__runtimeMutation, undefined, 'runtime mutation leaked into persisted fixture');
    assert.equal(fixtures.fingerprint(persisted), before, 'persisted fixture changed after runtime installation');
});

for (const definition of fixtures.listFixtureDefinitions()){
    test(`fixture ${definition.id} validates and satisfies its invariants`, () => {
        const filePath = path.join('tests', 'fixtures', 'scenarios', `${definition.id}.json`);
        fixtures.validateDefinition(definition, filePath);

        const first = fixtures.materializePersistedFixture(definition, legacy);
        const second = fixtures.materializePersistedFixture(definition, legacy);

        fixtures.assertFixture(definition, first);
        assert.deepEqual(first, second, `${definition.id}: materialization must be deterministic`);

        first.__testMutation = true;
        assert.equal(second.__testMutation, undefined, `${definition.id}: materializations must be isolated`);
    });
}

test('hydrated legacy process refuses replacement with another fixture state', async () => {
    const firstDefinition = fixtures.loadFixtureById('early-civilization-human');
    const first = fixtures.materializePersistedFixture(firstDefinition, legacy);
    legacy.installLegacyState(first);
    await legacy.hydrateSimulationState();

    const secondDefinition = fixtures.loadFixtureById('preindustrial-orc');
    const second = fixtures.materializePersistedFixture(secondDefinition, legacy);

    assert.throws(
        () => legacy.installLegacyState(second),
        /cannot be replaced after hydration/
    );
});
