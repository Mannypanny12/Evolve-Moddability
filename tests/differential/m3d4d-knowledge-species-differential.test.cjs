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
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs')).href);

function install(mutator){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    mutator(state);
    return legacy.installLegacyState(state);
}

async function modernSpecial(state, paymentId, amount){
    const [
        { createPaymentQuote },
        { createPaymentAssessor },
        { createPaymentPlan },
        { createEvolveLegacyPaymentReadProvider },
        { createEvolveSpecialPaymentSourceResolver },
    ] = await Promise.all([
        quotePromise,
        assessorPromise,
        planPromise,
        resourceBridgePromise,
        resolverPromise,
    ]);
    const readLegacyRoot = () => state;
    const resourceReads = createEvolveLegacyPaymentReadProvider({ readLegacyRoot });
    const source = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot }).resolvePaymentSource(paymentId);
    const quote = createPaymentQuote([{ kind: 'special', paymentId, source, amount }]);
    const assessor = createPaymentAssessor({ resource: resourceReads.resource });
    return {
        source,
        quote,
        plan: createPaymentPlan(quote),
        current: assessor.assessCurrentAffordability(quote),
        queue: assessor.assessQueuePaymentFeasibility(quote),
    };
}

test('M3D4D Knowledge matches legacy current and max affordability through its resource assessment source', async () => {
    const state = install(state => {
        state.resource.Knowledge = {
            ...(state.resource.Knowledge || {}),
            amount: 2,
            max: 10,
            delta: 0,
            display: true,
        };
    });
    const modern = await modernSpecial(state, 'evolve:payment/knowledge', 5);

    assert.equal(legacy.canAfford({ Knowledge: 5 }), false);
    assert.equal(legacy.canAffordMax({ Knowledge: 5 }), true);
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Knowledge: 5 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Knowledge: 5 }));
    assert.deepEqual(modern.source, { kind: 'resource', resourceId: 'evolve:resource/knowledge' });
});

test('M3D4D Knowledge planning preserves semantic settlement identity and is complete non-mutation', async () => {
    const state = install(state => {
        state.resource.Knowledge = {
            ...(state.resource.Knowledge || {}),
            amount: 100,
            max: 1000,
            delta: 0,
            display: true,
        };
        state.stats.know = 7;
    });
    const before = JSON.stringify(state);
    const modern = await modernSpecial(state, 'evolve:payment/knowledge', 25);

    assert.equal(modern.current.status, 'satisfied');
    assert.deepEqual(modern.plan.operations, [{
        kind: 'payment.special.settle',
        paymentId: 'evolve:payment/knowledge',
        source: { kind: 'resource', resourceId: 'evolve:resource/knowledge' },
        amount: 25,
    }]);
    assert.equal(JSON.stringify(state), before);
});

test('M3D4D Species matches legacy current-vs-max semantics for the active population resource', async () => {
    const state = install(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 2,
            max: 10,
            delta: 0,
            display: true,
        };
    });
    const modern = await modernSpecial(state, 'evolve:payment/species', 3);

    assert.equal(legacy.canAfford({ Species: 3 }), false);
    assert.equal(legacy.canAffordMax({ Species: 3 }), true);
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Species: 3 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Species: 3 }));
    assert.deepEqual(modern.source, { kind: 'resource', resourceId: 'evolve:resource/human' });
});

test('M3D4D Species queue availability follows the active population display flag like legacy max checking', async () => {
    const state = install(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 5,
            max: 10,
            delta: 0,
            display: false,
        };
    });
    const modern = await modernSpecial(state, 'evolve:payment/species', 3);

    assert.equal(legacy.canAfford({ Species: 3 }), true);
    assert.equal(legacy.canAffordMax({ Species: 3 }), false);
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Species: 3 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Species: 3 }));
});

test('M3D4D missing active Species resource fails deterministically instead of reproducing the legacy crash', async () => {
    const state = install(state => {
        state.race.species = 'human';
        delete state.resource.human;
    });

    assert.throws(() => legacy.canAfford({ Species: 1 }), TypeError);
    await assert.rejects(
        modernSpecial(state, 'evolve:payment/species', 1),
        error => error && error.code === 'PAYMENT_READ_FAILURE' && error.details?.readerCauseCode === 'INVALID_LEGACY_PAYMENT_SPECIES_STATE'
    );
});

test('M3D4D Species planning keeps commit-time default-job context out of the inert plan', async () => {
    const state = install(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 10,
            max: 100,
            delta: 0,
            display: true,
        };
        state.civic.d_job = 'unemployed';
        state.civic.unemployed = { workers: 2 };
    });
    const before = JSON.stringify(state);
    const modern = await modernSpecial(state, 'evolve:payment/species', 5);

    assert.deepEqual(modern.plan.operations, [{
        kind: 'payment.special.settle',
        paymentId: 'evolve:payment/species',
        source: { kind: 'resource', resourceId: 'evolve:resource/human' },
        amount: 5,
    }]);
    assert.equal('defaultJobId' in modern.plan.operations[0], false);
    assert.equal('workers' in modern.plan.operations[0], false);
    assert.equal(JSON.stringify(state), before);
});

test('M3D4D ordinary resource and Species special lines accumulate against one resolved population source', async () => {
    const [
        { createPaymentQuote },
        { createPaymentAssessor },
        { createEvolveLegacyPaymentReadProvider },
        { createEvolveSpecialPaymentSourceResolver },
    ] = await Promise.all([quotePromise, assessorPromise, resourceBridgePromise, resolverPromise]);
    const state = install(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 5,
            max: 10,
            delta: 0,
            display: true,
        };
    });
    const readLegacyRoot = () => state;
    const source = createEvolveSpecialPaymentSourceResolver({ readLegacyRoot }).resolvePaymentSource('evolve:payment/species');
    const quote = createPaymentQuote([
        { kind: 'resource', resourceId: 'evolve:resource/human', amount: 4 },
        { kind: 'special', paymentId: 'evolve:payment/species', source, amount: 4 },
    ]);
    const reads = createEvolveLegacyPaymentReadProvider({ readLegacyRoot });
    const assessor = createPaymentAssessor({ resource: reads.resource });

    const result = assessor.assessCurrentAffordability(quote);
    assert.equal(result.status, 'failed');
    assert.equal(result.reasons[0].code, 'payment.current.resource.amount_insufficient');
    assert.equal(result.reasons[0].details.requiredAmount, 8);
});
