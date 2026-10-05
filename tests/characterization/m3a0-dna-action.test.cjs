'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

function installDnaState({
    rna = 10,
    dna = 0,
    dnaMax = 10,
    rnaDisplay = true,
    dnaDisplay = true,
    evoFinalMenu = false,
} = {}){
    const state = legacy.pristineLegacyState();

    state.resource.RNA = {
        ...(state.resource.RNA || {}),
        amount: rna,
        max: 100,
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

test('DNA direct execution spends two RNA, grants one DNA, and still returns false', () => {
    const state = installDnaState({ rna: 2, dna: 9, dnaMax: 10 });

    assert.equal(legacy.actionCondition('evolution', 'dna'), true);
    assert.equal(legacy.actionAffordable('evolution', 'dna'), true);

    const result = legacy.executeAction('evolution', 'dna', { isQueue: false });

    assert.equal(result, false);
    assert.equal(state.resource.RNA.amount, 0);
    assert.equal(state.resource.DNA.amount, 10);
});

test('DNA qualification can be true while current affordability and execution both fail', () => {
    const state = installDnaState({ rna: 1, dna: 0, dnaMax: 10 });

    assert.equal(legacy.actionCondition('evolution', 'dna'), true);
    assert.equal(legacy.actionAffordable('evolution', 'dna'), false);

    const result = legacy.executeAction('evolution', 'dna', { isQueue: false });

    assert.equal(result, false);
    assert.equal(state.resource.RNA.amount, 1);
    assert.equal(state.resource.DNA.amount, 0);
});

test('DNA capacity is both a qualification gate and a direct execution guard', () => {
    const state = installDnaState({ rna: 10, dna: 10, dnaMax: 10 });

    assert.equal(legacy.actionCondition('evolution', 'dna'), false);

    legacy.executeAction('evolution', 'dna', { isQueue: false });

    assert.equal(state.resource.RNA.amount, 10);
    assert.equal(state.resource.DNA.amount, 10);
});

test('DNA presentation qualification is not the same contract as direct execution', () => {
    const displayHidden = installDnaState({ rna: 10, dna: 0, dnaDisplay: false });

    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    legacy.executeAction('evolution', 'dna', { isQueue: false });
    assert.equal(displayHidden.resource.RNA.amount, 8);
    assert.equal(displayHidden.resource.DNA.amount, 1);

    const finalMenu = installDnaState({ rna: 10, dna: 0, evoFinalMenu: true });

    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
    legacy.executeAction('evolution', 'dna', { isQueue: false });
    assert.equal(finalMenu.resource.RNA.amount, 8);
    assert.equal(finalMenu.resource.DNA.amount, 1);
});

test('RNA display does not participate in DNA qualification or current payment checks', () => {
    const state = installDnaState({ rna: 10, dna: 0, rnaDisplay: false });

    assert.equal(legacy.actionCondition('evolution', 'dna'), true);
    assert.equal(legacy.actionAffordable('evolution', 'dna'), true);
    assert.equal(legacy.actionAffordable('evolution', 'dna', { max: true }), false);

    legacy.executeAction('evolution', 'dna', { isQueue: false });
    assert.equal(state.resource.RNA.amount, 8);
    assert.equal(state.resource.DNA.amount, 1);
});
