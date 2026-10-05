'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { analyzeCommandModule, findViolations } = require('./m3a1-command-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3A1 command boundary accepts identity/local command dependencies', () => {
    const source = `
        import { EngineContractError } from '../identity.mjs';
        import { normalizeCommandOutcome } from './result.mjs';
        export function ok(){ return normalizeCommandOutcome; }
    `;
    assert.deepEqual(analyzeCommandModule(source, 'src/engine/commands/example.mjs'), []);
});

test('M3A1 command boundary rejects state, registry, external and dynamic imports', () => {
    const cases = [
        [`import { createGameStateRuntime } from '../state/game-state.mjs';`, 'GameState/state infrastructure'],
        [`import { Registry } from '../registry.mjs';`, 'definition Registry'],
        [`import x from 'some-package';`, 'external packages'],
        [`export async function load(){ return import('./result.mjs'); }`, 'dynamic import'],
    ];

    for (const [source, expected] of cases){
        const violations = analyzeCommandModule(source, 'src/engine/commands/example.mjs');
        assert.equal(violations.some(item => item.includes(expected)), true, `${expected}: ${JSON.stringify(violations)}`);
    }
});

test('M3A1 command boundary rejects raw mutation authority identifiers', () => {
    const violations = analyzeCommandModule(
        `export function bad(){ return mutationAuthority.createMutationScope({}); }`,
        'src/engine/commands/example.mjs'
    );
    assert.equal(violations.some(item => item.includes('raw GameState mutation authority')), true);
});

test('M3A1 current repository satisfies command boundary fitness', () => {
    assert.deepEqual(findViolations(root), []);
});
