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
const prestigeBridgePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-prestige-payment-read-adapter.mjs')).href);
const resolverPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-prestige-payment-source-resolver.mjs')).href);

function install(mutator){
    const state = legacy.pristineLegacyState();
    mutator(state);
    legacy.installLegacyState(state);
    return state;
}

async function newAssessmentFor(state, declaredIdsAndAmounts){
    const [
        { createPaymentQuote },
        { createPaymentAssessor },
        { createEvolveLegacyPaymentReadProvider },
        { createEvolvePrestigePaymentReadProvider },
        { createEvolvePrestigePaymentSourceResolver },
    ] = await Promise.all([
        quotePromise,
        assessorPromise,
        resourceBridgePromise,
        prestigeBridgePromise,
        resolverPromise,
    ]);

    const readLegacyRoot = () => state;
    const resourceReads = createEvolveLegacyPaymentReadProvider({ readLegacyRoot });
    const prestigeReads = createEvolvePrestigePaymentReadProvider({ readLegacyRoot });
    const resolver = createEvolvePrestigePaymentSourceResolver({ readLegacyRoot });
    const assessor = createPaymentAssessor({
        resource: resourceReads.resource,
        prestige: prestigeReads.prestige,
    });
    const quote = createPaymentQuote(declaredIdsAndAmounts.map(({ prestigeId, amount }) => ({
        kind: 'prestige',
        prestigeId: resolver.resolvePrestigeId(prestigeId),
        amount,
    })));
    return {
        current: assessor.assessCurrentAffordability(quote),
        queue: assessor.assessQueuePaymentFeasibility(quote),
        quote,
    };
}

test('M3D4B matches legacy prestige affordability outside antimatter', async () => {
    const state = install(state => {
        state.race.universe = 'standard';
        state.prestige.Plasmid = { count: 3 };
        state.prestige.AntiPlasmid = { count: 100 };
    });
    const modern = await newAssessmentFor(state, [{ prestigeId: 'evolve:prestige/plasmid', amount: 3 }]);

    assert.equal(modern.quote.lines[0].prestigeId, 'evolve:prestige/plasmid');
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Plasmid: 3 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Plasmid: 3 }));
});

test('M3D4B matches legacy antimatter Plasmid affordability after resolving to AntiPlasmid', async () => {
    const state = install(state => {
        state.race.universe = 'antimatter';
        state.prestige.Plasmid = { count: 100 };
        state.prestige.AntiPlasmid = { count: 2 };
    });
    let modern = await newAssessmentFor(state, [{ prestigeId: 'evolve:prestige/plasmid', amount: 3 }]);

    assert.equal(modern.quote.lines[0].prestigeId, 'evolve:prestige/anti_plasmid');
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Plasmid: 3 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Plasmid: 3 }));

    state.prestige.AntiPlasmid.count = 3;
    modern = await newAssessmentFor(state, [{ prestigeId: 'evolve:prestige/plasmid', amount: 3 }]);
    assert.equal(modern.current.status === 'satisfied', legacy.canAfford({ Plasmid: 3 }));
    assert.equal(modern.queue.status === 'satisfied', legacy.canAffordMax({ Plasmid: 3 }));
});

test('M3D4B deliberately hardens legacy convergence by cumulatively assessing the resolved prestige source', async () => {
    const state = install(state => {
        state.race.universe = 'antimatter';
        state.prestige.Plasmid = { count: 100 };
        state.prestige.AntiPlasmid = { count: 5 };
    });

    assert.equal(legacy.canAfford({ Plasmid: 4, AntiPlasmid: 4 }), true);
    assert.equal(legacy.canAffordMax({ Plasmid: 4, AntiPlasmid: 4 }), true);

    const modern = await newAssessmentFor(state, [
        { prestigeId: 'evolve:prestige/plasmid', amount: 4 },
        { prestigeId: 'evolve:prestige/anti_plasmid', amount: 4 },
    ]);
    assert.deepEqual(modern.quote.lines.map(line => line.prestigeId), [
        'evolve:prestige/anti_plasmid',
        'evolve:prestige/anti_plasmid',
    ]);
    assert.equal(modern.current.status, 'failed');
    assert.equal(modern.queue.status, 'failed');
    assert.equal(modern.current.reasons[0].details.requiredAmount, 8);
    assert.equal(modern.current.reasons[0].details.currentAmount, 5);
});
