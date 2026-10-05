'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

function installFood({ amount, max, display }){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    state.resource.Food = {
        ...(state.resource.Food || {}),
        amount,
        max,
        delta: 0,
        display,
    };
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

test('M3D2 evidence: current affordability ignores display while capacity feasibility requires it', () => {
    installFood({ amount: 100, max: 100, display: false });

    assert.equal(legacy.canAfford({ Food: 50 }), true);
    assert.equal(legacy.canAffordMax({ Food: 50 }), false);
});

test('M3D2 evidence: current affordability also fails when bounded capacity is below the cost', () => {
    installFood({ amount: 100, max: 40, display: true });

    assert.equal(legacy.canAfford({ Food: 50 }), false);
    assert.equal(legacy.canAffordMax({ Food: 50 }), false);
});

test('M3D2 evidence: legacy max -1 is an unbounded ordinary-resource capacity sentinel', () => {
    installFood({ amount: 100, max: -1, display: true });

    assert.equal(legacy.canAfford({ Food: 1000000 }), false);
    assert.equal(legacy.canAffordMax({ Food: 1000000 }), true);

    installFood({ amount: 1000000, max: -1, display: true });
    assert.equal(legacy.canAfford({ Food: 1000000 }), true);
});
