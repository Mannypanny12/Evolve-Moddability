'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeCalculationModule,
    productionCalculationConsumers,
    findViolations,
} = require('./m4a-calculation-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4A calculation package satisfies its dedicated architecture boundary', () => {
    assert.deepEqual(findViolations(root), []);
    assert.deepEqual(productionCalculationConsumers(root).consumers, []);
});

test('M4A calculation boundary rejects state, legacy, M3, runtime and inert Registry dependencies', () => {
    const cases = [
        ["import '../state/game-state.mjs';", 'GameState/state infrastructure'],
        ["import '../../legacy/bridge/example.mjs';", 'legacy/platform adapters'],
        ["import '../commands/command-bus.mjs';", 'M3 semantic packages'],
        ["import '../runtime/environment.mjs';", 'runtime capabilities'],
        ["import '../registry.mjs';", 'inert M1 Registry'],
    ];
    for (const [source, expected] of cases){
        assert.equal(
            analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs').some(value => value.includes(expected)),
            true,
            source
        );
    }
});

test('M4A calculation boundary rejects hidden runtime capabilities, mutation authority and first-party identities', () => {
    const source = `
        const now = Date.now();
        const roll = Math.random();
        mutationAuthority.write();
        const id = 'evolve:calculation/resource/food';
    `;
    const violations = analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs');
    assert.equal(violations.some(value => value.includes('runtime clock/random source')), true);
    assert.equal(violations.some(value => value.includes('mutation or transaction authority')), true);
    assert.equal(violations.some(value => value.includes('first-party evolve: identities')), true);
});

test('M4A calculation boundary permits only identity, inert-data and sibling calculation imports', () => {
    const source = `
        import { EngineContractError } from '../identity.mjs';
        import { inspectPlainInertObject } from '../contracts/inert-data.mjs';
        import { normalizeCalculationContext } from './calculation-context.mjs';
        export const probe = EngineContractError && inspectPlainInertObject && normalizeCalculationContext;
    `;
    assert.deepEqual(analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs'), []);
});
