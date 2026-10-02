'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    engineSourceViolations,
    maskNonCode,
    scanRepository,
    loadBaseline,
} = require('./architecture-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const engineRoot = path.join(root, 'src', 'engine');
const virtualFile = path.join(engineRoot, 'negative-control.js');

function rejects(source, expected){
    const violations = engineSourceViolations(source, virtualFile, engineRoot);
    assert.ok(
        violations.some(message => message.includes(expected)),
        'Expected violation containing "' + expected + '", got: ' + violations.join(' | ')
    );
}

test('M0E5 rejects direct legacy global access in engine code', () => {
    rejects('export const x = global.resource.Food.amount;', 'legacy global');
});

test('M0E5 rejects direct browser/UI access in engine code', () => {
    rejects('document.querySelector("#x");', 'DOM document');
    rejects('window.location.href;', 'browser window');
    rejects('globalThis.document;', 'platform globalThis');
    rejects('$("#x").hide();', 'jQuery');
    rejects('new Vue({});', 'Vue');
});

test('M0E5 rejects direct storage, wall-clock, and random access in engine code', () => {
    rejects('localStorage.getItem("x");', 'localStorage');
    rejects('save.setItem("x", "y");', 'legacy save storage');
    rejects('Date.now();', 'wall clock Date.now');
    rejects('new Date();', 'wall clock new Date');
    rejects('Date();', 'wall clock Date()');
    rejects('performance.now();', 'wall clock performance.now');
    rejects('Math.random();', 'direct random source');
    rejects('Math.rand(1, 2);', 'direct random source');
    rejects('crypto.getRandomValues(new Uint8Array(4));', 'direct crypto random source');
});

test('M0E5 rejects engine imports that escape into legacy source', () => {
    rejects("import { global } from '../vars.js';", 'engine import escapes src/engine');
});

test('M0E5 ignores forbidden words in comments and literal text but still scans template expressions', () => {
    const harmless = [
        '// global.resource window document Math.random()',
        'const text = "localStorage Date.now() $(\\"#x\\")";',
        "const other = 'new Date() Vue';",
        'const template = `global.resource window Math.rand()`;',
    ].join('\n');
    assert.deepEqual(engineSourceViolations(harmless, virtualFile, engineRoot), []);

    const masked = maskNonCode('const x = `value: ${global.resource.Food.amount}`;');
    assert.match(masked, /global\.resource/);
    rejects('const x = `value: ${global.resource.Food.amount}`;', 'legacy global');
});

test('current repository satisfies the frozen M0E5 architecture baseline', () => {
    const baseline = loadBaseline(root);
    const result = scanRepository(root, baseline);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.equal(result.summary.largestLegacySccSize, baseline.largestLegacySccSize);
});
