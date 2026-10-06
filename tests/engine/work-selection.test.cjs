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
const resultPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/result.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function harness(){
    const [busModule, workItemModule, workQueueModule, selectionModule, resultModule, identityModule] = await Promise.all([
        busPromise,
        workItemPromise,
        workQueuePromise,
        selectionPromise,
        resultPromise,
        identityPromise,
    ]);
    let executions = 0;
    const registrations = ['a', 'b', 'c', 'd'].map(name => ({
        id: `evolve:command/test/${name}`,
        validatePayload: payload => payload,
        execute(){
            executions++;
            return resultModule.commandSucceeded(null);
        },
    }));
    const bus = busModule.createCommandBus({ registrations });

    function item(name, payload = {}){
        return workItemModule.createQueuedWorkItem({
            command: { id: `evolve:command/test/${name}`, payload },
            remaining: 1,
            unitsPerSlot: 1,
        }, bus.prepare);
    }

    return {
        ...workQueueModule,
        ...selectionModule,
        ...identityModule,
        item,
        executions: () => executions,
    };
}

function reason(code, details = null){
    return { code, details };
}

test('M3E3 work-selection module and selector facade expose only the reviewed surface', async () => {
    const selection = await selectionPromise;
    assert.deepEqual(Object.keys(selection), ['createWorkQueueSelector']);
    const selector = selection.createWorkQueueSelector(() => ({ status: 'ready', reasons: [] }));
    assert.deepEqual(Object.keys(selector).sort(), ['evaluate', 'select']);
    assert.equal(Object.isFrozen(selector), true);
});

test('M3E3 evaluate normalizes, detaches and deeply freezes transient readiness data', async () => {
    const { createWorkQueueSelector, item, executions } = await harness();
    const details = { z: 2, a: { value: -0 } };
    const raw = { status: 'waiting', reasons: [reason('queue.readiness.waiting', details)] };
    const selector = createWorkQueueSelector(() => raw);
    const workItem = item('a');

    const result = selector.evaluate(workItem);
    assert.equal(result.status, 'waiting');
    assert.deepEqual(Object.keys(result.reasons[0].details), ['a', 'z']);
    assert.equal(Object.is(result.reasons[0].details.a.value, -0), false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.reasons), true);
    assert.equal(Object.isFrozen(result.reasons[0]), true);
    assert.equal(Object.isFrozen(result.reasons[0].details), true);
    assert.equal(Object.isFrozen(result.reasons[0].details.a), true);
    assert.notEqual(result.reasons[0].details, details);

    details.z = 99;
    details.a.value = 4;
    raw.reasons.push(reason('queue.readiness.later'));
    assert.equal(result.reasons.length, 1);
    assert.equal(result.reasons[0].details.z, 2);
    assert.equal(result.reasons[0].details.a.value, 0);
    assert.equal(executions(), 0);
});

test('M3E3 ordered selection skips bypass entries but stops on the first waiting blocker', async () => {
    const { createWorkQueue, createWorkQueueSelector, item } = await harness();
    const queue = createWorkQueue([item('a'), item('b'), item('c')]);
    const calls = [];
    const states = new Map([
        ['evolve:command/test/a', { status: 'bypass', reasons: [reason('queue.readiness.bypass')] }],
        ['evolve:command/test/b', { status: 'waiting', reasons: [reason('queue.readiness.waiting')] }],
        ['evolve:command/test/c', { status: 'ready', reasons: [] }],
    ]);
    const selector = createWorkQueueSelector(workItem => {
        calls.push(workItem.command.id);
        return states.get(workItem.command.id);
    });

    const result = selector.select(queue, 'ordered');
    assert.deepEqual(calls, ['evolve:command/test/a', 'evolve:command/test/b']);
    assert.equal(result.status, 'none');
    assert.equal(result.policy, 'ordered');
    assert.equal(result.selectedIndex, null);
    assert.deepEqual(result.evaluations.map(entry => entry.index), [0, 1]);
    assert.deepEqual(result.evaluations.map(entry => entry.readiness.status), ['bypass', 'waiting']);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.evaluations), true);
    assert.equal(Object.isFrozen(result.evaluations[0]), true);
});

test('M3E3 ordered selection chooses the first ready item after bypass entries', async () => {
    const { createWorkQueue, createWorkQueueSelector, item } = await harness();
    const queue = createWorkQueue([item('a'), item('b'), item('c')]);
    const selector = createWorkQueueSelector(workItem =>
        workItem.command.id === 'evolve:command/test/c'
            ? { status: 'ready', reasons: [] }
            : { status: 'bypass', reasons: [reason('queue.readiness.bypass')] }
    );

    const result = selector.select(queue, 'ordered');
    assert.equal(result.status, 'selected');
    assert.equal(result.selectedIndex, 2);
    assert.deepEqual(result.evaluations.map(entry => entry.index), [0, 1, 2]);
});

test('M3E3 first-ready selection skips both waiting and bypass entries', async () => {
    const { createWorkQueue, createWorkQueueSelector, item } = await harness();
    const queue = createWorkQueue([item('a'), item('b'), item('c'), item('d')]);
    const calls = [];
    const selector = createWorkQueueSelector(workItem => {
        calls.push(workItem.command.id);
        if (workItem.command.id === 'evolve:command/test/a'){
            return { status: 'waiting', reasons: [reason('queue.readiness.waiting')] };
        }
        if (workItem.command.id === 'evolve:command/test/b'){
            return { status: 'bypass', reasons: [reason('queue.readiness.bypass')] };
        }
        return { status: 'ready', reasons: [] };
    });

    const result = selector.select(queue, 'first-ready');
    assert.equal(result.status, 'selected');
    assert.equal(result.selectedIndex, 2);
    assert.deepEqual(calls, [
        'evolve:command/test/a',
        'evolve:command/test/b',
        'evolve:command/test/c',
    ]);
    assert.deepEqual(result.evaluations.map(entry => entry.readiness.status), ['waiting', 'bypass', 'ready']);
});

test('M3E3 empty and all-unready queues return a frozen none result without mutating the queue', async () => {
    const { createWorkQueue, createWorkQueueSelector, item } = await harness();
    let calls = 0;
    const selector = createWorkQueueSelector(() => {
        calls++;
        return { status: 'bypass', reasons: [reason('queue.readiness.bypass')] };
    });
    const empty = createWorkQueue([]);
    const emptyResult = selector.select(empty, 'ordered');
    assert.equal(emptyResult.status, 'none');
    assert.equal(emptyResult.selectedIndex, null);
    assert.deepEqual(emptyResult.evaluations, []);
    assert.equal(calls, 0);

    const queue = createWorkQueue([item('a'), item('b')]);
    const before = queue.slice();
    const none = selector.select(queue, 'first-ready');
    assert.equal(none.status, 'none');
    assert.equal(none.selectedIndex, null);
    assert.deepEqual(queue, before);
    assert.equal(calls, 2);
});

test('M3E3 rejects malformed readiness status/reason combinations and hostile details', async () => {
    const { createWorkQueueSelector, item, EngineContractError } = await harness();
    const workItem = item('a');
    const invalid = [
        { status: 'unknown', reasons: [] },
        { status: 'ready', reasons: [reason('queue.readiness.nope')] },
        { status: 'waiting', reasons: [] },
        { status: 'bypass', reasons: [] },
        { status: 'ready', reasons: [], extra: true },
        { status: 'waiting', reasons: [{ code: 'Bad Code', details: null }] },
        { status: 'waiting', reasons: [{ code: 'queue.readiness.waiting', details: [] }] },
    ];
    for (const raw of invalid){
        const selector = createWorkQueueSelector(() => raw);
        assert.throws(
            () => selector.evaluate(workItem),
            error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
        );
    }

    let getterCalls = 0;
    const accessorDetails = {};
    Object.defineProperty(accessorDetails, 'secret', {
        enumerable: true,
        get(){ getterCalls++; return 1; },
    });
    const accessorSelector = createWorkQueueSelector(() => ({
        status: 'waiting',
        reasons: [reason('queue.readiness.waiting', accessorDetails)],
    }));
    assert.throws(
        () => accessorSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );
    assert.equal(getterCalls, 0);

    const symbolDetails = { safe: true };
    symbolDetails[Symbol('hidden')] = 1;
    const symbolSelector = createWorkQueueSelector(() => ({
        status: 'waiting',
        reasons: [reason('queue.readiness.waiting', symbolDetails)],
    }));
    assert.throws(
        () => symbolSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );
});

test('M3E3 readiness detail canonicalization is prototype-safe and rejects shared identity/cycles', async () => {
    const { createWorkQueueSelector, item, EngineContractError } = await harness();
    const workItem = item('a');

    const protoDetails = {};
    Object.defineProperty(protoDetails, '__proto__', {
        value: { marker: 1 },
        enumerable: true,
        writable: true,
        configurable: true,
    });
    const safeSelector = createWorkQueueSelector(() => ({
        status: 'waiting',
        reasons: [reason('queue.readiness.waiting', protoDetails)],
    }));
    const safe = safeSelector.evaluate(workItem);
    assert.equal(Object.getPrototypeOf(safe.reasons[0].details), Object.prototype);
    assert.equal(Object.prototype.hasOwnProperty.call(safe.reasons[0].details, '__proto__'), true);
    assert.deepEqual(safe.reasons[0].details.__proto__, { marker: 1 });

    const shared = { value: 1 };
    const sharedSelector = createWorkQueueSelector(() => ({
        status: 'waiting',
        reasons: [
            reason('queue.readiness.one', shared),
            reason('queue.readiness.two', shared),
        ],
    }));
    assert.throws(
        () => sharedSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );

    const cyclic = {};
    cyclic.self = cyclic;
    const cycleSelector = createWorkQueueSelector(() => ({
        status: 'waiting',
        reasons: [reason('queue.readiness.cycle', cyclic)],
    }));
    assert.throws(
        () => cycleSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );
});

test('M3E3 rejects thenables synchronously without invoking accessor-based then properties', async () => {
    const { createWorkQueueSelector, item, EngineContractError } = await harness();
    const workItem = item('a');
    const promiseSelector = createWorkQueueSelector(() => Promise.resolve({ status: 'ready', reasons: [] }));
    assert.throws(
        () => promiseSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );

    let thenCalls = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'then', {
        enumerable: true,
        get(){ thenCalls++; return () => {}; },
    });
    const hostileSelector = createWorkQueueSelector(() => hostile);
    assert.throws(
        () => hostileSelector.evaluate(workItem),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_RESULT'
    );
    assert.equal(thenCalls, 0);
});

test('M3E3 wraps evaluator failures without retaining hostile thrown objects and invokes evaluator context-free', async () => {
    const { createWorkQueueSelector, item, EngineContractError } = await harness();
    const workItem = item('a');
    let observedThis = 'not-called';
    const selector = createWorkQueueSelector(function(){
        observedThis = this;
        throw new Error('secret-evaluator-message');
    });

    assert.throws(
        () => selector.evaluate(workItem),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'WORK_READINESS_EVALUATION_FAILURE');
            assert.equal(error.details.commandId, 'evolve:command/test/a');
            assert.equal(error.details.evaluatorCauseCode, null);
            assert.equal(JSON.stringify(error.details).includes('secret-evaluator-message'), false);
            return true;
        }
    );
    assert.equal(observedThis, undefined);
});

test('M3E3 rejects nested selector operations and recovers the lock after failure', async () => {
    const { createWorkQueue, createWorkQueueSelector, item, EngineContractError } = await harness();
    const workItem = item('a');
    const queue = createWorkQueue([workItem]);
    let selector;
    let recurse = true;
    selector = createWorkQueueSelector(current => {
        if (recurse){
            recurse = false;
            return selector.evaluate(current);
        }
        return { status: 'ready', reasons: [] };
    });

    assert.throws(
        () => selector.select(queue, 'ordered'),
        error => error instanceof EngineContractError && error.code === 'WORK_SELECTION_REENTRANCY'
    );

    const recovered = selector.select(queue, 'ordered');
    assert.equal(recovered.status, 'selected');
    assert.equal(recovered.selectedIndex, 0);
});

test('M3E3 validates evaluator, WorkItem, WorkQueue and policy contracts before selection', async () => {
    const { createWorkQueue, createWorkQueueSelector, item, EngineContractError } = await harness();
    assert.throws(
        () => createWorkQueueSelector(null),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_READINESS_EVALUATOR'
    );
    const selector = createWorkQueueSelector(() => ({ status: 'ready', reasons: [] }));
    const workItem = item('a');
    assert.throws(
        () => selector.evaluate({ ...workItem }),
        error => error instanceof EngineContractError
    );
    assert.throws(
        () => selector.select([workItem], 'ordered'),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_QUEUE'
    );
    assert.throws(
        () => selector.select(createWorkQueue([workItem]), 'random'),
        error => error instanceof EngineContractError && error.code === 'INVALID_WORK_SELECTION_POLICY'
    );
    const hostilePolicy = { secret: true };
    assert.throws(
        () => selector.select(createWorkQueue([workItem]), hostilePolicy),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_WORK_SELECTION_POLICY');
            assert.equal(error.details.valueType, 'object');
            assert.equal(Object.values(error.details).includes(hostilePolicy), false);
            return true;
        }
    );
});
