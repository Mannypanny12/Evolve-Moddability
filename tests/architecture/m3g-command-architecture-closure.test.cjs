'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    REVIEWED_COMMAND_ID,
    REVIEWED_COMMAND,
    REVIEWED_RUNTIME,
    REVIEWED_EXECUTION_AUTHORITY,
    REVIEWED_LEGACY_WRITE_CAPABILITY,
    analyzeGenericM3Dependency,
    m3ArchitectureTestCoverageViolations,
    prerequisiteViolations,
    scanM3GCommandArchitecture,
} = require('./m3g-command-architecture-closure.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M3G whole-M3 architecture closure composes all reviewed M3 boundaries', async () => {
    const result = await scanM3GCommandArchitecture(root);

    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.summary.reviewedLiveCommandIds, [REVIEWED_COMMAND_ID]);
    assert.deepEqual(result.summary.reviewedCommandModules, [REVIEWED_COMMAND]);
    assert.deepEqual(result.summary.productionRuntimes, [REVIEWED_RUNTIME]);
    assert.deepEqual(result.summary.executionAuthorities, [REVIEWED_EXECUTION_AUTHORITY]);
    assert.deepEqual(result.summary.legacyWriteCapabilities, [REVIEWED_LEGACY_WRITE_CAPABILITY]);
    assert.equal(result.summary.queueProductionConsumerCount, 0);
    assert.deepEqual(result.summary.queueProductionConsumers, []);
    assert.deepEqual(result.summary.prerequisiteViolationCounts, {
        command: 0,
        condition: 0,
        effect: 0,
        payment: 0,
        queue: 0,
        cutover: 0,
    });
    assert.equal(result.summary.crossLayerViolationCount, 0);
    assert.equal(result.summary.architectureTestCoverageViolationCount, 0);
    assert.equal(result.summary.violationCount, 0);
});

test('M3G cross-layer ownership rejects generic engine dependencies on compatibility/application layers', () => {
    assert.deepEqual(
        analyzeGenericM3Dependency(
            "import { x } from '../../legacy/bridge/example.mjs';\nexport const y = x;\n",
            'src/engine/costs/example.mjs'
        ),
        ['src/engine/costs/example.mjs: generic M3 engine package may not depend upward on src/legacy/bridge/example.mjs']
    );

    assert.deepEqual(
        analyzeGenericM3Dependency(
            "import { x } from '../../application/evolve/example.mjs';\nexport const y = x;\n",
            'src/engine/commands/example.mjs'
        ),
        ['src/engine/commands/example.mjs: generic M3 engine package may not depend upward on src/application/evolve/example.mjs']
    );
});

test('M3G cross-layer ownership rejects first-party content identity inside generic engine packages', () => {
    assert.deepEqual(
        analyzeGenericM3Dependency(
            "export const id = 'evolve:command/example';\n",
            'src/engine/effects/example.mjs'
        ),
        ['src/engine/effects/example.mjs: generic M3 engine packages may not embed first-party Evolve content IDs']
    );
});

test('M3G architecture coverage fails closed on omitted, duplicate, stale and unwrapped M3 gates', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m3-coverage-'));
    const architectureRoot = path.join(fixtureRoot, 'tests', 'architecture');
    fs.mkdirSync(architectureRoot, { recursive: true });

    fs.writeFileSync(path.join(architectureRoot, 'm3alpha.cjs'), "'use strict';\n");
    fs.writeFileSync(path.join(architectureRoot, 'm3alpha.test.cjs'), "'use strict';\n");
    fs.writeFileSync(path.join(architectureRoot, 'm3beta.cjs'), "'use strict';\n");
    fs.writeFileSync(path.join(fixtureRoot, 'package.json'), JSON.stringify({
        scripts: {
            'test:architecture': [
                'node tests/architecture/m3alpha.cjs',
                'node tests/architecture/m3alpha.cjs',
                'node tests/architecture/m3stale.cjs',
            ].join(' && '),
        },
    }));

    try {
        const violations = m3ArchitectureTestCoverageViolations(fixtureRoot);
        assert.ok(violations.some(item => item.includes('m3alpha.cjs: direct M3 architecture gate appears 2 times')));
        assert.ok(violations.some(item => item.includes('m3beta.cjs: direct M3 architecture gate is missing from scripts.test:architecture')));
        assert.ok(violations.some(item => item.includes('m3beta.cjs: direct M3 architecture gate is missing npm-test wrapper m3beta.test.cjs')));
        assert.ok(violations.some(item => item.includes('m3stale.cjs')));
    }
    finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});

test('M3G prerequisite aggregation preserves slice identity in diagnostics', () => {
    const violations = prerequisiteViolations({
        command: ['command problem'],
        condition: ['condition problem'],
        effect: [],
        payment: [],
        queue: ['queue problem'],
        cutover: ['cutover problem'],
    });

    assert.deepEqual(violations, [
        'M3G M3A command prerequisite: command problem',
        'M3G M3B condition prerequisite: condition problem',
        'M3G M3E queue prerequisite: queue problem',
        'M3G M3F cutover prerequisite: cutover problem',
    ]);
});
