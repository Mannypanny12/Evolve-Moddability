'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    CONTENT,
    analyzeContentSource,
    findViolations,
} = require('./m4e2-simple-production-content-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const contentPath = path.join(root, ...CONTENT.split('/'));

function contentSource(){
    return fs.readFileSync(contentPath, 'utf8');
}

test('M4E2 simple-production content stays inside the reviewed pure calculation boundary', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4E2 content guard rejects a dependency on legacy production code', () => {
    const mutated = contentSource().replace(
        "import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';",
        "import { production } from '../../../prod.js';"
    );
    const violations = analyzeContentSource(mutated).join('\n');
    assert.match(violations, /unsupported M4E2 dependency src\/prod\.js/);
    assert.match(violations, /legacy production module/);
});

test('M4E2 content guard rejects ambient capabilities and mutation authority', () => {
    const adversarialCases = [
        ['legacy/global runtime state', 'const hiddenState = global.tech;'],
        ['browser/UI capability', 'const hiddenWindow = window.location;'],
        ['browser storage', "localStorage.getItem('m4e2');"],
        ['browser/network API', "fetch('/m4e2');"],
        ['Node/platform global', 'process.cwd();'],
        ['mutation authority', "modRes('Oil', 1);"],
        ['clock/random capability', 'Math.random();'],
        ['timer or microtask scheduling', 'setTimeout(() => {}, 0);'],
        ['dynamic code capability', "eval('1');"],
        ['async/Promise/dynamic loading', 'Promise.resolve(1);'],
    ];

    for (const [label, injected] of adversarialCases){
        const violations = analyzeContentSource(`${contentSource()}\n${injected}\n`).join('\n');
        assert.match(violations, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), label);
    }
});

test('M4E2 content guard rejects dynamic module loading even when the target looks local', () => {
    const violations = analyzeContentSource(
        `${contentSource()}\nconst hiddenModule = import('../../../engine/identity.mjs');\n`
    ).join('\n');
    assert.match(violations, /only static ESM imports are allowed/);
    assert.match(violations, /async\/Promise\/dynamic loading/);
});
