'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);

function line(resourceId, amount){
    return { kind: 'resource', resourceId, amount };
}

async function modules(){
    const [{ createPaymentAssessor }, { createPaymentQuote }] = await Promise.all([assessorPromise, quotePromise]);
    return { createPaymentAssessor, createPaymentQuote };
}

function provider(states, calls = []){
    return {
        resource: {
            amount(resourceId){
                calls.push(`amount:${resourceId}`);
                return states[resourceId].amount;
            },
            available(resourceId){
                calls.push(`available:${resourceId}`);
                return states[resourceId].available;
            },
            capacity(resourceId){
                calls.push(`capacity:${resourceId}`);
                return states[resourceId].capacity;
            },
        },
    };
}

test('M3D2 free quotes satisfy both assessments without reading resource state', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const calls = [];
    const assessor = createPaymentAssessor(provider({}, calls));
    const quote = createPaymentQuote([]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote), {
        assessment: 'current-affordability',
        status: 'satisfied',
        reasons: [],
    });
    assert.deepEqual(assessor.assessQueuePaymentFeasibility(quote), {
        assessment: 'queue-payment-feasibility',
        status: 'satisfied',
        reasons: [],
    });
    assert.deepEqual(calls, []);
});

test('M3D2 keeps current affordability separate from queue payment feasibility', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/rna';
    const calls = [];
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: 1, available: true, capacity: 10 },
    }, calls));
    const quote = createPaymentQuote([line(resourceId, 2)]);

    const current = assessor.assessCurrentAffordability(quote);
    assert.equal(current.status, 'failed');
    assert.deepEqual(current.reasons, [{
        code: 'payment.current.resource.amount_insufficient',
        details: {
            lineIndex: 0,
            resourceId,
            requiredAmount: 2,
            currentAmount: 1,
        },
    }]);

    const queue = assessor.assessQueuePaymentFeasibility(quote);
    assert.equal(queue.status, 'satisfied');
    assert.deepEqual(calls, [
        `amount:${resourceId}`,
        `capacity:${resourceId}`,
        `available:${resourceId}`,
        `capacity:${resourceId}`,
    ]);
});

test('M3D2 current assessment never reads availability and queue assessment never reads amount', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/wood';
    const quote = createPaymentQuote([line(resourceId, 2)]);

    const current = createPaymentAssessor({
        resource: {
            amount: () => 3,
            available(){ throw new Error('current assessment must not read availability'); },
            capacity: () => 5,
        },
    });
    assert.equal(current.assessCurrentAffordability(quote).status, 'satisfied');

    const queue = createPaymentAssessor({
        resource: {
            amount(){ throw new Error('queue assessment must not read amount'); },
            available: () => true,
            capacity: () => 5,
        },
    });
    assert.equal(queue.assessQueuePaymentFeasibility(quote).status, 'satisfied');
});

test('M3D2 duplicate lines are cumulative and fail at the first threshold-crossing line', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/rna';
    const calls = [];
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: 5, available: true, capacity: 5 },
    }, calls));
    const quote = createPaymentQuote([
        line(resourceId, 2),
        line(resourceId, 2),
        line(resourceId, 2),
    ]);

    const current = assessor.assessCurrentAffordability(quote);
    assert.equal(current.status, 'failed');
    assert.deepEqual(current.reasons, [
        {
            code: 'payment.current.resource.amount_insufficient',
            details: { lineIndex: 2, resourceId, requiredAmount: 6, currentAmount: 5 },
        },
        {
            code: 'payment.current.resource.capacity_insufficient',
            details: { lineIndex: 2, resourceId, requiredAmount: 6, capacity: 5 },
        },
    ]);
    assert.deepEqual(calls, [`amount:${resourceId}`, `capacity:${resourceId}`]);
});

test('M3D2 reason ordering follows first threshold crossings across interleaved resources', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const wood = 'example:resource/wood';
    const stone = 'example:resource/stone';
    const assessor = createPaymentAssessor(provider({
        [wood]: { amount: 2, available: true, capacity: 5 },
        [stone]: { amount: 10, available: true, capacity: 1 },
    }));
    const quote = createPaymentQuote([
        line(wood, 2),
        line(stone, 2),
        line(wood, 1),
    ]);

    assert.deepEqual(assessor.assessCurrentAffordability(quote).reasons, [
        {
            code: 'payment.current.resource.capacity_insufficient',
            details: { lineIndex: 1, resourceId: stone, requiredAmount: 2, capacity: 1 },
        },
        {
            code: 'payment.current.resource.amount_insufficient',
            details: { lineIndex: 2, resourceId: wood, requiredAmount: 3, currentAmount: 2 },
        },
    ]);
});

test('M3D2 caches one relevant observation per distinct resource within an assessment', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const wood = 'example:resource/wood';
    const stone = 'example:resource/stone';
    const calls = [];
    const assessor = createPaymentAssessor(provider({
        [wood]: { amount: 10, available: true, capacity: 20 },
        [stone]: { amount: 8, available: true, capacity: 10 },
    }, calls));
    const quote = createPaymentQuote([
        line(wood, 1),
        line(stone, 1),
        line(wood, 2),
        line(stone, 2),
    ]);

    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
    assert.deepEqual(calls, [
        `amount:${wood}`, `capacity:${wood}`,
        `amount:${stone}`, `capacity:${stone}`,
    ]);
});

test('M3D2 treats null capacity as unbounded and still respects current amount', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/fuel';
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: 3, available: true, capacity: null },
    }));
    const quote = createPaymentQuote([line(resourceId, 4)]);

    const current = assessor.assessCurrentAffordability(quote);
    assert.equal(current.status, 'failed');
    assert.deepEqual(current.reasons.map(reason => reason.code), [
        'payment.current.resource.amount_insufficient',
    ]);
    assert.equal(assessor.assessQueuePaymentFeasibility(quote).status, 'satisfied');
});

test('M3D2 reports queue unavailability and capacity failure independently', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/fuel';
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: 100, available: false, capacity: 3 },
    }));
    const quote = createPaymentQuote([line(resourceId, 4)]);

    const queue = assessor.assessQueuePaymentFeasibility(quote);
    assert.equal(queue.status, 'failed');
    assert.deepEqual(queue.reasons, [
        {
            code: 'payment.queue.resource.unavailable',
            details: { lineIndex: 0, resourceId },
        },
        {
            code: 'payment.queue.resource.capacity_insufficient',
            details: { lineIndex: 0, resourceId, requiredAmount: 4, capacity: 3 },
        },
    ]);
});

test('M3D2 accepts finite negative current amounts as an insufficient state observation', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/debt';
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: -3, available: true, capacity: 10 },
    }));
    const quote = createPaymentQuote([line(resourceId, 1)]);

    const current = assessor.assessCurrentAffordability(quote);
    assert.equal(current.status, 'failed');
    assert.equal(current.reasons[0].details.currentAmount, -3);
});

test('M3D2 fails closed when cumulative finite quote lines overflow numeric range', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/huge';
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: Number.MAX_VALUE, available: true, capacity: null },
    }));
    const quote = createPaymentQuote([
        line(resourceId, Number.MAX_VALUE),
        line(resourceId, Number.MAX_VALUE),
    ]);

    assert.throws(
        () => assessor.assessCurrentAffordability(quote),
        error => error &&
            error.code === 'PAYMENT_REQUIREMENT_OVERFLOW' &&
            error.details?.resourceId === resourceId &&
            error.details?.lineIndex === 1
    );
});

test('M3D2 assessment results are deeply frozen at the result surface', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const resourceId = 'example:resource/wood';
    const assessor = createPaymentAssessor(provider({
        [resourceId]: { amount: 0, available: false, capacity: 0 },
    }));
    const result = assessor.assessCurrentAffordability(createPaymentQuote([line(resourceId, 1)]));

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.reasons), true);
    assert.equal(Object.isFrozen(result.reasons[0]), true);
    assert.equal(Object.isFrozen(result.reasons[0].details), true);
});
