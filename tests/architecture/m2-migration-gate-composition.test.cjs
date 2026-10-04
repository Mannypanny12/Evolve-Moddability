'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    scanAchievementAuthority,
} = require('./m2d3-achievement-authority-fitness.cjs');
const {
    scanAchievementReaders,
} = require('./m2d4-achievement-reader-fitness.cjs');
const {
    scanM2MigrationGates,
} = require('./m2-migration-gate-adapter.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2D3 and M2D4 expose composable scanner results without subprocess-only semantics', () => {
    const authority = scanAchievementAuthority(root);
    const readers = scanAchievementReaders(root);

    assert.deepEqual(authority.violations, []);
    assert.equal(authority.summary.passed, true);
    assert.equal(authority.summary.consumerCount, 3);
    assert.deepEqual(readers.violations, []);
    assert.equal(readers.summary.passed, true);
    assert.equal(readers.summary.readerExportCount, 6);
});

test('M2 migration gate aggregation reuses direct scanner summaries', () => {
    const aggregate = scanM2MigrationGates(root);

    assert.deepEqual(aggregate.violations, []);
    assert.equal(aggregate.summary.gateCount, 2);
    assert.equal(aggregate.summary.gates.achievementAuthority.passed, true);
    assert.equal(aggregate.summary.gates.achievementAuthority.details.consumerCount, 3);
    assert.equal(aggregate.summary.gates.achievementReaders.passed, true);
    assert.equal(aggregate.summary.gates.achievementReaders.details.readerExportCount, 6);
    assert.equal(
        Object.prototype.hasOwnProperty.call(aggregate.summary.gates.achievementAuthority, 'exitStatus'),
        false,
        'composable migration gates should no longer expose subprocess exit status as their data contract'
    );
});
