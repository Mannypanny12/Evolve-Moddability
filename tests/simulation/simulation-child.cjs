'use strict';

const path = require('node:path');

const fixtureId = process.argv[2];
const periods = Number(process.argv[3]);
const marker = '__EVOLVE_SIM_RESULT__';

if (!fixtureId || !Number.isInteger(periods) || periods < 0){
    throw new Error('Usage: simulation-child.cjs <fixture-id> <periods>');
}

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const fixtures = require('../fixtures/fixture-loader.cjs');
const { normalizeSimulationState } = require('./normalize-simulation.cjs');

async function main(){
    legacy.seedRandom(1);
    legacy.setWallClock(Date.UTC(2026, 0, 1, 12, 0, 0));

    const definition = fixtures.loadFixtureById(fixtureId);
    fixtures.validateDefinition(
        definition,
        path.join('tests', 'fixtures', 'scenarios', `${fixtureId}.json`)
    );

    const state = fixtures.materializeFixture(definition, legacy);
    fixtures.assertFixture(definition, state);
    legacy.installLegacyState(state);

    await legacy.initializeSimulation();

    const before = normalizeSimulationState(
        legacy.legacyState(),
        legacy.transientSimulationState()
    );

    await legacy.runGameLoops(periods);

    const after = normalizeSimulationState(
        legacy.legacyState(),
        legacy.transientSimulationState()
    );

    const result = {
        schema: 1,
        fixture: fixtureId,
        periods,
        environment: {
            wallClock: '2026-01-01T12:00:00.000Z',
            randomSeed: 1
        },
        before,
        after
    };

    const encoded = Buffer.from(JSON.stringify(result), 'utf8').toString('base64');
    process.stdout.write(`${marker}${encoded}\n`);
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
