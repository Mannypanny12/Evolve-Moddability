'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    SHARED_RUNTIME,
    PRODUCTION_IDS,
    analyzeSharedRuntimeSource,
    sharedRuntimeConsumers,
    productionIdsFromProd,
    findViolations,
} = require('./m4e1-production-runtime-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4E1 shared production runtime and frozen migration inventory satisfy their architecture boundary', () => {
    assert.deepEqual(findViolations(root), []);
    assert.deepEqual(sharedRuntimeConsumers(root), ['src/application/evolve/oil-well-production-runtime.mjs']);
    const prod = fs.readFileSync(path.join(root, 'src/prod.js'), 'utf8');
    assert.deepEqual(productionIdsFromProd(prod), PRODUCTION_IDS);
});

test('M4E1 shared runtime rejects hidden state, mutation, clocks and widened public surface', () => {
    const source = `
        import { createCalculationEngine } from '../../engine/calculations/calculation-engine.mjs';
        import { createOilWellProductionRegistration, createOilWellProductionModifiers } from '../../content/evolve/calculations/oil-well-production.mjs';
        const hidden = globalThis.resource.Oil.amount;
        const now = Date.now();
        modRes('Oil', 1);
        const productionCalculationEngine = createCalculationEngine({ registrations: [createOilWellProductionRegistration()], modifiers: [...createOilWellProductionModifiers()] });
        export function calculateProductionCalculation({ id, inputs }){ return productionCalculationEngine.calculate({ id, inputs }).value + hidden + now; }
        export function explainProductionCalculation(){ return 1; }
    `;
    const violations = analyzeSharedRuntimeSource(source);
    assert.equal(violations.some(value => value.includes('public surface')), true);
    assert.equal(violations.some(value => value.includes('legacy/global runtime state')), true);
    assert.equal(violations.some(value => value.includes('clock/random capability')), true);
    assert.equal(violations.some(value => value.includes('legacy gameplay helpers')), true);
});

test('M4E1 shared-runtime consumer scanner catches alternate import spellings and dynamic callers', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'm4e1-runtime-consumer-'));
    try {
        fs.mkdirSync(path.join(fixture, 'src/application/evolve'), { recursive: true });
        fs.writeFileSync(path.join(fixture, SHARED_RUNTIME), 'export function calculateProductionCalculation(){}\n');
        fs.writeFileSync(path.join(fixture, 'src/application/evolve/oil-well-production-runtime.mjs'), "import { calculateProductionCalculation } from './production-calculation-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/root.js'), "import '/src/application/evolve/production-calculation-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/repository.js'), "import 'src/application/evolve/production-calculation-runtime.mjs';\n");
        fs.writeFileSync(path.join(fixture, 'src/dynamic.js'), "export const load = () => import('/src/application/evolve/production-calculation-runtime.mjs');\n");
        assert.deepEqual(sharedRuntimeConsumers(fixture), [
            'src/application/evolve/oil-well-production-runtime.mjs',
            'src/dynamic.js',
            'src/repository.js',
            'src/root.js',
        ]);
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4E1 production inventory parser does not mistake nested val cases for production ids', () => {
    const source = `
export function production(id, val){
    switch (id){
        case 'alpha':
        {
            switch (val){
                case 'nested': return 1;
            }
        }
        case 'beta': return 2;
    }
}
`;
    assert.deepEqual(productionIdsFromProd(source), ['alpha', 'beta']);
});
