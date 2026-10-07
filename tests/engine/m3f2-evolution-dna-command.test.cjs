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

test('M3F2 DNA registration executes capacity condition then one atomic payment/effect commit', async () => {
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
    assert.equal(harness.calls.length, 2);
    assert.deepEqual(harness.calls[0], ['condition', {
        kind: 'resource.below_capacity',
        params: { resourceId: 'evolve:resource/dna' },
    }]);
    assert.deepEqual(harness.calls[1], ['commit', {
        operations: [{ kind: 'payment.resource.debit', resourceId: 'evolve:resource/rna', amount: 2 }],
    }, {
        operations: [{ kind: 'resource.grant', resourceId: 'evolve:resource/dna', amount: 1 }],
    }]);
});

test('M3F2 DNA condition rejection stops before payment/effect commit', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    let commitCalls = 0;
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        evaluateCondition: () => ({
            status: 'failed',
            reasons: [{
                code: 'condition.resource.at_capacity',
                details: { resourceId: 'evolve:resource/dna', actualAmount: 10, capacity: 10 },
            }],
        }),
        commitResourcePlans: () => { commitCalls++; return committed(); },
    });

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'condition.resource.at_capacity');
    assert.equal(commitCalls, 0);
});

test('M3F2 DNA maps final atomic settlement refusal into a structured command rejection', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus } = await modules();
    const harness = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        commitResourcePlans: () => ({
            status: 'rejected',
            reason: {
                code: 'insufficient_resource',
                details: { resourceId: 'evolve:resource/rna', required: 2, available: 1 },
            },
        }),
    });

    const result = harness.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
    assert.deepEqual(result.reasons, [{
        code: 'insufficient_resource',
        details: { available: 1, required: 2, resourceId: 'evolve:resource/rna' },
    }]);
});

test('M3F2 DNA accepts only an empty payload through both bus and exposed handler', async () => {
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
    assert.throws(
        () => harness.registration.execute({ isQueue: false }),
        error => error instanceof EngineContractError && error.code === 'INVALID_DNA_COMMAND_PAYLOAD'
    );
});

test('M3F2 DNA factory and dependency result contracts fail closed', async () => {
    const { createEvolutionDnaCommandRegistration, createCommandBus, EngineContractError } = await modules();

    assert.throws(
        () => createEvolutionDnaCommandRegistration({
            evaluateCondition: async () => satisfiedCondition(),
            commitResourcePlans: () => committed(),
        }),
        error => error instanceof EngineContractError && error.code === 'INVALID_DNA_COMMAND_CONFIG'
    );

    const malformed = createHarness(createEvolutionDnaCommandRegistration, createCommandBus, {
        commitResourcePlans: () => ({ status: 'maybe', reason: null }),
    });
    assert.throws(
        () => malformed.bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_DNA_RESOURCE_COMMIT_RESULT' &&
            error.details?.phase === 'execute'
    );
});

test('M3F2 DNA rejects direct execution reentrancy and releases the lock after failure', async () => {
    const { createEvolutionDnaCommandRegistration, EngineContractError } = await modules();
    let registration;
    let recurse = true;
    registration = createEvolutionDnaCommandRegistration({
        evaluateCondition(){
            if (recurse){
                recurse = false;
                return registration.execute({});
            }
            return satisfiedCondition();
        },
        commitResourcePlans: () => committed(),
    });

    assert.throws(
        () => registration.execute({}),
        error => error instanceof EngineContractError && error.code === 'DNA_COMMAND_REENTRANCY'
    );
    assert.deepEqual(registration.execute({}), { status: 'succeeded', data: null });
});
