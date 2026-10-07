'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy) throw new Error('Legacy test API did not initialize');

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

function executeFrozenLegacyDna({ isQueue = false } = {}){
    void isQueue;
    const state = legacy.legacyState();
    if (state.resource.RNA.amount >= 2 && state.resource.DNA.amount < state.resource.DNA.max){
        legacy.applyResourceDelta('RNA', -2, true);
        legacy.applyResourceDelta('DNA', 1, true);
    }
    return false;
}

function snapshotState(){
    return JSON.stringify(legacy.legacyState());
}

function compareLiveCutoverToFrozenOracle(options, actionOptions = {}){
    installDnaState(options);
    const frozenReturn = executeFrozenLegacyDna(actionOptions);
    const frozenAfter = snapshotState();

    installDnaState(options);
    const liveReturn = legacy.executeAction('evolution', 'dna', actionOptions);
    const liveAfter = snapshotState();

    assert.equal(frozenReturn, false);
    assert.equal(liveReturn, false);
    assert.equal(liveAfter, frozenAfter);
}

test('M3F3 live vanilla DNA action remains equivalent to the frozen pre-cutover oracle', async t => {
    const scenarios = [
        { label: 'normal success', options: { rna: 2, dna: 9, dnaMax: 10 } },
        { label: 'insufficient RNA', options: { rna: 1, dna: 0, dnaMax: 10 } },
        { label: 'DNA at capacity', options: { rna: 10, dna: 10, dnaMax: 10 } },
        { label: 'hidden DNA still executes directly', options: { rna: 10, dna: 0, dnaDisplay: false } },
        { label: 'final menu still executes directly', options: { rna: 10, dna: 0, evoFinalMenu: true } },
        { label: 'hidden RNA still executes directly', options: { rna: 10, rnaDisplay: false, dna: 0 } },
        { label: 'RNA holdings above low capacity clamp like modRes', options: { rna: 10, rnaMax: 1, dna: 0 } },
        { label: 'fractional DNA grant clamps at capacity like modRes', options: { rna: 10, dna: 9.5, dnaMax: 10 } },
    ];

    for (const scenario of scenarios){
        await t.test(`${scenario.label} from direct caller`, () => {
            compareLiveCutoverToFrozenOracle(scenario.options, { isQueue: false });
        });
        await t.test(`${scenario.label} from legacy queue-shaped caller`, () => {
            compareLiveCutoverToFrozenOracle(scenario.options, { isQueue: true });
        });
    }
});

test('M3F3 preserves presentation/execution separation on the real vanilla action', () => {
    installDnaState({ rna: 10, dna: 0, dnaDisplay: false, evoFinalMenu: true });
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    assert.equal(legacy.executeAction('evolution', 'dna'), false);
    assert.equal(legacy.legacyState().resource.RNA.amount, 8);
    assert.equal(legacy.legacyState().resource.DNA.amount, 1);
});

test('M3F3 production runtime follows setGlobal rebinding instead of retaining stale legacy state', () => {
    const first = installDnaState({ rna: 4, dna: 0, dnaMax: 10 });
    assert.equal(legacy.executeAction('evolution', 'dna'), false);
    assert.equal(first.resource.RNA.amount, 2);
    assert.equal(first.resource.DNA.amount, 1);

    const second = installDnaState({ rna: 6, dna: 2, dnaMax: 10 });
    assert.notEqual(second, first);
    assert.equal(legacy.executeAction('evolution', 'dna'), false);
    assert.equal(second.resource.RNA.amount, 4);
    assert.equal(second.resource.DNA.amount, 3);
    assert.equal(first.resource.RNA.amount, 2);
    assert.equal(first.resource.DNA.amount, 1);
});

test('M3F3 expected gameplay refusal keeps the legacy false return and leaves state unchanged', () => {
    installDnaState({ rna: 1, dna: 3, dnaMax: 10 });
    const before = snapshotState();
    assert.equal(legacy.executeAction('evolution', 'dna'), false);
    assert.equal(snapshotState(), before);

    installDnaState({ rna: 10, dna: 10, dnaMax: 10 });
    const fullBefore = snapshotState();
    assert.equal(legacy.executeAction('evolution', 'dna'), false);
    assert.equal(snapshotState(), fullBefore);
});

test('M3F3 contract failures propagate instead of being disguised as legacy refusal', () => {
    installDnaState({ rna: 10, dna: 0, dnaMax: 'broken-capacity' });
    const beforeRna = legacy.legacyState().resource.RNA.amount;
    const beforeDna = legacy.legacyState().resource.DNA.amount;

    assert.throws(
        () => legacy.executeAction('evolution', 'dna'),
        error => error && error.name === 'EngineContractError' && error.code === 'INVALID_LEGACY_CONDITION_STATE'
    );
    assert.equal(legacy.legacyState().resource.RNA.amount, beforeRna);
    assert.equal(legacy.legacyState().resource.DNA.amount, beforeDna);
});
