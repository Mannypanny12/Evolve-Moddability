'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    engineRuntimeDependencyViolations,
    platformSourceViolations,
    runPlatformArchitectureCheck,
    scanPlatform,
} = require('./platform-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const srcRoot = path.join(root, 'src');
const engineRoot = path.join(srcRoot, 'engine');
const platformRoot = path.join(srcRoot, 'platform');
const virtualPlatformFile = path.join(platformRoot, 'browser', 'negative-control.mjs');
const virtualEngineFile = path.join(engineRoot, 'negative-control.mjs');
const roots = { srcRoot, engineRoot, platformRoot };
const silentLogger = { log(){}, error(){} };

function withTempRepository(callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-platform-architecture-'));
    try {
        fs.mkdirSync(path.join(temp, 'src', 'engine'), { recursive: true });
        fs.mkdirSync(path.join(temp, 'src', 'platform', 'browser'), { recursive: true });
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

function rejectsPlatform(source, expected){
    const violations = platformSourceViolations(source, virtualPlatformFile, roots);
    assert.ok(
        violations.some(message => message.includes(expected)),
        'Expected violation containing "' + expected + '", got: ' + violations.join(' | ')
    );
}

function rejectsEngine(source, expected){
    const violations = engineRuntimeDependencyViolations(source, virtualEngineFile);
    assert.ok(
        violations.some(message => message.includes(expected)),
        'Expected violation containing "' + expected + '", got: ' + violations.join(' | ')
    );
}

test('M1C platform layer may depend inward on engine contracts', () => {
    const violations = platformSourceViolations(
        "import { createClock } from '../../engine/runtime/clock.mjs';\nexport const clock = createClock;\n",
        virtualPlatformFile,
        roots
    );
    assert.deepEqual(violations, []);
});

test('M1C platform layer rejects imports into legacy gameplay source', () => {
    rejectsPlatform("import { global } from '../../vars.js';", 'platform import escapes allowed platform/engine layers');
    rejectsPlatform("const legacy = import('../../main.js');", 'platform import escapes allowed platform/engine layers');
});

test('M1C platform layer rejects direct legacy global access and CommonJS escape hatches', () => {
    rejectsPlatform('export const legacyState = global;', 'legacy global');
    rejectsPlatform("const legacy = require('../../vars.js');", 'CommonJS require()');
});

test('M1C engine runtime guard rejects hidden diagnostics, scheduling, and random platform dependencies', () => {
    rejectsEngine('const legacyState = global;', 'legacy global symbol');
    rejectsEngine('console.warn("direct diagnostics");', 'direct console diagnostics');
    rejectsEngine('setTimeout(run, 0);', 'direct timer/scheduler API');
    rejectsEngine('requestAnimationFrame(render);', 'direct timer/scheduler API');
    rejectsEngine('crypto.randomUUID();', 'direct crypto random source');
    rejectsEngine('crypto.getRandomValues(bytes);', 'direct crypto random source');
});

test('M1C runtime guard ignores forbidden words in comments and literal text', () => {
    const harmless = [
        '// global console.log setTimeout crypto.randomUUID()',
        'const text = "global console.warn setInterval requestAnimationFrame crypto.getRandomValues";',
        'const template = `console.error global setTimeout`;'
    ].join('\n');
    assert.deepEqual(engineRuntimeDependencyViolations(harmless, virtualEngineFile), []);
});

test('M1C platform architecture gate detects platform import cycles', () => {
    withTempRepository(temp => {
        const platform = path.join(temp, 'src', 'platform', 'browser');
        fs.writeFileSync(path.join(platform, 'a.mjs'), "import './b.mjs';\nexport const a = 1;\n");
        fs.writeFileSync(path.join(platform, 'b.mjs'), "import './a.mjs';\nexport const b = 1;\n");

        const result = scanPlatform(temp);
        assert.match(result.violations.join('\n'), /src\/platform import cycle:/);
    });
});

test('M1C platform architecture gate discovers clean runtime and platform modules and returns success', () => {
    withTempRepository(temp => {
        const engine = path.join(temp, 'src', 'engine');
        const platform = path.join(temp, 'src', 'platform', 'browser');
        fs.writeFileSync(path.join(engine, 'port.mjs'), 'export const port = 1;\n');
        fs.writeFileSync(path.join(platform, 'adapter.mjs'), "import { port } from '../../engine/port.mjs';\nexport const adapter = port;\n");

        const outcome = runPlatformArchitectureCheck(temp, silentLogger);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.result.summary.engineFileCount, 1);
        assert.equal(outcome.result.summary.platformFileCount, 1);
        assert.deepEqual(outcome.result.violations, []);
    });
});

test('current repository satisfies the M1C runtime/platform architecture gate', () => {
    const outcome = runPlatformArchitectureCheck(root, silentLogger);
    assert.equal(outcome.exitCode, 0, outcome.result.violations.join('\n'));
    assert.equal(outcome.result.summary.engineFileCount > 0, true);
    assert.equal(outcome.result.summary.platformFileCount > 0, true);
});
