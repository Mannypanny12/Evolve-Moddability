'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeGenericCostSource,
    analyzeReviewedContractShape,
    analyzeBridgeExports,
    analyzeBridgeSource,
    findViolations,
} = require('./m3d4c-special-payment-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const COMMON = 'src/engine/costs/common.mjs';
const PLAN = 'src/engine/costs/payment-plan.mjs';
const POOL_ADAPTER = 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs';
const SOURCE_RESOLVER = 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs';

function validAdapter(){
    return "import { EngineContractError } from '../../engine/identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';\n" +
        "import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';\n" +
        "const SUPPORTED_POOL_MAPPING_IDS = Object.freeze(['evolve.payment_pool.purifier_supply_state']);\n" +
        'export function createEvolveSpecialPaymentPoolReadProvider(options){ return options; }';
}

function validResolver(){
    return "import { EngineContractError } from '../../engine/identity.mjs';\n" +
        'export function createEvolveSpecialPaymentSourceResolver(){ return {}; }';
}

test('M3D4C special payment boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D4C generic cost engine permits generic special/pool vocabulary but rejects first-party and execution drift', () => {
    assert.deepEqual(
        analyzeGenericCostSource("const kind = 'special'; const poolId = 'example:payment-pool/test';", 'src/engine/costs/example.mjs'),
        []
    );
    for (const source of [
        'const Supply = true;',
        'const purifier = true;',
        'const Knowledge = true;',
        'executePayment();',
        'mutationAuthority.beginTransaction();',
        'adjustCosts();',
        'enqueue();',
    ]){
        assert.notDeepEqual(analyzeGenericCostSource(source, 'src/engine/costs/example.mjs'), []);
    }
});

test('M3D4C reviewed quote and plan shapes reject family widening', () => {
    const validCommon = "if (value !== 'resource' && value !== 'prestige' && value !== 'special'){}\n" +
        "if (kind !== 'pool'){}\nconst a = 'payment'; const b = 'payment-pool';";
    assert.deepEqual(analyzeReviewedContractShape(validCommon, COMMON), []);
    assert.notDeepEqual(
        analyzeReviewedContractShape(
            validCommon.replace("value !== 'special')", "value !== 'special' && value !== 'future')"),
            COMMON
        ),
        []
    );
    assert.notDeepEqual(
        analyzeReviewedContractShape(validCommon.replace("kind !== 'pool'", "kind !== 'pool' && kind !== 'resource'"), COMMON),
        []
    );

    const decoyCommon =
        "// if (value !== 'resource' && value !== 'prestige' && value !== 'special'){} if (kind !== 'pool'){}\n" +
        "if (value !== 'resource'){}\nif (kind !== 'pool' && kind !== 'resource'){}\n" +
        "const a = 'payment'; const b = 'payment-pool';";
    assert.notDeepEqual(analyzeReviewedContractShape(decoyCommon, COMMON), []);

    const validPlan = "const a = { kind: 'payment.special.settle', source: { kind: 'pool' } };";
    assert.deepEqual(analyzeReviewedContractShape(validPlan, PLAN), []);
    assert.notDeepEqual(
        analyzeReviewedContractShape(validPlan.replace('payment.special.settle', 'payment.special.execute'), PLAN),
        []
    );
    assert.notDeepEqual(
        analyzeReviewedContractShape(validPlan + "\nconst b = { kind: 'payment.special.execute' };", PLAN),
        []
    );
});

test('M3D4C bridges expose only their reviewed factories', () => {
    assert.deepEqual(analyzeBridgeExports(validAdapter(), POOL_ADAPTER), []);
    assert.deepEqual(analyzeBridgeExports(validResolver(), SOURCE_RESOLVER), []);
    assert.notDeepEqual(analyzeBridgeExports(validAdapter() + '\nexport const bypass = true;', POOL_ADAPTER), []);
    assert.notDeepEqual(analyzeBridgeExports(validResolver() + '\nexport const bypass = true;', SOURCE_RESOLVER), []);
});

test('M3D4C bridges reject mutation, later scope, deferred special semantics and unrelated dependencies', () => {
    assert.deepEqual(analyzeBridgeSource(validAdapter(), POOL_ADAPTER), []);
    assert.deepEqual(analyzeBridgeSource(validResolver(), SOURCE_RESOLVER), []);

    for (const addition of [
        '\nmodRes("Supply", -1);',
        '\nadjustCosts();',
        '\nconst Knowledge = true;',
        "\nimport '../../actions.js';",
        "\nimport('../../actions.js');",
    ]){
        assert.notDeepEqual(analyzeBridgeSource(validAdapter() + addition, POOL_ADAPTER), []);
    }
});