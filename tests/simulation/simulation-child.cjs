'use strict';

const path = require('node:path');

const fixtureId = process.argv[2];
const periods = Number(process.argv[3]);
const marker = '__EVOLVE_SIM_RESULT__';
const {
    ORACLE_RESULT_SCHEMA,
    ORACLE_ENVIRONMENT
} = require('./oracle-contract.cjs');

if (!fixtureId || !Number.isInteger(periods) || periods < 0){
    throw new Error('Usage: simulation-child.cjs <fixture-id> <periods>');
}

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const fixtures = require('../fixtures/fixture-loader.cjs');
const { normalizeSimulationState } = require('./normalize-simulation.cjs');

async function main(){
    legacy.seedRandom(ORACLE_ENVIRONMENT.randomSeed);
    legacy.setWallClock(Date.parse(ORACLE_ENVIRONMENT.wallClock));

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
        schema: ORACLE_RESULT_SCHEMA,
        fixture: fixtureId,
        periods,
        environment: { ...ORACLE_ENVIRONMENT },
        before,
        after
    };

    const encoded = Buffer.from(JSON.stringify(result), 'utf8').toString('base64');
    process.stdout.write(`${marker}${encoded}\n`);
    process.exit(0);
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
