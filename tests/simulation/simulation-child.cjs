'use strict';

const path = require('node:path');

const fixtureId = process.argv[2];
const periods = Number(process.argv[3]);
const sequenceArg = process.argv[4];
const marker = '__EVOLVE_SIM_RESULT__';
const {
    ORACLE_RESULT_SCHEMA,
    ORACLE_ENVIRONMENT
} = require('./oracle-contract.cjs');

if (!fixtureId || !Number.isInteger(periods) || periods < 0){
    throw new Error('Usage: simulation-child.cjs <fixture-id> <periods> [call-sequence-json]');
}

const callSequence = sequenceArg ? JSON.parse(sequenceArg) : [periods];
if (
    !Array.isArray(callSequence) ||
    callSequence.length === 0 ||
    callSequence.some(value => !Number.isInteger(value) || value < 0)
){
    throw new Error('call sequence must be a non-empty array of non-negative integer periods');
}
if (callSequence.reduce((sum, value) => sum + value, 0) !== periods){
    throw new Error('call sequence period total must equal requested periods');
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

    const persistedState = fixtures.materializePersistedFixture(definition, legacy);
    fixtures.assertFixture(definition, persistedState);
    const persistedFingerprint = fixtures.fingerprint(persistedState);

    legacy.installLegacyState(persistedState);
    await legacy.hydrateSimulationState();

    if (fixtures.fingerprint(persistedState) !== persistedFingerprint){
        throw new Error(fixtureId + ': hydration mutated the persisted fixture input');
    }

    const before = normalizeSimulationState(
        legacy.legacyState(),
        legacy.transientSimulationState()
    );

    for (const callPeriods of callSequence){
        await legacy.runGameLoops(callPeriods);
    }

    const after = normalizeSimulationState(
        legacy.legacyState(),
        legacy.transientSimulationState()
    );

    if (fixtures.fingerprint(persistedState) !== persistedFingerprint){
        throw new Error(fixtureId + ': simulation mutated the persisted fixture input');
    }

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
