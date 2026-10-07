'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { scanAchievementReaders } = require('./m2d4-achievement-reader-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2D4 achievement reader fitness remains independently covered by npm test', () => {
    assert.deepEqual(scanAchievementReaders(root).violations, []);
});
