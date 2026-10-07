'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const executorPromise = import(pathToFileURL(path.join(root, 'src/engine/execution/resource-commit.mjs')).href);
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-resource-commit-adapter.mjs')).href);
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);
const effectPromise = import(pathToFileURL(path.join(root, 'src/engine/effects/effect-plan.mjs')).href);

async function modules(){
    const [executor, adapter, quote, plan, effect] = await Promise.all([
        executorPromise,
        adapterPromise,
        quotePromise,
        planPromise,
        effectPromise,
    ]);
    return { ...executor, ...adapter, ...quote, ...plan, ...effect };
}

test('M3F1 bounded debit preserves legacy modRes clamping when amount begins above capacity', async () => {
    const {
        createResourceCommitExecutor,
        createEvolveLegacyResourceCommitCapability,
        createPaymentQuote,
        createPaymentPlan,
        createEffectPlan,
    } = await modules();
    const state = {
        resource: {
            RNA: { amount: 10, max: 1, display: true },
            DNA: { amount: 0, max: 10, display: true },
        },
    };
    const executor = createResourceCommitExecutor(
        createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state })
    );
    const paymentPlan = createPaymentPlan(createPaymentQuote([
        { kind: 'resource', resourceId: 'evolve:resource/rna', amount: 2 },
    ]));
    const effectPlan = createEffectPlan([
        { kind: 'resource.grant', resourceId: 'evolve:resource/dna', amount: 1 },
    ]);

    assert.deepEqual(executor.commit(paymentPlan, effectPlan), { status: 'committed', reason: null });
    assert.equal(state.resource.RNA.amount, 1);
    assert.equal(state.resource.DNA.amount, 1);
});
