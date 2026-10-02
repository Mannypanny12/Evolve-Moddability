'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    engineSourceViolations,
    maskNonCode,
    scanRepository,
    loadBaseline,
    runArchitectureCheck,
} = require('./architecture-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const engineRoot = path.join(root, 'src', 'engine');
const virtualFile = path.join(engineRoot, 'negative-control.js');
const zeroMetrics = () => ({ global: 0, browser: 0, storage: 0, clock: 0, random: 0 });
const emptyBaseline = () => ({
    legacyModules: {},
    largestLegacySccSize: 0,
    allowedLegacyCycleMembers: [],
});
const silentLogger = { log(){}, error(){} };

function withTempRepository(callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-architecture-'));
    try {
        fs.mkdirSync(path.join(temp, 'src', 'engine'), { recursive: true });
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

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
    rejects("const legacy = require('../vars.js');", 'CommonJS require()');
    rejects("const legacy = import('../vars.js');", 'engine import escapes src/engine');
});

test('M0E5 rejects renamed imports of forbidden browser/UI packages', () => {
    rejects("import jqAlias from 'jquery';", 'forbidden engine package import: jquery');
    rejects("import Framework from 'vue';", 'forbidden engine package import: vue');
    rejects("import Component from '@vue/runtime-core';", 'forbidden engine package import: @vue/runtime-core');
    rejects("import UiKit from 'buefy';", 'forbidden engine package import: buefy');
});

test('M0E5 ignores forbidden words in comments and literal text but still scans template expressions', () => {
    const harmless = [
        '// global.resource window document Math.random() import("../vars.js")',
        'const text = "localStorage Date.now() $(\\"#x\\") import(\\"../vars.js\\") require(\\"../vars.js\\")";',
        "const other = 'new Date() Vue';",
        'const template = `global.resource window Math.rand()`;',
        'const pattern = /window|global|Math\\.random|import\\(\\\"..\\/vars\\.js\\\"\\)/;',
    ].join('\n');
    assert.deepEqual(engineSourceViolations(harmless, virtualFile, engineRoot), []);

    const masked = maskNonCode('const x = `value: ${global.resource.Food.amount}`;');
    assert.match(masked, /global\.resource/);
    rejects('const x = `value: ${global.resource.Food.amount}`;', 'legacy global');
});



test('repository-level gate discovers clean .mjs engine code and returns success', () => {
    withTempRepository(temp => {
        fs.writeFileSync(path.join(temp, 'src', 'engine', 'identity.mjs'), 'export const id = "test:item";\n');
        const outcome = runArchitectureCheck(temp, emptyBaseline(), silentLogger);
        assert.equal(outcome.result.summary.engineFileCount, 1);
        assert.deepEqual(outcome.result.violations, []);
        assert.equal(outcome.exitCode, 0);
    });
});

test('repository-level gate discovers forbidden .cjs engine code and returns failure', () => {
    withTempRepository(temp => {
        fs.writeFileSync(path.join(temp, 'src', 'engine', 'bad.cjs'), 'module.exports = global.resource;\n');
        const outcome = runArchitectureCheck(temp, emptyBaseline(), silentLogger);
        assert.equal(outcome.result.summary.engineFileCount, 1);
        assert.equal(outcome.exitCode, 1);
        assert.match(outcome.result.violations.join('\n'), /forbidden engine dependency: legacy global/);
    });
});

test('repository-level gate rejects an engine import cycle across supported source extensions', () => {
    withTempRepository(temp => {
        fs.writeFileSync(path.join(temp, 'src', 'engine', 'a.js'), "import './b.mjs';\nexport const a = 1;\n");
        fs.writeFileSync(path.join(temp, 'src', 'engine', 'b.mjs'), "import './a.js';\nexport const b = 1;\n");
        const outcome = runArchitectureCheck(temp, emptyBaseline(), silentLogger);
        assert.equal(outcome.exitCode, 1);
        assert.match(outcome.result.violations.join('\n'), /src\/engine import cycle:/);
    });
});

test('legacy cycle guard rejects a new module joining the frozen SCC', () => {
    withTempRepository(temp => {
        const src = path.join(temp, 'src');
        fs.writeFileSync(path.join(src, 'a.js'), "import './b.js';\n");
        fs.writeFileSync(path.join(src, 'b.js'), "import './a.js';\n");
        fs.writeFileSync(path.join(src, 'c.js'), 'export const c = 1;\n');

        const baseline = {
            legacyModules: {
                'a.js': zeroMetrics(),
                'b.js': zeroMetrics(),
                'c.js': zeroMetrics(),
            },
            largestLegacySccSize: 2,
            allowedLegacyCycleMembers: ['a.js', 'b.js'],
        };

        assert.deepEqual(scanRepository(temp, baseline).violations, []);

        fs.writeFileSync(path.join(src, 'a.js'), "import './b.js';\nimport './c.js';\n");
        fs.writeFileSync(path.join(src, 'c.js'), "import './a.js';\n");
        const result = scanRepository(temp, baseline);
        assert.match(result.violations.join('\n'), /Legacy dependency cycle gained a new member: src\/c\.js/);
        assert.match(result.violations.join('\n'), /Largest legacy SCC grew: 3 > 2/);
    });
});

test('legacy SCC improvement must ratchet the stored cycle baseline downward', () => {
    withTempRepository(temp => {
        const src = path.join(temp, 'src');
        fs.writeFileSync(path.join(src, 'a.js'), "import './b.js';\n");
        fs.writeFileSync(path.join(src, 'b.js'), "import './a.js';\n");

        const baseline = {
            legacyModules: {
                'a.js': zeroMetrics(),
                'b.js': zeroMetrics(),
            },
            largestLegacySccSize: 2,
            allowedLegacyCycleMembers: ['a.js', 'b.js'],
        };

        assert.deepEqual(scanRepository(temp, baseline).violations, []);

        fs.writeFileSync(path.join(src, 'b.js'), 'export const b = 1;\n');
        const result = scanRepository(temp, baseline);
        assert.match(result.violations.join('\n'), /Legacy SCC baseline must ratchet downward/);
        assert.match(result.violations.join('\n'), /Legacy cycle-member baseline must ratchet downward/);
    });
});

test('current repository satisfies the frozen M0E5 architecture baseline', () => {
    const baseline = loadBaseline(root);
    const result = scanRepository(root, baseline);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.equal(result.summary.largestLegacySccSize, baseline.largestLegacySccSize);
});
