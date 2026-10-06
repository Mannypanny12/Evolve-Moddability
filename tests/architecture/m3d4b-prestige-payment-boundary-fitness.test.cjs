'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeCostSource,
    analyzeBridgeExports,
    analyzeBridgeSource,
    findViolations,
} = require('./m3d4b-prestige-payment-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const READ_ADAPTER = 'src/legacy/bridge/evolve-prestige-payment-read-adapter.mjs';
const SOURCE_RESOLVER = 'src/legacy/bridge/evolve-prestige-payment-source-resolver.mjs';

function validReadAdapter(){
    return "import { EngineContractError } from '../../engine/identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';\n" +
        "import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';\n" +
        'export function createEvolvePrestigePaymentReadProvider(options){ return options; }';
}

function validResolver(){
    return "import { EngineContractError } from '../../engine/identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';\n" +
        'export function createEvolvePrestigePaymentSourceResolver(options){ return options; }';
}

test('M3D4B prestige payment boundary remains clean after M3D4C widening', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D4B ratchet still rejects first-party names, execution and prestige-capacity scope', () => {
    for (const source of [
        'const Plasmid = 1;',
        'const Supply = 1;',
        'executePayment();',
        'executor["payCosts"]();',
        'reads.prestige.capacity(id);',
        "reads.prestige['capacity'](id);",
        'prestige.available(id);',
        'reads["prestige"].available(id);',
    ]){
        assert.notDeepEqual(analyzeCostSource(source, 'src/engine/costs/example.mjs'), []);
    }
});

test('M3D4B ratchet deliberately permits the reviewed M3D4C generic special/pool vocabulary', () => {
    for (const source of [
        "const kind = 'special';",
        "const sourceKind = 'pool';",
        'const paymentId = "example:payment/test";',
        'const poolId = "example:payment-pool/test";',
        "const op = 'payment.special.settle';",
    ]){
        assert.deepEqual(analyzeCostSource(source, 'src/engine/costs/example.mjs'), []);
    }
});

test('M3D4B prestige bridge exports are pinned to one reviewed factory each', () => {
    assert.deepEqual(analyzeBridgeExports(validReadAdapter(), READ_ADAPTER), []);
    assert.deepEqual(analyzeBridgeExports(validResolver(), SOURCE_RESOLVER), []);
    assert.notDeepEqual(analyzeBridgeExports(validReadAdapter() + '\nexport const bypass = true;', READ_ADAPTER), []);
    assert.notDeepEqual(analyzeBridgeExports(validResolver() + '\nexport const bypass = true;', SOURCE_RESOLVER), []);
});

test('M3D4B prestige bridges reject globals, mutation, calculation scope and unrelated dependencies', () => {
    assert.deepEqual(analyzeBridgeSource(validReadAdapter(), READ_ADAPTER), []);
    assert.deepEqual(analyzeBridgeSource(validResolver(), SOURCE_RESOLVER), []);

    for (const addition of [
        '\nglobal.prestige.Plasmid.count;',
        '\nmodRes("Plasmid", -1);',
        '\nadjustCosts();',
        "\nimport '../../actions.js';",
        "\nimport('../../actions.js');",
    ]){
        assert.notDeepEqual(analyzeBridgeSource(validReadAdapter() + addition, READ_ADAPTER), []);
        assert.notDeepEqual(analyzeBridgeSource(validResolver() + addition, SOURCE_RESOLVER), []);
    }
});
