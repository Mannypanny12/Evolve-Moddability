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

function resourceLine(resourceId, amount){
    return { kind: 'resource', resourceId, amount };
}

test('M3D1 creates a detached frozen empty PaymentQuote', async () => {
    const { createPaymentQuote } = await modules();
    const input = [];
    const quote = createPaymentQuote(input);

    assert.deepEqual(quote, { lines: [] });
    assert.deepEqual(Object.keys(quote), ['lines']);
    assert.equal(Object.isFrozen(quote), true);
    assert.equal(Object.isFrozen(quote.lines), true);
    assert.notEqual(quote.lines, input);

    input.push(resourceLine('example:resource/wood', 1));
    assert.deepEqual(quote.lines, []);
});

test('M3D1 requires an explicit dense line array and exposes only the reviewed public entry point', async () => {
    const quoteModule = await quotePromise;
    const { createPaymentQuote, EngineContractError } = await modules();

    assert.deepEqual(Object.keys(quoteModule).sort(), ['createPaymentQuote']);
    assert.equal(createPaymentQuote.length, 1);
    for (const create of [
        () => createPaymentQuote(),
        () => createPaymentQuote(undefined),
        () => createPaymentQuote(null),
        () => createPaymentQuote({}),
    ]){
        assert.throws(
            create,
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
        );
    }
});

test('M3D1 accepts arbitrary namespaces but requires canonical typed resource IDs', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([
        resourceLine('example:resource/dragon_blood', 0.25),
        resourceLine('other_mod:resource/fuel/refined', 3),
    ]);

    assert.deepEqual(quote, {
        lines: [
            resourceLine('example:resource/dragon_blood', 0.25),
            resourceLine('other_mod:resource/fuel/refined', 3),
        ],
    });

    for (const resourceId of [
        'DNA',
        'Example:resource/wood',
        'example:command/wood',
        'example:resource/',
    ]){
        assert.throws(
            () => createPaymentQuote([resourceLine(resourceId, 1)]),
            error => error instanceof EngineContractError &&
                error.code === 'INVALID_PAYMENT_QUOTE_RESOURCE_ID'
        );
    }
});

test('M3D1 requires positive finite numeric amounts', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();

    assert.deepEqual(
        createPaymentQuote([resourceLine('example:resource/wood', Number.MIN_VALUE)]).lines[0].amount,
        Number.MIN_VALUE
    );

    for (const amount of [0, -0, -1, NaN, Infinity, -Infinity, '2', 2n, null]){
        assert.throws(
            () => createPaymentQuote([resourceLine('example:resource/wood', amount)]),
            error => error instanceof EngineContractError &&
                error.code === 'INVALID_PAYMENT_QUOTE_AMOUNT'
        );
    }
});

test('M3D1 preserves exact line order, duplicates, and repeated input identity', async () => {
    const { createPaymentQuote } = await modules();
    const shared = resourceLine('example:resource/wood', 2);
    const input = [
        shared,
        resourceLine('example:resource/stone', 1),
        shared,
    ];
    const quote = createPaymentQuote(input);

    assert.deepEqual(quote.lines, [
        resourceLine('example:resource/wood', 2),
        resourceLine('example:resource/stone', 1),
        resourceLine('example:resource/wood', 2),
    ]);
    assert.notEqual(quote.lines[0], shared);
    assert.notEqual(quote.lines[2], shared);
    assert.notEqual(quote.lines[0], quote.lines[2]);
    assert.equal(Object.isFrozen(quote.lines[0]), true);
    assert.equal(Object.isFrozen(quote.lines[1]), true);
    assert.equal(Object.isFrozen(quote.lines[2]), true);

    shared.amount = 99;
    input.reverse();
    assert.equal(quote.lines[0].amount, 2);
    assert.equal(quote.lines[2].amount, 2);
});

test('M3D1 distinguishes malformed line kinds from well-formed but unsupported families', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();

    for (const kind of [null, 1, {}, 'Resource', 'Bad Kind', 'resource..grant']){
        assert.throws(
            () => createPaymentQuote([{ kind, resourceId: 'example:resource/wood', amount: 1 }]),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE_KIND'
        );
    }

    for (const kind of ['prestige', 'special', 'resource.consume']){
        assert.throws(
            () => createPaymentQuote([{ kind, resourceId: 'example:resource/wood', amount: 1 }]),
            error => error instanceof EngineContractError && error.code === 'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND'
        );
    }
});

test('M3D1 rejects unknown and missing quote-line fields', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();

    assert.throws(
        () => createPaymentQuote([{ kind: 'resource', resourceId: 'example:resource/wood', amount: 1, note: 'x' }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );
    assert.throws(
        () => createPaymentQuote([{ kind: 'resource', resourceId: 'example:resource/wood' }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );
});

test('M3D1 invalid field diagnostics do not retain hostile caller objects', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    const hostile = new Proxy({}, {
        get(){ throw new Error('hostile get'); },
        ownKeys(){ throw new Error('hostile ownKeys'); },
        getOwnPropertyDescriptor(){ throw new Error('hostile descriptor'); },
        getPrototypeOf(){ throw new Error('hostile prototype'); },
    });

    const cases = [
        [{ kind: hostile, resourceId: 'example:resource/wood', amount: 1 }, 'INVALID_PAYMENT_QUOTE_LINE_KIND'],
        [{ kind: 'resource', resourceId: hostile, amount: 1 }, 'INVALID_PAYMENT_QUOTE_RESOURCE_ID'],
        [{ kind: 'resource', resourceId: 'example:resource/wood', amount: hostile }, 'INVALID_PAYMENT_QUOTE_AMOUNT'],
    ];

    for (const [line, code] of cases){
        assert.throws(
            () => createPaymentQuote([line]),
            error => {
                assert.equal(error instanceof EngineContractError, true);
                assert.equal(error.code, code);
                assert.equal(Object.isFrozen(error.details), true);
                assert.doesNotThrow(() => JSON.stringify(error.details));
                assert.equal(Object.values(error.details).includes(hostile), false);
                return true;
            }
        );
    }
});

test('M3D1 accepts null-prototype line objects but emits normal frozen records', async () => {
    const { createPaymentQuote } = await modules();
    const line = Object.create(null);
    line.kind = 'resource';
    line.resourceId = 'example:resource/wood';
    line.amount = 4;

    const output = createPaymentQuote([line]).lines[0];
    assert.deepEqual(output, resourceLine('example:resource/wood', 4));
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(Object.isFrozen(output), true);
});

test('M3D1 rejects accessors, hidden/symbol fields, sparse arrays, extra array fields, and array subclasses', async () => {
    const { createPaymentQuote, EngineContractError } = await modules();
    let getterCalls = 0;
    const accessor = resourceLine('example:resource/wood', 1);
    Object.defineProperty(accessor, 'amount', {
        enumerable: true,
        get(){ getterCalls++; return 1; },
    });
    assert.throws(
        () => createPaymentQuote([accessor]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );
    assert.equal(getterCalls, 0);

    const hidden = resourceLine('example:resource/wood', 1);
    Object.defineProperty(hidden, 'secret', { value: true, enumerable: false });
    assert.throws(
        () => createPaymentQuote([hidden]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );

    const symbol = resourceLine('example:resource/wood', 1);
    symbol[Symbol('secret')] = true;
    assert.throws(
        () => createPaymentQuote([symbol]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );

    const sparse = new Array(2);
    sparse[1] = resourceLine('example:resource/wood', 1);
    assert.throws(
        () => createPaymentQuote(sparse),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );

    const extra = [resourceLine('example:resource/wood', 1)];
    extra.note = true;
    assert.throws(
        () => createPaymentQuote(extra),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );

    class QuoteArray extends Array {}
    assert.throws(
        () => createPaymentQuote(new QuoteArray()),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );
});

test('M3D1 fails closed on hostile reflective inputs and enforces the line-count ceiling', async () => {
    const {
        createPaymentQuote,
        MAX_PAYMENT_QUOTE_LINES,
        EngineContractError,
    } = await modules();

    const hostileLine = new Proxy(resourceLine('example:resource/wood', 1), {
        ownKeys(){ throw new Error('hostile ownKeys'); },
    });
    assert.throws(
        () => createPaymentQuote([hostileLine]),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE_LINE'
    );

    const tooMany = Array.from(
        { length: MAX_PAYMENT_QUOTE_LINES + 1 },
        () => resourceLine('example:resource/wood', 1)
    );
    assert.throws(
        () => createPaymentQuote(tooMany),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_PAYMENT_QUOTE' &&
            error.details?.maxLength === MAX_PAYMENT_QUOTE_LINES
    );
});
