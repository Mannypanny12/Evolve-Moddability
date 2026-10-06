'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const readPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-prestige-payment-read-adapter.mjs')).href);
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-prestige-payment-source-resolver.mjs')).href);

function fixture(){
    return {
        race: { universe: 'standard' },
        prestige: {
            Plasmid: { count: 7 },
            AntiPlasmid: { count: 3 },
        },
    };
}

test('M3D4B prestige read bridge is frozen, bounded, finite and read-only', async () => {
    const { createEvolvePrestigePaymentReadProvider } = await readPromise;
    const state = fixture();
    const before = JSON.stringify(state);
    const provider = createEvolvePrestigePaymentReadProvider({ readLegacyRoot: () => state });

    assert.equal(Object.isFrozen(provider), true);
    assert.deepEqual(Object.keys(provider), ['prestige']);
    assert.deepEqual(Object.keys(provider.prestige), ['amount']);
    assert.equal(provider.prestige.amount('evolve:prestige/plasmid'), 7);
    assert.equal(provider.prestige.amount('evolve:prestige/anti_plasmid'), 3);
    assert.equal(JSON.stringify(state), before);

    assert.throws(
        () => provider.prestige.amount('example:prestige/other'),
        error => error && error.code === 'UNSUPPORTED_LEGACY_PRESTIGE_PAYMENT_SUBJECT'
    );
});

test('M3D4B prestige read bridge fails closed on missing or malformed resolved sources', async () => {
    const { createEvolvePrestigePaymentReadProvider } = await readPromise;
    const ref = { current: fixture() };
    const provider = createEvolvePrestigePaymentReadProvider({ readLegacyRoot: () => ref.current });

    delete ref.current.prestige.AntiPlasmid;
    assert.throws(
        () => provider.prestige.amount('evolve:prestige/anti_plasmid'),
        error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_STATE'
    );

    ref.current = fixture();
    ref.current.prestige.Plasmid = {};
    assert.throws(
        () => provider.prestige.amount('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_STATE'
    );

    for (const count of [NaN, Infinity, '7', null]){
        ref.current = fixture();
        ref.current.prestige.Plasmid.count = count;
        assert.throws(
            () => provider.prestige.amount('evolve:prestige/plasmid'),
            error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_STATE'
        );
    }
});

test('M3D4B prestige read bridge rejects async/generator/class providers and promise-like root results', async () => {
    const { createEvolvePrestigePaymentReadProvider } = await readPromise;

    for (const readLegacyRoot of [
        async () => fixture(),
        function* rootGenerator(){ yield fixture(); },
        class RootProvider {},
    ]){
        assert.throws(
            () => createEvolvePrestigePaymentReadProvider({ readLegacyRoot }),
            error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER'
        );
    }

    const provider = createEvolvePrestigePaymentReadProvider({
        readLegacyRoot: () => Promise.resolve(fixture()),
    });
    assert.throws(
        () => provider.prestige.amount('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER'
    );
});

test('M3D4B prestige bridge configuration and state accessors are rejected without invocation', async () => {
    const [
        { createEvolvePrestigePaymentReadProvider },
        { createEvolvePrestigePaymentSourceResolver },
    ] = await Promise.all([readPromise, resolverPromise]);

    let optionGetterCalls = 0;
    const hostileOptions = {};
    Object.defineProperty(hostileOptions, 'readLegacyRoot', {
        enumerable: true,
        get(){ optionGetterCalls++; return () => fixture(); },
    });
    assert.throws(
        () => createEvolvePrestigePaymentReadProvider(hostileOptions),
        error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG'
    );
    assert.throws(
        () => createEvolvePrestigePaymentSourceResolver(hostileOptions),
        error => error && error.code === 'INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG'
    );
    assert.equal(optionGetterCalls, 0);

    const state = fixture();
    let countGetterCalls = 0;
    Object.defineProperty(state.prestige.Plasmid, 'count', {
        enumerable: true,
        get(){ countGetterCalls++; return 7; },
    });
    const provider = createEvolvePrestigePaymentReadProvider({ readLegacyRoot: () => state });
    assert.throws(
        () => provider.prestige.amount('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_LEGACY_PRESTIGE_PAYMENT_STATE'
    );
    assert.equal(countGetterCalls, 0);

    const resolverState = fixture();
    let universeGetterCalls = 0;
    Object.defineProperty(resolverState.race, 'universe', {
        enumerable: true,
        get(){ universeGetterCalls++; return 'antimatter'; },
    });
    const resolver = createEvolvePrestigePaymentSourceResolver({ readLegacyRoot: () => resolverState });
    assert.throws(
        () => resolver.resolvePrestigeId('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT'
    );
    assert.equal(universeGetterCalls, 0);
});

test('M3D4B prestige source resolver remaps only first-party Plasmid in antimatter', async () => {
    const { createEvolvePrestigePaymentSourceResolver } = await resolverPromise;
    const ref = { current: fixture() };
    const resolver = createEvolvePrestigePaymentSourceResolver({ readLegacyRoot: () => ref.current });

    assert.equal(resolver.resolvePrestigeId('evolve:prestige/plasmid'), 'evolve:prestige/plasmid');
    assert.equal(resolver.resolvePrestigeId('evolve:prestige/anti_plasmid'), 'evolve:prestige/anti_plasmid');

    ref.current.race.universe = 'antimatter';
    assert.equal(resolver.resolvePrestigeId('evolve:prestige/plasmid'), 'evolve:prestige/anti_plasmid');
    assert.equal(resolver.resolvePrestigeId('evolve:prestige/anti_plasmid'), 'evolve:prestige/anti_plasmid');
});

test('M3D4B prestige source resolver rejects malformed context and unsupported identities', async () => {
    const { createEvolvePrestigePaymentSourceResolver } = await resolverPromise;
    const ref = { current: fixture() };
    const resolver = createEvolvePrestigePaymentSourceResolver({ readLegacyRoot: () => ref.current });

    assert.throws(
        () => resolver.resolvePrestigeId('example:prestige/other'),
        error => error && error.code === 'UNSUPPORTED_PRESTIGE_PAYMENT_SOURCE_ID'
    );

    delete ref.current.race.universe;
    assert.throws(
        () => resolver.resolvePrestigeId('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT'
    );
});

test('M3D4B resolver rejects asynchronous providers but never reads context for already-resolved AntiPlasmid', async () => {
    const { createEvolvePrestigePaymentSourceResolver } = await resolverPromise;

    for (const readLegacyRoot of [
        async () => fixture(),
        function* rootGenerator(){ yield fixture(); },
        class RootProvider {},
    ]){
        assert.throws(
            () => createEvolvePrestigePaymentSourceResolver({ readLegacyRoot }),
            error => error && error.code === 'INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER'
        );
    }

    const promiseResolver = createEvolvePrestigePaymentSourceResolver({
        readLegacyRoot: () => Promise.resolve(fixture()),
    });
    assert.throws(
        () => promiseResolver.resolvePrestigeId('evolve:prestige/plasmid'),
        error => error && error.code === 'INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER'
    );

    let contextReads = 0;
    const resolver = createEvolvePrestigePaymentSourceResolver({
        readLegacyRoot(){
            contextReads++;
            throw new Error('context should be read only for declared Plasmid');
        },
    });
    assert.equal(
        resolver.resolvePrestigeId('evolve:prestige/anti_plasmid'),
        'evolve:prestige/anti_plasmid'
    );
    assert.equal(contextReads, 0);
    assert.throws(
        () => resolver.resolvePrestigeId('evolve:prestige/plasmid'),
        error => error && error.code === 'PRESTIGE_PAYMENT_SOURCE_CONTEXT_READ_FAILURE'
    );
    assert.equal(contextReads, 1);
});
