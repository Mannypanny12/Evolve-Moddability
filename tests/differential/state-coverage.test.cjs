'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    canonicalize,
    canonicalStringify,
    UNDEFINED_SENTINEL_KEY,
    UNDEFINED_SENTINEL_VALUE
} = require('../simulation/canonical-state.cjs');
const {
    ROOT_POLICY,
    SIMULATION_SETTING_KEYS
} = require('../simulation/legacy-state-policy.cjs');
const {
    normalizeSimulationState
} = require('../simulation/normalize-simulation.cjs');
const {
    compareSnapshots
} = require('../simulation/differential-harness.cjs');

function minimalState(){
    return {
        version: '1.4.10',
        new: false,
        seed: 2,
        warseed: 3,
        resource: {
            Money: {
                amount: 10,
                max: 100,
                value: 1.25,
                diff: 0,
                delta: 0,
                rate: 1,
                display: true,
                crates: 0,
                containers: 0,
                trade: 0,
                stackable: false
            }
        },
        evolution: { rna: 2 },
        tech: {},
        city: {},
        space: {},
        interstellar: {},
        galaxy: {},
        portal: {},
        eden: {},
        tauceti: {},
        starDock: {},
        civic: {},
        race: {},
        genes: {},
        blood: {},
        stats: {},
        event: {},
        m_event: {},
        queue: {},
        r_queue: {},
        power: [],
        support: {},
        arpa: { railway: { complete: 25, rank: 1 } },
        settings: {
            pause: false,
            at: 0,
            boring: true,
            qAny: true,
            theme: 'dark',
            showCity: true
        },
        special: { gift: { g2019: true } },
        custom: { race0: { name: 'Test Race', traits: [] } },
        pillars: { human: 2 },
        prestige: {},
        govern: { governor: {}, candidate: [], policy: { taxation: 1 } },
        lastMsg: { all: ['presentation-only'] }
    };
}

test('legacy root policy explicitly classifies required M0E1 roots', () => {
    for (const root of [
        'evolution',
        'arpa',
        'pillars',
        'custom',
        'govern',
        'special',
        'version',
        'new'
    ]){
        assert.ok(ROOT_POLICY[root], `missing root policy for ${root}`);
        assert.notEqual(ROOT_POLICY[root].mode, 'exclude', `${root} must be observed`);
    }

    assert.equal(ROOT_POLICY.lastMsg.mode, 'exclude');
    assert.equal(ROOT_POLICY.settings.mode, 'mixed');
});

test('normalizer observes newly covered authoritative state', () => {
    const normalized = normalizeSimulationState(minimalState());

    assert.equal(normalized.metadata.version, '1.4.10');
    assert.equal(normalized.metadata.new, false);
    assert.equal(normalized.resources.Money.value, 1.25);
    assert.equal(normalized.evolution.rna, 2);
    assert.equal(normalized.arpa.railway.complete, 25);
    assert.equal(normalized.pillars.human, 2);
    assert.equal(normalized.custom.race0.name, 'Test Race');
    assert.equal(normalized.governor.policy.taxation, 1);
    assert.equal(normalized.special.gift.g2019, true);
});

test('newly covered roots participate in structural differential output', () => {
    const expected = normalizeSimulationState(minimalState());
    const changedState = minimalState();
    changedState.arpa.railway.complete = 26;
    const actual = normalizeSimulationState(changedState);

    const diffs = compareSnapshots(expected, actual);

    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, 'arpa.railway.complete');
    assert.equal(diffs[0].delta, 1);
});

test('unclassified top-level legacy state fails closed', () => {
    const state = minimalState();
    state.unexpected_future_root = { value: 1 };

    assert.throws(
        () => normalizeSimulationState(state),
        /Unclassified legacy top-level state root\(s\): unexpected_future_root/
    );
});

test('simulation settings include behavioral keys and exclude presentation-only preferences', () => {
    const normalized = normalizeSimulationState(minimalState());

    assert.deepEqual(
        Object.keys(normalized.simulationSettings).sort(),
        [...SIMULATION_SETTING_KEYS].sort()
    );
    assert.equal(normalized.simulationSettings.boring, true);
    assert.equal(normalized.simulationSettings.qAny, true);
    assert.equal(
        Object.prototype.hasOwnProperty.call(normalized.simulationSettings, 'theme'),
        false
    );
    assert.equal(
        Object.prototype.hasOwnProperty.call(normalized.simulationSettings, 'showCity'),
        false
    );
});

test('canonical encoding preserves present-but-undefined properties', () => {
    const canonical = canonicalize({
        present: undefined
    });

    assert.equal(
        Object.prototype.hasOwnProperty.call(canonical, 'present'),
        true
    );
    assert.deepEqual(canonical.present, {
        [UNDEFINED_SENTINEL_KEY]: UNDEFINED_SENTINEL_VALUE
    });
    assert.notEqual(
        canonicalStringify({ present: undefined }),
        canonicalStringify({})
    );
});

for (const value of [NaN, Infinity, -Infinity]){
    test(`canonical encoding rejects non-finite number ${String(value)} with its path`, () => {
        assert.throws(
            () => canonicalStringify({ resources: { Money: { amount: value } } }),
            /Non-finite number at resources\.Money\.amount/
        );
    });
}

test('normalization rejects non-finite authoritative resource values before JSON transport', () => {
    const state = minimalState();
    state.resource.Money.amount = NaN;

    assert.throws(
        () => normalizeSimulationState(state),
        /Non-finite number at resource\.Money\.amount/
    );
});
