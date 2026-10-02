'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkerHarness } = require('../legacy/worker-harness.cjs');
const { LEGACY_CADENCE } = require('../simulation/legacy-cadence.cjs');

test('timer worker schedules the first main-loop callback at the requested period', () => {
    const worker = createWorkerHarness();

    worker.send({ loop: 'start', period: 250 });

    assert.equal(worker.pendingTimerCount(), 1);
    assert.equal(worker.nextDelay(), 250);

    worker.runNext();

    assert.deepEqual(worker.messages, [
        { loop: 'main', periods: 1 }
    ]);
    assert.equal(worker.pendingTimerCount(), 1);
});

test('timer worker reports catch-up periods after large scheduling jitter', () => {
    const worker = createWorkerHarness();

    worker.send({ loop: 'start', period: 250 });
    worker.runNext(500);

    assert.deepEqual(worker.messages, [
        { loop: 'main', periods: LEGACY_CADENCE.representativeCatchUpPeriods }
    ]);
});

test('timer worker clear message cancels the pending timer', () => {
    const worker = createWorkerHarness();

    worker.send({ loop: 'start', period: 250 });
    assert.equal(worker.pendingTimerCount(), 1);

    worker.send({ loop: 'clear' });

    assert.equal(worker.pendingTimerCount(), 0);
});
