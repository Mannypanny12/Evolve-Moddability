'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const workItemPromise = import(pathToFileURL(path.join(root, 'src/engine/queue/work-item.mjs')).href);
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);

async function modules(){
    const [bus, workItem, result] = await Promise.all([busPromise, workItemPromise, resultPromise]);
    return { ...bus, ...workItem, ...result };
}

test('M3E1 defensive canonical-order verification accepts real prepared payloads with numeric-like keys', async () => {
    const { createCommandBus, createQueuedWorkItem, commandSucceeded } = await modules();
    const bus = createCommandBus({
        registrations: [{
            id: 'evolve:command/test',
            validatePayload(){
                return { '10': 'ten', '2': 'two', z: true, a: true };
            },
            execute: () => commandSucceeded(null),
        }],
    });

    const item = createQueuedWorkItem({
        command: { id: 'evolve:command/test', payload: {} },
        remaining: 1,
        unitsPerSlot: 1,
    }, bus.prepare);

    assert.deepEqual(Reflect.ownKeys(item.command.payload), ['2', '10', 'a', 'z']);
    assert.equal(item.command.payload['2'], 'two');
    assert.equal(item.command.payload['10'], 'ten');
});
