'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function special(paymentId, poolId, amount, sourceKind = 'pool'){
    return {
        kind: 'special',
        paymentId,
        source: { kind: sourceKind, poolId },
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

test('M3D4C hostile special-source kind cannot escape through diagnostics', async () => {
    const [{ createPaymentQuote }, { EngineContractError }] = await Promise.all([quotePromise, identityPromise]);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const line = special('example:payment/test', 'example:payment-pool/pool', 1, revoked.proxy);

    assert.throws(
        () => createPaymentQuote([line]),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'UNSUPPORTED_PAYMENT_QUOTE_SPECIAL_SOURCE_KIND');
            assert.equal(error.details?.kindType, 'object');
            assert.equal(Object.values(error.details || {}).includes(revoked.proxy), false);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
});

test('M3D4C pool presence read must return a real boolean in both assessment modes', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { EngineContractError }] = await Promise.all([
        quotePromise,
        assessorPromise,
        identityPromise,
    ]);
    const quote = createPaymentQuote([special('example:payment/test', 'example:payment-pool/pool', 1)]);

    for (const present of [0, 1, 'true', null, undefined]){
        const assessor = createPaymentAssessor({
            resource: resourceReads(),
            pool: {
                present: () => present,
                amount: () => 10,
                capacity: () => 10,
            },
        });
        assert.throws(
            () => assessor.assessCurrentAffordability(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
        assert.throws(
            () => assessor.assessQueuePaymentFeasibility(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
    }
});

test('M3D4C special-only assessment never consults ordinary resource reads', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }] = await Promise.all([quotePromise, assessorPromise]);
    let resourceReads = 0;
    const assessor = createPaymentAssessor({
        resource: {
            amount(){ resourceReads++; throw new Error('resource amount must remain isolated'); },
            available(){ resourceReads++; throw new Error('resource availability must remain isolated'); },
            capacity(){ resourceReads++; throw new Error('resource capacity must remain isolated'); },
        },
        pool: {
            present: () => true,
            amount: () => 5,
            capacity: () => 5,
        },
    });
    const quote = createPaymentQuote([special('example:payment/test', 'example:payment-pool/pool', 5)]);

    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
    assert.equal(assessor.assessQueuePaymentFeasibility(quote).status, 'satisfied');
    assert.equal(resourceReads, 0);
});

test('M3D4C cumulative special requirements fail closed on finite-number overflow', async () => {
    const [{ createPaymentQuote }, { createPaymentAssessor }, { EngineContractError }] = await Promise.all([
        quotePromise,
        assessorPromise,
        identityPromise,
    ]);
    const poolId = 'example:payment-pool/pool';
    const quote = createPaymentQuote([
        special('example:payment/alpha', poolId, Number.MAX_VALUE),
        special('example:payment/beta', poolId, Number.MAX_VALUE),
    ]);
    const assessor = createPaymentAssessor({
        resource: resourceReads(),
        pool: {
            present: () => true,
            amount: () => Number.MAX_VALUE,
            capacity: () => Number.MAX_VALUE,
        },
    });

    for (const assess of [
        assessor.assessCurrentAffordability,
        assessor.assessQueuePaymentFeasibility,
    ]){
        assert.throws(
            () => assess(quote),
            error => error instanceof EngineContractError &&
                error.code === 'PAYMENT_REQUIREMENT_OVERFLOW' &&
                error.details?.paymentFamily === 'pool' &&
                error.details?.poolId === poolId &&
                error.details?.lineIndex === 1
        );
    }
});
