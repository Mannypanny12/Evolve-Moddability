'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-plan.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [{ createPaymentPlan }, { EngineContractError }] = await Promise.all([
        planPromise,
        identityPromise,
    ]);
    return { createPaymentPlan, EngineContractError };
}

function line(resourceId, amount){
    return { kind: 'resource', resourceId, amount };
}

function debit(resourceId, amount){
    return { kind: 'payment.resource.debit', resourceId, amount };
}

test('M3D3 accepts null-prototype quote wrappers but emits normal frozen plan records', async () => {
    const { createPaymentPlan } = await modules();
    const quote = Object.create(null);
    quote.lines = [line('example:resource/wood', 2)];

    const plan = createPaymentPlan(quote);
    assert.deepEqual(plan, { operations: [debit('example:resource/wood', 2)] });
    assert.equal(Object.getPrototypeOf(plan), Object.prototype);
    assert.equal(Object.getPrototypeOf(plan.operations[0]), Object.prototype);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.operations), true);
    assert.equal(Object.isFrozen(plan.operations[0]), true);
});

test('M3D3 shared quote-wrapper diagnostics escape exotic unsupported field paths', async () => {
    const { createPaymentPlan, EngineContractError } = await modules();
    const quote = { 'x.y\n[z]': [] };

    assert.throws(
        () => createPaymentPlan(quote),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_PAYMENT_QUOTE');
            assert.equal(error.details?.field, 'x.y\n[z]');
            assert.equal(error.details?.path, 'paymentQuote["x.y\\n[z]"]');
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
});

test('M3D3 rejects wrapper accessors, hidden fields and symbol fields without invoking getters', async () => {
    const { createPaymentPlan, EngineContractError } = await modules();
    let getterCalls = 0;

    const accessor = {};
    Object.defineProperty(accessor, 'lines', {
        enumerable: true,
        get(){ getterCalls++; return []; },
    });
    assert.throws(
        () => createPaymentPlan(accessor),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );
    assert.equal(getterCalls, 0);

    const hidden = {};
    Object.defineProperty(hidden, 'lines', { enumerable: false, value: [] });
    assert.throws(
        () => createPaymentPlan(hidden),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );

    const symbol = {};
    symbol[Symbol('lines')] = [];
    assert.throws(
        () => createPaymentPlan(symbol),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );
});

test('M3D3 keeps individually valid huge duplicate debits separate instead of aggregating during planning', async () => {
    const { createPaymentPlan } = await modules();
    const resourceId = 'example:resource/huge';
    const plan = createPaymentPlan({
        lines: [
            line(resourceId, Number.MAX_VALUE),
            line(resourceId, Number.MAX_VALUE),
        ],
    });

    assert.deepEqual(plan.operations, [
        debit(resourceId, Number.MAX_VALUE),
        debit(resourceId, Number.MAX_VALUE),
    ]);
});

test('M3D3 operation output never aliases caller quote lines, even when the same input line object is reused', async () => {
    const { createPaymentPlan } = await modules();
    const shared = line('example:resource/wood', 3);
    const quote = { lines: [shared, shared] };
    const plan = createPaymentPlan(quote);

    assert.deepEqual(plan.operations, [
        debit('example:resource/wood', 3),
        debit('example:resource/wood', 3),
    ]);
    assert.notEqual(plan.operations[0], shared);
    assert.notEqual(plan.operations[1], shared);
    assert.notEqual(plan.operations[0], plan.operations[1]);

    shared.amount = 99;
    quote.lines.length = 0;
    assert.equal(plan.operations[0].amount, 3);
    assert.equal(plan.operations[1].amount, 3);
});
