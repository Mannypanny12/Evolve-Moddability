'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { scanAchievementAuthority } = require('./m2d3-achievement-authority-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2D3 achievement authority fitness remains independently covered by npm test', () => {
    assert.deepEqual(scanAchievementAuthority(root).violations, []);
});
