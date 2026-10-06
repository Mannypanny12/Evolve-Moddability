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

test('M3D4B prestige payment boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D4B generic cost engine rejects first-party, special/pool, execution and prestige-capacity scope', () => {
    for (const source of [
        'const Plasmid = 1;',
        "const kind = 'special';",
        'const kind = `pool`;',
        'const paymentId = "example:payment/test";',
        'executePayment();',
        'executor["payCosts"]();',
        'reads.prestige.capacity(id);',
        "reads.prestige['capacity'](id);",
        'prestige.available(id);',
        'reads["prestige"].available(id);',
    ]){
        assert.notDeepEqual(analyzeCostSource(source, 'src/engine/costs/example.mjs'), []);
    }
    assert.deepEqual(
        analyzeCostSource("const family = 'prestige'; const op = 'payment.prestige.debit';", 'src/engine/costs/example.mjs'),
        []
    );
});

test('M3D4B future-family literals remain a whole-source architecture tripwire', () => {
    assert.notDeepEqual(
        analyzeCostSource("// Future scope must not land here: kind = 'special'", 'src/engine/costs/example.mjs'),
        []
    );
    assert.deepEqual(
        analyzeCostSource("// Prestige is the only added family in this slice.\nconst family = 'prestige';", 'src/engine/costs/example.mjs'),
        []
    );
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
