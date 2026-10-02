'use strict';

const path = require('node:path');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const fixtures = require('../fixtures/fixture-loader.cjs');

async function main(){
    const firstDefinition = fixtures.loadFixtureById('early-civilization-human');
    const first = fixtures.materializePersistedFixture(firstDefinition, legacy);
    legacy.installLegacyState(first);
    await legacy.hydrateSimulationState();

    const secondDefinition = fixtures.loadFixtureById('preindustrial-orc');
    const second = fixtures.materializePersistedFixture(secondDefinition, legacy);

    let rejected = false;
    try {
        legacy.installLegacyState(second);
    }
    catch (error){
        if (/cannot be replaced after hydration/.test(String(error && error.message))){
            rejected = true;
        }
        else {
            throw error;
        }
    }

    if (!rejected){
        throw new Error('hydrated legacy process accepted replacement fixture state');
    }

    process.stdout.write('lifecycle-replacement-rejected\n');
    process.exit(0);
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
