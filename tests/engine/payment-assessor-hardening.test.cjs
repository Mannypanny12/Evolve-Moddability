'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const assessorPromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href);
const quotePromise = import(pathToFileURL(path.join(root, 'src/engine/costs/payment-quote.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function line(resourceId, amount){
    return { kind: 'resource', resourceId, amount };
}

async function modules(){
    const [{ createPaymentAssessor }, { createPaymentQuote }, { EngineContractError }] = await Promise.all([
        assessorPromise,
        quotePromise,
        identityPromise,
    ]);
    return { createPaymentAssessor, createPaymentQuote, EngineContractError };
}

function validProvider(overrides = {}){
    return {
        resource: {
            amount: overrides.amount || (() => 10),
            available: overrides.available || (() => true),
            capacity: overrides.capacity || (() => 20),
        },
    };
}

function hostileContainer(){
    return new Proxy({}, {
        getPrototypeOf(){ return {}; },
        get(){ throw new Error('hostile container escaped into diagnostics'); },
    });
}

test('M3D2 assessor facade is frozen and exposes exactly the two reviewed assessment operations', async () => {
    const { createPaymentAssessor } = await modules();
    const assessor = createPaymentAssessor(validProvider());

    assert.equal(Object.isFrozen(assessor), true);
    assert.deepEqual(Object.keys(assessor).sort(), [
        'assessCurrentAffordability',
        'assessQueuePaymentFeasibility',
    ]);
});

test('M3D2 rejects malformed read capability containers and non-callable members', async () => {
    const { createPaymentAssessor, EngineContractError } = await modules();

    for (const bad of [
        null,
        [],
        {},
        { resource: {} },
        { resource: { amount: 1, available(){}, capacity(){} } },
        { resource: { amount(){}, available(){}, capacity(){}, extra: true } },
    ]){
        assert.throws(
            () => createPaymentAssessor(bad),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_CAPABILITIES'
        );
    }
});

test('M3D2 malformed capability containers cannot escape through error details', async () => {
    const { createPaymentAssessor, EngineContractError } = await modules();

    for (const bad of [
        hostileContainer(),
        { resource: hostileContainer() },
    ]){
        assert.throws(
            () => createPaymentAssessor(bad),
            error => {
                assert.equal(error instanceof EngineContractError, true);
                assert.equal(error.code, 'INVALID_PAYMENT_READ_CAPABILITIES');
                assert.equal(Object.prototype.hasOwnProperty.call(error.details || {}, 'value'), false);
                assert.doesNotThrow(() => JSON.stringify(error.details));
                return true;
            }
        );
    }
});

test('M3D2 callable misuse still fails closed when a reader is invoked', async () => {
    const { createPaymentAssessor, createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);

    const asyncAssessor = createPaymentAssessor(validProvider({ amount: async () => 1 }));
    assert.throws(
        () => asyncAssessor.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
    );

    const generatorAssessor = createPaymentAssessor(validProvider({ amount: function*(){ yield 1; } }));
    assert.throws(
        () => generatorAssessor.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
    );

    const classAssessor = createPaymentAssessor(validProvider({ amount: class Reader {} }));
    assert.throws(
        () => classAssessor.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'PAYMENT_READ_FAILURE'
    );
});

test('M3D2 rejects invalid reader results and hostile thenables without invoking accessors', async () => {
    const { createPaymentAssessor, createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);

    for (const amount of [NaN, Infinity, '1', null]){
        const assessor = createPaymentAssessor(validProvider({ amount: () => amount }));
        assert.throws(
            () => assessor.assessCurrentAffordability(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
    }

    for (const capacity of [-1, NaN, Infinity, '10']){
        const assessor = createPaymentAssessor(validProvider({ capacity: () => capacity }));
        assert.throws(
            () => assessor.assessCurrentAffordability(quote),
            error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
        );
    }

    const queue = createPaymentAssessor(validProvider({ available: () => 1 }));
    assert.throws(
        () => queue.assessQueuePaymentFeasibility(quote),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
    );

    let getterCalls = 0;
    const thenable = {};
    Object.defineProperty(thenable, 'then', {
        get(){ getterCalls++; return () => {}; },
    });
    const hostile = createPaymentAssessor(validProvider({ amount: () => thenable }));
    assert.throws(
        () => hostile.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_READ_RESULT'
    );
    assert.equal(getterCalls, 0);
});

test('M3D2 wraps provider failures without retaining hostile thrown values', async () => {
    const { createPaymentAssessor, createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    const assessor = createPaymentAssessor(validProvider({ amount(){ throw proxy; } }));
    assert.throws(
        () => assessor.assessCurrentAffordability(quote),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'PAYMENT_READ_FAILURE');
            assert.equal(error.details?.readerCauseCode, null);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
});

test('M3D2 captures provider function identity at construction', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const raw = validProvider({ amount: () => 5 });
    const assessor = createPaymentAssessor(raw);
    raw.resource.amount = () => 0;
    raw.resource.capacity = () => 0;

    const result = assessor.assessCurrentAffordability(
        createPaymentQuote([line('example:resource/wood', 4)])
    );
    assert.equal(result.status, 'satisfied');
});

test('M3D2 detaches quote input before resource providers can mutate caller-owned data', async () => {
    const { createPaymentAssessor } = await modules();
    const rawQuote = { lines: [line('example:resource/wood', 2)] };
    const assessor = createPaymentAssessor(validProvider({
        amount(){
            rawQuote.lines[0].amount = 999;
            rawQuote.lines.push(line('example:resource/wood', 999));
            return 2;
        },
        capacity: () => 2,
    }));

    const result = assessor.assessCurrentAffordability(rawQuote);
    assert.equal(result.status, 'satisfied');
});

test('M3D2 malformed quote containers cannot escape through assessor diagnostics', async () => {
    const { createPaymentAssessor, EngineContractError } = await modules();
    const assessor = createPaymentAssessor(validProvider());
    const hostile = hostileContainer();

    assert.throws(
        () => assessor.assessCurrentAffordability(hostile),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_PAYMENT_QUOTE');
            assert.equal(Object.prototype.hasOwnProperty.call(error.details || {}, 'value'), false);
            assert.doesNotThrow(() => JSON.stringify(error.details));
            return true;
        }
    );
});

test('M3D2 rejects cross-mode reentrant assessment and recovers the lock afterwards', async () => {
    const { createPaymentAssessor, createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);
    let assessor;
    let nestedError;

    assessor = createPaymentAssessor(validProvider({
        amount(){
            try {
                assessor.assessQueuePaymentFeasibility(quote);
            }
            catch (error){
                nestedError = error;
            }
            return 5;
        },
    }));

    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
    assert.equal(nestedError instanceof EngineContractError, true);
    assert.equal(nestedError.code, 'PAYMENT_ASSESSMENT_REENTRANCY');
    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
});

test('M3D2 assessment locks are instance-local rather than process-global', async () => {
    const { createPaymentAssessor, createPaymentQuote } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);
    const inner = createPaymentAssessor(validProvider({ amount: () => 2, capacity: () => 2 }));
    let innerResult;
    const outer = createPaymentAssessor(validProvider({
        amount(){
            innerResult = inner.assessCurrentAffordability(quote);
            return 2;
        },
        capacity: () => 2,
    }));

    assert.equal(outer.assessCurrentAffordability(quote).status, 'satisfied');
    assert.equal(innerResult.status, 'satisfied');
});

test('M3D2 assessment lock recovers after quote and provider failures', async () => {
    const { createPaymentAssessor, createPaymentQuote, EngineContractError } = await modules();
    const quote = createPaymentQuote([line('example:resource/wood', 1)]);
    let failRead = true;
    const assessor = createPaymentAssessor(validProvider({
        amount(){
            if (failRead){
                failRead = false;
                throw new Error('first read fails');
            }
            return 2;
        },
        capacity: () => 2,
    }));

    assert.throws(
        () => assessor.assessCurrentAffordability({}),
        error => error instanceof EngineContractError && error.code === 'INVALID_PAYMENT_QUOTE'
    );
    assert.throws(
        () => assessor.assessCurrentAffordability(quote),
        error => error instanceof EngineContractError && error.code === 'PAYMENT_READ_FAILURE'
    );
    assert.equal(assessor.assessCurrentAffordability(quote).status, 'satisfied');
});

test('M3D2 validates arbitrary caller quote objects rather than trusting D1 provenance', async () => {
    const { createPaymentAssessor, EngineContractError } = await modules();
    const assessor = createPaymentAssessor(validProvider());

    for (const quote of [
        null,
        [],
        {},
        { lines: [], extra: true },
        { lines: [{ kind: 'resource', resourceId: 'example:resource/wood', amount: 0 }] },
    ]){
        assert.throws(
            () => assessor.assessCurrentAffordability(quote),
            error => error instanceof EngineContractError && String(error.code).startsWith('INVALID_PAYMENT_QUOTE')
        );
    }
});
