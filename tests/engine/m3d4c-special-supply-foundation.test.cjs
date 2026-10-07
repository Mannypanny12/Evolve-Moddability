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

function special(paymentId, poolId, amount){
    return {
        kind: 'special',
        paymentId,
        source: { kind: 'pool', poolId },
        amount,
    };
}

function resourceReads(){
    return {
        amount: () => 100,
        available: () => true,
        capacity: () => 100,
    };
}

test('M3D4C PaymentQuote accepts detached frozen pool-backed special lines', async () => {
    const { createPaymentQuote } = await quotePromise;
    const input = special('example:payment/relic_charge', 'example:payment-pool/relic_pool', 2.5);
    const quote = createPaymentQuote([input]);

    assert.deepEqual(quote, { lines: [input] });
    assert.notEqual(quote.lines[0], input);
    assert.notEqual(quote.lines[0].source, input.source);
    assert.equal(Object.isFrozen(quote.lines[0]), true);
    assert.equal(Object.isFrozen(quote.lines[0].source), true);

    input.source.poolId = 'example:payment-pool/other';
    input.amount = 99;
    assert.equal(quote.lines[0].source.poolId, 'example:payment-pool/relic_pool');
    assert.equal(quote.lines[0].amount, 2.5);
});

test('M3D4C pool-backed special quote invariants survive later source-family widening', async () => {
    const [{ createPaymentQuote }, { EngineContractError }] = await Promise.all([quotePromise, identityPromise]);

    assert.throws(
        () => createPaymentQuote([special('example:resource/not_payment', 'example:payment-pool/pool', 1)]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_PAYMENT_ID'
    );
    assert.throws(
        () => createPaymentQuote([special('example:payment/test', 'example:resource/not_pool', 1)]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_POOL_ID'
    );
    assert.throws(
        () => createPaymentQuote([{
            kind: 'special',
            paymentId: 'example:payment/test',
            source: { kind: 'pool', resourceId: 'example:resource/wood' },
            amount: 1,
        }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_SPECIAL_SOURCE'
    );
});

test('M3D4C pool current assessment reads present plus amount while queue reads present plus capacity', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const poolId = 'example:payment-pool/relic_pool';
    const calls = [];
    const assessor = createPaymentAssessor({
        resource: resourceReads(),
        pool: {
            present(id){ calls.push(`present:${id}`); return true; },
            amount(id){ calls.push(`amount:${id}`); return 2; },
            capacity(id){ calls.push(`capacity:${id}`); return 10; },
        },
    });
    const quote = createPaymentQuote([special('example:payment/relic_charge', poolId, 5)]);

    const current = assessor.assessCurrentAffordability(quote);
    assert.equal(current.status, 'failed');
    assert.deepEqual(current.reasons, [{
        code: 'payment.current.pool.amount_insufficient',
        details: { lineIndex: 0, poolId, requiredAmount: 5, currentAmount: 2 },
    }]);
    assert.deepEqual(calls, [`present:${poolId}`, `amount:${poolId}`]);

    calls.length = 0;
    const queue = assessor.assessQueuePaymentFeasibility(quote);
    assert.equal(queue.status, 'satisfied');
    assert.deepEqual(calls, [`present:${poolId}`, `capacity:${poolId}`]);
});

test('M3D4C missing pool is an assessment failure and does not read numeric pool facts', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const poolId = 'example:payment-pool/missing';
    let amountReads = 0;
    let capacityReads = 0;
    const assessor = createPaymentAssessor({
        resource: resourceReads(),
        pool: {
            present: () => false,
            amount(){ amountReads++; throw new Error('amount must not be read'); },
            capacity(){ capacityReads++; throw new Error('capacity must not be read'); },
        },
    });
    const quote = createPaymentQuote([special('example:payment/test', poolId, 1)]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons, [{
        code: 'payment.current.pool.missing',
        details: { lineIndex: 0, poolId },
    }]);
    assert.deepEqual(assessor.assessQueuePaymentFeasibility(quote).reasons, [{
        code: 'payment.queue.pool.missing',
        details: { lineIndex: 0, poolId },
    }]);
    assert.equal(amountReads, 0);
    assert.equal(capacityReads, 0);
});

test('M3D4C cumulatively groups distinct special payment IDs by their actual pool source', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const poolId = 'example:payment-pool/shared';
    let amountReads = 0;
    const assessor = createPaymentAssessor({
        resource: resourceReads(),
        pool: {
            present: () => true,
            amount(){ amountReads++; return 5; },
            capacity: () => 20,
        },
    });
    const quote = createPaymentQuote([
        special('example:payment/alpha', poolId, 4),
        special('example:payment/beta', poolId, 4),
    ]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons, [{
        code: 'payment.current.pool.amount_insufficient',
        details: { lineIndex: 1, poolId, requiredAmount: 8, currentAmount: 5 },
    }]);
    assert.equal(amountReads, 1);
});

test('M3D4C pool assessment requires the optional pool read family only when a special pool line is present', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { EngineContractError }] = await Promise.all([
        quotePromise, assessorPromise, identityPromise,
    ]);
    const assessor = createPaymentAssessor({ resource: resourceReads() });
    const quote = createPaymentQuote([special('example:payment/test', 'example:payment-pool/pool', 1)]);

    assert.throws(
        () => assessor.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'MISSING_PAYMENT_READ_FAMILY'
    );
});

test('M3D4C malformed pool read results fail closed as contract errors', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { EngineContractError }] = await Promise.all([
        quotePromise, assessorPromise, identityPromise,
    ]);
    const quote = createPaymentQuote([special('example:payment/test', 'example:payment-pool/pool', 1)]);

    for (const amount of [NaN, Infinity, '1', null]){
        const assessor = createPaymentAssessor({
            resource: resourceReads(),
            pool: { present: () => true, amount: () => amount, capacity: () => 10 },
        });
        assert.throws(
            () => assessor.assessCurrentAffordability(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
    }

    for (const capacity of [NaN, Infinity, -1, '10', null]){
        const assessor = createPaymentAssessor({
            resource: resourceReads(),
            pool: { present: () => true, amount: () => 10, capacity: () => capacity },
        });
        assert.throws(
            () => assessor.assessQueuePaymentFeasibility(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
    }
});

test('M3D4C PaymentPlan emits one inert special settlement per special quote line without aggregation', async () => {
    const [{ createPaymentQuote }, { createPaymentPlan }] = await Promise.all([quotePromise, planPromise]);
    const poolId = 'example:payment-pool/shared';
    const quote = createPaymentQuote([
        special('example:payment/alpha', poolId, 2),
        special('example:payment/beta', poolId, 3),
    ]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan.operations, [
        {
            kind: 'payment.special.settle',
            paymentId: 'example:payment/alpha',
            source: { kind: 'pool', poolId },
            amount: 2,
        },
        {
            kind: 'payment.special.settle',
            paymentId: 'example:payment/beta',
            source: { kind: 'pool', poolId },
            amount: 3,
        },
    ]);
    assert.equal(Object.isFrozen(plan.operations[0]), true);
    assert.equal(Object.isFrozen(plan.operations[0].source), true);
});
