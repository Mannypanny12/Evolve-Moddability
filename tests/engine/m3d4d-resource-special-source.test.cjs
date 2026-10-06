'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);

function reads({ amount = 10, capacity = 10, available = true } = {}){
    const calls = { amount: 0, capacity: 0, available: 0 };
    return {
        calls,
        capabilities: {
            resource: {
                amount(){ calls.amount++; return amount; },
                capacity(){ calls.capacity++; return capacity; },
                available(){ calls.available++; return available; },
            },
        },
    };
}

test('M3D4D resource-backed special source is canonical inert quote data', async () => {
    const { createPaymentQuote } = await quotePromise;
    const quote = createPaymentQuote([{
        kind: 'special',
        paymentId: 'example:payment/knowledge_like',
        source: {
            kind: 'resource',
            resourceId: 'example:resource/knowledge_like',
        },
        amount: 3,
    }]);

    assert.deepEqual(quote.lines, [{
        kind: 'special',
        paymentId: 'example:payment/knowledge_like',
        source: {
            kind: 'resource',
            resourceId: 'example:resource/knowledge_like',
        },
        amount: 3,
    }]);
    assert.equal(Object.isFrozen(quote), true);
    assert.equal(Object.isFrozen(quote.lines), true);
    assert.equal(Object.isFrozen(quote.lines[0]), true);
    assert.equal(Object.isFrozen(quote.lines[0].source), true);
});

test('M3D4D rejects unreviewed special source families', async () => {
    const { createPaymentQuote } = await quotePromise;
    assert.throws(
        () => createPaymentQuote([{
            kind: 'special',
            paymentId: 'example:payment/custom',
            source: { kind: 'knowledge', resourceId: 'example:resource/knowledge' },
            amount: 1,
        }]),
        error => error && error.code === 'UNSUPPORTED_PAYMENT_QUOTE_SPECIAL_SOURCE_KIND'
    );
});

test('M3D4D resource-backed special and ordinary resource accumulate against one actual source', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    const resourceId = 'example:resource/shared';
    const quote = createPaymentQuote([
        { kind: 'resource', resourceId, amount: 4 },
        {
            kind: 'special',
            paymentId: 'example:payment/special_shared',
            source: { kind: 'resource', resourceId },
            amount: 4,
        },
    ]);
    const read = reads({ amount: 5, capacity: 7, available: true });
    const assessor = createPaymentAssessor(read.capabilities);

    const current = assessor.assessCurrentAffordability(quote);
    const queue = assessor.assessQueuePaymentFeasibility(quote);

    assert.equal(current.status, 'failed');
    assert.equal(queue.status, 'failed');
    assert.equal(current.reasons[0].code, 'payment.current.resource.amount_insufficient');
    assert.equal(current.reasons[0].details.requiredAmount, 8);
    assert.equal(queue.reasons[0].code, 'payment.queue.resource.capacity_insufficient');
    assert.equal(queue.reasons[0].details.requiredAmount, 8);
    assert.equal(read.calls.amount, 1);
    assert.equal(read.calls.available, 1);
    assert.equal(read.calls.capacity, 2);
});

test('M3D4D plan preserves resource-backed special source without executing it', async () => {
    const [{ createPaymentQuote }, { createPaymentPlan }] = await Promise.all([quotePromise, planPromise]);
    const quote = createPaymentQuote([{
        kind: 'special',
        paymentId: 'example:payment/knowledge_like',
        source: {
            kind: 'resource',
            resourceId: 'example:resource/knowledge_like',
        },
        amount: 3,
    }]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan.operations, [{
        kind: 'payment.special.settle',
        paymentId: 'example:payment/knowledge_like',
        source: {
            kind: 'resource',
            resourceId: 'example:resource/knowledge_like',
        },
        amount: 3,
    }]);
    assert.equal(Object.isFrozen(plan.operations[0]), true);
    assert.equal(Object.isFrozen(plan.operations[0].source), true);
});
