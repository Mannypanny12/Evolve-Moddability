'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    ARCHITECTURE_REPORT_VERSION,
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
    assert.equal(report.stateArchitecture.migration.gates.achievementAuthority.passed, true);
    assert.equal(report.stateArchitecture.migration.gates.achievementReaders.passed, true);
    assert.equal(report.stateArchitecture.selectors.domainCount, 1);

    assert.equal(Array.isArray(report.legacyMappings), true);
    assert.equal(report.legacyMappings.length, 2);
    assert.deepEqual(reportViolations(report), []);

    const serialized = JSON.stringify(report);
    const roundTrip = JSON.parse(serialized);
    assert.deepEqual(roundTrip, report);
    assert.equal(roundTrip.legacyMappings.length, 2, 'legacy mappings must survive report serialization');
});
