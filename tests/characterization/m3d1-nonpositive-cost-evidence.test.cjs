'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

function installFood(amount = 10, max = 100){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    state.resource.Food = {
        ...(state.resource.Food || {}),
        amount,
        max,
        delta: 0,
        display: true,
    };
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

test('legacy zero resource cost is affordable and payment is a no-op', () => {
    const state = installFood();

    assert.equal(legacy.canAfford({ Food: 0 }), true);
    assert.equal(legacy.pay({ Food: 0 }), true);
    assert.equal(state.resource.Food.amount, 10);
});

test('legacy negative resource cost is accepted and payment increases the resource', () => {
    const state = installFood();

    assert.equal(legacy.canAfford({ Food: -5 }), true);
    assert.equal(legacy.pay({ Food: -5 }), true);
    assert.equal(state.resource.Food.amount, 15);
});
