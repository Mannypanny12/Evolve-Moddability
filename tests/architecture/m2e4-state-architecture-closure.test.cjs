'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { buildArchitectureReport } = require('./architecture-report.cjs');
const {
    closureViolations,
    architectureScriptViolations,
    scanM2StateArchitectureClosure,
} = require('./m2e4-state-architecture-closure.cjs');

const root = path.resolve(__dirname, '..', '..');

function clone(value){
    return JSON.parse(JSON.stringify(value));
}

test('M2E4 closure accepts the actual integrated M2 architecture', async () => {
    const result = await scanM2StateArchitectureClosure(root);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.summary.authoritativeDomains, ['achievements']);
    assert.deepEqual(result.summary.metadataRoots, ['schemaVersion']);
    assert.equal(result.summary.cumulativeGateCount, 13);
    assert.equal(result.summary.legacyMappingCount, 2);
});

test('M2E4 closure fails if a cumulative report gate disappears', async () => {
    const report = clone(await buildArchitectureReport(root));
    delete report.gateViolations.selectorReview;
    assert.match(closureViolations(report).join('\n'), /gates must be exactly/);
});

test('M2E4 closure fails if writable roots drift from authoritative ownership', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.stateArchitecture.mutation.writableRoots = [];
    assert.match(closureViolations(report).join('\n'), /writable roots must exactly equal ownership domains/);
});

test('M2E4 closure fails if selector domains drift from authoritative ownership', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.stateArchitecture.selectors.domains = [];
    assert.match(closureViolations(report).join('\n'), /selector domains must exactly equal ownership domains/);
});

test('M2E4 closure fails if mutation scope ownership no longer matches domain ownership', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.stateArchitecture.mutation.scopes[0].id = 'wrong-owner';
    assert.match(closureViolations(report).join('\n'), /must have exactly one mutation scope owned by/);
});

test('M2E4 closure fails if GameState metadata becomes writable', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.stateArchitecture.mutation.writableRoots.push('schemaVersion');
    assert.match(closureViolations(report).join('\n'), /metadata root schemaVersion may not be runtime writable/);
});

test('M2E4 closure fails if either achievement authority migration gate is absent or failing', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.stateArchitecture.migration.gates.achievementReaders.passed = false;
    assert.match(closureViolations(report).join('\n'), /migration gate achievementReaders must be present and passing/);
});

test('M2E4 closure fails if the legacy mapping inspector shape becomes opaque or incomplete', async () => {
    const report = clone(await buildArchitectureReport(root));
    report.legacyMappings = {};
    assert.match(closureViolations(report).join('\n'), /legacyMappings must preserve the reviewed JSON-safe/);
});

test('M2E4 package architecture chain contains every cumulative M2 closure gate', () => {
    assert.deepEqual(architectureScriptViolations(root), []);
});
