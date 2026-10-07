'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy) throw new Error('Legacy test API did not initialize');

const root = path.resolve(__dirname, '../..');
const imports = {
    command: import(pathToFileURL(path.join(root, 'src/content/evolve/commands/evolution-dna.mjs')).href),
    bus: import(pathToFileURL(path.join(root, 'src/engine/commands/command-bus.mjs')).href),
    conditionEvaluator: import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href),
    coreRequirements: import(pathToFileURL(path.join(root, 'src/engine/conditions/core-requirements.mjs')).href),
    conditionAdapter: import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-condition-read-adapter.mjs')).href),
    paymentAssessor: import(pathToFileURL(path.join(root, 'src/engine/costs/payment-assessor.mjs')).href),
    paymentAdapter: import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-payment-read-adapter.mjs')).href),
    commitExecutor: import(pathToFileURL(path.join(root, 'src/engine/execution/resource-commit.mjs')).href),
    commitAdapter: import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-resource-commit-adapter.mjs')).href),
};

function installDnaState({
    rna = 10,
    rnaMax = 100,
    rnaDisplay = true,
    dna = 0,
    dnaMax = 10,
    dnaDisplay = true,
    evoFinalMenu = false,
} = {}){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    state.resource.RNA = {
        ...(state.resource.RNA || {}),
        amount: rna,
        max: rnaMax,
        delta: 0,
        display: rnaDisplay,
    };
    state.resource.DNA = {
        ...(state.resource.DNA || {}),
        amount: dna,
        max: dnaMax,
        delta: 0,
        display: dnaDisplay,
    };
    state.race.evoFinalMenu = evoFinalMenu;
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

async function createDnaBus(){
    const [
        { createEvolutionDnaCommandRegistration },
        { createCommandBus },
        { createConditionEvaluator },
        { createCoreRequirementRegistrations },
        { createEvolveLegacyConditionReadProvider },
        { createPaymentAssessor },
        { createEvolveLegacyPaymentReadProvider },
        { createResourceCommitExecutor },
        { createEvolveLegacyResourceCommitCapability },
    ] = await Promise.all([
        imports.command,
        imports.bus,
        imports.conditionEvaluator,
        imports.coreRequirements,
        imports.conditionAdapter,
        imports.paymentAssessor,
        imports.paymentAdapter,
        imports.commitExecutor,
        imports.commitAdapter,
    ]);

    const readLegacyRoot = () => legacy.legacyState();
    const conditionReads = createEvolveLegacyConditionReadProvider({ readLegacyRoot });
    const conditionEvaluator = createConditionEvaluator({
        registrations: createCoreRequirementRegistrations(conditionReads),
    });
    const paymentReads = createEvolveLegacyPaymentReadProvider({ readLegacyRoot });
    const paymentAssessor = createPaymentAssessor(paymentReads);
    const commitCapability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot });
    const commitExecutor = createResourceCommitExecutor({
        commitResourceChanges: changes => commitCapability.commitResourceChanges(changes),
    });

    const registration = createEvolutionDnaCommandRegistration({
        evaluateCondition: condition => conditionEvaluator.evaluate(condition),
        assessCurrentAffordability: quote => paymentAssessor.assessCurrentAffordability(quote),
        commitResourcePlans: (paymentPlan, effectPlan) => commitExecutor.commit(paymentPlan, effectPlan),
    });
    return createCommandBus({ registrations: [registration] });
}

async function dispatchDna(){
    const bus = await createDnaBus();
    return bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
}

test('M3F2 integrated DNA command matches the successful legacy RNA/DNA mutation', async () => {
    const state = installDnaState({ rna: 2, dna: 9, dnaMax: 10 });
    const result = await dispatchDna();

    assert.equal(result.status, 'succeeded');
    assert.equal(state.resource.RNA.amount, 0);
    assert.equal(state.resource.DNA.amount, 10);
});

test('M3F2 integrated DNA command rejects insufficient RNA with complete non-mutation', async () => {
    installDnaState({ rna: 1, dna: 0, dnaMax: 10 });
    const before = JSON.stringify(legacy.legacyState());
    const result = await dispatchDna();

    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'payment.current.resource.amount_insufficient');
    assert.equal(JSON.stringify(legacy.legacyState()), before);
});

test('M3F2 integrated DNA command rejects full DNA capacity before payment', async () => {
    installDnaState({ rna: 10, dna: 10, dnaMax: 10 });
    const before = JSON.stringify(legacy.legacyState());
    const result = await dispatchDna();

    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'condition.resource.at_capacity');
    assert.equal(JSON.stringify(legacy.legacyState()), before);
});

test('M3F2 command execution deliberately ignores DNA display and evoFinalMenu presentation state', async () => {
    const hiddenDna = installDnaState({ rna: 10, dna: 0, dnaDisplay: false });
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    assert.equal((await dispatchDna()).status, 'succeeded');
    assert.equal(hiddenDna.resource.RNA.amount, 8);
    assert.equal(hiddenDna.resource.DNA.amount, 1);

    const finalMenu = installDnaState({ rna: 10, dna: 0, evoFinalMenu: true });
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    assert.equal((await dispatchDna()).status, 'succeeded');
    assert.equal(finalMenu.resource.RNA.amount, 8);
    assert.equal(finalMenu.resource.DNA.amount, 1);
});

test('M3F2 current RNA affordability ignores display but preserves the legacy bounded-capacity rule', async () => {
    const hiddenRna = installDnaState({ rna: 10, rnaMax: 10, rnaDisplay: false, dna: 0 });
    assert.equal(legacy.actionAffordable('evolution', 'dna'), true);
    assert.equal((await dispatchDna()).status, 'succeeded');
    assert.equal(hiddenRna.resource.RNA.amount, 8);
    assert.equal(hiddenRna.resource.DNA.amount, 1);

    installDnaState({ rna: 10, rnaMax: 1, rnaDisplay: true, dna: 0 });
    assert.equal(legacy.actionAffordable('evolution', 'dna'), false);
    const before = JSON.stringify(legacy.legacyState());
    const result = await dispatchDna();
    assert.equal(result.status, 'rejected');
    assert.equal(result.reasons[0].code, 'payment.current.resource.capacity_insufficient');
    assert.equal(JSON.stringify(legacy.legacyState()), before);
});
