'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

function baseState(){
    return {
        seed: 1,
        warseed: 1,
        resource: {},
        evolution: {},
        tech: {},
        city: {
            morale: { current: 100 }
        },
        space: {},
        interstellar: {},
        galaxy: {},
        portal: {},
        eden: {},
        tauceti: {},
        civic: {
            d_job: 'unemployed',
            unemployed: { workers: 0 },
            garrison: { raid: 0 }
        },
        race: {
            species: 'human',
            universe: 'standard'
        },
        genes: {},
        blood: {},
        stats: {
            achieve: {},
            feat: {}
        },
        prestige: {},
        settings: {},
        queue: {
            display: false,
            queue: [],
            max: 0,
            pause: false
        },
        r_queue: {
            display: false,
            queue: [],
            max: 0,
            pause: false
        }
    };
}

test.beforeEach(() => {
    legacy.seedRandom(1);
    legacy.setWallClock(Date.UTC(2026, 0, 1, 12, 0, 0));
    legacy.installLegacyState(baseState());
});

test.after(() => {
    legacy.resetRandom();
    legacy.resetWallClock();
});

test('resource mutation clamps gain at the current resource maximum', () => {
    const state = legacy.legacyState();
    state.resource.Food = {
        amount: 90,
        max: 100,
        delta: 0
    };

    const result = legacy.applyResourceDelta('Food', 25, true);

    assert.equal(result, true);
    assert.equal(state.resource.Food.amount, 100);
});

test('resource mutation floors an overspend at zero and reports failure', () => {
    const state = legacy.legacyState();
    state.resource.Food = {
        amount: 10,
        max: 100,
        delta: 0
    };

    const result = legacy.applyResourceDelta('Food', -25, true);

    assert.equal(result, false);
    assert.equal(state.resource.Food.amount, 0);
});

test('cost checks and payment use the same current resource amount', () => {
    const state = legacy.legacyState();
    state.resource.Money = {
        amount: 100,
        max: 1000,
        delta: 0
    };

    assert.equal(legacy.canAfford({ Money: 75 }), true);
    assert.equal(legacy.pay({ Money: 75 }), true);
    assert.equal(state.resource.Money.amount, 25);
    assert.equal(legacy.canAfford({ Money: 75 }), false);
});

test('technology requirements expose the legacy not-ready, ready, and already-granted states', () => {
    const state = legacy.legacyState();

    state.tech.primitive = 0;
    assert.equal(legacy.technologyRequirements('bone_tools'), false);

    state.tech.primitive = 1;
    assert.equal(legacy.technologyRequirements('bone_tools'), 'ok');

    state.tech.primitive = 2;
    assert.equal(legacy.technologyRequirements('bone_tools'), false);
});

test('technology qualification follows the technology condition against race traits', () => {
    const state = legacy.legacyState();

    assert.equal(legacy.technologyQualifies('bone_tools'), true);
    assert.equal(legacy.technologyQualifies('wooden_tools'), false);

    state.race.soul_eater = 1;
    assert.equal(legacy.technologyQualifies('bone_tools'), false);
    assert.equal(legacy.technologyQualifies('wooden_tools'), true);

    state.race.evil = 1;
    assert.equal(legacy.technologyQualifies('bone_tools'), true);
    assert.equal(legacy.technologyQualifies('wooden_tools'), false);
});


test('wall-clock-dependent action conditions can be characterized at a frozen date', () => {
    const state = legacy.legacyState();
    state.special = {
        gift: {
            g2019: true
        }
    };

    legacy.setWallClock(Date.UTC(2026, 0, 1, 12, 0, 0));
    assert.equal(legacy.actionCondition('city', 'gift'), true);

    legacy.setWallClock(Date.UTC(2026, 11, 20, 12, 0, 0));
    assert.equal(legacy.actionCondition('city', 'gift'), false);
});

test('unseeded legacy event randomness can be replayed with a controlled RNG sequence', () => {
    const state = legacy.legacyState();
    state.race.species = 'protoplasm';
    state.resource.DNA = {
        amount: 0,
        max: 30,
        delta: 0
    };

    legacy.setRandomSequence([0.5]);
    legacy.eventEffect('dna_replication');

    assert.equal(state.resource.DNA.amount, 5);
});

test('legacy loop timing exposes the default worker cadence deterministically', () => {
    assert.deepEqual(legacy.loopTiming(), {
        webWorkerMainTimer: 250,
        mainTimer: 250,
        longTimer: 5000,
        baseLongTimer: 5000,
        timeAccelerationFactor: 2
    });
});
