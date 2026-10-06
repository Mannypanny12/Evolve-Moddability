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
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [executor, adapter, quote, plan, effect, identity] = await Promise.all([
        executorPromise,
        adapterPromise,
        quotePromise,
        planPromise,
        effectPromise,
        identityPromise,
    ]);
    return { ...executor, ...adapter, ...quote, ...plan, ...effect, ...identity };
}

function legacyRoot({ rna = 4, rnaMax = 10, dna = 2, dnaMax = 5 } = {}){
    return {
        resource: {
            RNA: { amount: rna, max: rnaMax, display: true },
            DNA: { amount: dna, max: dnaMax, display: true },
        },
    };
}

function dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan, rnaCost = 2){
    return {
        paymentPlan: createPaymentPlan(createPaymentQuote([
            { kind: 'resource', resourceId: 'evolve:resource/rna', amount: rnaCost },
        ])),
        effectPlan: createEffectPlan([
            { kind: 'resource.grant', resourceId: 'evolve:resource/dna', amount: 1 },
        ]),
    };
}

function emptyEffectPlan(createEffectPlan){
    return createEffectPlan([]);
}

test('M3F1 exposes one generic executor factory and one bounded Evolve capability factory', async () => {
    const [executorModule, adapterModule] = await Promise.all([executorPromise, adapterPromise]);
    assert.deepEqual(Object.keys(executorModule), ['createResourceCommitExecutor']);
    assert.deepEqual(Object.keys(adapterModule), ['createEvolveLegacyResourceCommitCapability']);
    assert.equal(executorModule.createResourceCommitExecutor.length, 1);
    assert.equal(adapterModule.createEvolveLegacyResourceCommitCapability.length, 1);
});

test('M3F1 atomically commits the DNA payment then effect through canonical resource operations', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan } = await modules();
    const state = legacyRoot({ rna: 4, dna: 2, dnaMax: 5 });
    const capability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state });
    const executor = createResourceCommitExecutor(capability);
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    const result = executor.commit(plans.paymentPlan, plans.effectPlan);

    assert.deepEqual(result, { status: 'committed', reason: null });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(state.resource.RNA.amount, 2);
    assert.equal(state.resource.DNA.amount, 3);
});

test('M3F1 preserves payment-before-effect ordering instead of allowing net-delta cancellation to bypass affordability', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan } = await modules();
    const state = legacyRoot({ rna: 2, dna: 0 });
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const paymentPlan = createPaymentPlan(createPaymentQuote([
        { kind: 'resource', resourceId: 'evolve:resource/rna', amount: 3 },
    ]));
    const effectPlan = createEffectPlan([
        { kind: 'resource.grant', resourceId: 'evolve:resource/rna', amount: 2 },
    ]);

    const result = executor.commit(paymentPlan, effectPlan);

    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.reason, {
        code: 'insufficient_resource',
        details: { resourceId: 'evolve:resource/rna', required: 3, available: 2 },
    });
    assert.equal(state.resource.RNA.amount, 2);
});

test('M3F1 rejects an insufficient payment without applying the later DNA grant', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan } = await modules();
    const state = legacyRoot({ rna: 1, dna: 2 });
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    const result = executor.commit(plans.paymentPlan, plans.effectPlan);

    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'insufficient_resource');
    assert.equal(state.resource.RNA.amount, 1);
    assert.equal(state.resource.DNA.amount, 2);
});

test('M3F1 rejects a grant at capacity without consuming its payment', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan } = await modules();
    const state = legacyRoot({ rna: 4, dna: 5, dnaMax: 5 });
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    const result = executor.commit(plans.paymentPlan, plans.effectPlan);

    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.reason, {
        code: 'resource_at_capacity',
        details: { resourceId: 'evolve:resource/dna', amount: 5, capacity: 5 },
    });
    assert.equal(state.resource.RNA.amount, 4);
    assert.equal(state.resource.DNA.amount, 5);
});

test('M3F1 bounded legacy grants preserve modRes-style capacity clamping after a below-capacity preflight', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan } = await modules();
    const state = legacyRoot({ rna: 4, dna: 2.5, dnaMax: 3 });
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    assert.equal(executor.commit(plans.paymentPlan, plans.effectPlan).status, 'committed');
    assert.equal(state.resource.RNA.amount, 2);
    assert.equal(state.resource.DNA.amount, 3);
});

test('M3F1 preflights every mapped record before any write, including writable amount fields', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan, EngineContractError } = await modules();
    const state = legacyRoot({ rna: 4, dna: 2 });
    Object.defineProperty(state.resource.DNA, 'amount', { value: 2, writable: false, enumerable: true, configurable: true });
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    assert.throws(
        () => executor.commit(plans.paymentPlan, plans.effectPlan),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_RESOURCE_COMMIT_STATE'
    );
    assert.equal(state.resource.RNA.amount, 4);
    assert.equal(state.resource.DNA.amount, 2);
});

test('M3F1 malformed later resource state cannot cause partial payment mutation', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan, EngineContractError } = await modules();
    const state = legacyRoot({ rna: 4, dna: 2 });
    state.resource.DNA.max = 'broken';
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const plans = dnaPlans(createPaymentQuote, createPaymentPlan, createEffectPlan);

    assert.throws(
        () => executor.commit(plans.paymentPlan, plans.effectPlan),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_RESOURCE_COMMIT_STATE'
    );
    assert.equal(state.resource.RNA.amount, 4);
    assert.equal(state.resource.DNA.amount, 2);
});

test('M3F1 fails closed on unreviewed resource mappings instead of becoming an arbitrary legacy writer', async () => {
    const { createResourceCommitExecutor, createEvolveLegacyResourceCommitCapability, createPaymentQuote, createPaymentPlan, createEffectPlan, EngineContractError } = await modules();
    const state = legacyRoot();
    state.resource.Wood = { amount: 100, max: 1000, display: true };
    const executor = createResourceCommitExecutor(createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state }));
    const paymentPlan = createPaymentPlan(createPaymentQuote([
        { kind: 'resource', resourceId: 'evolve:resource/wood', amount: 1 },
    ]));

    assert.throws(
        () => executor.commit(paymentPlan, emptyEffectPlan(createEffectPlan)),
        error => error instanceof EngineContractError && error.code === 'UNSUPPORTED_LEGACY_RESOURCE_COMMIT_SUBJECT'
    );
    assert.equal(state.resource.Wood.amount, 100);
});

test('M3F1 generic executor refuses prestige/special payment execution in the bounded resource slice', async () => {
    const { createResourceCommitExecutor, EngineContractError } = await modules();
    let calls = 0;
    const executor = createResourceCommitExecutor({
        commitResourceChanges(){ calls++; return { status: 'committed', reason: null }; },
    });

    assert.throws(
        () => executor.commit(
            { operations: [{ kind: 'payment.prestige.debit', prestigeId: 'example:prestige/token', amount: 1 }] },
            { operations: [] }
        ),
        error => error instanceof EngineContractError && error.code === 'UNSUPPORTED_RESOURCE_COMMIT_PAYMENT_OPERATION'
    );
    assert.equal(calls, 0);
});

test('M3F1 detaches capability result diagnostics and rejects async/thenable leakage', async () => {
    const { createResourceCommitExecutor, EngineContractError } = await modules();
    const emptyPayment = { operations: [] };
    const emptyEffect = { operations: [] };

    const executor = createResourceCommitExecutor({
        commitResourceChanges(){ return Promise.resolve({ status: 'committed', reason: null }); },
    });
    assert.throws(
        () => executor.commit(emptyPayment, emptyEffect),
        error => error instanceof EngineContractError && error.code === 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT'
    );

    const sourceDetails = { resourceId: 'example:resource/x', required: 2 };
    const rejecting = createResourceCommitExecutor({
        commitResourceChanges(){
            return { status: 'rejected', reason: { code: 'insufficient_resource', details: sourceDetails } };
        },
    });
    const result = rejecting.commit(emptyPayment, emptyEffect);
    sourceDetails.required = 99;
    assert.equal(result.reason.details.required, 2);
    assert.equal(Object.isFrozen(result.reason.details), true);
});

test('M3F1 resource commit reentrancy is module-wide and the lock recovers after failure', async () => {
    const { createResourceCommitExecutor, EngineContractError } = await modules();
    const emptyPayment = { operations: [] };
    const emptyEffect = { operations: [] };
    let second;
    const first = createResourceCommitExecutor({
        commitResourceChanges(){ return second.commit(emptyPayment, emptyEffect); },
    });
    second = createResourceCommitExecutor({
        commitResourceChanges(){ return { status: 'committed', reason: null }; },
    });

    assert.throws(
        () => first.commit(emptyPayment, emptyEffect),
        error => error instanceof EngineContractError && error.code === 'RESOURCE_COMMIT_REENTRANCY'
    );
    assert.deepEqual(second.commit(emptyPayment, emptyEffect), { status: 'committed', reason: null });
});
