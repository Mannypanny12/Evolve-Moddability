'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

let modulesPromise;
function loadModules(){
    if (!modulesPromise){
        modulesPromise = Promise.all([
            import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/engine/conditions/core-requirements.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/engine/execution/resource-commit.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/content/evolve/commands/evolution-dna.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-condition-read-adapter.mjs')).href),
            import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-resource-commit-adapter.mjs')).href),
        ]).then(([
            commandBus,
            conditionEvaluator,
            coreRequirements,
            resourceCommit,
            dnaCommand,
            conditionAdapter,
            commitAdapter,
        ]) => ({
            commandBus,
            conditionEvaluator,
            coreRequirements,
            resourceCommit,
            dnaCommand,
            conditionAdapter,
            commitAdapter,
        }));
    }
    return modulesPromise;
}

function makeState({ rna = 10, rnaMax = 100, dna = 0, dnaMax = 100, dnaRecord = null } = {}){
    return {
        stats: { achieve: {} },
        resource: {
            RNA: { amount: rna, max: rnaMax, display: true },
            DNA: dnaRecord || { amount: dna, max: dnaMax, display: true },
        },
    };
}

function failThenRecoveringResource({ amount = 0, max = 100, failRollback = false } = {}){
    const target = { amount, max, display: true };
    let amountWrites = 0;
    return new Proxy(target, {
        set(record, field, value){
            if (field !== 'amount') return Reflect.set(record, field, value);
            amountWrites++;
            if (amountWrites === 1) return false;
            if (failRollback) return false;
            return Reflect.set(record, field, value);
        },
    });
}

async function createHarness(state, { afterCondition = null } = {}){
    const modules = await loadModules();
    const readLegacyRoot = () => state;
    const conditionReads = modules.conditionAdapter.createEvolveLegacyConditionReadProvider({ readLegacyRoot });
    const evaluator = modules.conditionEvaluator.createConditionEvaluator({
        registrations: modules.coreRequirements.createCoreRequirementRegistrations(conditionReads),
    });
    const commitCapability = modules.commitAdapter.createEvolveLegacyResourceCommitCapability({ readLegacyRoot });
    const executor = modules.resourceCommit.createResourceCommitExecutor({
        commitResourceChanges: changes => commitCapability.commitResourceChanges(changes),
    });
    const registration = modules.dnaCommand.createEvolutionDnaCommandRegistration({
        evaluateCondition: condition => {
            const result = evaluator.evaluate(condition);
            if (afterCondition && result.status === 'satisfied') afterCondition(state, result);
            return result;
        },
        commitResourcePlans: (paymentPlan, effectPlan) => executor.commit(paymentPlan, effectPlan),
    });
    const bus = modules.commandBus.createCommandBus({ registrations: [registration] });
    return () => bus.dispatch({
        id: 'evolve:command/evolution/dna',
        payload: {},
    });
}

function assertExecutionContractError(fn, expectedCode){
    assert.throws(
        fn,
        error => error
            && error.name === 'EngineContractError'
            && error.code === expectedCode
            && error.details
            && error.details.commandId === 'evolve:command/evolution/dna'
            && error.details.phase === 'execute'
            && error.details.causeCode === expectedCode
    );
}

test('M3G settlement revalidates RNA after the execution condition has already passed', async () => {
    const state = makeState({ rna: 10, dna: 0, dnaMax: 100 });
    const dispatch = await createHarness(state, {
        afterCondition(current){
            current.resource.RNA.amount = 1;
        },
    });

    const result = dispatch();

    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.reasons, [{
        code: 'insufficient_resource',
        details: {
            resourceId: 'evolve:resource/rna',
            required: 2,
            available: 1,
        },
    }]);
    assert.equal(state.resource.RNA.amount, 1, 'the external drift must remain visible');
    assert.equal(state.resource.DNA.amount, 0, 'the rejected command must not grant DNA');
});

test('M3G settlement revalidates DNA capacity after the execution condition has already passed', async () => {
    const state = makeState({ rna: 10, dna: 0, dnaMax: 5 });
    const dispatch = await createHarness(state, {
        afterCondition(current){
            current.resource.DNA.amount = 5;
        },
    });

    const result = dispatch();

    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.reasons, [{
        code: 'resource_at_capacity',
        details: {
            resourceId: 'evolve:resource/dna',
            amount: 5,
            capacity: 5,
        },
    }]);
    assert.equal(state.resource.RNA.amount, 10, 'payment must not be debited after target-capacity drift');
    assert.equal(state.resource.DNA.amount, 5, 'the external drift must remain visible');
});

test('M3G partial legacy write failure rolls earlier resource changes back atomically', async () => {
    const dna = failThenRecoveringResource({ amount: 0, max: 100 });
    const state = makeState({ rna: 10, dnaRecord: dna });
    const dispatch = await createHarness(state);

    assertExecutionContractError(dispatch, 'LEGACY_RESOURCE_COMMIT_WRITE_FAILURE');
    assert.equal(state.resource.RNA.amount, 10, 'RNA debit must be rolled back');
    assert.equal(state.resource.DNA.amount, 0, 'DNA must remain at its original amount');
});

test('M3G rollback failure remains a hard contract failure and is never normalized into gameplay rejection', async () => {
    const dna = failThenRecoveringResource({ amount: 0, max: 100, failRollback: true });
    const state = makeState({ rna: 10, dnaRecord: dna });
    const dispatch = await createHarness(state);

    assertExecutionContractError(dispatch, 'LEGACY_RESOURCE_COMMIT_ROLLBACK_FAILURE');
    assert.equal(state.resource.RNA.amount, 10, 'earlier RNA debit must still be restored before rollback failure is reported');
    assert.equal(state.resource.DNA.amount, 0);
});
