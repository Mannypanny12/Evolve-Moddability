'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { analyzeConditionModule, findViolations } = require('./m3b1-condition-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3B1 condition boundary accepts identity/local condition dependencies', () => {
    const source = `
        import { EngineContractError } from '../identity.mjs';
        import { normalizeConditionOutcome } from './result.mjs';
        export function ok(){ return normalizeConditionOutcome; }
    `;
    assert.deepEqual(analyzeConditionModule(source, 'src/engine/conditions/example.mjs'), []);
});

test('M3B1 condition boundary rejects state, commands, registry, legacy/platform, external and dynamic imports', () => {
    const cases = [
        [`import { createGameStateRuntime } from '../state/game-state.mjs';`, 'GameState/state infrastructure'],
        [`import { createCommandBus } from '../commands/command-bus.mjs';`, 'command execution modules'],
        [`import { Registry } from '../registry.mjs';`, 'definition Registry'],
        [`import x from '../../legacy/bridge/inspector.mjs';`, 'legacy/platform adapters'],
        [`import x from '../../platform/browser/runtime.mjs';`, 'legacy/platform adapters'],
        [`import x from 'some-package';`, 'external packages'],
        [`export async function load(){ return import('./result.mjs'); }`, 'dynamic import'],
    ];

    for (const [source, expected] of cases){
        const violations = analyzeConditionModule(source, 'src/engine/conditions/example.mjs');
        assert.equal(violations.some(item => item.includes(expected)), true, `${expected}: ${JSON.stringify(violations)}`);
    }
});

test('M3B1 condition boundary rejects mutation authority and legacy/UI/platform globals', () => {
    const mutation = analyzeConditionModule(
        `export function bad(){ return mutationAuthority.createMutationScope({}); }`,
        'src/engine/conditions/example.mjs'
    );
    assert.equal(mutation.some(item => item.includes('raw GameState mutation authority')), true);

    for (const source of [
        `export function bad(){ return global.resource.Food.amount; }`,
        `export function bad(){ return document.body; }`,
        `export function bad(){ return window.location; }`,
        `export function bad(){ return $('#main'); }`,
    ]){
        const violations = analyzeConditionModule(source, 'src/engine/conditions/example.mjs');
        assert.equal(violations.some(item => item.includes('legacy globals or UI/platform objects')), true);
    }
});

test('M3B1 current repository satisfies condition boundary fitness', () => {
    assert.deepEqual(findViolations(root), []);
});
