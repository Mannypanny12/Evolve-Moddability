'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    CONTENT,
    analyzeContentSource,
    findViolations,
} = require('./m4e3-explicit-state-production-content-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function contentSource(){
    return fs.readFileSync(path.join(root, ...CONTENT.split('/')), 'utf8');
}

test('M4E3 explicit-state content stays inside the reviewed pure calculation boundary', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4E3 content guard rejects direct legacy state and gameplay helpers', () => {
    for (const injected of [
        '\nconst leaked = global.tech;\n',
        '\nconst leaked = traits.tough.vars()[0];\n',
        '\nconst leaked = p_on.corruptor;\n',
        "\nconst leaked = hellSupression('gate', 0, false);\n",
    ]){
        assert.notDeepEqual(analyzeContentSource(contentSource() + injected), []);
    }
});

test('M4E3 content guard rejects platform, mutation and dynamic capabilities', () => {
    for (const injected of [
        '\nwindow.location.reload();\n',
        '\ncommitTransaction();\n',
        '\nsetTimeout(() => {}, 1);\n',
        '\nconst x = Math.random();\n',
        "\nconst x = import('./anything.mjs');\n",
    ]){
        assert.notDeepEqual(analyzeContentSource(contentSource() + injected), []);
    }
});

test('M4E3 content guard rejects legacy production dependencies', () => {
    const mutated = contentSource().replace(
        "import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';",
        "import { production as legacyProduction } from '../../../prod.js';"
    );
    assert.match(analyzeContentSource(mutated).join('\n'), /unsupported M4E3 dependency src\/prod\.js/);
});
