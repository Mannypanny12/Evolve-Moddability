'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy) throw new Error('Legacy test API did not initialize');

const root = path.resolve(__dirname, '../..');
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href);

function installRna({ amount, max, display }){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    state.resource.RNA = {
        ...(state.resource.RNA || {}),
        amount,
        max,
        delta: 0,
        display,
    };
    legacy.installLegacyState(state);
}

async function newAnswers(){
    const [
        { createPaymentAssessor },
        { createPaymentQuote },
        { createEvolveLegacyPaymentReadProvider },
    ] = await Promise.all([assessorPromise, quotePromise, adapterPromise]);

    const provider = createEvolveLegacyPaymentReadProvider({
        readLegacyRoot: () => legacy.legacyState(),
    });
    const assessor = createPaymentAssessor(provider);
    const quote = createPaymentQuote([{
        kind: 'resource',
        resourceId: 'evolve:resource/rna',
        amount: 2,
    }]);
    return {
        current: assessor.assessCurrentAffordability(quote).status === 'satisfied',
        queue: assessor.assessQueuePaymentFeasibility(quote).status === 'satisfied',
    };
}

const cases = [
    {
        name: 'not enough RNA now but enough capacity to wait',
        state: { amount: 1, max: 10, display: true },
    },
    {
        name: 'exactly enough RNA now',
        state: { amount: 2, max: 10, display: true },
    },
    {
        name: 'current amount is high but capacity is below the price',
        state: { amount: 10, max: 1, display: true },
    },
    {
        name: 'hidden RNA remains currently payable but is not queue-payment feasible',
        state: { amount: 10, max: 10, display: false },
    },
    {
        name: 'legacy unbounded capacity remains feasible',
        state: { amount: 2, max: -1, display: true },
    },
];

for (const entry of cases){
    test(`M3D2 RNA differential: ${entry.name}`, async () => {
        installRna(entry.state);
        const expected = {
            current: legacy.canAfford({ RNA: 2 }),
            queue: legacy.canAffordMax({ RNA: 2 }),
        };
        assert.deepEqual(await newAnswers(), expected);
    });
}
