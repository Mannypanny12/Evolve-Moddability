'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    RUNTIME,
    analyzeContentSource,
    analyzeProdSource,
    removedRuntimeReferences,
    findViolations,
} = require('./m4d-oil-well-production-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4D Oil Well live vertical uses the shared runtime directly and keeps the old adapter removed', () => {
    assert.deepEqual(findViolations(root), []);
    assert.equal(fs.existsSync(path.join(root, ...RUNTIME.split('/'))), false);
    assert.deepEqual(removedRuntimeReferences(root), []);
});

test('M4D first-party calculation rejects hidden runtime state, ambient capabilities, Promise wrapping and mutation authority', () => {
    const source = `
        import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';
        const hidden = globalThis.resource.Oil.amount;
        const stored = localStorage.getItem('oil');
        const jitter = Math.random();
        commitTransaction();
        rollbackTransaction();
        const promised = Promise.resolve(1);
        export const probe = calculateProduction({ contributions: [hidden + Number(stored || 0) + jitter + promised] });
    `;
    const violations = analyzeContentSource(source);
    assert.equal(violations.some(value => value.includes('legacy/global runtime state')), true);
    assert.equal(violations.some(value => value.includes('browser storage')), true);
    assert.equal(violations.some(value => value.includes('clock/random capability')), true);
    assert.equal(violations.some(value => value.includes('mutation authority')), true);
    assert.equal(violations.some(value => value.includes('async/Promise/dynamic loading')), true);
});

test('M4D prod shim rejects retained legacy arithmetic after direct shared-runtime cutover', () => {
    const source = `
        import { calculateProductionCalculation } from './application/evolve/production-calculation-runtime.mjs';
        import { OIL_WELL_PRODUCTION_CALCULATION_ID } from './content/evolve/calculations/oil-well-production.mjs';
        export function production(id){
            switch (id){
                case 'oil_well': {
                    let oil = global.tech['oil'] >= 4 ? 0.48 : 0.4;
                    oil *= 2;
                    return calculateProductionCalculation({
                        id: OIL_WELL_PRODUCTION_CALCULATION_ID,
                        inputs: {
                            oilTechLevel: global.tech['oil'] || 0,
                            geologyBonus: global.city.geology['Oil'] || 0,
                            biomeOilMultiplier: null,
                            dirtyJobsPercent: govActive('dirty_jobs',2) || 0,
                            warlord: Boolean(global.race['warlord']),
                            pumpjackRank: global.portal?.pumpjack?.rank || 0,
                        },
                    });
                }
                case 'iridium_mine': return 1;
            }
        }
    `;
    const violations = analyzeProdSource(source);
    assert.equal(violations.some(value => value.includes('embedded base production arithmetic')), true);
    assert.equal(violations.some(value => value.includes('embedded technology thresholds')), true);
});

test('M4D prod shim rejects reintroducing the deleted adapter or duplicating the canonical id string', () => {
    const source = `
        import { calculateOilWellProduction } from './application/evolve/oil-well-production-runtime.mjs';
        import { calculateProductionCalculation } from './application/evolve/production-calculation-runtime.mjs';
        import { OIL_WELL_PRODUCTION_CALCULATION_ID } from './content/evolve/calculations/oil-well-production.mjs';
        export function production(id){
            switch (id){
                case 'oil_well': {
                    return calculateProductionCalculation({
                        id: 'evolve:calculation/production/oil-well',
                        inputs: {},
                    }) + Number(Boolean(calculateOilWellProduction));
                }
                case 'iridium_mine': return 1;
            }
        }
    `;
    const violations = analyzeProdSource(source);
    assert.equal(violations.some(value => value.includes('removed Oil Well runtime adapter')), true);
    assert.equal(violations.some(value => value.includes('imported canonical id')), true);
});

test('M4D removed-adapter scanner catches relative, root-style and dynamic reintroduction', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'm4d-removed-runtime-'));
    try {
        fs.mkdirSync(path.join(fixture, 'src/application/evolve'), { recursive: true });
        fs.writeFileSync(path.join(fixture, 'src/prod.js'), "import './application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/root.js'), "import '/src/application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/repo-root.js'), "import 'src/application/evolve/oil-well-production-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/dynamic.js'), "export async function load(){ return import('/src/application/evolve/oil-well-production-runtime.mjs'); }\n");
        assert.deepEqual(removedRuntimeReferences(fixture), [
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
