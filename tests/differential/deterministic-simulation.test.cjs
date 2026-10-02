'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    runLegacyScenario,
    compareSnapshots,
    compareImplementations,
    formatDiffs
} = require('../simulation/differential-harness.cjs');

const oracleScenarios = [
    { fixture: 'fresh-evolution', periods: 20 },
    { fixture: 'early-civilization-human', periods: 20 }
];

for (const scenario of oracleScenarios){
    test(`legacy simulation is deterministic for ${scenario.fixture} over ${scenario.periods} periods`, () => {
        const first = runLegacyScenario(scenario);
        const second = runLegacyScenario(scenario);
        const diffs = compareSnapshots(first.after, second.after);

        assert.equal(
            diffs.length,
            0,
            `determinism failure:\n${formatDiffs(diffs)}`
        );
    });
}

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
