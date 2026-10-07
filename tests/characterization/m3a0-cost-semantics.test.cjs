'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

function installState(mutator){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    mutator(state);
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

test('current affordability and capacity feasibility are distinct for ordinary resources', () => {
    const state = installState(state => {
        state.resource.Food = {
            ...(state.resource.Food || {}),
            amount: 10,
            max: 100,
            delta: 0,
            display: true,
        };
    });

    assert.equal(legacy.canAfford({ Food: 50 }), false);
    assert.equal(legacy.canAffordMax({ Food: 50 }), true);

    state.resource.Food.display = false;
    assert.equal(legacy.canAffordMax({ Food: 50 }), false);
});

test('Supply uses current supply for payment affordability and supply capacity for max checks', () => {
    installState(state => {
        state.portal.purifier = { supply: 1, sup_max: 10 };
    });

    assert.equal(legacy.canAfford({ Supply: 5 }), false);
    assert.equal(legacy.canAffordMax({ Supply: 5 }), true);
});

test('prestige max checks still use current holdings rather than a storage capacity', () => {
    const state = installState(state => {
        state.prestige.Plasmid = { count: 2 };
        state.prestige.AntiPlasmid = { count: 2 };
        state.race.universe = 'standard';
    });

    assert.equal(legacy.canAfford({ Plasmid: 5 }), false);
    assert.equal(legacy.canAffordMax({ Plasmid: 5 }), false);

    state.prestige.Plasmid.count = 5;
    assert.equal(legacy.canAffordMax({ Plasmid: 5 }), true);
});

test('Plasmid payment resolves to AntiPlasmid in the antimatter universe', () => {
    const state = installState(state => {
        state.prestige.Plasmid = { count: 20 };
        state.prestige.AntiPlasmid = { count: 10 };
        state.race.universe = 'antimatter';
    });

    assert.equal(legacy.pay({ Plasmid: 3 }), true);
    assert.equal(state.prestige.Plasmid.count, 20);
    assert.equal(state.prestige.AntiPlasmid.count, 7);
});

test('Species payment is a compound mutation of population and the default job', () => {
    const state = installState(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 10,
            max: 100,
            delta: 0,
            display: true,
        };
        state.civic.d_job = 'unemployed';
        state.civic.unemployed = { workers: 7 };
    });

    assert.equal(legacy.pay({ Species: 3 }), true);
    assert.equal(state.resource.human.amount, 7);
    assert.equal(state.civic.unemployed.workers, 4);
});

test('Knowledge payment also records cumulative knowledge spending', () => {
    const state = installState(state => {
        state.resource.Knowledge = {
            ...(state.resource.Knowledge || {}),
            amount: 100,
            max: 1000,
            delta: 0,
            display: true,
        };
        state.stats.know = 0;
    });

    assert.equal(legacy.pay({ Knowledge: 25 }), true);
    assert.equal(state.resource.Knowledge.amount, 75);
    assert.equal(state.stats.know, 25);
});

test('Bool participates in affordability but is deliberately not a consumptive payment', () => {
    installState(() => {});

    assert.equal(legacy.canAfford({ Bool: false }), false);
    assert.equal(legacy.canAffordMax({ Bool: false }), false);
    assert.equal(legacy.canAfford({ Bool: true }), true);
    assert.equal(legacy.pay({ Bool: true }), true);
});

test('cost adjustment can change a numeric amount before affordability is checked', () => {
    installState(state => {
        state.genes.evolve = 1;
    });

    assert.deepEqual(
        legacy.adjustedSyntheticCosts({ DNA: 150 }),
        { DNA: 120 }
    );
});

test('cost adjustment can substitute the resource being charged', () => {
    installState(state => {
        state.race.smoldering = 1;
        state.tech.primitive = 0;
    });

    assert.deepEqual(
        legacy.adjustedSyntheticCosts({ Lumber: 100 }),
        { Chrysotile: 100 }
    );
});
