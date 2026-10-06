'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { maskNonCode } = require('../architecture/architecture-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs')).href);
const readPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);
const mappingPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);
const speciesCatalogPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-species-payment-catalog.mjs')).href);

function fixture(species = 'human'){
    return {
        race: { species },
        resource: {
            RNA: { amount: 20, max: 100, display: true },
            Knowledge: { amount: 80, max: 200, display: true },
            human: { amount: 7, max: 15, display: true },
            orc: { amount: 9, max: 18, display: true },
        },
    };
}

test('M3D4D first-party resolver maps Supply, Knowledge and contextual Species without executing payment', async () => {
    const { createEvolveSpecialPaymentSourceResolver } = await resolverPromise;
    const state = fixture('human');
    let rootReads = 0;
    const resolver = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot: () => { rootReads++; return state; } });

    assert.deepEqual(
        resolver.resolvePaymentSource('evolve:payment/supply'),
        { kind: 'pool', poolId: 'evolve:payment-pool/purifier_supply' }
    );
    assert.deepEqual(
        resolver.resolvePaymentSource('evolve:payment/knowledge'),
        { kind: 'resource', resourceId: 'evolve:resource/knowledge' }
    );
    assert.equal(rootReads, 0, 'static Supply/Knowledge resolution must not consult legacy context');

    assert.deepEqual(
        resolver.resolvePaymentSource('evolve:payment/species'),
        { kind: 'resource', resourceId: 'evolve:resource/human' }
    );
    assert.equal(rootReads, 1);

    state.race.species = 'orc';
    assert.deepEqual(
        resolver.resolvePaymentSource('evolve:payment/species'),
        { kind: 'resource', resourceId: 'evolve:resource/orc' }
    );
    assert.equal(rootReads, 2);
});

test('M3D4D Species source resolution is bounded to the live reviewed first-party race catalog', async () => {
    const { createEvolveSpecialPaymentSourceResolver } = await resolverPromise;
    const { EVOLVE_SPECIES_PAYMENT_LOCAL_IDS } = await speciesCatalogPromise;
    const racesSource = fs.readFileSync(path.join(root, 'src/races.js'), 'utf8');
    const code = maskNonCode(racesSource);
    const startToken = 'export const races = {';
    const start = code.indexOf(startToken);
    assert.notEqual(start, -1);
    const end = code.indexOf('\n};', start + startToken.length);
    assert.notEqual(end, -1);
    const block = code.slice(start + startToken.length, end);
    const liveSpecies = [...block.matchAll(/^    ([a-z0-9_]+):/gm)].map(match => match[1]).sort();

    assert.deepEqual([...EVOLVE_SPECIES_PAYMENT_LOCAL_IDS].sort(), liveSpecies);

    const state = fixture('not_a_vanilla_species');
    const resolver = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot: () => state });
    assert.throws(
        () => resolver.resolvePaymentSource('evolve:payment/species'),
        error => error && error.code === 'UNSUPPORTED_EVOLVE_SPECIES_PAYMENT_ID'
    );
});

test('M3D4D Knowledge mapping and active Species reads stay bounded and read-only', async () => {
    const [{ createEvolveLegacyPaymentReadProvider }, { createEvolveLegacyMappingCatalog }] = await Promise.all([
        readPromise,
        mappingPromise,
    ]);
    const state = fixture('human');
    const before = JSON.stringify(state);
    const provider = createEvolveLegacyPaymentReadProvider({ readLegacyRoot: () => state });

    const knowledge = createEvolveLegacyMappingCatalog().getRequired('evolve.resource.knowledge_payment_state');
    assert.equal(knowledge.legacyPath, 'global.resource.Knowledge');
    assert.deepEqual(knowledge.canonicalIds, ['evolve:resource/knowledge']);
    assert.equal(knowledge.introducedIn, 'M3D4D');
    assert.equal(knowledge.removeBy, 'M6B');

    assert.equal(provider.resource.amount('evolve:resource/knowledge'), 80);
    assert.equal(provider.resource.capacity('evolve:resource/knowledge'), 200);
    assert.equal(provider.resource.available('evolve:resource/knowledge'), true);
    assert.equal(provider.resource.amount('evolve:resource/human'), 7);
    assert.equal(provider.resource.capacity('evolve:resource/human'), 15);
    assert.equal(provider.resource.available('evolve:resource/human'), true);
    assert.equal(JSON.stringify(state), before);

    assert.throws(
        () => provider.resource.amount('evolve:resource/orc'),
        error => error && error.code === 'LEGACY_PAYMENT_SPECIES_CONTEXT_DRIFT'
    );
    assert.throws(
        () => provider.resource.amount('example:resource/human'),
        error => error && error.code === 'UNSUPPORTED_LEGACY_PAYMENT_SUBJECT'
    );
});

test('M3D4D missing active Species resource is a wiring/state failure, not invented zero affordability', async () => {
    const { createEvolveLegacyPaymentReadProvider } = await readPromise;
    const state = fixture('human');
    delete state.resource.human;
    const provider = createEvolveLegacyPaymentReadProvider({ readLegacyRoot: () => state });

    assert.throws(
        () => provider.resource.amount('evolve:resource/human'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_SPECIES_STATE'
    );
});

test('M3D4D Species resolver rejects accessors and asynchronous providers without invoking hostile getters', async () => {
    const { createEvolveSpecialPaymentSourceResolver } = await resolverPromise;

    for (const readLegacyRoot of [
        async () => fixture(),
        function* rootGenerator(){ yield fixture(); },
        class RootProvider {},
    ]){
        assert.throws(
            () => createEvolveSpecialPaymentSourceResolver({ readLegacyRoot }),
            error => error && error.code === 'INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER'
        );
    }

    const promised = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot: () => Promise.resolve(fixture()) });
    assert.throws(
        () => promised.resolvePaymentSource('evolve:payment/species'),
        error => error && error.code === 'INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER'
    );

    const state = fixture();
    let getterCalls = 0;
    Object.defineProperty(state.race, 'species', {
        enumerable: true,
        get(){ getterCalls++; return 'human'; },
    });
    const accessorResolver = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot: () => state });
    assert.throws(
        () => accessorResolver.resolvePaymentSource('evolve:payment/species'),
        error => error && error.code === 'INVALID_SPECIAL_PAYMENT_SOURCE_STATE'
    );
    assert.equal(getterCalls, 0);
});
