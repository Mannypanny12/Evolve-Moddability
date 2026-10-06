'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const workItemPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-item.mjs')).href);
const workQueuePromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-queue.mjs')).href);
const selectionPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-selection.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [bus, workItem, workQueue, selection, result, identity] = await Promise.all([
        busPromise,
        workItemPromise,
        workQueuePromise,
        selectionPromise,
        resultPromise,
        identityPromise,
    ]);
    return { ...bus, ...workItem, ...workQueue, ...selection, ...result, ...identity };
}

function createHarness(loaded){
    const bus = loaded.createCommandBus({
        registrations: [{
            id: 'evolve:command/review/test',
            validatePayload(payload){
                if (!Number.isSafeInteger(payload.amount) || payload.amount <= 0){
                    throw new loaded.EngineContractError(
                        'INVALID_REVIEW_AMOUNT',
                        'amount must be a positive safe integer',
                        { path: 'command.payload.amount' }
                    );
                }
                return { amount: payload.amount };
            },
            execute(){
                return loaded.commandSucceeded(null);
            },
        }],
    });

    function item(remaining = 1, unitsPerSlot = 1, amount = 1){
        return loaded.createQueuedWorkItem({
            command: {
                id: 'evolve:command/review/test',
                payload: { amount },
            },
            remaining,
            unitsPerSlot,
        }, bus.prepare);
    }

    return { bus, item };
}

test('M3E review hardening rejects replacement-preparer output with non-canonical object prototypes', async () => {
    const loaded = await modules();
    const raw = {
        command: { id: 'evolve:command/review/test', payload: { amount: 1 } },
        remaining: 1,
        unitsPerSlot: 1,
    };

    const nullPayload = Object.create(null);
    Object.defineProperty(nullPayload, 'amount', {
        value: 1,
        enumerable: true,
        writable: false,
        configurable: false,
    });
    Object.freeze(nullPayload);
    assert.throws(
        () => loaded.createQueuedWorkItem(raw, () => Object.freeze({
            id: 'evolve:command/review/test',
            payload: nullPayload,
        })),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_PREPARED_COMMAND' &&
            error.details?.path === 'workItem.command.payload'
    );

    const nullPrepared = Object.assign(Object.create(null), {
        id: 'evolve:command/review/test',
        payload: Object.freeze({ amount: 1 }),
    });
    Object.freeze(nullPrepared);
    assert.throws(
        () => loaded.createQueuedWorkItem(raw, () => nullPrepared),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_PREPARED_COMMAND' &&
            error.details?.path === 'workItem.command'
    );

    const nullNested = Object.create(null);
    Object.defineProperty(nullNested, 'value', {
        value: 1,
        enumerable: true,
        writable: false,
        configurable: false,
    });
    Object.freeze(nullNested);
    assert.throws(
        () => loaded.createQueuedWorkItem(raw, () => Object.freeze({
            id: 'evolve:command/review/test',
            payload: Object.freeze({ nested: nullNested }),
        })),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_PREPARED_COMMAND' &&
            error.details?.path === 'workItem.command.payload.nested'
    );
});

test('M3E review hardening prevents hand-forged structural WorkItems from entering WorkQueue or selection', async () => {
    const loaded = await modules();
    const forged = Object.freeze({
        command: Object.freeze({
            id: 'evolve:command/review/test',
            payload: Object.freeze({ amount: 0 }),
        }),
        remaining: 1,
        unitsPerSlot: 1,
    });

    assert.throws(
        () => loaded.createWorkQueue([forged]),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_QUEUED_WORK_ITEM' &&
            error.details?.reason === 'unverified-construction'
    );

    const selector = loaded.createWorkQueueSelector(() => ({ status: 'ready', reasons: [] }));
    assert.throws(
        () => selector.evaluate(forged),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_QUEUED_WORK_ITEM' &&
            error.details?.reason === 'unverified-construction'
    );

    const { item } = createHarness(loaded);
    const constructed = item();
    const copied = Object.freeze({ ...constructed });
    assert.throws(
        () => loaded.createWorkQueue([copied]),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'INVALID_QUEUED_WORK_ITEM' &&
            error.details?.reason === 'unverified-construction'
    );
    assert.equal(loaded.createWorkQueue([constructed])[0], constructed);
});

test('M3E review hardening preserves WorkItem provenance across internal merge and trim rebuilds', async () => {
    const loaded = await modules();
    const { item } = createHarness(loaded);
    const base = loaded.createWorkQueue([item(1, 2)]);
    const merged = loaded.enqueueWorkItem(base, item(2, 2), {
        mergePolicy: 'adjacent',
        capacity: 2,
    });

    assert.equal(merged.status, 'enqueued');
    assert.equal(merged.queue[0].remaining, 3);
    assert.equal(loaded.getWorkQueueSlotUsage(merged.queue), 2);

    const trimmed = loaded.trimWorkQueueToCapacity(merged.queue, 1);
    assert.equal(trimmed[0].remaining, 2);
    assert.equal(loaded.getWorkQueueSlotUsage(trimmed), 1);

    const selector = loaded.createWorkQueueSelector(() => ({ status: 'ready', reasons: [] }));
    assert.equal(selector.evaluate(merged.queue[0]).status, 'ready');
    assert.equal(selector.evaluate(trimmed[0]).status, 'ready');
});

test('M3E review hardening rejects nested readiness operations across selector instances and releases the shared lock', async () => {
    const loaded = await modules();
    const { item } = createHarness(loaded);
    const workItem = item();

    const second = loaded.createWorkQueueSelector(() => ({ status: 'ready', reasons: [] }));
    const first = loaded.createWorkQueueSelector(current => second.evaluate(current));

    assert.throws(
        () => first.evaluate(workItem),
        error => error instanceof loaded.EngineContractError &&
            error.code === 'WORK_SELECTION_REENTRANCY'
    );

    assert.deepEqual(second.evaluate(workItem), {
        status: 'ready',
        reasons: [],
    });
});
