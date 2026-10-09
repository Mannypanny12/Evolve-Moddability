'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const deltaPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-delta.mjs')).href);

function bounded(value){
    return { mode: 'bounded', value };
}

const CASES = Object.freeze([
    Object.freeze({ startAmount: 0, capacity: bounded(0), operations: [] }),
    Object.freeze({ startAmount: 5, capacity: bounded(0), operations: [{ kind: 'credit', amount: 10 }] }),
    Object.freeze({ startAmount: 5, capacity: bounded(0), operations: [{ kind: 'debit', amount: 2 }] }),
    Object.freeze({ startAmount: 3, capacity: bounded(100), operations: [{ kind: 'debit', amount: 5 }, { kind: 'credit', amount: 100 }] }),
    Object.freeze({ startAmount: 100, capacity: bounded(100), operations: [{ kind: 'credit', amount: 150 }] }),
    Object.freeze({ startAmount: 150, capacity: bounded(100), operations: [] }),
    Object.freeze({ startAmount: 0.1, capacity: bounded(10), operations: [{ kind: 'credit', amount: 0.2 }, { kind: 'debit', amount: 0.05 }] }),
    Object.freeze({ startAmount: 5, capacity: { mode: 'unbounded' }, operations: [{ kind: 'credit', amount: 10 }, { kind: 'debit', amount: 3 }] }),
]);

test('M4C resource-delta evidence remains internally continuous and aggregate fields match their step evidence', async () => {
    const { resolveResourceDelta } = await deltaPromise;

    for (const input of CASES){
        const result = resolveResourceDelta(input);
        let previous = result.startAmount;
        let requestedDelta = 0;
        let operationAppliedDelta = 0;
        let overflow = 0;
        let shortfall = 0;

        for (let index = 0; index < result.steps.length; index++){
            const step = result.steps[index];
            assert.equal(step.before, previous, `step ${index} must continue from the previous amount`);
            assert.equal(step.appliedDelta, step.after - step.before);
            assert.equal(step.overflow >= 0, true);
            assert.equal(step.shortfall >= 0, true);

            requestedDelta += step.kind === 'credit' ? step.requested : -step.requested;
            operationAppliedDelta += step.appliedDelta;
            overflow += step.overflow;
            shortfall += step.shortfall;
            previous = step.after;
        }

        assert.equal(result.bufferedEndAmount, previous);
        assert.equal(result.requestedDelta, Object.is(requestedDelta, -0) ? 0 : requestedDelta);
        assert.equal(result.operationAppliedDelta, Object.is(operationAppliedDelta, -0) ? 0 : operationAppliedDelta);
        assert.equal(result.overflow, Object.is(overflow, -0) ? 0 : overflow);
        assert.equal(result.shortfall, Object.is(shortfall, -0) ? 0 : shortfall);
        assert.equal(result.finalCapacityDiscard, result.bufferedEndAmount - result.endAmount);
        assert.equal(result.netAppliedDelta, result.endAmount - result.startAmount);
    }
});
