'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { buildArchitectureReport } = require('./architecture-report.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M1D architecture report is executable and reflects the guarded repository state', async () => {
    const report = await buildArchitectureReport(root);

    assert.equal(report.legacy.moduleCount > 0, true);
    assert.equal(report.legacy.counters.global > 0, true);
    assert.equal(report.legacy.largestSccSize > 0, true);
    assert.equal(report.protectedLayers.engineFileCount > 0, true);
    assert.equal(report.protectedLayers.platformFileCount > 0, true);
    assert.equal(report.protectedLayers.bridgeFileCount > 0, true);
    assert.equal(report.legacyMappings.size, 2);
    assert.deepEqual(report.gateViolations.architecture, []);
    assert.deepEqual(report.gateViolations.platform, []);
    assert.deepEqual(report.gateViolations.bridge, []);
});
