'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const baselines = require('../simulation/oracle-baselines.json');
const { oracleScenarios } = require('../simulation/oracle-scenarios.cjs');

const {
    runLegacyScenario,
    compareSnapshots,
    compareImplementations,
    formatDiffs
} = require('../simulation/differential-harness.cjs');
const {
    serializeSnapshot,
    fingerprintSnapshot,
    loadSnapshot,
    exactSnapshotDiff,
    formatFrozenDiffs
} = require('../simulation/oracle-goldens.cjs');

for (const scenario of oracleScenarios){
    test('legacy simulation matches frozen oracle for ' + scenario.key, () => {
        const first = runLegacyScenario(scenario);
        const second = runLegacyScenario(scenario);
        const progressed = compareSnapshots(first.before, first.after);

        assert.ok(
            progressed.length > 0,
            scenario.fixture + ': requested loop execution produced no normalized state change'
        );

        const expected = baselines.scenarios[scenario.key];
        assert.ok(expected, scenario.key + ': missing frozen oracle manifest entry');
        assert.equal(expected.fixture, scenario.fixture, scenario.key + ': fixture mismatch in manifest');
        assert.equal(expected.periods, scenario.periods, scenario.key + ': period mismatch in manifest');

        const frozenSnapshot = loadSnapshot(expected);
        const frozenHash = fingerprintSnapshot(frozenSnapshot);
        assert.equal(
            frozenHash,
            expected.sha256,
            scenario.key + ': committed snapshot does not match its manifest SHA-256'
        );

        for (const pair of [['first', first], ['second', second]]){
            const label = pair[0];
            const run = pair[1];
            const actualHash = fingerprintSnapshot(run.after);
            if (actualHash !== expected.sha256){
                const differences = exactSnapshotDiff(frozenSnapshot, run.after);
                assert.fail(
                    scenario.key + ': ' + label + ' independent run changed frozen legacy behavior; ' +
                    'expected SHA-256=' + expected.sha256 + ' actual SHA-256=' + actualHash + '\n' +
                    formatFrozenDiffs(differences)
                );
            }
        }
    });
}

test('frozen oracle comparison is exact even where differential comparison uses tolerance', () => {
    const expected = { value: 100 };
    const near = { value: 100 + 1e-11 };

    assert.equal(compareSnapshots(expected, near).length, 0);

    const exact = exactSnapshotDiff(expected, near);
    assert.equal(exact.diffs.length, 1);
    assert.equal(exact.diffs[0].path, 'value');
});

test('oracle snapshot serialization is deterministic and recursively key-sorted', () => {
    const first = serializeSnapshot({ z: 1, a: { y: 2, b: 3 } });
    const second = serializeSnapshot({ a: { b: 3, y: 2 }, z: 1 });

    assert.equal(first, second);
    assert.equal(first, '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
});

test('frozen oracle diff output is bounded and reports omission', () => {
    const expected = {};
    const actual = {};
    for (let i = 0; i < 30; i++){
        expected['key' + i] = i;
        actual['key' + i] = i + 1;
    }

    const result = exactSnapshotDiff(expected, actual, 5);
    assert.equal(result.diffs.length, 5);
    assert.equal(result.truncated, true);
    assert.match(formatFrozenDiffs(result), /Additional differences omitted\./);
});

test('differential harness reports a precise state path for a deliberate mutation', () => {
    const scenario = { fixture: 'fresh-evolution', periods: 20 };

    const result = compareImplementations(
        runLegacyScenario,
        input => {
            const candidate = runLegacyScenario(input);
            candidate.after.resources.DNA.amount += 0.5;
            return candidate;
        },
        scenario
    );

    assert.ok(result.diffs.length > 0);
    assert.equal(result.diffs[0].path, 'resources.DNA.amount');
    assert.match(formatDiffs(result.diffs), /resources\.DNA\.amount/);
});

test('numeric comparison uses explicit narrow tolerances', () => {
    const expected = { value: 100 };
    const near = { value: 100 + 1e-11 };
    const far = { value: 100 + 1e-6 };

    assert.equal(compareSnapshots(expected, near).length, 0);

    const diffs = compareSnapshots(expected, far);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, 'value');
});
