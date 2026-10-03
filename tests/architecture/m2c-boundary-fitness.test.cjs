'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    analyzeSettingsAccesses,
    importedVarsBindings,
    compareBoundarySnapshot,
    parseGameStateRootFields,
    gameStateRootViolations,
    buildBoundarySnapshot,
    loadBoundaryBaseline,
    scanM2CBoundary,
} = require('./m2c-boundary-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');

function withTempGameState(source, callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2c3-'));
    try {
        const dir = path.join(temp, 'src', 'engine', 'state');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'game-state.mjs'), source);
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

function emptySnapshot(runtimeConsumers = {}){
    return { snapshotVersion: 1, settingsAccesses: {}, runtimeConsumers };
}

test('M2C3 recognizes static, bracket, existence-check and dynamic settings access without counting comments or strings', () => {
    const source = [
        'global.settings.pause;',
        'global["settings"]["q_merge"];',
        "global['settings'].qAny;",
        "global.settings.hasOwnProperty('touch');",
        'global.settings.hasOwnProperty(key);',
        'global.settings[key];',
        'const root = global.settings;',
        '// global.settings.fake;',
        'const text = "global.settings.fake";',
    ].join('\n');
    assert.deepEqual(analyzeSettingsAccesses(source), {
        '$dynamic': 2,
        '$root': 1,
        pause: 1,
        qAny: 1,
        q_merge: 1,
        touch: 1,
    });
});

test('M2C3 prototype-shaped setting names remain ordinary counted data', () => {
    assert.deepEqual(analyzeSettingsAccesses("global.settings['hasOwnProperty'];"), { hasOwnProperty: 1 });
});

test('M2C3 recognizes named vars imports including aliases and namespace imports', () => {
    const source = [
        "import { p_on, support_on as supportMap } from './vars.js';",
        "import * as legacyVars from './vars.js';",
    ].join('\n');
    assert.deepEqual(importedVarsBindings(source), ['$namespace', 'p_on', 'support_on']);
});

test('M2C3 settings debt is downward-only per module and setting key', () => {
    const expected = {
        snapshotVersion: 1,
        settingsAccesses: { 'a.js': { pause: 2 } },
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    const increased = {
        snapshotVersion: 1,
        settingsAccesses: { 'a.js': { pause: 3 } },
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    assert.match(compareBoundarySnapshot(increased, expected).join('\n'), /settings-access debt increased: a\.js pause 3 > 2/);

    const decreased = {
        snapshotVersion: 1,
        settingsAccesses: { 'a.js': { pause: 1 } },
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    assert.match(compareBoundarySnapshot(decreased, expected).join('\n'), /baseline must ratchet downward: a\.js pause is now 1 < 2/);
});

test('M2C3 runtime binding consumers are downward-only', () => {
    const expected = emptySnapshot({ '$namespace': [], p_on: ['a.js'] });
    const increased = emptySnapshot({ '$namespace': [], p_on: ['a.js', 'b.js'] });
    assert.match(compareBoundarySnapshot(increased, expected).join('\n'), /runtime consumer debt increased: p_on gained b\.js/);

    const decreased = emptySnapshot({ '$namespace': [], p_on: [] });
    assert.match(compareBoundarySnapshot(decreased, expected).join('\n'), /runtime consumer baseline must ratchet downward: p_on no longer used by a\.js/);
});

test('M2C3 runtime baseline keyset is fail-closed', () => {
    const expected = emptySnapshot({ '$namespace': [], p_on: [] });
    const actual = emptySnapshot({ '$namespace': [], p_on: [], support_on: [] });
    assert.match(compareBoundarySnapshot(actual, expected).join('\n'), /baseline missing reviewed bindings: support_on/);
});

test('M2C3 permanently rejects generic non-authoritative GameState roots', () => {
    const source = "const GAME_STATE_ROOT_FIELDS = Object.freeze(['schemaVersion', 'settings', 'achievements']);\n";
    assert.deepEqual(parseGameStateRootFields(source), ['schemaVersion', 'settings', 'achievements']);
    withTempGameState(source, temp => {
        assert.deepEqual(gameStateRootViolations(temp), ['M2C3 forbids generic non-authoritative GameState root: settings']);
    });
});

test('M2C3 fails closed if the GameState root declaration changes beyond inspection', () => {
    withTempGameState('const roots = [\'schemaVersion\'];\n', temp => {
        assert.match(gameStateRootViolations(temp).join('\n'), /cannot inspect GAME_STATE_ROOT_FIELDS/);
    });
});

test('current repository exactly matches the frozen M2C3 boundary baseline', () => {
    const baseline = loadBoundaryBaseline(root);
    const actual = buildBoundarySnapshot(root);
    assert.deepEqual(compareBoundarySnapshot(actual, baseline), []);
});

test('current GameState root contains no M2C-forbidden catch-all layer', () => {
    assert.deepEqual(gameStateRootViolations(root), []);
});

test('current repository satisfies the complete M2C3 boundary gate', () => {
    const result = scanM2CBoundary(root);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.ok(result.summary.settingsReferenceCount > 0);
    assert.ok(result.summary.runtimeBindingCount > 0);
});
