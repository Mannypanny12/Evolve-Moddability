'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);

function fixture(){
    return {
        resource: {
            RNA: { amount: 3, max: 10, display: true },
            DNA: { amount: 5, max: 20, display: true },
        },
    };
}

async function providerFor(ref){
    const { createEvolveLegacyPaymentReadProvider } = await adapterPromise;
    return createEvolveLegacyPaymentReadProvider({ readLegacyRoot: () => ref.current });
}

test('M3D2 legacy payment bridge exposes only the bounded RNA subject', async () => {
    const ref = { current: fixture() };
    const provider = await providerFor(ref);

    assert.equal(provider.resource.amount('evolve:resource/rna'), 3);
    assert.equal(provider.resource.available('evolve:resource/rna'), true);
    assert.equal(provider.resource.capacity('evolve:resource/rna'), 10);

    assert.throws(
        () => provider.resource.amount('evolve:resource/dna'),
        error => error &&
            error.code === 'UNSUPPORTED_LEGACY_PAYMENT_SUBJECT' &&
            error.details?.resourceId === 'evolve:resource/dna'
    );
});

test('M3D2 legacy payment bridge normalizes max -1 to unbounded null capacity', async () => {
    const ref = { current: fixture() };
    const provider = await providerFor(ref);

    ref.current.resource.RNA.max = -1;
    assert.equal(provider.resource.capacity('evolve:resource/rna'), null);

    ref.current.resource.RNA.max = 0;
    assert.equal(provider.resource.capacity('evolve:resource/rna'), 0);
});

test('M3D2 legacy payment bridge follows current injected root state without retaining old snapshots', async () => {
    const ref = { current: fixture() };
    const provider = await providerFor(ref);

    assert.equal(provider.resource.amount('evolve:resource/rna'), 3);
    ref.current = fixture();
    ref.current.resource.RNA.amount = 9;
    ref.current.resource.RNA.display = false;

    assert.equal(provider.resource.amount('evolve:resource/rna'), 9);
    assert.equal(provider.resource.available('evolve:resource/rna'), false);
});

test('M3D2 legacy payment bridge uses explicit missing-resource fallbacks', async () => {
    const ref = { current: { resource: {} } };
    const provider = await providerFor(ref);

    assert.equal(provider.resource.amount('evolve:resource/rna'), 0);
    assert.equal(provider.resource.available('evolve:resource/rna'), false);
    assert.equal(provider.resource.capacity('evolve:resource/rna'), 0);
});

test('M3D2 legacy payment bridge accepts numeric legacy display markers and is read-only', async () => {
    const state = fixture();
    const ref = { current: state };
    const provider = await providerFor(ref);
    const before = JSON.stringify(state);

    state.resource.RNA.display = 1;
    assert.equal(provider.resource.available('evolve:resource/rna'), true);
    state.resource.RNA.display = 0;
    assert.equal(provider.resource.available('evolve:resource/rna'), false);

    state.resource.RNA.display = true;
    provider.resource.amount('evolve:resource/rna');
    provider.resource.available('evolve:resource/rna');
    provider.resource.capacity('evolve:resource/rna');
    assert.equal(JSON.stringify(state), before);
});
