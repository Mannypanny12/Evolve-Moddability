'use strict';
const path = require('node:path');
const test = require('node:test');
const { buildBoundarySnapshot } = require('./m2c-boundary-fitness.cjs');
const root = path.resolve(__dirname, '..', '..');
test('temporary M2C review boundary bootstrap output', () => {
    console.log('M2C_REVIEW_BASELINE_SNAPSHOT_START');
    console.log(JSON.stringify(buildBoundarySnapshot(root), null, 2));
    console.log('M2C_REVIEW_BASELINE_SNAPSHOT_END');
});
