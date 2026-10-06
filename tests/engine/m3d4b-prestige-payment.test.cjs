'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function resource(resourceId, amount){ return { kind: 'resource', resourceId, amount }; }
function prestige(prestigeId, amount){ return { kind: 'prestige', prestigeId, amount }; }
function resourceDebit(resourceId, amount){ return { kind: 'payment.resource.debit', resourceId, amount }; }
function prestigeDebit(prestigeId, amount){ return { kind: 'payment.prestige.debit', prestigeId, amount }; }

function reads(prestigeAmount, calls = []){
    return {
        resource: {
            amount(id){ calls.push(`resource.amount:${id}`); return 100; },
            available(id){ calls.push(`resource.available:${id}`); return true; },
            capacity(id){ calls.push(`resource.capacity:${id}`); return 100; },
        },
        prestige: {
            amount(id){ calls.push(`prestige.amount:${id}`); return prestigeAmount[id]; },
        },
    };
}

test('M3D4B PaymentQuote accepts generic prestige lines and keeps them detached and frozen', async () => {
    const { createPaymentQuote } = await quotePromise;
    const input = prestige('example:prestige/relic_dust', 2.5);
    const quote = createPaymentQuote([input]);

    assert.deepEqual(quote, { lines: [prestige('example:prestige/relic_dust', 2.5)] });
    assert.equal(Object.isFrozen(quote.lines[0]), true);
    assert.notEqual(quote.lines[0], input);

    input.amount = 99;
    assert.equal(quote.lines[0].amount, 2.5);
});

test('M3D4B prestige quote lines require canonical prestige IDs and exact family fields', async () => {
    const [{ createPaymentQuote }, { EngineContractError }] = await Promise.all([quotePromise, identityPromise]);

    for (const line of [
        { kind: 'prestige', prestigeId: 'example:resource/token', amount: 1 },
        { kind: 'prestige', prestigeId: 'Prestige', amount: 1 },
    ]){
        assert.throws(
            () => createPaymentQuote([line]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_PRESTIGE_ID'
        );
    }

    assert.throws(
        () => createPaymentQuote([{ kind: 'prestige', resourceId: 'example:resource/token', amount: 1 }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );
    assert.throws(
        () => createPaymentQuote([{ kind: 'special', paymentId: 'example:payment/test', amount: 1 }]),
        error => error instanceof EngineContractError && error.code === 'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND'
    );
});

test('M3D4B current and queue prestige assessment both use current prestige holdings only', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const id = 'example:prestige/token';
    const calls = [];
    const assessor = createPaymentAssessor(reads({ [id]: 2 }, calls));
    const quote = createPaymentQuote([prestige(id, 3)]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons, [{
        code: 'payment.current.prestige.holdings_insufficient',
        details: { lineIndex: 0, prestigeId: id, requiredAmount: 3, currentAmount: 2 },
    }]);
    assert.deepEqual(assessor.assessQueuePaymentFeasibility(quote).reasons, [{
        code: 'payment.queue.prestige.holdings_insufficient',
        details: { lineIndex: 0, prestigeId: id, requiredAmount: 3, currentAmount: 2 },
    }]);
    assert.deepEqual(calls, [`prestige.amount:${id}`, `prestige.amount:${id}`]);
});

test('M3D4B prestige assessments never read ordinary resource facts', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const id = 'example:prestige/token';
    const assessor = createPaymentAssessor({
        resource: {
            amount(){ throw new Error('prestige assessment must not read resource amount'); },
            available(){ throw new Error('prestige assessment must not read resource availability'); },
            capacity(){ throw new Error('prestige assessment must not read resource capacity'); },
        },
        prestige: { amount: () => 5 },
    });
    const quote = createPaymentQuote([prestige(id, 4)]);

    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
    assert.equal(assessor.assessQueuePaymentFeasibility(quote).status, 'satisfied');
});

test('M3D4B cumulatively groups duplicate resolved prestige sources and reads each source once per assessment', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const id = 'example:prestige/resolved_source';
    const calls = [];
    const assessor = createPaymentAssessor(reads({ [id]: 5 }, calls));
    const quote = createPaymentQuote([
        prestige(id, 4),
        prestige(id, 4),
    ]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons, [{
        code: 'payment.current.prestige.holdings_insufficient',
        details: { lineIndex: 1, prestigeId: id, requiredAmount: 8, currentAmount: 5 },
    }]);
    assert.deepEqual(calls, [`prestige.amount:${id}`]);
});

test('M3D4B mixed resource and prestige lines remain independently sourced and preserve reason order', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const resourceId = 'example:resource/wood';
    const prestigeId = 'example:prestige/token';
    const assessor = createPaymentAssessor({
        resource: { amount: () => 0, available: () => true, capacity: () => 10 },
        prestige: { amount: () => 0 },
    });
    const quote = createPaymentQuote([
        prestige(prestigeId, 1),
        resource(resourceId, 1),
    ]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons.map(reason => reason.code), [
        'payment.current.prestige.holdings_insufficient',
        'payment.current.resource.amount_insufficient',
    ]);
});

test('M3D4B prestige assessment requires the optional prestige read family only when a prestige line is present', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { EngineContractError }] = await Promise.all([
        quotePromise, assessorPromise, identityPromise,
    ]);
    const assessor = createPaymentAssessor({
        resource: { amount: () => 10, available: () => true, capacity: () => 10 },
    });

    assert.equal(
        assessor.assessCurrentAffordability(createPaymentQuote([resource('example:resource/wood', 1)])).status,
        'satisfied'
    );
    assert.throws(
        () => assessor.assessCurrentAffordability(createPaymentQuote([prestige('example:prestige/token', 1)])),
        error => error instanceof EngineContractError && error.code === 'MISSING_PAYMENT_READ_FAMILY'
    );
});

test('M3D4B PaymentPlan derives one prestige debit per prestige quote line without aggregation', async () => {
    const [{ createPaymentQuote }, { createPaymentPlan }] = await Promise.all([quotePromise, planPromise]);
    const prestigeId = 'example:prestige/token';
    const resourceId = 'example:resource/wood';
    const plan = createPaymentPlan(createPaymentQuote([
        prestige(prestigeId, 2),
        resource(resourceId, 3),
        prestige(prestigeId, 4),
    ]));

    assert.deepEqual(plan.operations, [
        prestigeDebit(prestigeId, 2),
        resourceDebit(resourceId, 3),
        prestigeDebit(prestigeId, 4),
    ]);
    for (const operation of plan.operations) assert.equal(Object.isFrozen(operation), true);
});

test('M3D4B prestige cumulative overflow fails closed during assessment, not planning', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { createPaymentPlan }] = await Promise.all([
        quotePromise, assessorPromise, planPromise,
    ]);
    const id = 'example:prestige/huge';
    const quote = createPaymentQuote([
        prestige(id, Number.MAX_VALUE),
        prestige(id, Number.MAX_VALUE),
    ]);
    const plan = createPaymentPlan(quote);
    assert.equal(plan.operations.length, 2);

    const assessor = createPaymentAssessor(reads({ [id]: Number.MAX_VALUE }));
    assert.throws(
        () => assessor.assessCurrentAffordability(quote),
        error => error && error.code === 'PAYMENT_REQUIREMENT_OVERFLOW' && error.details?.prestigeId === id
    );
});
