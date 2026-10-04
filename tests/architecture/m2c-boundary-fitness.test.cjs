'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    analyzeSettingsAccesses,
    analyzeNestedSettingsAccesses,
    importedVarsBindings,
    compareBoundarySnapshot,
    validateBoundaryBaseline,
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

function withTempBoundaryBaselines(legacy, nested, callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2c3-baseline-'));
    try {
        const dir = path.join(temp, 'tests', 'architecture');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'm2c-boundary-baseline.json'), JSON.stringify(legacy));
        fs.writeFileSync(path.join(dir, 'm2c-nested-boundary-baseline.json'), JSON.stringify(nested));
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

function emptySnapshot(runtimeConsumers = {}){
    return { snapshotVersion: 2, settingsAccesses: {}, nestedSettingsAccesses: {}, runtimeConsumers };
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

test('M2C3 ratchets mixed nested settings at ownership-significant paths', () => {
    const source = [
        'global.settings.space.moon;',
        'global.settings.space[region];',
        'global.settings.space;',
        'global.settings.msgFilters[tag].vis;',
        'global.settings.msgFilters[tag].unlocked;',
        'global.settings.msgFilters[tag];',
        'global.settings.keyMap[key];',
        'global.settings.resBar.Food;',
        "global.settings.arpa.hasOwnProperty('physics');",
    ].join('\n');
    assert.deepEqual(analyzeNestedSettingsAccesses(source), {
        'arpa.physics': 1,
        'keyMap.$dynamic': 1,
        'msgFilters.$dynamic.$root': 1,
        'msgFilters.$dynamic.unlocked': 1,
        'msgFilters.$dynamic.vis': 1,
        'resBar.Food': 1,
        'space.$dynamic': 1,
        'space.$root': 1,
        'space.moon': 1,
    });
});

test('M2C3 dynamic bracket parsing continues after the closing bracket', () => {
    const source = 'global.settings.msgFilters[getFilter(tags[index])].save;';
    assert.deepEqual(analyzeNestedSettingsAccesses(source), { 'msgFilters.$dynamic.save': 1 });
});

test('M2C3 prototype-shaped setting names remain ordinary counted data', () => {
    assert.deepEqual(analyzeSettingsAccesses("global.settings['hasOwnProperty'];"), { hasOwnProperty: 1 });
});

test('M2C3 recognizes named vars imports, aliases and whole-module escape hatches', () => {
    const source = [
        "import { p_on, support_on as supportMap } from './vars.js';",
        "import * as legacyVars from './vars.js';",
        "const lazyVars = import('./vars.js');",
        "const requiredVars = require('./vars');",
    ].join('\n');
    assert.deepEqual(importedVarsBindings(source), ['$namespace', 'p_on', 'support_on']);
});

test('M2C3 settings debt is downward-only per module and setting key', () => {
    const expected = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { pause: 2 } },
        nestedSettingsAccesses: {},
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    const increased = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { pause: 3 } },
        nestedSettingsAccesses: {},
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    assert.match(compareBoundarySnapshot(increased, expected).join('\n'), /settings-access debt increased: a\.js pause 3 > 2/);

    const decreased = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { pause: 1 } },
        nestedSettingsAccesses: {},
        runtimeConsumers: { '$namespace': [], p_on: [] },
    };
    assert.match(compareBoundarySnapshot(decreased, expected).join('\n'), /baseline must ratchet downward: a\.js pause is now 1 < 2/);
});

test('M2C3 catches nested ownership changes even when top-level settings counts stay unchanged', () => {
    const expected = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { msgFilters: 1 } },
        nestedSettingsAccesses: { 'a.js': { 'msgFilters.$dynamic.vis': 1 } },
        runtimeConsumers: { '$namespace': [] },
    };
    const changedOwnership = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { msgFilters: 1 } },
        nestedSettingsAccesses: { 'a.js': { 'msgFilters.$dynamic.unlocked': 1 } },
        runtimeConsumers: { '$namespace': [] },
    };
    const violations = compareBoundarySnapshot(changedOwnership, expected).join('\n');
    assert.match(violations, /nested-settings-access debt increased: a\.js msgFilters\.\$dynamic\.unlocked/);
    assert.match(violations, /nested-settings-access baseline must ratchet downward: a\.js msgFilters\.\$dynamic\.vis/);
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

test('M2C3 validates the reviewed baseline shape before comparing debt', () => {
    const malformed = {
        snapshotVersion: 2,
        settingsAccesses: { 'a.js': { pause: -1 } },
        nestedSettingsAccesses: [],
        runtimeConsumers: { p_on: ['a.js', 'a.js'] },
    };
    const violations = validateBoundaryBaseline(malformed).join('\n');
    assert.match(violations, /pause must be a non-negative safe integer/);
    assert.match(violations, /nestedSettingsAccesses must be an object/);
    assert.match(violations, /runtimeConsumers\.p_on must not contain duplicates/);
});

test('M2C3 composes the original and nested baselines and rejects component-version drift', () => {
    const legacy = { snapshotVersion: 1, settingsAccesses: { 'a.js': { pause: 1 } }, runtimeConsumers: { '$namespace': [] } };
    const nested = { snapshotVersion: 1, nestedSettingsAccesses: { 'a.js': { 'msgFilters.x.vis': 1 } } };
    withTempBoundaryBaselines(legacy, nested, temp => {
        assert.deepEqual(loadBoundaryBaseline(temp), {
            snapshotVersion: 2,
            settingsAccesses: legacy.settingsAccesses,
            nestedSettingsAccesses: nested.nestedSettingsAccesses,
            runtimeConsumers: legacy.runtimeConsumers,
        });
    });
    withTempBoundaryBaselines({ ...legacy, snapshotVersion: 2 }, nested, temp => {
        assert.throws(() => loadBoundaryBaseline(temp), /m2c-boundary-baseline\.json snapshotVersion must be 1/);
    });
    withTempBoundaryBaselines(legacy, { ...nested, snapshotVersion: 2 }, temp => {
        assert.throws(() => loadBoundaryBaseline(temp), /m2c-nested-boundary-baseline\.json snapshotVersion must be 1/);
    });
});

test('M2C3 permanently rejects generic non-authoritative GameState roots including layer-name variants', () => {
    const source = "const GAME_STATE_ROOT_FIELDS = Object.freeze(['schemaVersion', 'derived_state', 'applicationWorking', 'achievements']);\n";
    assert.deepEqual(parseGameStateRootFields(source), ['schemaVersion', 'derived_state', 'applicationWorking', 'achievements']);
    withTempGameState(source, temp => {
        assert.deepEqual(gameStateRootViolations(temp), [
            'M2C3 forbids generic non-authoritative GameState root: derived_state',
            'M2C3 forbids generic non-authoritative GameState root: applicationWorking',
        ]);
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
    assert.ok(result.summary.nestedSettingsReferenceCount > 0);
    assert.ok(result.summary.runtimeBindingCount > 0);
});
