'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy) throw new Error('Legacy test API did not initialize');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const resourceBridgePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);
const poolBridgePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs')).href);
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs')).href);

function install(mutator){
    const state = legacy.pristineLegacyState();
    mutator(state);
    return legacy.installLegacyState(state);
}

async function assessSupply(state, amount){
    const [
        { createPaymentQuote },
        { createPaymentAssessor },
        { createEvolveLegacyPaymentReadProvider },
        { createEvolveSpecialPaymentPoolReadProvider },
        { createEvolveSpecialPaymentSourceResolver },
    ] = await Promise.all([
        quotePromise,
        assessorPromise,
        resourceBridgePromise,
        poolBridgePromise,
        resolverPromise,
    ]);

    const readLegacyRoot = () => state;
    const resource = createEvolveLegacyPaymentReadProvider({ readLegacyRoot }).resource;
    const pool = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot }).pool;
    const source = createEvolveSpecialPaymentSourceResolver().resolvePaymentSource('evolve:payment/supply');
    const quote = createPaymentQuote([{
        kind: 'special',
        paymentId: 'evolve:payment/supply',
        source,
        amount,
    }]);
    const assessor = createPaymentAssessor({ resource, pool });
    return {
        current: assessor.assessCurrentAffordability(quote),
        queue: assessor.assessQueuePaymentFeasibility(quote),
    };
}

test('M3D4C exact Supply amount and capacity boundaries match legacy inclusive affordability', async () => {
    const state = install(state => {
        state.portal.purifier = {
            ...(state.portal.purifier || {}),
            supply: 5,
            sup_max: 5,
        };
    });
    const modern = await assessSupply(state, 5);

    assert.equal(legacy.canAfford({ Supply: 5 }), true);
    assert.equal(legacy.canAffordMax({ Supply: 5 }), true);
    assert.equal(modern.current.status, 'satisfied');
    assert.equal(modern.queue.status, 'satisfied');
});

test('M3D4C one-unit Supply threshold crossings match legacy in each assessment mode', async () => {
    const state = install(state => {
        state.portal.purifier = {
            ...(state.portal.purifier || {}),
            supply: 4,
            sup_max: 5,
        };
    });
    let modern = await assessSupply(state, 5);
    assert.equal(legacy.canAfford({ Supply: 5 }), false);
    assert.equal(legacy.canAffordMax({ Supply: 5 }), true);
    assert.equal(modern.current.status, 'failed');
    assert.equal(modern.queue.status, 'satisfied');

    state.portal.purifier.supply = 5;
    state.portal.purifier.sup_max = 4;
    modern = await assessSupply(state, 5);
    assert.equal(legacy.canAfford({ Supply: 5 }), true);
    assert.equal(legacy.canAffordMax({ Supply: 5 }), false);
    assert.equal(modern.current.status, 'satisfied');
    assert.equal(modern.queue.status, 'failed');
});
