'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    ARCHITECTURE_REPORT_VERSION,
    assertJsonData,
    normalizeJsonData,
    buildArchitectureReport,
    reportViolations,
} = require('./architecture-report.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2E4 architecture report is complete, JSON-safe, and reflects the guarded repository state', async () => {
    const report = await buildArchitectureReport(root);

    assert.equal(report.reportVersion, ARCHITECTURE_REPORT_VERSION);
    assert.equal(report.legacy.moduleCount > 0, true);
    assert.equal(report.legacy.counters.global > 0, true);
    assert.equal(report.legacy.largestSccSize > 0, true);
    assert.equal(report.protectedLayers.engineFileCount > 0, true);
    assert.equal(report.protectedLayers.platformFileCount > 0, true);
    assert.equal(report.protectedLayers.bridgeFileCount > 0, true);

    assert.equal(report.stateArchitecture.boundary.settingsReferenceCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.nestedSettingsModuleCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.nestedSettingsReferenceCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.reviewedNestedSettingPaths.length > 0, true);
    assert.equal(report.stateArchitecture.boundary.runtimeBindingCount > 0, true);
    assert.equal(report.stateArchitecture.ownership.domainCount, 1);
    assert.deepEqual(report.stateArchitecture.ownership.metadataRoots, ['schemaVersion']);
    assert.deepEqual(report.stateArchitecture.ownership.domains, [
        { root: 'achievements', owner: 'achievement-state' },
    ]);
    assert.deepEqual(report.stateArchitecture.mutation.writableRoots, ['achievements']);
    assert.deepEqual(report.stateArchitecture.mutationReview.reviewedSurfaces.map(value => value.root), ['achievements']);
    assert.equal(report.stateArchitecture.migration.gates.achievementAuthority.passed, true);
    assert.equal(report.stateArchitecture.migration.gates.achievementReaders.passed, true);
    assert.equal(report.stateArchitecture.selectors.domainCount, 1);

    assert.equal(report.legacyMappings.size, 2);
    assert.equal(report.legacyMappings.mappings.length, 2);
    assert.equal(typeof report.legacyMappings.byDomain, 'object');
    assert.deepEqual(reportViolations(report), []);

    assert.doesNotThrow(() => assertJsonData(report));
    const serialized = JSON.stringify(report);
    const roundTrip = JSON.parse(serialized);
    assert.deepEqual(roundTrip, report);
    assert.equal(roundTrip.legacyMappings.size, 2, 'legacy mappings must survive report serialization');
    assert.equal(roundTrip.legacyMappings.mappings.length, 2, 'legacy mapping records must survive report serialization');
});

test('M2E4 JSON normalization fails closed instead of silently dropping unsupported report data', () => {
    assert.throws(() => normalizeJsonData({ hidden: undefined }), /unsupported JSON value type undefined/);
    assert.throws(() => normalizeJsonData({ count: Infinity }), /non-finite number/);
    assert.throws(() => normalizeJsonData(new Map([['hidden', true]])), /plain or null object prototype/);

    const symbolData = { visible: true };
    symbolData[Symbol('hidden')] = true;
    assert.throws(() => normalizeJsonData(symbolData), /symbol keys/);

    const cycle = {};
    cycle.self = cycle;
    assert.throws(() => normalizeJsonData(cycle), /cycle/);
});
