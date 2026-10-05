'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeAssessorExports,
    analyzeCostSource,
    analyzeLegacyAdapter,
    analyzeProductionConsumer,
    findViolations,
} = require('./m3d2-payment-assessment-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function validLegacyAdapterSource(){
    return "import { EngineContractError } from '../../engine/identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';\n" +
        "import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';\n" +
        "const SUPPORTED_PAYMENT_MAPPING_IDS = Object.freeze(['evolve.resource.rna_state']);\n" +
        'export function createEvolveLegacyPaymentReadProvider(options){ return options; }';
}

test('M3D2 payment assessment boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D2 assessor exposes exactly one synchronous one-argument production factory', () => {
    assert.deepEqual(
        analyzeAssessorExports(
            'export function createPaymentAssessor(reads){ return reads; }',
            'src/engine/costs/payment-assessor.mjs'
        ),
        []
    );
    for (const source of [
        'export function createPaymentAssessor(){}',
        'export function createPaymentAssessor(a,b){}',
        'export async function createPaymentAssessor(reads){}',
        'export function createPaymentAssessor(reads){} export const bypass = 1;',
    ]){
        assert.notDeepEqual(
            analyzeAssessorExports(source, 'src/engine/costs/payment-assessor.mjs'),
            []
        );
    }
});

test('M3D2 cost source rejects condition coupling, state/mutation authority, later payment scope and modifiers', () => {
    const cases = [
        "import '../conditions/condition-evaluator.mjs';",
        "import '../state/state-store.mjs';",
        'mutationAuthority.beginTransaction();',
        'const paymentPlan = [];',
        'function executePayment(){}',
        'function adjustCosts(){}',
        'function checkCosts(){}',
        'function checkAffordable(){}',
        'const queueWorkItem = {};',
        "const id = 'evolve:resource/rna';",
    ];
    for (const source of cases){
        assert.notDeepEqual(
            analyzeCostSource(source, 'src/engine/costs/payment-assessor.mjs'),
            []
        );
    }
});

test('M3D2 cost source rejects hidden async, Promise and generator control flow', () => {
    for (const source of [
        'async function helper(){}',
        'function helper(){ return Promise.resolve(1); }',
        'function helper(){ return new Promise(() => {}); }',
        'async function helper(){ await value; }',
        'function* helper(){ yield 1; }',
    ]){
        assert.notDeepEqual(
            analyzeCostSource(source, 'src/engine/costs/payment-assessor.mjs'),
            []
        );
    }
});

test('M3D2 legacy adapter remains one RNA-only read provider with narrow dependencies', () => {
    assert.deepEqual(analyzeLegacyAdapter(validLegacyAdapterSource()), []);

    assert.notDeepEqual(
        analyzeLegacyAdapter(validLegacyAdapterSource().replace(
            "['evolve.resource.rna_state']",
            "['evolve.resource.rna_state', 'evolve.resource.dna_state']"
        )),
        []
    );
    assert.notDeepEqual(
        analyzeLegacyAdapter(validLegacyAdapterSource() + '\nexport const bypass = true;'),
        []
    );
    assert.notDeepEqual(
        analyzeLegacyAdapter(validLegacyAdapterSource().replace(
            'export function createEvolveLegacyPaymentReadProvider(options)',
            'export async function createEvolveLegacyPaymentReadProvider(options)'
        )),
        []
    );
    assert.notDeepEqual(analyzeLegacyAdapter(validLegacyAdapterSource() + "\nimport '../../actions.js';"), []);
    assert.notDeepEqual(analyzeLegacyAdapter(validLegacyAdapterSource() + '\nglobal.resource.RNA.amount;'), []);
    assert.notDeepEqual(analyzeLegacyAdapter(validLegacyAdapterSource() + '\nmodRes("RNA", -2);'), []);
});

test('M3D2 production consumers cannot import cost internals or dynamically load the public surface', () => {
    assert.deepEqual(
        analyzeProductionConsumer("import './engine/costs/payment-assessor.mjs';", 'src/example.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer("import './engine/costs/payment-read-capabilities.mjs';", 'src/example.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer("import('./engine/costs/payment-assessor.mjs');", 'src/example.mjs'),
        []
    );
});
