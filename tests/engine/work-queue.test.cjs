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
    const registrations = ['a', 'b', 'c'].map(name => ({
        id: `evolve:command/test/${name}`,
        validatePayload: payload => payload,
        execute(){
            executions++;
            return resultModule.commandSucceeded(null);
        },
    }));
    const bus = busModule.createCommandBus({ registrations });

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

test('M3E2 work-queue module exposes only pure list operations', async () => {
    const workQueue = await workQueuePromise;
    assert.deepEqual(Object.keys(workQueue).sort(), [
        'createWorkQueue',
        'enqueueWorkItem',
        'getWorkQueueSlotUsage',
        'moveWorkItem',
        'normalizeWorkQueue',
        'removeWorkItem',
        'removeWorkItemSlots',
        'trimWorkQueueToCapacity',
    ].sort());
});

test('M3E2 WorkQueue is a detached frozen dense array and slot usage is ceil(remaining / unitsPerSlot)', async () => {
    const { createWorkQueue, getWorkQueueSlotUsage, item, executions } = await harness();
    const first = item('a', 7, 3);
    const source = [first];
    const queue = createWorkQueue(source);

    assert.equal(Object.isFrozen(queue), true);
    assert.deepEqual(queue, [first]);
    assert.notEqual(queue, source);
    assert.equal(getWorkQueueSlotUsage(queue), 3);
    source.push(item('b'));
    assert.equal(queue.length, 1);
    assert.equal(executions(), 0);
});

test('M3E2 enqueue supports never, adjacent and matching merge policies', async () => {
    const { createWorkQueue, enqueueWorkItem, item } = await harness();
    const a1 = item('a', 2, 1, { target: 'same' });
    const b = item('b');
    const a2 = item('a', 4, 1, { target: 'same' });
    const base = createWorkQueue([a1, b]);

    const never = enqueueWorkItem(base, a2, { mergePolicy: 'never', capacity: 10 });
    assert.equal(never.status, 'enqueued');
    assert.equal(never.merged, false);
    assert.deepEqual(never.queue.map(entry => entry.remaining), [2, 1, 4]);

    const adjacentMiss = enqueueWorkItem(base, a2, { mergePolicy: 'adjacent', capacity: 10 });
    assert.equal(adjacentMiss.merged, false);
    assert.deepEqual(adjacentMiss.queue.map(entry => entry.command.id), [
        'evolve:command/test/a',
        'evolve:command/test/b',
        'evolve:command/test/a',
    ]);

    const adjacentHit = enqueueWorkItem(
        createWorkQueue([a1]),
        a2,
        { mergePolicy: 'adjacent', capacity: 10 }
    );
    assert.equal(adjacentHit.merged, true);
    assert.equal(adjacentHit.index, 0);
    assert.equal(adjacentHit.queue[0].remaining, 6);

    const matching = enqueueWorkItem(base, a2, { mergePolicy: 'matching', capacity: 10 });
    assert.equal(matching.merged, true);
    assert.equal(matching.index, 0);
    assert.deepEqual(matching.queue.map(entry => entry.remaining), [6, 1]);
});

test('M3E2 merge identity includes canonical payload and unitsPerSlot', async () => {
    const { createWorkQueue, enqueueWorkItem, item } = await harness();
    const first = item('a', 1, 2, { target: { id: 'alpha' }, amount: 2 });
    const sameIntent = item('a', 3, 2, { amount: 2, target: { id: 'alpha' } });
    const differentPayload = item('a', 1, 2, { amount: 2, target: { id: 'beta' } });
    const differentUnits = item('a', 1, 1, { amount: 2, target: { id: 'alpha' } });

    const merged = enqueueWorkItem(
        createWorkQueue([first]),
        sameIntent,
        { mergePolicy: 'matching', capacity: 10 }
    );
    assert.equal(merged.merged, true);
    assert.equal(merged.queue[0].remaining, 4);

    const payloadMiss = enqueueWorkItem(
        createWorkQueue([first]),
        differentPayload,
        { mergePolicy: 'matching', capacity: 10 }
    );
    assert.equal(payloadMiss.merged, false);
    assert.equal(payloadMiss.queue.length, 2);

    const unitsMiss = enqueueWorkItem(
        createWorkQueue([first]),
        differentUnits,
        { mergePolicy: 'matching', capacity: 10 }
    );
    assert.equal(unitsMiss.merged, false);
    assert.equal(unitsMiss.queue.length, 2);
});

test('M3E2 enqueue evaluates capacity after merging and rejects ordinary capacity overflow without throwing', async () => {
    const { createWorkQueue, enqueueWorkItem, item } = await harness();
    const queue = createWorkQueue([item('a', 1, 3)]);

    const fitsByMerge = enqueueWorkItem(
        queue,
        item('a', 2, 3),
        { mergePolicy: 'adjacent', capacity: 1 }
    );
    assert.equal(fitsByMerge.status, 'enqueued');
    assert.equal(fitsByMerge.slotUsage, 1);
    assert.equal(fitsByMerge.queue[0].remaining, 3);

    const rejected = enqueueWorkItem(
        fitsByMerge.queue,
        item('a', 1, 3),
        { mergePolicy: 'adjacent', capacity: 1 }
    );
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.code, 'queue.capacity.exceeded');
    assert.equal(rejected.capacity, 1);
    assert.equal(rejected.requiredSlots, 2);
    assert.equal(rejected.queue, fitsByMerge.queue);
    assert.equal(Object.isFrozen(rejected), true);
});

test('M3E2 normalize applies adjacent or first-matching consolidation without hidden policy changes', async () => {
    const { createWorkQueue, normalizeWorkQueue, item } = await harness();
    const a1 = item('a', 1);
    const a2 = item('a', 2);
    const a3 = item('a', 3);
    const b = item('b', 1);

    const source = createWorkQueue([a1, a2, b, a3]);
    const adjacent = normalizeWorkQueue(source, 'adjacent');
    assert.deepEqual(adjacent.map(entry => entry.command.id), [
        'evolve:command/test/a',
        'evolve:command/test/b',
        'evolve:command/test/a',
    ]);
    assert.deepEqual(adjacent.map(entry => entry.remaining), [3, 1, 3]);

    const matching = normalizeWorkQueue(source, 'matching');
    assert.deepEqual(matching.map(entry => entry.command.id), [
        'evolve:command/test/a',
        'evolve:command/test/b',
    ]);
    assert.deepEqual(matching.map(entry => entry.remaining), [6, 1]);

    assert.equal(normalizeWorkQueue(source, 'never'), source);
});

test('M3E2 remove supports whole-record and legacy-equivalent slot-chunk removal', async () => {
    const { createWorkQueue, removeWorkItem, removeWorkItemSlots, item } = await harness();
    const queue = createWorkQueue([item('a', 7, 3), item('b')]);

    const oneSlot = removeWorkItemSlots(queue, 0, 1);
    assert.equal(oneSlot[0].remaining, 4);
    assert.equal(queue[0].remaining, 7);

    const twoSlots = removeWorkItemSlots(oneSlot, 0, 1);
    assert.equal(twoSlots[0].remaining, 1);

    const gone = removeWorkItemSlots(twoSlots, 0, 1);
    assert.deepEqual(gone.map(entry => entry.command.id), ['evolve:command/test/b']);

    const removed = removeWorkItem(queue, 1);
    assert.deepEqual(removed.map(entry => entry.command.id), ['evolve:command/test/a']);
});

test('M3E2 move changes order only and does not implicitly merge', async () => {
    const { createWorkQueue, moveWorkItem, item } = await harness();
    const queue = createWorkQueue([item('a', 1), item('b', 1), item('a', 2)]);
    const moved = moveWorkItem(queue, 2, 1);

    assert.deepEqual(moved.map(entry => entry.command.id), [
        'evolve:command/test/a',
        'evolve:command/test/a',
        'evolve:command/test/b',
    ]);
    assert.deepEqual(moved.map(entry => entry.remaining), [1, 2, 1]);
    assert.equal(moved.length, 3);
});

test('M3E2 trim keeps the prefix, partially trims the boundary WorkItem, and removes the suffix', async () => {
    const { createWorkQueue, getWorkQueueSlotUsage, trimWorkQueueToCapacity, item } = await harness();
    const queue = createWorkQueue([
        item('a', 2, 1),
        item('b', 7, 3),
        item('c', 1, 1),
    ]);

    assert.equal(getWorkQueueSlotUsage(queue), 6);
    const trimmed = trimWorkQueueToCapacity(queue, 3);
    assert.deepEqual(trimmed.map(entry => entry.command.id), [
        'evolve:command/test/a',
        'evolve:command/test/b',
    ]);
    assert.deepEqual(trimmed.map(entry => entry.remaining), [2, 3]);
    assert.equal(getWorkQueueSlotUsage(trimmed), 3);

    const empty = trimWorkQueueToCapacity(queue, 0);
    assert.deepEqual(empty, []);
});

test('M3E2 fails closed on malformed queues, options, indices and slot counts', async () => {
    const { createWorkQueue, enqueueWorkItem, moveWorkItem, removeWorkItemSlots, item, EngineContractError } = await harness();
    const first = item('a');
    const queue = createWorkQueue([first]);

    assert.throws(
        () => createWorkQueue([{ command: first.command, remaining: 1, unitsPerSlot: 1 }]),
        error => error instanceof EngineContractError && error.code === 'INVALID_QUEUED_WORK_ITEM'
    );
    assert.throws(
        () => enqueueWorkItem(queue, item('b'), { mergePolicy: 'mystery', capacity: 2 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE_MERGE_POLICY'
    );
    assert.throws(
        () => enqueueWorkItem(queue, item('b'), { mergePolicy: 'never', capacity: -1 }),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE_CAPACITY'
    );
    assert.throws(
        () => enqueueWorkItem(queue, item('b'), { mergePolicy: 'never', capacity: 2, pause: false }),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE_ENQUEUE_OPTIONS'
    );
    assert.throws(
        () => moveWorkItem(queue, 0, 1),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE_INDEX'
    );
    assert.throws(
        () => removeWorkItemSlots(queue, 0, 0),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE_SLOT_COUNT'
    );
});

test('M3E2 rejects remaining and aggregate slot overflows', async () => {
    const { createWorkQueue, enqueueWorkItem, item, EngineContractError } = await harness();
    const huge = item('a', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const one = item('a', 1, Number.MAX_SAFE_INTEGER);

    assert.throws(
        () => enqueueWorkItem(
            createWorkQueue([huge]),
            one,
            { mergePolicy: 'matching', capacity: Number.MAX_SAFE_INTEGER }
        ),
        error => error instanceof EngineContractError && error.code === 'WORK_QUEUE_REMAINING_OVERFLOW'
    );

    const hugeSlotsA = item('a', Number.MAX_SAFE_INTEGER, 1);
    const hugeSlotsB = item('b', Number.MAX_SAFE_INTEGER, 1);
    assert.throws(
        () => createWorkQueue([hugeSlotsA, hugeSlotsB]),
        error => error instanceof EngineContractError && error.code === 'WORK_QUEUE_SLOT_USAGE_OVERFLOW'
    );
});
