'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzePoolAdapterReview,
    analyzeSourceResolverReview,
    findViolations,
} = require('./m3d4c-special-payment-review-hardening.cjs');

const root = path.resolve(__dirname, '../..');

function validAdapter(){
    return "const SUPPORTED_POOL_MAPPING_IDS = Object.freeze(['evolve.payment_pool.purifier_supply_state']);\n" +
        "function readDataField(){}\n" +
        "function sample(record){ readDataField(record, 'supply'); readDataField(record, 'sup_max'); }\n";
}

function validResolver(){
    return "const SUPPLY_PAYMENT_ID = 'evolve:payment/supply';\n" +
        "const PURIFIER_SUPPLY_POOL_ID = 'evolve:payment-pool/purifier_supply';\n" +
        "function resolve(parsed){ if (parsed.canonical !== SUPPLY_PAYMENT_ID) throw new Error(); return { kind: 'pool', poolId: PURIFIER_SUPPLY_POOL_ID }; }\n";
}

test('M3D4C review-hardening gate is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D4C adapter mapping ratchet cannot be satisfied by a comment decoy', () => {
    assert.deepEqual(analyzePoolAdapterReview(validAdapter()), []);

    const widened = validAdapter().replace(
        "Object.freeze(['evolve.payment_pool.purifier_supply_state'])",
        "Object.freeze(['evolve.payment_pool.purifier_supply_state', 'evolve.payment_pool.extra'])"
    ) + "\n// const SUPPORTED_POOL_MAPPING_IDS = Object.freeze(['evolve.payment_pool.purifier_supply_state']);";
    assert.notDeepEqual(analyzePoolAdapterReview(widened), []);

    const liveExtra = validAdapter() + "\nconst hidden = 'evolve.payment_pool.extra';";
    assert.notDeepEqual(analyzePoolAdapterReview(liveExtra), []);

    const commentOnlyExtra = validAdapter() + "\n// const future = 'evolve.payment_pool.extra';";
    assert.deepEqual(analyzePoolAdapterReview(commentOnlyExtra), []);
});

test('M3D4C adapter remains limited to the two reviewed purifier state fields', () => {
    assert.deepEqual(analyzePoolAdapterReview(validAdapter()), []);
    assert.notDeepEqual(
        analyzePoolAdapterReview(validAdapter() + "\nfunction extra(record){ readDataField(record, 'workers'); }"),
        []
    );
});

test('M3D4C resolver first-party scope remains exactly Supply to purifier supply', () => {
    assert.deepEqual(analyzeSourceResolverReview(validResolver()), []);

    assert.notDeepEqual(
        analyzeSourceResolverReview(validResolver() + "\nconst other = 'evolve:payment/other';"),
        []
    );
    assert.notDeepEqual(
        analyzeSourceResolverReview(validResolver() + "\nconst otherPool = 'evolve:payment-pool/other';"),
        []
    );
    assert.notDeepEqual(
        analyzeSourceResolverReview(validResolver().replace('parsed.canonical !== SUPPLY_PAYMENT_ID', 'false')),
        []
    );
    assert.notDeepEqual(
        analyzeSourceResolverReview(validResolver().replace("kind: 'pool'", "kind: 'resource'")),
        []
    );

    const comments = validResolver() +
        "\n// const deferred = 'evolve:payment/knowledge';" +
        "\n// const deferredPool = 'evolve:payment-pool/other';";
    assert.deepEqual(analyzeSourceResolverReview(comments), []);
});
