'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const readPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs')).href);

const POOL_ID = 'evolve:payment-pool/purifier_supply';

function fixture(supply = 7, capacity = 20){
    return {
        portal: {
            purifier: {
                supply,
                sup_max: capacity,
            },
        },
    };
}

test('M3D4C purifier bridge follows replacement roots rather than retaining stale state', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;
    const ref = { current: fixture(3, 8) };
    const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => ref.current });

    assert.equal(provider.pool.amount(POOL_ID), 3);
    assert.equal(provider.pool.capacity(POOL_ID), 8);

    ref.current = fixture(9, 14);
    assert.equal(provider.pool.amount(POOL_ID), 9);
    assert.equal(provider.pool.capacity(POOL_ID), 14);
});

test('M3D4C purifier bridge rejects portal, purifier, supply and capacity accessors without invoking them', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;

    for (const target of ['portal', 'purifier', 'supply', 'sup_max']){
        const state = fixture();
        let getterCalls = 0;
        if (target === 'portal'){
            const portal = state.portal;
            Object.defineProperty(state, 'portal', {
                enumerable: true,
                get(){ getterCalls++; return portal; },
            });
        }
        else if (target === 'purifier'){
            const purifier = state.portal.purifier;
            Object.defineProperty(state.portal, 'purifier', {
                enumerable: true,
                get(){ getterCalls++; return purifier; },
            });
        }
        else {
            Object.defineProperty(state.portal.purifier, target, {
                enumerable: true,
                get(){ getterCalls++; return target === 'supply' ? 7 : 20; },
            });
        }

        const provider = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => state });
        const read = target === 'sup_max' ? provider.pool.capacity :
            target === 'supply' ? provider.pool.amount : provider.pool.present;
        assert.throws(
            () => read(POOL_ID),
            error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
        );
        assert.equal(getterCalls, 0);
    }
});

test('M3D4C purifier bridge normalizes throwing root providers and rejects accessor thenables without invocation', async () => {
    const { createEvolveSpecialPaymentPoolReadProvider } = await readPromise;

    const throwing = createEvolveSpecialPaymentPoolReadProvider({
        readLegacyRoot(){ throw new Error('root exploded'); },
    });
    assert.throws(
        () => throwing.pool.present(POOL_ID),
        error => error && error.code === 'LEGACY_SPECIAL_PAYMENT_POOL_ROOT_READ_FAILURE'
    );

    const state = fixture();
    let thenGetterCalls = 0;
    Object.defineProperty(state, 'then', {
        configurable: true,
        get(){ thenGetterCalls++; return () => {}; },
    });
    const thenable = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot: () => state });
    assert.throws(
        () => thenable.pool.present(POOL_ID),
        error => error && error.code === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER'
    );
    assert.equal(thenGetterCalls, 0);
});
