'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);

test('M3D3 DNA evidence maps the legacy 2 RNA price to exactly one inert RNA debit', async () => {
    const state = legacy.pristineLegacyState();
    legacy.installLegacyState(state);
    assert.deepEqual(legacy.rawActionCosts('evolution', 'dna'), { RNA: 2 });

    const before = JSON.stringify(legacy.legacyState());
    const [{ createPaymentQuote }, { createPaymentPlan }] = await Promise.all([quotePromise, planPromise]);
    const quote = createPaymentQuote([{
        kind: 'resource',
        resourceId: 'evolve:resource/rna',
        amount: 2,
    }]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan, {
        operations: [{
            kind: 'payment.resource.debit',
            resourceId: 'evolve:resource/rna',
            amount: 2,
        }],
    });
    assert.equal(JSON.stringify(legacy.legacyState()), before);
});
