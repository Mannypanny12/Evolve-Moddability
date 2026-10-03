'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    bridgeSourceViolations,
    runLegacyBridgeArchitectureCheck,
    scanLegacyBridge,
} = require('./legacy-bridge-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const srcRoot = path.join(root, 'src');
const engineRoot = path.join(srcRoot, 'engine');
const bridgeRoot = path.join(srcRoot, 'legacy', 'bridge');
const roots = { srcRoot, engineRoot, bridgeRoot };
const virtualBridgeFile = path.join(bridgeRoot, 'negative-control.mjs');
const silentLogger = { log(){}, error(){} };

function rejectsBridge(source, expected){
    const violations = bridgeSourceViolations(source, virtualBridgeFile, roots);
    assert.ok(
        violations.some(message => message.includes(expected)),
        `Expected violation containing ${expected}, got: ${violations.join(' | ')}`
    );
}

function withTempRepository(callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m1d-bridge-'));
    try {
        fs.mkdirSync(path.join(temp, 'src', 'engine'), { recursive: true });
        fs.mkdirSync(path.join(temp, 'src', 'legacy', 'bridge'), { recursive: true });
        fs.writeFileSync(path.join(temp, 'src', 'engine', 'identity.mjs'), 'export const identity = 1;\n');
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

test('M1D legacy bridge may depend inward on engine code and bridge-local modules', () => {
    const source = [
        "import { identity } from '../../engine/identity.mjs';",
        "import './local.mjs';",
        'export const value = identity;',
    ].join('\n');
    assert.deepEqual(bridgeSourceViolations(source, virtualBridgeFile, roots), []);
});

test('M1D legacy bridge rejects direct legacy/platform access', () => {
    rejectsBridge('export const state = global.tech;', 'direct legacy global access');
    rejectsBridge('window.localStorage.getItem("x");', 'browser window');
    rejectsBridge('Date.now();', 'direct wall clock');
    rejectsBridge('Math.random();', 'direct random source');
    rejectsBridge('console.warn("x");', 'direct console diagnostics');
    rejectsBridge('setTimeout(run, 1);', 'direct timer/scheduler API');
});

test('M1D legacy bridge rejects imports into legacy gameplay modules', () => {
    rejectsBridge("import { global } from '../../vars.js';", 'legacy bridge import escapes bridge/engine layers');
    rejectsBridge("import '../../tech.js';", 'legacy bridge import escapes bridge/engine layers');
});

test('M1D legacy bridge guard ignores diagnostic legacy paths stored as literal metadata', () => {
    const source = [
        "const path = 'global.tech.primitive';",
        "const note = `global.resource.Food`;",
        '// global window localStorage Date.now Math.random',
        'export { path, note };',
    ].join('\n');
    assert.deepEqual(bridgeSourceViolations(source, virtualBridgeFile, roots), []);
});

test('M1D legacy bridge architecture gate rejects bridge cycles', () => {
    withTempRepository(temp => {
        const bridge = path.join(temp, 'src', 'legacy', 'bridge');
        fs.writeFileSync(path.join(bridge, 'a.mjs'), "import './b.mjs';\nexport const a = 1;\n");
        fs.writeFileSync(path.join(bridge, 'b.mjs'), "import './a.mjs';\nexport const b = 1;\n");
        const result = scanLegacyBridge(temp);
        assert.match(result.violations.join('\n'), /src\/legacy\/bridge import cycle:/);
    });
});

test('current repository satisfies the M1D legacy bridge architecture gate', () => {
    const outcome = runLegacyBridgeArchitectureCheck(root, silentLogger);
    assert.equal(outcome.exitCode, 0, outcome.result.violations.join('\n'));
    assert.equal(outcome.result.summary.bridgeFileCount > 0, true);
});
