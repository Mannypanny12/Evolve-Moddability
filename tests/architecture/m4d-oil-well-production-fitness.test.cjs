'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    PROD,
    analyzeContentSource,
    analyzeRuntimeSource,
    analyzeProdSource,
    runtimeConsumers,
    findViolations,
} = require('./m4d-oil-well-production-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4D Oil Well live vertical satisfies its dedicated architecture boundary', () => {
    assert.deepEqual(findViolations(root), []);
    assert.deepEqual(runtimeConsumers(root), [PROD]);
});

test('M4D first-party calculation rejects hidden legacy state and mutation authority', () => {
    const source = `
        import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';
        const hidden = global.resource.Oil.amount;
        modRes('Oil', 1);
        export const probe = calculateProduction({ contributions: [hidden] });
    `;
    const violations = analyzeContentSource(source);
    assert.equal(violations.some(value => value.includes('legacy global state')), true);
    assert.equal(violations.some(value => value.includes('mutation authority')), true);
});

test('M4D runtime rejects legacy reads and widened public surface', () => {
    const source = `
        import { createCalculationEngine } from '../../engine/calculations/calculation-engine.mjs';
        import { createOilWellProductionRegistration } from '../../content/evolve/calculations/oil-well-production.mjs';
        const state = global.tech.oil;
        export function calculateOilWellProduction(){ return state; }
        export function explainOilWellProduction(){ return createCalculationEngine && createOilWellProductionRegistration; }
    `;
    const violations = analyzeRuntimeSource(source);
    assert.equal(violations.some(value => value.includes('public surface')), true);
    assert.equal(violations.some(value => value.includes('legacy/global state')), true);
});

test('M4D prod shim rejects retained legacy arithmetic', () => {
    const source = `
        import { calculateOilWellProduction } from './application/evolve/oil-well-production-runtime.mjs';
        export function production(id){
            switch (id){
                case 'oil_well': {
                    let oil = global.tech['oil'] >= 4 ? 0.48 : 0.4;
                    oil *= 2;
                    return calculateOilWellProduction({});
                }
                case 'iridium_mine': return 1;
            }
        }
    `;
    const violations = analyzeProdSource(source);
    assert.equal(violations.some(value => value.includes('embedded base production arithmetic')), true);
    assert.equal(violations.some(value => value.includes('embedded technology thresholds')), true);
});

test('M4D runtime consumer scanner catches relative, root-style and dynamic extra callers', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'm4d-runtime-consumer-'));
    try {
        fs.mkdirSync(path.join(fixture, 'src/application/evolve'), { recursive: true });
        fs.writeFileSync(path.join(fixture, 'src/application/evolve/oil-well-production-runtime.mjs'), 'export function calculateOilWellProduction(){}\n');
        fs.writeFileSync(path.join(fixture, 'src/prod.js'), "import { calculateOilWellProduction } from './application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/root.js'), "import { calculateOilWellProduction } from '/src/application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/repo-root.js'), "import { calculateOilWellProduction } from 'src/application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/dynamic.js'), "export async function load(){ return import('/src/application/evolve/oil-well-production-runtime.mjs'); }\n");
        assert.deepEqual(runtimeConsumers(fixture), [
            'src/dynamic.js',
            'src/prod.js',
            'src/repo-root.js',
            'src/root.js',
        ]);
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});
