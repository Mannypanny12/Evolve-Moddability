'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const workItemPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-item.mjs')).href);
const workQueuePromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-queue.mjs')).href);
const selectionPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-selection.mjs')).href);

async function load(){
    return Promise.all([busPromise, workItemPromise, workQueuePromise, selectionPromise]);
}

test('M3E4 composes prepare -> WorkItem -> WorkQueue -> selection without command execution', async () => {
    const [busModule, workItemModule, workQueueModule, selectionModule] = await load();
    let executions = 0;
    const bus = busModule.createCommandBus({
        registrations: [{
            id: 'evolve:command/test/queued-work',
            validatePayload(payload){
                return { amount: payload.amount };
            },
            execute(){
                executions++;
                throw new Error('M3E closure pipeline must not execute command handlers.');
            },
        }],
    });

    const item = workItemModule.createQueuedWorkItem({
        command: {
            id: 'evolve:command/test/queued-work',
            payload: { amount: 2 },
        },
        remaining: 3,
        unitsPerSlot: 2,
    }, bus.prepare);

    const queue = workQueueModule.createWorkQueue([item]);
    const selector = selectionModule.createWorkQueueSelector(workItem => ({
        status: workItem.command.payload.amount === 2 ? 'ready' : 'bypass',
        reasons: workItem.command.payload.amount === 2
            ? []
            : [{ code: 'queue.test.not_ready', details: null }],
    }));
    const result = selector.select(queue, 'ordered');

    assert.equal(result.status, 'selected');
    assert.equal(result.selectedIndex, 0);
    assert.equal(result.evaluations.length, 1);
    assert.equal(result.evaluations[0].readiness.status, 'ready');
    assert.equal(workQueueModule.getWorkQueueSlotUsage(queue), 2);
    assert.equal(executions, 0);
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(queue), true);
    assert.equal(Object.isFrozen(result), true);
});

test('M3E4 enqueue and selection remain structural/transient rather than queue admission authority', async () => {
    const [busModule, workItemModule, workQueueModule, selectionModule] = await load();
    let executions = 0;
    const bus = busModule.createCommandBus({
        registrations: [{
            id: 'evolve:command/test/structural-only',
            validatePayload: payload => payload,
            execute(){ executions++; return { status: 'success', events: [] }; },
        }],
    });
    const item = workItemModule.createQueuedWorkItem({
        command: { id: 'evolve:command/test/structural-only', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    }, bus.prepare);
    const empty = workQueueModule.createWorkQueue([]);
    const enqueue = workQueueModule.enqueueWorkItem(empty, item, {
        mergePolicy: 'never',
        capacity: 1,
    });
    const selector = selectionModule.createWorkQueueSelector(() => ({
        status: 'bypass',
        reasons: [{ code: 'queue.test.not_admitted', details: null }],
    }));
    const selected = selector.select(enqueue.queue, 'first-ready');

    assert.equal(enqueue.status, 'enqueued');
    assert.equal(selected.status, 'none');
    assert.equal(selected.selectedIndex, null);
    assert.equal(executions, 0);
});
