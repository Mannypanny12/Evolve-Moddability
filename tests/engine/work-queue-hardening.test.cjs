'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const workItemPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-item.mjs')).href);
const workQueuePromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-queue.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function harness(){
    const [busModule, workItemModule, workQueueModule, resultModule, identityModule] = await Promise.all([
        busPromise,
        workItemPromise,
        workQueuePromise,
        resultPromise,
        identityPromise,
    ]);
    let executions = 0;
    const bus = busModule.createCommandBus({
        registrations: ['a', 'b'].map(name => ({
            id: `evolve:command/test/${name}`,
            validatePayload: payload => payload,
            execute(){
                executions++;
                return resultModule.commandSucceeded(null);
            },
        })),
    });

    function item(name, remaining = 1, unitsPerSlot = 1, payload = {}){
        return workItemModule.createQueuedWorkItem({
            command: {
                id: `evolve:command/test/${name}`,
                payload,
            },
            remaining,
            unitsPerSlot,
        }, bus.prepare);
    }

    return {
        ...workQueueModule,
        ...identityModule,
        item,
        executions: () => executions,
    };
}

test('M3E2 hardening fails closed on hostile queue arrays and enqueue options without invoking getters', async () => {
    const { createWorkQueue, enqueueWorkItem, item, EngineContractError } = await harness();

    let queueGetterCalls = 0;
    const accessorQueue = [];
    Object.defineProperty(accessorQueue, '0', {
        enumerable: true,
        configurable: true,
        get(){
            queueGetterCalls++;
            return item('a');
        },
    });
    Object.freeze(accessorQueue);
    assert.throws(
        () => createWorkQueue(accessorQueue),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE'
    );
    assert.equal(queueGetterCalls, 0);

    const symbolQueue = [item('a')];
    symbolQueue[Symbol('hidden')] = true;
    Object.freeze(symbolQueue);
    assert.throws(
        () => createWorkQueue(symbolQueue),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE'
    );

    const queue = createWorkQueue([item('a')]);
    let optionGetterCalls = 0;
    const options = { capacity: 2 };
    Object.defineProperty(options, 'mergePolicy', {
        enumerable: true,
        configurable: true,
        get(){
            optionGetterCalls++;
            return 'never';
        },
    });
    assert.throws(
        () => enqueueWorkItem(queue, item('b'), options),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_WORK_QUEUE_ENQUEUE_OPTIONS'
    );
    assert.equal(optionGetterCalls, 0);
});

test('M3E2 hardening pins frozen enqueue result shapes and first-match placement', async () => {
    const { createWorkQueue, enqueueWorkItem, item, executions } = await harness();
    const firstA = item('a', 1, 1, { target: 'same' });
    const secondA = item('a', 2, 1, { target: 'same' });
    const base = createWorkQueue([firstA, item('b'), secondA]);

    const success = enqueueWorkItem(
        base,
        item('a', 3, 1, { target: 'same' }),
        { mergePolicy: 'matching', capacity: 10 }
    );
    assert.equal(Object.isFrozen(success), true);
    assert.deepEqual(Object.keys(success), [
        'status',
        'queue',
        'index',
        'merged',
        'slotUsage',
    ]);
    assert.equal(success.index, 0);
    assert.equal(success.merged, true);
    assert.deepEqual(success.queue.map(entry => entry.remaining), [4, 1, 2]);

    const rejected = enqueueWorkItem(
        base,
        item('b'),
        { mergePolicy: 'never', capacity: 3 }
    );
    assert.equal(Object.isFrozen(rejected), true);
    assert.deepEqual(Object.keys(rejected), [
        'status',
        'code',
        'queue',
        'capacity',
        'requiredSlots',
    ]);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.queue, base);
    assert.equal(executions(), 0);
});

test('M3E2 hardening keeps normalization overflow atomic and leaves the source queue untouched', async () => {
    const { createWorkQueue, normalizeWorkQueue, item, EngineContractError } = await harness();
    const huge = item('a', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, { target: 'same' });
    const one = item('a', 1, Number.MAX_SAFE_INTEGER, { target: 'same' });
    const queue = createWorkQueue([huge, one]);

    assert.throws(
        () => normalizeWorkQueue(queue, 'matching'),
        error => error instanceof EngineContractError &&
            error.code === 'WORK_QUEUE_REMAINING_OVERFLOW'
    );
    assert.equal(queue.length, 2);
    assert.equal(queue[0], huge);
    assert.equal(queue[1], one);
    assert.equal(queue[0].remaining, Number.MAX_SAFE_INTEGER);
    assert.equal(queue[1].remaining, 1);
});
