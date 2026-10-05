'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    analyzeEffectModule,
    analyzeInertDataContract,
} = require('./m3c1-effect-boundary-fitness.cjs');

const EFFECT_FILE = 'src/engine/effects/example.mjs';

test('M3C1 effect fitness allows identity, inert-data contract and sibling effect imports', () => {
    const source = `
        import { EngineContractError } from '../identity.mjs';
        import { inspectPlainInertObject } from '../contracts/inert-data.mjs';
        import { helper } from './common.mjs';
        export const value = helper(EngineContractError, inspectPlainInertObject);
    `;
    assert.deepEqual(analyzeEffectModule(source, EFFECT_FILE), []);
});

test('M3C1 effect fitness rejects state, runtime, legacy, command and external dependencies', () => {
    const cases = [
        `import x from '../state/state-store.mjs';`,
        `import x from '../runtime/rng.mjs';`,
        `import x from '../../legacy/bridge/inspector.mjs';`,
        `import x from '../commands/command-bus.mjs';`,
        `import x from 'some-package';`,
        `const x = import('./common.mjs');`,
    ];
    for (const source of cases){
        assert.notEqual(analyzeEffectModule(source, EFFECT_FILE).length, 0, source);
    }
});

test('M3C1 effect fitness rejects mutation authority and platform/runtime globals', () => {
    const cases = [
        `export const x = mutationAuthority;`,
        `export const x = createMutationScope;`,
        `export const x = modRes;`,
        `export const x = document.body;`,
        `export const x = Math.random();`,
        `export const x = setTimeout(() => {}, 0);`,
        `export const x = localStorage;`,
    ];
    for (const source of cases){
        assert.notEqual(analyzeEffectModule(source, EFFECT_FILE).length, 0, source);
    }
});

test('M3C1 inert-data contract fitness allows only identity dependency', () => {
    assert.deepEqual(
        analyzeInertDataContract(`import { EngineContractError } from '../identity.mjs';`),
        []
    );
    assert.notEqual(
        analyzeInertDataContract(`import x from '../state/common.mjs';`).length,
        0
    );
    assert.notEqual(
        analyzeInertDataContract(`export const x = Date.now();`).length,
        0
    );
});
