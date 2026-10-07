'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeCommitConsumerSource,
    findViolations,
} = require('./m3f1-resource-commit-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const reviewedRuntime = 'src/application/evolve/evolution-dna-command-runtime.mjs';
const resourceCommitImport = "import { createResourceCommitExecutor } from '../../engine/execution/resource-commit.mjs';";
const legacyAdapterImport = "import { createEvolveLegacyResourceCommitCapability } from '../../legacy/bridge/evolve-resource-commit-adapter.mjs';";

test('M3F1 resource commit boundary admits the reviewed M3F3 DNA runtime', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3F1 resource commit boundary rejects an unreviewed production consumer', () => {
    const analysis = analyzeCommitConsumerSource(
        'src/application/evolve/unreviewed-runtime.mjs',
        `${resourceCommitImport}\n${legacyAdapterImport}\n`
    );

    assert.equal(analysis.violations.length, 2);
    assert.ok(analysis.violations.every(violation => violation.includes('may only be consumed by the reviewed DNA runtime')));
});

test('M3F1 resource commit boundary recognizes the reviewed runtime imports', () => {
    const analysis = analyzeCommitConsumerSource(
        reviewedRuntime,
        `${resourceCommitImport}\n${legacyAdapterImport}\n`
    );

    assert.deepEqual(analysis.violations, []);
    assert.deepEqual(
        [...analysis.targets].sort(),
        [
            'src/engine/execution/resource-commit.mjs',
            'src/legacy/bridge/evolve-resource-commit-adapter.mjs',
        ]
    );
});
