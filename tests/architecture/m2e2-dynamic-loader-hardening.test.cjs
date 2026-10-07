'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    dynamicLoaderViolationsForSource,
    gameStatePrimitiveAliasViolations,
    scanDynamicEngineLoaders,
} = require('./m2e2-dynamic-loader-hardening.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2E2 dynamic-loader hardening rejects computed import and require but ignores decoys', () => {
    assert.match(
        dynamicLoaderViolationsForSource("const spec = './state-store.mjs'; import(spec);", 'dynamic.mjs').join('\n'),
        /dynamic import/
    );
    assert.match(
        dynamicLoaderViolationsForSource("const spec = './state-store.mjs'; require(spec);", 'require.cjs').join('\n'),
        /runtime require/
    );
    assert.deepEqual(
        dynamicLoaderViolationsForSource("// import(spec)\nconst text = 'require(spec)';", 'decoy.mjs'),
        []
    );
});

test('M2E2 GameState cannot alias the low-level createStateStore primitive', () => {
    const reviewed = [
        "import { createStateStore } from './state-store.mjs';",
        'function createGameStateInfrastructure(){ return createStateStore({}); }',
    ].join('\n');
    assert.deepEqual(gameStatePrimitiveAliasViolations(reviewed), []);

    const aliased = reviewed + '\nconst makeStore = createStateStore;\n';
    assert.match(gameStatePrimitiveAliasViolations(aliased).join('\n'), /aliases or extra uses are forbidden/);
});

test('current engine has no dynamic loader or low-level store alias escape route around capability review', () => {
    const violations = scanDynamicEngineLoaders(root);
    assert.deepEqual(violations, [], violations.join('\n'));
});
