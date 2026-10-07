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

function snapshotLegacyState(){
    return JSON.stringify(legacy.legacyState());
}

function executeFrozenLegacyDna(){
    const state = legacy.legacyState();
    if (state.resource.RNA.amount >= 2 && state.resource.DNA.amount < state.resource.DNA.max){
        legacy.applyResourceDelta('RNA', -2, true);
        legacy.applyResourceDelta('DNA', 1, true);
    }
    return false;
}

async function createDnaBus(){
    const [
        { createEvolutionDnaCommandRegistration },
        { createCommandBus },
        { createConditionEvaluator },
        { createCoreRequirementRegistrations },
        { createEvolveLegacyConditionReadProvider },
        { createResourceCommitExecutor },
        { createEvolveLegacyResourceCommitCapability },
    ] = await Promise.all([
        imports.command,
        imports.bus,
        imports.conditionEvaluator,
        imports.coreRequirements,
        imports.conditionAdapter,
        imports.commitExecutor,
        imports.commitAdapter,
    ]);

    const readLegacyRoot = () => legacy.legacyState();
    const conditionReads = createEvolveLegacyConditionReadProvider({ readLegacyRoot });
    const conditionEvaluator = createConditionEvaluator({
        registrations: createCoreRequirementRegistrations(conditionReads),
    });
    const commitCapability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot });
    const commitExecutor = createResourceCommitExecutor({
        commitResourceChanges: changes => commitCapability.commitResourceChanges(changes),
    });

    const registration = createEvolutionDnaCommandRegistration({
        evaluateCondition: condition => conditionEvaluator.evaluate(condition),
        commitResourcePlans: (paymentPlan, effectPlan) => commitExecutor.commit(paymentPlan, effectPlan),
    });
    return createCommandBus({ registrations: [registration] });
}

async function dispatchDna(){
    const bus = await createDnaBus();
    return bus.dispatch({ id: 'evolve:command/evolution/dna', payload: {} });
}

async function compareFrozenLegacyAndCommand(options, expectedStatus, expectedReason = null){
    installDnaState(options);
    const legacyReturn = executeFrozenLegacyDna();
    const legacyAfter = snapshotLegacyState();

    installDnaState(options);
    const commandResult = await dispatchDna();
    const commandAfter = snapshotLegacyState();

    assert.equal(legacyReturn, false);
    assert.equal(commandResult.status, expectedStatus);
    if (expectedReason !== null){
        assert.equal(commandResult.reasons[0]?.code, expectedReason);
    }
    assert.equal(commandAfter, legacyAfter);
}

test('M3F2 DNA command remains state-equivalent to the frozen pre-cutover legacy oracle across the reviewed execution matrix', async t => {
    const scenarios = [
        {
            label: 'normal success',
            options: { rna: 2, dna: 9, dnaMax: 10 },
            status: 'succeeded',
        },
        {
            label: 'insufficient RNA',
            options: { rna: 1, dna: 0, dnaMax: 10 },
            status: 'rejected',
            reason: 'insufficient_resource',
        },
        {
            label: 'DNA at capacity',
            options: { rna: 10, dna: 10, dnaMax: 10 },
            status: 'rejected',
            reason: 'condition.resource.at_capacity',
        },
        {
            label: 'hidden DNA presentation state',
            options: { rna: 10, dna: 0, dnaDisplay: false },
            status: 'succeeded',
        },
        {
            label: 'final-menu presentation state',
            options: { rna: 10, dna: 0, evoFinalMenu: true },
            status: 'succeeded',
        },
        {
            label: 'hidden RNA presentation state',
            options: { rna: 10, rnaMax: 10, rnaDisplay: false, dna: 0 },
            status: 'succeeded',
        },
        {
            label: 'RNA capacity below price but holdings sufficient',
            options: { rna: 10, rnaMax: 1, rnaDisplay: true, dna: 0 },
            status: 'succeeded',
        },
        {
            label: 'DNA grant clamps at capacity like modRes',
            options: { rna: 10, dna: 9.5, dnaMax: 10 },
            status: 'succeeded',
        },
    ];

    for (const scenario of scenarios){
        await t.test(scenario.label, async () => {
            await compareFrozenLegacyAndCommand(scenario.options, scenario.status, scenario.reason || null);
        });
    }
});

test('M3F2 keeps presentation/current-affordability observations separate from direct execution authority', async () => {
    installDnaState({ rna: 10, rnaMax: 1, dna: 0 });
    assert.equal(legacy.actionAffordable('evolution', 'dna'), false);
    assert.equal(executeFrozenLegacyDna(), false);
    assert.equal(legacy.legacyState().resource.RNA.amount, 1);
    assert.equal(legacy.legacyState().resource.DNA.amount, 1);

    installDnaState({ rna: 10, rnaMax: 1, dna: 0 });
    const result = await dispatchDna();
    assert.equal(result.status, 'succeeded');
    assert.equal(legacy.legacyState().resource.RNA.amount, 1);
    assert.equal(legacy.legacyState().resource.DNA.amount, 1);

    installDnaState({ rna: 10, dna: 0, dnaDisplay: false, evoFinalMenu: true });
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    assert.equal((await dispatchDna()).status, 'succeeded');
});
