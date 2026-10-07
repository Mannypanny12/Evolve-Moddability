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
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);
const resourceBridgePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);
const poolBridgePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs')).href);
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs')).href);

function install(mutator){
    const state = legacy.pristineLegacyState();
    mutator(state);
    return legacy.installLegacyState(state);
}

async function modernSupply(state, amount){
    const [
        { createPaymentQuote },
        { createPaymentAssessor },
        { createPaymentPlan },
        { createEvolveLegacyPaymentReadProvider },
        { createEvolveSpecialPaymentPoolReadProvider },
        { createEvolveSpecialPaymentSourceResolver },
    ] = await Promise.all([
        quotePromise,
        assessorPromise,
        planPromise,
        resourceBridgePromise,
        poolBridgePromise,
        resolverPromise,
    ]);

    const readLegacyRoot = () => state;
    const resourceReads = createEvolveLegacyPaymentReadProvider({ readLegacyRoot });
    const poolReads = createEvolveSpecialPaymentPoolReadProvider({ readLegacyRoot });
    const source = createEvolveSpecialPaymentSourceResolver().resolvePaymentSource('evolve:payment/supply');
    const quote = createPaymentQuote([{
        kind: 'special',
        paymentId: 'evolve:payment/supply',
        source,
        amount,
    }]);
    const assessor = createPaymentAssessor({
        resource: resourceReads.resource,
        pool: poolReads.pool,
    });

    return {
        quote,
        plan: createPaymentPlan(quote),
        current: assessor.assessCurrentAffordability(quote),
        queue: assessor.assessQueuePaymentFeasibility(quote),
    };
}

test('M3D4C Supply matches legacy current and max checks while preserving their semantic split', async () => {
    const state = install(state => {
        state.portal.purifier = {
            ...(state.portal.purifier || {}),
            supply: 2,
            sup_max: 10,
        };
    });
    const modern = await modernSupply(state, 5);

    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Supply: 5 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Supply: 5 }));
    assert.equal(modern.current.status, 'failed');
    assert.equal(modern.queue.status, 'satisfied');
});

test('M3D4C missing purifier matches legacy false/false without changing payment family', async () => {
    const state = install(state => {
        delete state.portal.purifier;
        state.resource.Supply = {
            amount: 999,
            max: 999,
            delta: 0,
            display: true,
        };
    });
    const modern = await modernSupply(state, 1);

    assert.equal(legacy.canAfford({ Supply: 1 }), false);
    assert.equal(legacy.canAffordMax({ Supply: 1 }), false);
    assert.equal(modern.current.status, 'failed');
    assert.equal(modern.queue.status, 'failed');
    assert.equal(modern.quote.lines[0].kind, 'special');
    assert.equal(modern.quote.lines[0].source.poolId, 'evolve:payment-pool/purifier_supply');
});

test('M3D4C Supply source ignores a same-named ordinary resource and planning is complete non-mutation', async () => {
    const state = install(state => {
        state.portal.purifier = {
            ...(state.portal.purifier || {}),
            supply: 7,
            sup_max: 20,
        };
        state.resource.Supply = {
            amount: 999,
            max: 999,
            delta: 0,
            display: true,
        };
    });
    const before = JSON.stringify(state);
    const modern = await modernSupply(state, 5);

    assert.equal(modern.current.status, 'satisfied');
    assert.equal(modern.queue.status, 'satisfied');
    assert.deepEqual(modern.plan.operations, [{
        kind: 'payment.special.settle',
        paymentId: 'evolve:payment/supply',
        source: { kind: 'pool', poolId: 'evolve:payment-pool/purifier_supply' },
        amount: 5,
    }]);
    assert.equal(JSON.stringify(state), before);
});

test('M3D4C deliberately rejects malformed present purifier state that legacy can accept and poison', async () => {
    const state = install(state => {
        state.portal.purifier = {};
    });

    assert.equal(legacy.canAfford({ Supply: 1 }), true);
    assert.equal(legacy.canAffordMax({ Supply: 1 }), true);

    await assert.rejects(
        modernSupply(state, 1),
        error => error && error.code === 'PAYMENT_READ_FAILURE' && error.details?.readerCauseCode === 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE'
    );
});
