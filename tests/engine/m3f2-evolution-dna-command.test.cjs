'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const commandPromise = import(pathToFileURL(path.join(root, 'src/content/evolve/commands/evolution-dna.mjs')).href);
const busPromise = import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [command, bus, identity] = await Promise.all([commandPromise, busPromise, identityPromise]);
    return { ...command, ...bus, ...identity };
}

function satisfiedCondition(){
    return { status: 'satisfied', reasons: [] };
}

function affordable(){
    return { assessment: 'current-affordability', status: 'satisfied', reasons: [] };
}

function committed(){
    return { status: 'committed', reason: null };
}

function createHarness(createEvolutionDnaCommandRegistration, createCommandBus, overrides = {}){
    const calls = [];
    const registration = createEvolutionDnaCommandRegistration({
        evaluateCondition: overrides.evaluateCondition || (condition => {
            calls.push(['condition', condition]);
            return satisfiedCondition();
        }),
        assessCurrentAffordability: overrides.assessCurrentAffordability || (quote => {
            calls.push(['affordability', quote]);
            return affordable();
        }),
        commitResourcePlans: overrides.commitResourcePlans || ((paymentPlan, effectPlan) => {
            calls.push(['commit', paymentPlan, effectPlan]);
            return committed();
        }),
    });
    return {
        calls,
        registration,
        bus: createCommandBus({ registrations: [registration] }),
    };
}

test('M3F2 DNA registration executes condition, current affordability and atomic resource commit in order', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus);

    assert.equal(harness.registration.id, 'evolve:command/evolution/dna');
    assert.equal(Object.isFrozen(harness.registration), true);

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });

    assert.deepEqual(result, {
        commandId: 'evolve:command/evolution/dna',
        status: 'succeeded',
        data: null,
        reasons: [],
    });
    assert.equal(harness.calls.length, 3);
    assert.deepEqual(harness.calls[0], ['condition', {
        kind: 'resource.below_capacity',
        params: { resourceId: 'evolve:resource/dna' },
    }]);
    assert.deepEqual(harness.calls[1], ['affordability', {
        lines: [{ kind: 'resource', resourceId: 'evolve:resource/rna', amount: 2 }],
    }]);
    assert.deepEqual(harness.calls[2], ['commit', {
        operations: [{ kind: 'payment.resource.debit', resourceId: 'evolve:resource/rna', amount: 2 }],
    }, {
        operations: [{ kind: 'resource.grant', resourceId: 'evolve:resource/dna', amount: 1 }],
    }]);
});

test('M3F2 DNA condition rejection stops before payment assessment and commit', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    let affordabilityCalls = 0;
    let commitCalls = 0;
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        evaluateCondition: () => ({
            status: 'failed',
            reasons: [{
                code: 'condition.resource.at_capacity',
                details: { resourceId: 'evolve:resource/dna', actualAmount: 10, capacity: 10 },
            }],
        }),
        assessCurrentAffordability: () => { affordabilityCalls++; return affordable(); },
        commitResourcePlans: () => { commitCalls++; return committed(); },
    });

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'condition.resource.at_capacity');
    assert.equal(affordabilityCalls, 0);
    assert.equal(commitCalls, 0);
});

test('M3F2 DNA affordability rejection stops before commit and preserves payment reason', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    let commitCalls = 0;
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        assessCurrentAffordability: () => ({
            assessment: 'current-affordability',
            status: 'failed',
            reasons: [{
                code: 'payment.current.resource.amount_insufficient',
                details: {
                    lineIndex: 0,
                    resourceId: 'evolve:resource/rna',
                    requiredAmount: 2,
                    currentAmount: 1,
                },
            }],
        }),
        commitResourcePlans: () => { commitCalls++; return committed(); },
    });

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'payment.current.resource.amount_insufficient');
    assert.equal(commitCalls, 0);
});

test('M3F2 DNA maps final atomic commit refusal into a structured command rejection', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        commitResourcePlans: () => ({
            status: 'rejected',
            reason: {
                code: 'resource_at_capacity',
                details: { resourceId: 'evolve:resource/dna', amount: 10, capacity: 10 },
            },
        }),
    });

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
    assert.deepEqual(result.reasons, [{
        code: 'resource_at_capacity',
        details: { amount: 10, capacity: 10, resourceId: 'evolve:resource/dna' },
    }]);
});

test('M3F2 DNA accepts only an empty command payload', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus, EngineContractError } = await modules();
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus);

    assert.deepEqual(
        harness.bus.prepare({ id: 'evolve:command/evolution/dna', payload: {} }),
        { id: 'evolve:command/evolution/dna', payload: {} }
    );
    assert.throws(
        () => harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: { isQueue: false } }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_DNA_COMMAND_PAYLOAD' &&
            error.details?.phase === 'validate'
    );
});

test('M3F2 DNA factory and dependency result contracts fail closed', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus, EngineContractError } = await modules();

    assert.throws(
        () => createEvolutionDnaCommandRegistration({
            evaluateCondition: async () => satisfiedCondition(),
            assessCurrentAffordability: () => affordable(),
            commitResourcePlans: () => committed(),
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_DNA_COMMAND_CONFIG'
    );

    const malformed = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        assessCurrentAffordability: () => ({
            assessment: 'queue-payment-feasibility',
            status: 'satisfied',
            reasons: [],
        }),
    });
    assert.throws(
        () => malformed.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_DNA_PAYMENT_ASSESSMENT' &&
            error.details?.phase === 'execute'
    );
});
