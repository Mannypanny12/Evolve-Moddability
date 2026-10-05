'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeEffectModule,
    analyzeInertDataContract,
    findViolations,
} = require('./m3c1-effect-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');
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
        `const target = './common.mjs'; export const x = import(target);`,
        `const x = require('./common.mjs');`,
        `const loader = require; export const x = loader('./common.mjs');`,
        `import data from './operations.json';`,
    ];
    for (const source of cases){
        assert.notEqual(analyzeEffectModule(source, EFFECT_FILE).length, 0, source);
    }
});

test('M3C1 effect fitness rejects computed dynamic module loading independently of import resolution', () => {
    const cases = [
        `const target = './common.mjs'; export const x = import(target);`,
        `const loader = require; export const x = loader('./common.mjs');`,
    ];
    for (const source of cases){
        const violations = analyzeEffectModule(source, EFFECT_FILE);
        assert.equal(
            violations.some(item => item.includes('dynamic module loading')),
            true,
            `${source}: ${JSON.stringify(violations)}`
        );
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

test('M3C1 effect fitness rejects direct and indirect dynamic-code capabilities', () => {
    const cases = [
        `export const x = eval('1');`,
        `export const x = (0, eval)('1');`,
        `const Maker = Function; export const x = Maker('return 1')();`,
        `export const x = WebAssembly.instantiate(bytes);`,
    ];
    for (const source of cases){
        const violations = analyzeEffectModule(source, EFFECT_FILE);
        assert.equal(
            violations.some(item => item.includes('dynamic code capability')),
            true,
            `${source}: ${JSON.stringify(violations)}`
        );
    }

    assert.deepEqual(
        analyzeEffectModule(`export const text = 'eval Function WebAssembly require import('; // eval`, EFFECT_FILE),
        []
    );
});

test('M3C1 inert-data contract fitness allows only static identity dependency', () => {
    assert.deepEqual(
        analyzeInertDataContract(`import { EngineContractError } from '../identity.mjs';`),
        []
    );
    for (const source of [
        `import x from '../state/common.mjs';`,
        `export const x = Date.now();`,
        `export const x = (0, eval)('1');`,
        `const x = require('../identity.mjs');`,
        `const target = '../identity.mjs'; export const x = import(target);`,
    ]){
        assert.notEqual(analyzeInertDataContract(source).length, 0, source);
    }
});

test('M3C1 current repository satisfies effect boundary fitness', () => {
    assert.deepEqual(findViolations(root), []);
});
