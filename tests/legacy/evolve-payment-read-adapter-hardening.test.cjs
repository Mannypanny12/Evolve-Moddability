'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);

async function create(options){
    const { createEvolveLegacyPaymentReadProvider } = await adapterPromise;
    return createEvolveLegacyPaymentReadProvider(options);
}

function fixture(){
    return { resource: { RNA: { amount: 3, max: 10, display: true } } };
}

test('M3D2 legacy payment bridge rejects malformed adapter configuration and async providers', async () => {
    for (const options of [null, {}, { readLegacyRoot: 1 }, { readLegacyRoot(){}, extra: true }]){
        await assert.rejects(
            async () => create(options),
            error => error && [
                'INVALID_LEGACY_PAYMENT_ADAPTER_CONFIG',
                'INVALID_LEGACY_PAYMENT_ROOT_PROVIDER',
            ].includes(error.code)
        );
    }

    await assert.rejects(
        async () => create({ readLegacyRoot: async () => fixture() }),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_ROOT_PROVIDER'
    );
});

test('M3D2 legacy payment bridge rejects malformed resource fields', async () => {
    const ref = { current: fixture() };
    const provider = await create({ readLegacyRoot: () => ref.current });

    for (const amount of [NaN, Infinity, '3', null]){
        ref.current = fixture();
        ref.current.resource.RNA.amount = amount;
        assert.throws(
            () => provider.resource.amount('evolve:resource/rna'),
            error => error && error.code === 'INVALID_LEGACY_PAYMENT_STATE'
        );
    }

    for (const max of [-2, NaN, Infinity, '10', null]){
        ref.current = fixture();
        ref.current.resource.RNA.max = max;
        assert.throws(
            () => provider.resource.capacity('evolve:resource/rna'),
            error => error && error.code === 'INVALID_LEGACY_PAYMENT_STATE'
        );
    }

    for (const display of [{}, [], 'true', -1, NaN]){
        ref.current = fixture();
        ref.current.resource.RNA.display = display;
        assert.throws(
            () => provider.resource.available('evolve:resource/rna'),
            error => error && error.code === 'INVALID_LEGACY_PAYMENT_STATE'
        );
    }
});

test('M3D2 legacy payment bridge rejects accessor state without invoking the getter', async () => {
    const state = fixture();
    let getterCalls = 0;
    Object.defineProperty(state.resource.RNA, 'amount', {
        enumerable: true,
        get(){ getterCalls++; return 3; },
    });
    const provider = await create({ readLegacyRoot: () => state });

    assert.throws(
        () => provider.resource.amount('evolve:resource/rna'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_STATE'
    );
    assert.equal(getterCalls, 0);
});

test('M3D2 legacy payment bridge fails closed on throwing, Promise and hostile roots', async () => {
    const throwing = await create({ readLegacyRoot(){ throw new Error('boom'); } });
    assert.throws(
        () => throwing.resource.amount('evolve:resource/rna'),
        error => error && error.code === 'LEGACY_PAYMENT_ROOT_READ_FAILURE'
    );

    const promised = await create({ readLegacyRoot: () => Promise.resolve(fixture()) });
    assert.throws(
        () => promised.resource.amount('evolve:resource/rna'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_ROOT_PROVIDER'
    );

    const hostile = new Proxy({}, {
        getPrototypeOf(){ throw new Error('hostile prototype'); },
    });
    const hostileProvider = await create({ readLegacyRoot: () => hostile });
    assert.throws(
        () => hostileProvider.resource.amount('evolve:resource/rna'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_ROOT_PROVIDER'
    );
});
