'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const readPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs')).href);
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs')).href);
const mappingPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);

function fixture(){
    return {
        portal: {
            purifier: {
                supply: 7,
                sup_max: 20,
            },
        },
    };
}

test('M3D4C Supply resolver maps only the canonical first-party payment to the purifier pool', async () => {
    const { createEvolveSpecialPaymentSourceResolver } = await resolverPromise;
    const resolver = createEvolveSpecialPaymentSourceResolver();

    assert.deepEqual(
        resolver.resolvePaymentSource('evolve:payment/supply'),
        { kind: 'pool', poolId: 'evolve:payment-pool/purifier_supply' }
    );
    assert.equal(Object.isFrozen(resolver), true);
    assert.equal(Object.isFrozen(resolver.resolvePaymentSource('evolve:payment/supply')), true);
    assert.throws(
        () => resolver.resolvePaymentSource('example:payment/other'),
        error => error && error.code === 'UNSUPPORTED_SPECIAL_PAYMENT_SOURCE_ID'
    );
    assert.throws(
        () => resolver.resolvePaymentSource('evolve:resource/supply'),
        error => error && error.code === 'INVALID_SPECIAL_PAYMENT_SOURCE_ID'
    );
});

test('M3D4C purifier mapping has the reviewed payment-pool identity and lifecycle', async () => {
    const { createEvolveLegacyMappingCatalog } = await mappingPromise;
    const mapping = createEvolveLegacyMappingCatalog().getRequired('evolve.payment_pool.purifier_supply_state');

    assert.equal(mapping.domain, 'payment-pools');
    assert.equal(mapping.family, 'payment-pool');
    assert.equal(mapping.legacyPath, 'global.portal.purifier');
    assert.deepEqual(mapping.canonicalIds, ['evolve:payment-pool/purifier_supply']);
    assert.equal(mapping.introducedIn, 'M3D4C');
    assert.equal(mapping.removeBy, 'M6K');
});

test('M3D4C purifier pool bridge is frozen, bounded, finite and read-only', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;
    const state = fixture();
    const before = JSON.stringify(state);
    const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => state });
    const poolId = 'evolve:payment-pool/purifier_supply';

    assert.equal(Object.isFrozen(provider), true);
    assert.deepEqual(Object.keys(provider), ['pool']);
    assert.deepEqual(Object.keys(provider.pool), ['present', 'amount', 'capacity']);
    assert.equal(provider.pool.present(poolId), true);
    assert.equal(provider.pool.amount(poolId), 7);
    assert.equal(provider.pool.capacity(poolId), 20);
    assert.equal(JSON.stringify(state), before);

    assert.throws(
        () => provider.pool.present('example:payment-pool/other'),
        error => error && error.code === 'UNSUPPORTED_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT'
    );
});

test('M3D4C missing purifier is valid absence while numeric reads require a present pool', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;
    const state = fixture();
    delete state.portal.purifier;
    const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => state });
    const poolId = 'evolve:payment-pool/purifier_supply';

    assert.equal(provider.pool.present(poolId), false);
    assert.throws(
        () => provider.pool.amount(poolId),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );
    assert.throws(
        () => provider.pool.capacity(poolId),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );
});

test('M3D4C present malformed purifier state fails closed instead of preserving legacy NaN poisoning', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;
    const ref = { current: fixture() };
    const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => ref.current });
    const poolId = 'evolve:payment-pool/purifier_supply';

    ref.current.portal.purifier = {};
    assert.equal(provider.pool.present(poolId), true);
    assert.throws(
        () => provider.pool.amount(poolId),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );
    assert.throws(
        () => provider.pool.capacity(poolId),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );

    for (const supply of [NaN, Infinity, '7', null]){
        ref.current = fixture();
        ref.current.portal.purifier.supply = supply;
        assert.throws(
            () => provider.pool.amount(poolId),
            error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
        );
    }

    for (const capacity of [NaN, Infinity, -1, '20', null]){
        ref.current = fixture();
        ref.current.portal.purifier.sup_max = capacity;
        assert.throws(
            () => provider.pool.capacity(poolId),
            error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
        );
    }
});

test('M3D4C purifier bridge rejects hostile options, accessors and asynchronous root providers', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;

    let optionGetterCalls = 0;
    const hostileOptions = {};
    Object.defineProperty(hostileOptions, 'readLegacyRoot', {
        enumerable: true,
        get(){ optionGetterCalls++; return () => fixture(); },
    });
    assert.throws(
        () => createEvolveSpecialPaymentPoolReadProvider(hostileOptions),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG'
    );
    assert.equal(optionGetterCalls, 0);

    for (const readLegacyRoot of [
        async () => fixture(),
        function* rootGenerator(){ yield fixture(); },
        class RootProvider {},
    ]){
        assert.throws(
            () => createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot }),
            error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER'
        );
    }

    const promised = createEvolveSpecialPaymentPoolReadProvider({
        readLegacyRoot: () => Promise.resolve(fixture()),
    });
    assert.throws(
        () => promised.pool.present('evolve:payment-pool/purifier_supply'),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER'
    );

    const state = fixture();
    let supplyGetterCalls = 0;
    Object.defineProperty(state.portal.purifier, 'supply', {
        enumerable: true,
        get(){ supplyGetterCalls++; return 7; },
    });
    const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => state });
    assert.throws(
        () => provider.pool.amount('evolve:payment-pool/purifier_supply'),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );
    assert.equal(supplyGetterCalls, 0);
});
