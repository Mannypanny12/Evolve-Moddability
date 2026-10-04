'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    stripReviewedNamedVarsImports,
    referenceTargetsVars,
    unreviewedVarsReferenceViolations,
    settingsSyntaxViolations,
    parseStrictStringArrayBody,
    parseStrictGameStateRootFields,
    scanM2CSyntaxHardening,
} = require('./m2c-syntax-hardening.cjs');

const root = path.resolve(__dirname, '..', '..');
const fakeRoot = path.join(path.sep, 'repo');
const fakeMain = path.join(fakeRoot, 'src', 'main.js');

test('M2C syntax hardening leaves the reviewed named vars import form intact', () => {
    const source = "import { p_on, support_on as supportMap } from './vars.js';\nconst x = 1;\n";
    const stripped = stripReviewedNamedVarsImports(source);
    assert.equal(/vars\.js/.test(stripped), false);
    assert.deepEqual(unreviewedVarsReferenceViolations(source, fakeMain, fakeRoot), []);
});

test('M2C syntax hardening catches alternate vars access and re-export forms', () => {
    const cases = [
        "import legacyVars, { p_on } from './vars.js';",
        "import * as legacyVars from './vars.js';",
        "import legacyVars from './vars.js';",
        "const legacyVars = require('./vars');",
        "const legacyVars = import('./vars.js');",
        "export { p_on } from './vars.js';",
        "export * from './vars.js';",
        "import './vars.js';",
        "import { p_on } from './../src/vars.js';",
    ];
    for (const source of cases){
        const violations = unreviewedVarsReferenceViolations(source, fakeMain, fakeRoot);
        assert.equal(violations.length > 0, true, source);
    }
});

test('M2C syntax hardening resolves equivalent local vars module paths', () => {
    assert.equal(referenceTargetsVars('./vars.js', fakeMain, fakeRoot), true);
    assert.equal(referenceTargetsVars('./vars', fakeMain, fakeRoot), true);
    assert.equal(referenceTargetsVars('./../src/vars.js', fakeMain, fakeRoot), true);
    assert.equal(referenceTargetsVars('./actions.js', fakeMain, fakeRoot), false);
});

test('M2C syntax hardening catches settings syntax that bypasses path-specific debt tracking', () => {
    const source = [
        'const a = global?.settings.pause;',
        'const b = global.settings?.msgFilters[tag].vis;',
        'const c = global.settings.msgFilters?.[tag].unlocked;',
        "const d = global?.['settings'].space.moon;",
        'const { settings } = global;',
        'const e = global[`settings`].pause;',
        '// const ignored = global?.settings.fake;',
        'const text = "global.settings?.msgFilters[tag].vis";',
    ].join('\n');
    const violations = settingsSyntaxViolations(source, fakeMain).join('\n');
    assert.match(violations, /optional chaining inside direct global\.settings access/);
    assert.match(violations, /destructuring settings from legacy global/);
    assert.match(violations, /template-literal access to global settings/);
});

test('M2C syntax hardening does not confuse unrelated optional legacy-global access with settings debt', () => {
    const source = [
        'const a = global?.tech?.primitive;',
        'const b = global.eden?.mech_station?.count;',
        'const c = wiki?.count ?? 0;',
    ].join('\n');
    assert.deepEqual(settingsSyntaxViolations(source, fakeMain), []);
});

test('M2C strict GameState root parser accepts only plain string-literal arrays', () => {
    assert.deepEqual(parseStrictStringArrayBody("'schemaVersion', /* reviewed */ 'achievements',"), [
        'schemaVersion',
        'achievements',
    ]);
    assert.equal(parseStrictStringArrayBody("'schemaVersion', EXTRA_ROOT"), null);
    assert.equal(parseStrictStringArrayBody("'schemaVersion', ...EXTRA_ROOTS"), null);
    assert.equal(parseStrictStringArrayBody("'schemaVersion', `settings`"), null);
    assert.equal(parseStrictStringArrayBody("'schemaVersion', 'set\\tings'"), null);
});

test('M2C strict GameState root declaration fails closed on expressions hidden among literals', () => {
    const safe = "const GAME_STATE_ROOT_FIELDS = Object.freeze(['schemaVersion', 'achievements']);\n";
    assert.deepEqual(parseStrictGameStateRootFields(safe), ['schemaVersion', 'achievements']);

    const unsafe = [
        "const EXTRA_ROOT = 'settings';",
        "const GAME_STATE_ROOT_FIELDS = Object.freeze(['schemaVersion', EXTRA_ROOT]);",
    ].join('\n');
    assert.equal(parseStrictGameStateRootFields(unsafe), null);
});

test('current repository satisfies the M2C syntax-hardening companion gate', () => {
    const result = scanM2CSyntaxHardening(root);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.ok(result.summary.legacyModuleCount > 0);
});
