'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [plan, quote, identity] = await Promise.all([planPromise, quotePromise, identityPromise]);
    return { ...plan, ...quote, ...identity };
}

function line(resourceId, amount){
    return { kind: 'resource', resourceId, amount };
}

function debit(resourceId, amount){
    return { kind: 'payment.resource.debit', resourceId, amount };
}

test('M3D3 exposes only the synchronous one-argument PaymentPlan factory', async () => {
    const planModule = await planPromise;
    assert.deepEqual(Object.keys(planModule), ['createPaymentPlan']);
    assert.equal(planModule.createPaymentPlan.length, 1);
});

test('M3D3 maps a free quote to a detached frozen empty PaymentPlan', async () => {
    const { createPaymentPlan, createPaymentQuote } = await modules();
    const quote = createPaymentQuote([]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan, { operations: [] });
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.operations), true);
    assert.notEqual(plan.operations, quote.lines);
});

test('M3D3 derives ordinary resource debit operations without changing amount or identity', async () => {
    const { createPaymentPlan, createPaymentQuote } = await modules();
    const quote = createPaymentQuote([
        line('example:resource/wood', 0.25),
        line('other_mod:resource/fuel/refined', 3),
    ]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan, {
        operations: [
            debit('example:resource/wood', 0.25),
            debit('other_mod:resource/fuel/refined', 3),
        ],
    });
    for (const operation of plan.operations){
        assert.equal(Object.isFrozen(operation), true);
    }
});

test('M3D3 preserves quote order and duplicate line identity as separate debit operations', async () => {
    const { createPaymentPlan, createPaymentQuote } = await modules();
    const quote = createPaymentQuote([
        line('example:resource/rna', 2),
        line('example:resource/wood', 5),
        line('example:resource/rna', 3),
    ]);
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan.operations, [
        debit('example:resource/rna', 2),
        debit('example:resource/wood', 5),
        debit('example:resource/rna', 3),
    ]);
    assert.notEqual(plan.operations[0], plan.operations[2]);
    assert.notEqual(plan.operations[0], quote.lines[0]);
    assert.notEqual(plan.operations[2], quote.lines[2]);
});

test('M3D3 accepts a structurally valid arbitrary quote and detaches from caller-owned data', async () => {
    const { createPaymentPlan } = await modules();
    const rawLine = line('example:resource/wood', 4);
    const rawQuote = { lines: [rawLine] };
    const plan = createPaymentPlan(rawQuote);

    rawLine.amount = 99;
    rawQuote.lines.push(line('example:resource/stone', 1));

    assert.deepEqual(plan.operations, [debit('example:resource/wood', 4)]);
});

test('M3D3 planning is independent of current affordability or queue feasibility', async () => {
    const { createPaymentPlan, createPaymentQuote } = await modules();
    const quote = createPaymentQuote([line('example:resource/rna', Number.MAX_VALUE)]);

    assert.deepEqual(createPaymentPlan(quote), {
        operations: [debit('example:resource/rna', Number.MAX_VALUE)],
    });
});

test('M3D3 rejects raw operation arrays and malformed quote wrappers', async () => {
    const { createPaymentPlan, EngineContractError } = await modules();
    for (const value of [
        undefined,
        null,
        [],
        {},
        { lines: [], extra: true },
        new Date(),
    ]){
        assert.throws(
            () => createPaymentPlan(value),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
        );
    }
});

test('M3D3 reuses the hardened quote-line contract rather than accepting plan operations as input', async () => {
    const { createPaymentPlan, EngineContractError } = await modules();

    assert.throws(
        () => createPaymentPlan({
            lines: [debit('example:resource/wood', 1)],
        }),
        error => error instanceof EngineContractError &&
            error.code === 'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND'
    );
});

test('M3D3 hostile quote wrappers fail without escaping caller-owned objects in diagnostics', async () => {
    const { createPaymentPlan, EngineContractError } = await modules();
    const hostile = new Proxy({}, {
        getPrototypeOf(){ throw new Error('hostile prototype'); },
        ownKeys(){ throw new Error('hostile ownKeys'); },
        getOwnPropertyDescriptor(){ throw new Error('hostile descriptor'); },
    });

    assert.throws(
        () => createPaymentPlan(hostile),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_PAYMENT_QUOTE');
            assert.equal(Object.isFrozen(error.details), true);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            assert.equal(Object.values(error.details).includes(hostile), false);
            return true;
        }
    );

    const target = {};
    const revoked = Proxy.revocable(target, {});
    revoked.revoke();
    assert.throws(
        () => createPaymentPlan(revoked.proxy),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );
});
