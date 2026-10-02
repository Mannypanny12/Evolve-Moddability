'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const baselines = require('../simulation/oracle-baselines.json');
const legacyBase = require('../fixtures/legacy-base.json');
const earlyCivilizationFixture = require('../fixtures/scenarios/early-civilization-human.json');
const { oracleScenarios } = require('../simulation/oracle-scenarios.cjs');
const { LEGACY_CADENCE } = require('../simulation/legacy-cadence.cjs');
const {
    ORACLE_RESULT_SCHEMA,
    ORACLE_RUNTIME_CONTRACT_SCHEMA,
    ORACLE_SOURCE,
    ORACLE_ENVIRONMENT,
    validateOracleManifest,
    validateOracleResult
} = require('../simulation/oracle-contract.cjs');

const {
    runLegacyScenario,
    compareSnapshots,
    compareImplementations,
    formatDiffs
} = require('../simulation/differential-harness.cjs');
const {
    snapshotRoot,
    serializeSnapshot,
    fingerprintSnapshot,
    resolveSnapshotPath,
    loadSnapshot,
    exactSnapshotDiff,
    formatFrozenDiffs
} = require('../simulation/oracle-goldens.cjs');

test('oracle manifest provenance matches the canonical legacy base contract', () => {
    assert.doesNotThrow(() => validateOracleManifest(baselines));
    assert.deepEqual(baselines.source, ORACLE_SOURCE);
    assert.deepEqual(baselines.environment, ORACLE_ENVIRONMENT);
    assert.deepEqual(baselines.source, legacyBase.source);
    assert.equal(baselines.environment.wallClock, legacyBase.harness.clock);
    assert.equal(baselines.environment.randomSeed, legacyBase.harness.rngSeed);
    assert.equal(baselines.runtimeContractSchema, ORACLE_RUNTIME_CONTRACT_SCHEMA);
    assert.equal(ORACLE_RUNTIME_CONTRACT_SCHEMA, legacyBase.harness.contractSchema);

    assert.throws(
        () => validateOracleManifest({
            ...baselines,
            runtimeContractSchema: ORACLE_RUNTIME_CONTRACT_SCHEMA + 1
        }),
        /runtime contract schema mismatch/
    );
});

test('oracle child-result metadata validation fails closed on provenance drift', () => {
    const scenario = oracleScenarios[0];
    const valid = {
        schema: ORACLE_RESULT_SCHEMA,
        fixture: scenario.fixture,
        periods: scenario.periods,
        environment: { ...ORACLE_ENVIRONMENT },
        before: {},
        after: {}
    };

    assert.equal(validateOracleResult(valid, scenario), valid);

    const mutations = [
        [{ ...valid, schema: ORACLE_RESULT_SCHEMA + 1 }, /schema mismatch/],
        [{ ...valid, fixture: 'wrong-fixture' }, /fixture mismatch/],
        [{ ...valid, periods: scenario.periods + 1 }, /period mismatch/],
        [{
            ...valid,
            environment: {
                ...ORACLE_ENVIRONMENT,
                wallClock: '2030-01-01T00:00:00.000Z'
            }
        }, /environment does not match/],
        [{
            ...valid,
            environment: {
                ...ORACLE_ENVIRONMENT,
                randomSeed: ORACLE_ENVIRONMENT.randomSeed + 1
            }
        }, /environment does not match/],
        [{
            schema: valid.schema,
            fixture: valid.fixture,
            periods: valid.periods,
            environment: valid.environment,
            after: {}
        }, /missing before state/],
        [{
            schema: valid.schema,
            fixture: valid.fixture,
            periods: valid.periods,
            environment: valid.environment,
            before: {}
        }, /missing after state/]
    ];

    for (const pair of mutations){
        assert.throws(
            () => validateOracleResult(pair[0], scenario),
            pair[1]
        );
    }
});

test('persisted fixture hydration supplies generic defaults before any loop period runs', () => {
    assert.equal(
        Object.prototype.hasOwnProperty.call(earlyCivilizationFixture.patch.civic, 'taxes'),
        false,
        'default tax state belongs to hydration, not persisted scenario intent'
    );

    const result = runLegacyScenario({
        fixture: 'early-civilization-human',
        periods: 0
    });

    assert.equal(result.before.populationAndCivics.taxes.tax_rate, 20);
    assert.equal(result.before.populationAndCivics.taxes.display, false);
    assert.equal(result.before.populationAndCivics.garrison.display, false);
    assert.equal(result.before.populationAndCivics.garrison.disabled, false);
    assert.equal(result.before.populationAndCivics.garrison.rate, 0);
    assert.equal(result.before.populationAndCivics.garrison.progress, 0);
    assert.equal(result.before.populationAndCivics.garrison.tactic, 0);
    assert.equal(result.before.populationAndCivics.garrison.max, 0);
    assert.equal(result.before.populationAndCivics.garrison.mercs, false);
    assert.equal(result.before.populationAndCivics.garrison.fatigue, 0);
    assert.equal(result.before.populationAndCivics.garrison.protest, 0);
    assert.equal(result.before.populationAndCivics.garrison.m_use, 0);
    assert.equal(result.before.populationAndCivics.garrison.crew, 0);

    assert.deepEqual(
        result.after,
        result.before,
        'zero periods must expose hydration only, not simulation progress'
    );
});

test('oracle matrix protects fast, catch-up, mid, long, and Orc full-loop coverage', () => {
    const earlyPeriods = oracleScenarios
        .filter(scenario => scenario.fixture === 'early-civilization-human')
        .map(scenario => scenario.periods)
        .sort((a, b) => a - b);

    assert.deepEqual(earlyPeriods, [
        LEGACY_CADENCE.fastOnlyPeriods,
        LEGACY_CADENCE.representativeCatchUpPeriods,
        LEGACY_CADENCE.firstMidPeriods,
        LEGACY_CADENCE.firstLongPeriods
    ]);

    assert.ok(
        oracleScenarios.some(scenario =>
            scenario.fixture === 'preindustrial-orc' &&
            scenario.periods === LEGACY_CADENCE.firstLongPeriods
        ),
        'preindustrial Orc must execute through the full p20 cadence'
    );
});

test('legacy cadence contract is derived from canonical base metadata', () => {
    assert.equal(LEGACY_CADENCE.mainPeriodMs, legacyBase.harness.cadence.mainMs);
    assert.equal(LEGACY_CADENCE.midRatio, legacyBase.harness.cadence.midRatio);
    assert.equal(LEGACY_CADENCE.longRatio, legacyBase.harness.cadence.longRatio);
    assert.equal(LEGACY_CADENCE.firstMidPeriods, legacyBase.harness.cadence.midRatio);
    assert.equal(LEGACY_CADENCE.firstLongPeriods, legacyBase.harness.cadence.longRatio);
    assert.equal(
        LEGACY_CADENCE.representativeCatchUpPeriods,
        1 + Math.floor(
            LEGACY_CADENCE.representativeCatchUpJitterMs /
            LEGACY_CADENCE.mainPeriodMs
        )
    );
});

test('split worker calls preserve cadence phase across mid and long boundaries', () => {
    const fixture = 'early-civilization-human';
    const cases = [
        { calls: [2, 3], total: 5, label: 'mid boundary' },
        { calls: [18, 3], total: 21, label: 'long boundary' }
    ];

    for (const item of cases){
        const split = runLegacyScenario({
            fixture,
            periods: item.total,
            calls: item.calls
        });
        const single = runLegacyScenario({
            fixture,
            periods: item.total
        });

        assert.deepEqual(
            split.before,
            single.before,
            item.label + ': split and single runs must start from the same hydrated state'
        );
        assert.deepEqual(
            split.after,
            single.after,
            item.label + ': cadence phase must persist across worker calls'
        );
    }
});

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

test('oracle scenario manifest and committed snapshot catalog stay in exact sync', () => {
    const scenarioKeys = oracleScenarios.map(scenario => scenario.key).sort();
    const manifestKeys = Object.keys(baselines.scenarios).sort();

    assert.deepEqual(
        manifestKeys,
        scenarioKeys,
        'oracle scenario list and manifest keys must match exactly'
    );

    const expectedFiles = [];
    const seenPaths = new Set();

    for (const key of manifestKeys){
        const entry = baselines.scenarios[key];
        const snapshotPath = resolveSnapshotPath(entry);
        const relative = path.relative(snapshotRoot, snapshotPath);

        assert.equal(
            seenPaths.has(snapshotPath),
            false,
            key + ': snapshot path is reused by another scenario'
        );
        seenPaths.add(snapshotPath);

        assert.match(
            entry.sha256,
            /^[a-f0-9]{64}$/,
            key + ': invalid manifest SHA-256'
        );

        expectedFiles.push(relative);

        const raw = fs.readFileSync(snapshotPath, 'utf8');
        const parsed = JSON.parse(raw);
        assert.equal(
            raw,
            serializeSnapshot(parsed),
            key + ': committed snapshot bytes are not canonical'
        );
    }

    const directoryEntries = fs.readdirSync(snapshotRoot, { withFileTypes: true });

    for (const entry of directoryEntries){
        assert.equal(
            entry.isFile(),
            true,
            'oracle snapshot directory must not contain subdirectories: ' + entry.name
        );
        assert.match(
            entry.name,
            /\.json$/,
            'oracle snapshot directory must contain JSON files only: ' + entry.name
        );
    }

    const actualFiles = directoryEntries
        .map(entry => entry.name)
        .sort();

    assert.deepEqual(
        actualFiles,
        expectedFiles.sort(),
        'committed snapshot directory and manifest must contain the same JSON files'
    );
});

test('structural comparator never exceeds its configured diff cap', () => {
    const expected = {};
    const actual = {};

    for (let i = 0; i < 30; i++){
        actual['added' + i] = i;
    }

    const diffs = compareSnapshots(expected, actual, {
        absTolerance: 0,
        relTolerance: 0,
        maxDiffs: 5
    });

    assert.equal(diffs.length, 5);
});

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

test('frozen oracle diagnostics name the exact changed gameplay path', () => {
    const expected = { resources: { DNA: { amount: 7.25 } } };
    const actual = structuredClone(expected);
    actual.resources.DNA.amount += 0.5;

    const result = exactSnapshotDiff(expected, actual);

    assert.equal(result.diffs.length, 1);
    assert.equal(result.diffs[0].path, 'resources.DNA.amount');
    assert.match(formatFrozenDiffs(result), /resources\.DNA\.amount/);
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
