'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    REVIEWED_COMMAND_ID,
    REVIEWED_COMMAND,
    REVIEWED_RUNTIME,
    REVIEWED_EXECUTION_AUTHORITY,
    REVIEWED_LEGACY_WRITE_CAPABILITY,
    analyzeGenericM3Dependency,
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
