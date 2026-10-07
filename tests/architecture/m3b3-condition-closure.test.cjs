'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { findM3B3Violations } = require('./m3b3-condition-closure.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M3B3 condition closure remains independently covered by npm test', () => {
    assert.deepEqual(findM3B3Violations(root), []);
});
