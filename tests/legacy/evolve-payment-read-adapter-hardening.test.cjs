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

function hostileContainer(){
    return new Proxy({}, {
        getPrototypeOf(){ return {}; },
        get(){ throw new Error('hostile adapter input escaped into diagnostics'); },
    });
}

test('M3D2 legacy payment bridge facade is frozen and exposes exactly the reviewed resource reads', async () => {
    const provider = await create({ readLegacyRoot: () => fixture() });

    assert.equal(Object.isFrozen(provider), true);
    assert.equal(Object.isFrozen(provider.resource), true);
    assert.deepEqual(Object.keys(provider), ['resource']);
    assert.deepEqual(Object.keys(provider.resource).sort(), ['amount', 'available', 'capacity']);
});

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

test('M3D2 hostile adapter configuration cannot escape through error details', async () => {
    await assert.rejects(
        async () => create(hostileContainer()),
        error => {
            assert.equal(error && error.code, 'INVALID_LEGACY_PAYMENT_ADAPTER_CONFIG');
            assert.equal(Object.prototype.hasOwnProperty.call(error.details || {}, 'value'), false);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
});

test('M3D2 legacy payment bridge rejects malformed direct subject IDs without retaining them', async () => {
    const provider = await create({ readLegacyRoot: () => fixture() });
    const hostile = new Proxy({}, {
        get(){ throw new Error('hostile subject escaped into diagnostics'); },
    });

    assert.throws(
        () => provider.resource.amount(hostile),
        error => {
            assert.equal(error && error.code, 'INVALID_LEGACY_PAYMENT_SUBJECT_ID');
            assert.equal(Object.prototype.hasOwnProperty.call(error.details || {}, 'resourceId'), false);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
    assert.throws(
        () => provider.resource.amount('example:technology/not-a-resource'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_SUBJECT_ID'
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

test('M3D2 legacy payment bridge rejects accessor-based root thenables without invoking the getter', async () => {
    const state = fixture();
    let getterCalls = 0;
    Object.defineProperty(state, 'then', {
        enumerable: false,
        get(){ getterCalls++; return () => {}; },
    });
    const provider = await create({ readLegacyRoot: () => state });

    assert.throws(
        () => provider.resource.amount('evolve:resource/rna'),
        error => error && error.code === 'INVALID_LEGACY_PAYMENT_ROOT_PROVIDER'
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
