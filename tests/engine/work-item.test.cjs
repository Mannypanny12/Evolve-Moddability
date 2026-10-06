'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const workItemPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-item.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [bus, workItem, result, identity] = await Promise.all([
        busPromise,
        workItemPromise,
        resultPromise,
        identityPromise,
    ]);
    return { ...bus, ...workItem, ...result, ...identity };
}

test('M3E1 work-item module exposes only the construction capability', async () => {
    const workItem = await workItemPromise;
    assert.deepEqual(Object.keys(workItem), ['createQueuedWorkItem']);
});

test('M3E1 queued work contains only prepared command progress data and does not execute', async () => {
    const { createCommandBus, createQueuedWorkItem, commandSucceeded } = await modules();
    let executions = 0;
    let validations = 0;
    const originalPayload = { target: { id: 'alpha' }, amount: 2 };

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/build/test',
            validatePayload(payload){
                validations++;
                return {
                    amount: payload.amount,
                    target: { id: payload.target.id },
                };
            },
            execute(){
                executions++;
                return commandSucceeded(null);
            },
        }],
    });

    const item = createQueuedWorkItem({
        command: {
            id: 'evolve:command/build/test',
            payload: originalPayload,
        },
        remaining: 7,
        unitsPerSlot: 3,
    }, bus.prepare);

    assert.equal(validations, 1);
    assert.equal(executions, 0);
    assert.deepEqual(Object.keys(item), ['command', 'remaining', 'unitsPerSlot']);
    assert.deepEqual(Object.keys(item.command), ['id', 'payload']);
    assert.equal(item.command.id, 'evolve:command/build/test');
    assert.deepEqual(item.command.payload, {
        amount: 2,
        target: { id: 'alpha' },
    });
    assert.equal(item.remaining, 7);
    assert.equal(item.unitsPerSlot, 3);
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.command), true);
    assert.equal(Object.isFrozen(item.command.payload), true);
    assert.equal(Object.isFrozen(item.command.payload.target), true);

    originalPayload.target.id = 'mutated';
    originalPayload.amount = 99;
    assert.equal(item.command.payload.target.id, 'alpha');
    assert.equal(item.command.payload.amount, 2);
});

test('M3E1 queued work rejects malformed command payloads through CommandBus.prepare', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();
    let executions = 0;

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/build/test',
            validatePayload(payload){
                if (!Number.isSafeInteger(payload.amount) || payload.amount <= 0){
                    throw new EngineContractError(
                        'INVALID_BUILD_AMOUNT',
                        'amount must be positive',
                        { path: 'command.payload.amount' }
                    );
                }
                return { amount: payload.amount };
            },
            execute(){
                executions++;
                return commandSucceeded(null);
            },
        }],
    });

    assert.throws(
        () => createQueuedWorkItem({
            command: {
                id: 'evolve:command/build/test',
                payload: { amount: 0 },
            },
            remaining: 1,
            unitsPerSlot: 1,
        }, bus.prepare),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_BUILD_AMOUNT' &&
            error.details?.phase === 'validate'
    );
    assert.equal(executions, 0);
});

test('M3E1 queued work rejects executable, accessor and action-object payload state', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/build/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });

    assert.throws(
        () => createQueuedWorkItem({
            command: {
                id: 'evolve:command/build/test',
                payload: { callback(){ return true; } },
            },
            remaining: 1,
            unitsPerSlot: 1,
        }, bus.prepare),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND_DATA'
    );

    let getterCalls = 0;
    const payloadWithAccessor = {};
    Object.defineProperty(payloadWithAccessor, 'action', {
        enumerable: true,
        get(){
            getterCalls++;
            return 'legacy-action';
        },
    });
    assert.throws(
        () => createQueuedWorkItem({
            command: {
                id: 'evolve:command/build/test',
                payload: payloadWithAccessor,
            },
            remaining: 1,
            unitsPerSlot: 1,
        }, bus.prepare),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_COMMAND_DATA'
    );
    assert.equal(getterCalls, 0);
});

test('M3E1 queued work shape is closed and excludes legacy/UI/payment cache fields', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });

    const forbiddenFields = [
        'id',
        'action',
        'type',
        'label',
        'cna',
        'time',
        't_max',
        'bres',
        'req',
        'qa',
        'callback',
        'handler',
        'paymentPlan',
        'quote',
        'affordable',
        'requirementsMet',
    ];

    for (const field of forbiddenFields){
        assert.throws(
            () => createQueuedWorkItem({
                command: { id: 'evolve:command/test', payload: {} },
                remaining: 1,
                unitsPerSlot: 1,
                [field]: null,
            }, bus.prepare),
            error => error instanceof EngineContractError &&
                error.code === 'INVALID_QUEUED_WORK_ITEM' &&
                error.details?.field === field,
            field
        );
    }

    assert.throws(
        () => createQueuedWorkItem({
            command: { id: 'evolve:command/test', payload: {} },
            remaining: 1,
        }, bus.prepare),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_QUEUED_WORK_ITEM' &&
            error.details?.field === 'unitsPerSlot'
    );
});

test('M3E1 raw work items fail closed on accessors, hidden fields and symbols without invoking getters', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });
    const command = { id: 'evolve:command/test', payload: {} };

    let getterCalls = 0;
    const accessorItem = { command, unitsPerSlot: 1 };
    Object.defineProperty(accessorItem, 'remaining', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });
    assert.throws(
        () => createQueuedWorkItem(accessorItem, bus.prepare),
        error => error instanceof EngineContractError && error.code === 'INVALID_QUEUED_WORK_ITEM'
    );
    assert.equal(getterCalls, 0);

    const hiddenItem = { command, remaining: 1, unitsPerSlot: 1 };
    Object.defineProperty(hiddenItem, 'legacy', { enumerable: false, value: true });
    assert.throws(
        () => createQueuedWorkItem(hiddenItem, bus.prepare),
        error => error instanceof EngineContractError && error.code === 'INVALID_QUEUED_WORK_ITEM'
    );

    const symbolItem = { command, remaining: 1, unitsPerSlot: 1 };
    symbolItem[Symbol('legacy')] = true;
    assert.throws(
        () => createQueuedWorkItem(symbolItem, bus.prepare),
        error => error instanceof EngineContractError && error.code === 'INVALID_QUEUED_WORK_ITEM'
    );
});

test('M3E1 null-prototype raw work items remain valid inert input', async () => {
    const { createCommandBus, createQueuedWorkItem, commandSucceeded } = await modules();
    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });
    const raw = Object.assign(Object.create(null), {
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 2,
        unitsPerSlot: 1,
    });
    const item = createQueuedWorkItem(raw, bus.prepare);
    assert.equal(item.remaining, 2);
    assert.equal(item.command.id, 'evolve:command/test');
});

test('M3E1 remaining and unitsPerSlot are positive safe integers', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });

    const base = {
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    };

    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]){
        assert.throws(
            () => createQueuedWorkItem({ ...base, remaining: value }, bus.prepare),
            error => error instanceof EngineContractError &&
                error.code === 'INVALID_QUEUED_WORK_ITEM' &&
                error.details?.path === 'workItem.remaining',
            `remaining=${String(value)}`
        );
        assert.throws(
            () => createQueuedWorkItem({ ...base, unitsPerSlot: value }, bus.prepare),
            error => error instanceof EngineContractError &&
                error.code === 'INVALID_QUEUED_WORK_ITEM' &&
                error.details?.path === 'workItem.unitsPerSlot',
            `unitsPerSlot=${String(value)}`
        );
    }
});

test('M3E1 queued work requires a prepare capability and never stores it', async () => {
    const {
        createCommandBus,
        createQueuedWorkItem,
        commandSucceeded,
        EngineContractError,
    } = await modules();

    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload: payload => payload,
            execute: () => commandSucceeded(null),
        }],
    });
    const raw = {
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    };

    assert.throws(
        () => createQueuedWorkItem(raw, null),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_WORK_ITEM_PREPARER'
    );

    const item = createQueuedWorkItem(raw, bus.prepare);
    assert.equal('prepare' in item, false);
    assert.equal('callback' in item, false);
    assert.equal('handler' in item, false);
});

test('M3E1 rejects a broken preparer that returns mutable or non-command data', async () => {
    const {
        createQueuedWorkItem,
        EngineContractError,
    } = await modules();
    const raw = {
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    };

    assert.throws(
        () => createQueuedWorkItem(raw, () => ({
            id: 'evolve:command/test',
            payload: {},
        })),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_PREPARED_COMMAND'
    );

    assert.throws(
        () => createQueuedWorkItem(raw, () => Object.freeze({
            id: 'evolve:technology/test',
            payload: Object.freeze({}),
        })),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_PREPARED_COMMAND'
    );
});

test('M3E1 rejects broken preparers whose frozen payload is not actually canonical inert command data', async () => {
    const { createQueuedWorkItem, EngineContractError } = await modules();
    const raw = {
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    };
    const wrap = payload => Object.freeze({
        id: 'evolve:command/test',
        payload,
    });
    const expectInvalid = prepare => assert.throws(
        () => createQueuedWorkItem(raw, prepare),
        error => error instanceof EngineContractError && error.code === 'INVALID_PREPARED_COMMAND'
    );

    const mutableChild = { amount: 1 };
    expectInvalid(() => wrap(Object.freeze({ child: mutableChild })));

    expectInvalid(() => wrap(Object.freeze({ value: -0 })));
    expectInvalid(() => wrap(Object.freeze({ z: 1, a: 2 })));

    const shared = Object.freeze({ value: 1 });
    expectInvalid(() => wrap(Object.freeze({ a: shared, b: shared })));

    const cyclic = {};
    cyclic.self = cyclic;
    Object.freeze(cyclic);
    expectInvalid(() => wrap(Object.freeze({ cyclic })));

    let getterCalls = 0;
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, 'value', {
        enumerable: true,
        get(){
            getterCalls++;
            return 1;
        },
    });
    Object.freeze(accessorPayload);
    expectInvalid(() => wrap(accessorPayload));
    assert.equal(getterCalls, 0);
});
