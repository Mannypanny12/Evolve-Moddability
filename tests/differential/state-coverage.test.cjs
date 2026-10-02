'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    canonicalize,
    canonicalStringify,
    UNDEFINED_SENTINEL_KEY,
    UNDEFINED_SENTINEL_VALUE,
    NON_FINITE_SENTINEL_VALUE
} = require('../simulation/canonical-state.cjs');
const {
    ROOT_POLICY,
    SIMULATION_SETTING_POLICY,
    SIMULATION_SETTING_KEYS,
    RESOURCE_FIELD_POLICY
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
            alwaysPower: false,
            at: 0,
            boring: true,
            lowPowerBalance: false,
            mtorder: ['mastery'],
            pause: false,
            qAny: true,
            qAny_res: false,
            qKey: false,
            q_merge: 'merge_nearby',
            showCivic: true,
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
        'new',
        'sim'
    ]){
        assert.ok(ROOT_POLICY[root], `missing root policy for ${root}`);
        assert.notEqual(ROOT_POLICY[root].mode, 'exclude', `${root} must be observed`);
    }

    assert.equal(ROOT_POLICY.lastMsg.mode, 'exclude');
    assert.equal(ROOT_POLICY.settings.mode, 'mixed');
});

test('resource observation is fail-closed by default and excludes only classified presentation fields', () => {
    const state = minimalState();
    state.resource.Money.name = 'Localized Money';
    state.resource.Money.bar = true;
    state.resource.Money.future_mechanic_field = 42;

    const normalized = normalizeSimulationState(state);

    assert.equal(normalized.resources.Money.future_mechanic_field, 42);
    assert.equal(
        Object.prototype.hasOwnProperty.call(normalized.resources.Money, 'name'),
        false
    );
    assert.equal(
        Object.prototype.hasOwnProperty.call(normalized.resources.Money, 'bar'),
        false
    );
    assert.equal(RESOURCE_FIELD_POLICY.name.mode, 'exclude');
    assert.equal(RESOURCE_FIELD_POLICY.bar.mode, 'exclude');
});

test('every root classified as include is actually observed by normalization', () => {
    const baselineState = minimalState();
    const baseline = normalizeSimulationState(baselineState);

    for (const [root, policy] of Object.entries(ROOT_POLICY)){
        if (policy.mode !== 'include'){
            continue;
        }

        const changed = structuredClone(baselineState);

        if (root === 'seed' || root === 'warseed'){
            changed[root] += 1000;
        }
        else if (root === 'version'){
            changed[root] = `${changed[root]}-probe`;
        }
        else if (root === 'new'){
            changed[root] = !changed[root];
        }
        else if (root === 'power'){
            changed[root].push('m0e1:probe');
        }
        else if (root === 'sim'){
            changed[root] = { stats: { achieve: { simulation_probe: true } } };
        }
        else if (root === 'resource'){
            changed[root].M0E1_Probe = {
                amount: 1,
                max: 1,
                value: 1,
                diff: 0,
                delta: 0,
                rate: 0,
                display: false,
                crates: 0,
                containers: 0,
                stackable: false
            };
        }
        else {
            assert.ok(
                changed[root] && typeof changed[root] === 'object',
                `${root}: test fixture needs an object-like included root`
            );
            changed[root].__m0e1_probe = 1;
        }

        const diffs = compareSnapshots(
            baseline,
            normalizeSimulationState(changed)
        );

        assert.ok(
            diffs.length > 0,
            `${root}: policy says include but normalization did not observe a change`
        );
    }
});

test('roots classified as exclude do not enter passive simulation output', () => {
    const baseline = minimalState();
    baseline.revision = 'old';
    baseline.beta = true;

    const changed = structuredClone(baseline);
    changed.lastMsg = { all: ['different presentation history'] };
    changed.revision = 'different';
    changed.beta = false;

    assert.deepEqual(
        normalizeSimulationState(changed),
        normalizeSimulationState(baseline)
    );
});

test('simulation challenge snapshot root is authoritative and observed when present', () => {
    const baseline = normalizeSimulationState(minimalState());
    const changed = minimalState();
    changed.sim = {
        stats: { achieve: { simulation_probe: true } },
        prestige: { Plasmid: { count: 123 } }
    };

    const normalized = normalizeSimulationState(changed);
    const diffs = compareSnapshots(baseline, normalized);

    assert.ok(diffs.some(diff => diff.path.startsWith('simulationMode')));
    assert.equal(normalized.simulationMode.prestige.Plasmid.count, 123);
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

test('simulation settings include every classified gameplay key and exclude presentation-only preferences', () => {
    const normalized = normalizeSimulationState(minimalState());

    assert.deepEqual(
        Object.keys(normalized.simulationSettings).sort(),
        [...SIMULATION_SETTING_KEYS].sort()
    );

    for (const key of [
        'lowPowerBalance',
        'qAny_res',
        'alwaysPower',
        'q_merge',
        'qKey',
        'mtorder',
        'showCivic'
    ]){
        assert.equal(SIMULATION_SETTING_POLICY[key].mode, 'include', `${key} must be gameplay-observed`);
        assert.equal(
            Object.prototype.hasOwnProperty.call(normalized.simulationSettings, key),
            true,
            `${key} missing from normalized simulation settings`
        );
    }

    for (const key of ['theme', 'showCity', 'msgFilters', 'tabLoad']){
        assert.equal(SIMULATION_SETTING_POLICY[key].mode, 'exclude');
        assert.equal(
            Object.prototype.hasOwnProperty.call(normalized.simulationSettings, key),
            false
        );
    }
});

test('every gameplay-included setting changes normalized output', () => {
    const baselineState = minimalState();
    const baseline = normalizeSimulationState(baselineState);

    for (const key of SIMULATION_SETTING_KEYS){
        const changed = structuredClone(baselineState);
        const value = changed.settings[key];

        if (typeof value === 'boolean'){
            changed.settings[key] = !value;
        }
        else if (typeof value === 'number'){
            changed.settings[key] = value + 1;
        }
        else if (typeof value === 'string'){
            changed.settings[key] = value + '-probe';
        }
        else if (Array.isArray(value)){
            changed.settings[key].push('m0e1-probe');
        }
        else {
            throw new Error(`test needs mutation strategy for settings.${key}`);
        }

        const diffs = compareSnapshots(
            baseline,
            normalizeSimulationState(changed)
        );

        assert.ok(
            diffs.some(diff => diff.path.startsWith(`simulationSettings.${key}`)),
            `settings.${key}: included policy did not affect normalized output`
        );
    }
});

test('unclassified future top-level settings fail closed', () => {
    const state = minimalState();
    state.settings.future_gameplay_toggle = true;

    assert.throws(
        () => normalizeSimulationState(state),
        /Unclassified legacy top-level setting\(s\): future_gameplay_toggle/
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


test('known legacy non-tradable resource NaN value is preserved as an explicit tag', () => {
    const state = minimalState();
    state.resource.Aerogel = {
        amount: 0,
        max: -1,
        value: NaN,
        diff: 0,
        delta: 0,
        rate: 0,
        display: false,
        crates: 0,
        containers: 0,
        stackable: false
    };

    const normalized = normalizeSimulationState(state);

    assert.deepEqual(normalized.resources.Aerogel.value, {
        [UNDEFINED_SENTINEL_KEY]: NON_FINITE_SENTINEL_VALUE,
        value: 'NaN'
    });
});

test('tradable resource NaN value remains invalid', () => {
    const state = minimalState();
    state.resource.Food = {
        amount: 10,
        max: 250,
        value: NaN,
        diff: 0,
        delta: 0,
        rate: 1,
        display: true,
        crates: 0,
        containers: 0,
        trade: 0,
        stackable: true
    };

    assert.throws(
        () => normalizeSimulationState(state),
        /Non-finite number at resource\.Food\.value/
    );
});

test('Infinity remains invalid even in resource value fields', () => {
    const state = minimalState();
    state.resource.Money.value = Infinity;

    assert.throws(
        () => normalizeSimulationState(state),
        /Non-finite number at resource\.Money\.value/
    );
});
