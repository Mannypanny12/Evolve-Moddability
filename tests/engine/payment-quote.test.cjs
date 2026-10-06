'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [quote, common, identity] = await Promise.all([quotePromise, commonPromise, identityPromise]);
    return { ...quote, ...common, ...identity };
}

function resourceLine(resourceId, amount){ return { kind: 'resource', resourceId, amount }; }
function prestigeLine(prestigeId, amount){ return { kind: 'prestige', prestigeId, amount }; }

test('PaymentQuote creates a detached frozen empty quote and exposes one reviewed public entry', async () => {
    const quoteModule = await quotePromise;
    const { createPaymentQuote, EngineContractError } = await modules();
    const input = [];
    const quote = createPaymentQuote(input);

    assert.deepEqual(Object.keys(quoteModule), ['createPaymentQuote']);
    assert.equal(createPaymentQuote.length, 1);
    assert.deepEqual(quote, { lines: [] });
    assert.equal(Object.isFrozen(quote), true);
    assert.equal(Object.isFrozen(quote.lines), true);
    assert.notEqual(quote.lines, input);

    for (const bad of [undefined, null, {}]){
        assert.throws(
            () => createPaymentQuote(bad),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
        );
    }
});

test('PaymentQuote accepts arbitrary namespaces for canonical resource and prestige identities', async () => {
    const { createPaymentQuote } = await modules();
    assert.deepEqual(createPaymentQuote([
        resourceLine('example:resource/dragon_blood', 0.25),
        prestigeLine('other_mod:prestige/ascension/token', 3),
    ]), {
        lines: [
            resourceLine('example:resource/dragon_blood', 0.25),
            prestigeLine('other_mod:prestige/ascension/token', 3),
        ],
    });
});

test('PaymentQuote requires typed canonical IDs for each admitted family', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    for (const resourceId of ['DNA', 'Example:resource/wood', 'example:command/wood', 'example:resource/']){
        assert.throws(
            () => createPaymentQuote([resourceLine(resourceId, 1)]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_RESOURCE_ID'
        );
    }
    for (const prestigeId of ['Plasmid', 'example:resource/token', 'Example:prestige/token']){
        assert.throws(
            () => createPaymentQuote([prestigeLine(prestigeId, 1)]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_PRESTIGE_ID'
        );
    }
});

test('PaymentQuote requires positive finite numeric amounts for every family', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    assert.equal(createPaymentQuote([resourceLine('example:resource/wood', Number.MIN_VALUE)]).lines[0].amount, Number.MIN_VALUE);
    assert.equal(createPaymentQuote([prestigeLine('example:prestige/token', Number.MIN_VALUE)]).lines[0].amount, Number.MIN_VALUE);
    for (const amount of [0, -0, -1, NaN, Infinity, -Infinity, '2', 2n, null]){
        assert.throws(
            () => createPaymentQuote([resourceLine('example:resource/wood', amount)]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_AMOUNT'
        );
    }
});

test('PaymentQuote preserves exact line order, duplicates and repeated input identity across families', async () => {
    const { createPaymentQuote } = await modules();
    const shared = prestigeLine('example:prestige/token', 2);
    const input = [shared, resourceLine('example:resource/stone', 1), shared];
    const quote = createPaymentQuote(input);

    assert.deepEqual(quote.lines, [
        prestigeLine('example:prestige/token', 2),
        resourceLine('example:resource/stone', 1),
        prestigeLine('example:prestige/token', 2),
    ]);
    assert.notEqual(quote.lines[0], shared);
    assert.notEqual(quote.lines[2], shared);
    assert.notEqual(quote.lines[0], quote.lines[2]);
    assert.equal(Object.isFrozen(quote.lines[0]), true);

    shared.amount = 99;
    input.reverse();
    assert.equal(quote.lines[0].amount, 2);
});

test('PaymentQuote distinguishes malformed line kinds from well-formed unsupported later families', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    for (const kind of [null, 1, {}, 'Resource', 'Bad Kind', 'resource..grant']){
        assert.throws(
            () => createPaymentQuote([{ kind, resourceId: 'example:resource/wood', amount: 1 }]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE_KIND'
        );
    }
    for (const kind of ['special', 'resource.consume']){
        assert.throws(
            () => createPaymentQuote([{ kind, resourceId: 'example:resource/wood', amount: 1 }]),
            error => error instanceof EngineContractError && error.code === 'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND'
        );
    }
});

test('PaymentQuote rejects family-mismatched, unknown and missing fields', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    for (const line of [
        { kind: 'resource', resourceId: 'example:resource/wood', amount: 1, note: 'x' },
        { kind: 'resource', resourceId: 'example:resource/wood' },
        { kind: 'prestige', resourceId: 'example:resource/wood', amount: 1 },
        { kind: 'resource', prestigeId: 'example:prestige/token', amount: 1 },
    ]){
        assert.throws(
            () => createPaymentQuote([line]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
        );
    }
});

test('PaymentQuote invalid field diagnostics do not retain hostile caller objects', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    const hostile = new Proxy({}, {
        get(){ throw new Error('hostile get'); },
        ownKeys(){ throw new Error('hostile ownKeys'); },
        getOwnPropertyDescriptor(){ throw new Error('hostile descriptor'); },
        getPrototypeOf(){ throw new Error('hostile prototype'); },
    });
    for (const [line, code] of [
        [{ kind: hostile, resourceId: 'example:resource/wood', amount: 1 }, 'INVALID_PAYMENT_QUOTE_LINE_KIND'],
        [{ kind: 'resource', resourceId: hostile, amount: 1 }, 'INVALID_PAYMENT_QUOTE_RESOURCE_ID'],
        [{ kind: 'prestige', prestigeId: hostile, amount: 1 }, 'INVALID_PAYMENT_QUOTE_PRESTIGE_ID'],
        [{ kind: 'resource', resourceId: 'example:resource/wood', amount: hostile }, 'INVALID_PAYMENT_QUOTE_AMOUNT'],
    ]){
        assert.throws(
            () => createPaymentQuote([line]),
            error => {
                assert.equal(error instanceof EngineContractError, true);
                assert.equal(error.code, code);
                assert.doesNotThrow(() => JSON.stringify(error.details));
                assert.equal(Object.values(error.details || {}).includes(hostile), false);
                return true;
            }
        );
    }
});

test('PaymentQuote accepts null-prototype lines but emits normal frozen records', async () => {
    const { createPaymentQuote } = await modules();
    const line = Object.create(null);
    line.kind = 'prestige';
    line.prestigeId = 'example:prestige/token';
    line.amount = 4;
    const output = createPaymentQuote([line]).lines[0];
    assert.deepEqual(output, prestigeLine('example:prestige/token', 4));
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(Object.isFrozen(output), true);
});

test('PaymentQuote rejects accessors, hidden/symbol fields, sparse arrays, extra array fields and array subclasses', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    let getterCalls = 0;
    const accessor = resourceLine('example:resource/wood', 1);
    Object.defineProperty(accessor, 'amount', { enumerable: true, get(){ getterCalls++; return 1; } });
    assert.throws(() => createPaymentQuote([accessor]), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE');
    assert.equal(getterCalls, 0);

    const hidden = resourceLine('example:resource/wood', 1);
    Object.defineProperty(hidden, 'secret', { value: true, enumerable: false });
    assert.throws(() => createPaymentQuote([hidden]), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE');

    const symbol = resourceLine('example:resource/wood', 1);
    symbol[Symbol('secret')] = true;
    assert.throws(() => createPaymentQuote([symbol]), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE');

    const sparse = new Array(2);
    sparse[1] = resourceLine('example:resource/wood', 1);
    assert.throws(() => createPaymentQuote(sparse), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE');

    const extra = [resourceLine('example:resource/wood', 1)];
    extra.note = true;
    assert.throws(() => createPaymentQuote(extra), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE');

    class QuoteArray extends Array {}
    assert.throws(() => createPaymentQuote(new QuoteArray()), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE');
});

test('PaymentQuote fails closed on hostile reflective inputs and enforces the line-count ceiling', async () => {
    const { createPaymentQuote, MAX_PAYMENT_QUOTE_LINES, EngineContractError } = await modules();
    const hostileLine = new Proxy(resourceLine('example:resource/wood', 1), { ownKeys(){ throw new Error('hostile ownKeys'); } });
    assert.throws(() => createPaymentQuote([hostileLine]), error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE');

    const tooMany = Array.from({ length: MAX_PAYMENT_QUOTE_LINES + 1 }, () => resourceLine('example:resource/wood', 1));
    assert.throws(
        () => createPaymentQuote(tooMany),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE' && error.details?.maxLength === MAX_PAYMENT_QUOTE_LINES
    );
});
