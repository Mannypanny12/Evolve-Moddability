'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [quote, identity] = await Promise.all([quotePromise, identityPromise]);
    return { ...quote, ...identity };
}

function assertSafeDetails(error, EngineContractError, code, hostile){
    assert.equal(error instanceof EngineContractError, true);
    assert.equal(error.code, code);
    assert.equal(Object.isFrozen(error.details), true);
    assert.doesNotThrow(() => JSON.stringify(error.details));
    assert.equal(Object.values(error.details).includes(hostile), false);
    return true;
}

test('M3D1 wrong quote containers do not escape caller-owned objects through diagnostics', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    const hostile = new Proxy({}, {
        get(){ throw new Error('hostile get'); },
        ownKeys(){ throw new Error('hostile ownKeys'); },
        getOwnPropertyDescriptor(){ throw new Error('hostile descriptor'); },
    });

    assert.throws(
        () => createPaymentQuote(hostile),
        error => assertSafeDetails(error, EngineContractError, 'INVALID_PAYMENT_QUOTE', hostile)
    );
});

test('M3D1 exotic and array quote-line containers do not escape through diagnostics', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();

    const hostileArray = new Proxy([], {
        get(){ throw new Error('hostile get'); },
        ownKeys(){ throw new Error('hostile ownKeys'); },
        getOwnPropertyDescriptor(){ throw new Error('hostile descriptor'); },
    });
    assert.throws(
        () => createPaymentQuote([hostileArray]),
        error => assertSafeDetails(error, EngineContractError, 'INVALID_PAYMENT_QUOTE_LINE', hostileArray)
    );

    const exotic = new Date(0);
    Object.defineProperty(exotic, 'toJSON', {
        value(){ throw new Error('must not serialize caller object'); },
        enumerable: false,
    });
    assert.throws(
        () => createPaymentQuote([exotic]),
        error => assertSafeDetails(error, EngineContractError, 'INVALID_PAYMENT_QUOTE_LINE', exotic)
    );
});

test('M3D1 revoked proxies fail closed without leaking raw reflective failures', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    const revokedQuote = Proxy.revocable([], {});
    revokedQuote.revoke();
    assert.throws(
        () => createPaymentQuote(revokedQuote.proxy),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_PAYMENT_QUOTE');
            assert.equal(error.details?.path, 'paymentQuote.lines');
            return true;
        }
    );

    const revokedLine = Proxy.revocable({}, {});
    revokedLine.revoke();
    assert.throws(
        () => createPaymentQuote([revokedLine.proxy]),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_PAYMENT_QUOTE_LINE');
            assert.equal(error.details?.path, 'paymentQuote.lines[0]');
            return true;
        }
    );
});
