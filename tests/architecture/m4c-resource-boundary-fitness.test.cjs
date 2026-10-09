'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { findViolations } = require('./m4c-resource-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4C resource package satisfies its dedicated architecture boundary', () => {
    assert.deepEqual(findViolations(root), []);
});
