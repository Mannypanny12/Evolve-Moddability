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
