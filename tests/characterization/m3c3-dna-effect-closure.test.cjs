'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const root = path.resolve(__dirname, '../..');
const effectPlanPromise = import(pathToFileURL(path.join(root, 'src/engine/effects/effect-plan.mjs')).href);

function installDnaState({ rna = 10, dna = 0, dnaMax = 10 } = {}){
    const state = legacy.pristineLegacyState();
    state.resource.RNA = {
        ...(state.resource.RNA || {}),
        amount: rna,
        max: 100,
        delta: 0,
        display: true,
    };
    state.resource.DNA = {
        ...(state.resource.DNA || {}),
        amount: dna,
        max: dnaMax,
        delta: 0,
        display: true,
    };
    state.race.evoFinalMenu = false;
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

async function createDnaEffectPlan(){
    const { createEffectPlan } = await effectPlanPromise;
    return createEffectPlan([
        {
            kind: 'resource.grant',
            resourceId: 'evolve:resource/dna',
            amount: 1,
        },
    ]);
}

function resourceDeltas(plan){
    const deltas = {};
    for (const operation of plan.operations){
        const direction = operation.kind === 'resource.grant'
            ? 1
            : operation.kind === 'resource.consume'
                ? -1
                : null;
        if (direction === null){
            throw new Error(`Unexpected M3C3 operation kind: ${operation.kind}`);
        }
        deltas[operation.resourceId] = (deltas[operation.resourceId] || 0) + direction * operation.amount;
    }
    return deltas;
}

function observedLegacyDeltas(state, before){
    return {
        RNA: state.resource.RNA.amount - before.RNA,
        DNA: state.resource.DNA.amount - before.DNA,
    };
}

test('M3C3 decomposes successful legacy DNA execution into payment evidence plus one DNA effect', async () => {
    const state = installDnaState({ rna: 2, dna: 9, dnaMax: 10 });
    const before = {
        RNA: state.resource.RNA.amount,
        DNA: state.resource.DNA.amount,
    };

    assert.deepEqual(legacy.rawActionCosts('evolution', 'dna'), { RNA: 2 });
    const legacyResult = legacy.executeAction('evolution', 'dna', { isQueue: false });
    const observed = observedLegacyDeltas(state, before);

    assert.equal(legacyResult, false);
    assert.deepEqual(observed, { RNA: -2, DNA: 1 });

    const plan = await createDnaEffectPlan();
    assert.deepEqual(plan, {
        operations: [
            {
                kind: 'resource.grant',
                resourceId: 'evolve:resource/dna',
                amount: 1,
            },
        ],
    });
    assert.deepEqual(resourceDeltas(plan), {
        'evolve:resource/dna': 1,
    });

    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations.some(operation => operation.kind === 'resource.consume'), false);
    assert.equal(plan.operations.some(operation => operation.resourceId === 'evolve:resource/rna'), false);
});

test('M3C3 effect definition remains +1 DNA when current legacy state cannot execute it', async () => {
    const plan = await createDnaEffectPlan();

    for (const scenario of [
        { rna: 1, dna: 0, dnaMax: 10 },
        { rna: 10, dna: 10, dnaMax: 10 },
    ]){
        const state = installDnaState(scenario);
        const before = {
            RNA: state.resource.RNA.amount,
            DNA: state.resource.DNA.amount,
        };

        const legacyResult = legacy.executeAction('evolution', 'dna', { isQueue: false });
        assert.equal(legacyResult, false);
        assert.deepEqual(observedLegacyDeltas(state, before), { RNA: 0, DNA: 0 });
        assert.deepEqual(resourceDeltas(plan), { 'evolve:resource/dna': 1 });
    }
});

test('M3C3 DNA effect plan carries only the closed generic operation contract', async () => {
    const plan = await createDnaEffectPlan();
    const operation = plan.operations[0];

    assert.deepEqual(Object.keys(plan), ['operations']);
    assert.deepEqual(Object.keys(operation), ['kind', 'resourceId', 'amount']);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.operations), true);
    assert.equal(Object.isFrozen(operation), true);

    for (const forbidden of [
        'cost',
        'price',
        'payment',
        'condition',
        'capacity',
        'display',
        'evoFinalMenu',
        'callback',
        'effectText',
    ]){
        assert.equal(Object.prototype.hasOwnProperty.call(operation, forbidden), false);
    }
});
