'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeResolver,
    analyzeSpeciesCatalog,
    analyzeResourceAdapter,
    analyzeKnowledgeMapping,
    analyzeGenericClosure,
    findViolations,
} = require('./m3d4d-special-payment-closure.cjs');

const root = path.resolve(__dirname, '../..');

function validResolver(){
    return "const SUPPLY_PAYMENT_ID = 'evolve:payment/supply';\n" +
        "const KNOWLEDGE_PAYMENT_ID = 'evolve:payment/knowledge';\n" +
        "const SPECIES_PAYMENT_ID = 'evolve:payment/species';\n" +
        "const PURIFIER_SUPPLY_POOL_ID = 'evolve:payment-pool/purifier_supply';\n" +
        "const KNOWLEDGE_RESOURCE_ID = 'evolve:resource/knowledge';\n" +
        "function f(paymentId,species){ if (paymentId === SUPPLY_PAYMENT_ID) return {kind:'pool',poolId:PURIFIER_SUPPLY_POOL_ID}; if (paymentId === KNOWLEDGE_PAYMENT_ID) return {kind:'resource',resourceId:KNOWLEDGE_RESOURCE_ID}; return evolveSpeciesPaymentResourceId(species); }";
}

function validCatalog(){
    return "export const EVOLVE_SPECIES_PAYMENT_LOCAL_IDS = Object.freeze(['human','orc']);\n" +
        "const SPECIES = new Set(EVOLVE_SPECIES_PAYMENT_LOCAL_IDS);\n" +
        "function f(rawSpecies){ if (!SPECIES.has(rawSpecies)) throw new Error(); return `evolve:resource/${rawSpecies}`; }";
}

function validRaces(){
    return "export const races = {\n    human: {},\n    orc: {},\n};\n";
}

function validAdapter(){
    return "const SUPPORTED_PAYMENT_MAPPING_IDS = Object.freeze(['evolve.resource.rna_state','evolve.resource.knowledge_payment_state']);\n" +
        "if (SPECIES_LOCAL_IDS.has(parsed.localId)) {}\n" +
        "if (species !== subject.localId){ fail('LEGACY_PAYMENT_SPECIES_CONTEXT_DRIFT'); }\n" +
        "fail('INVALID_LEGACY_PAYMENT_SPECIES_STATE');";
}

function validMapping(){
    return "registerDirect(catalog,{ id:'evolve.resource.knowledge_payment_state', legacyPath:'global.resource.Knowledge', canonicalId:'evolve:resource/knowledge', introducedIn:'M3D4D', removeBy:'M6B' });";
}

test('M3D4D closure gate is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D4D resolver scope is exactly Supply, Knowledge and Species', () => {
    assert.deepEqual(analyzeResolver(validResolver()), []);
    assert.notDeepEqual(
        analyzeResolver(validResolver() + "\nconst extra = 'evolve:payment/other';"),
        []
    );
    assert.notDeepEqual(
        analyzeResolver(validResolver().replace('evolveSpeciesPaymentResourceId(species)', '`evolve:resource/${species}`')),
        []
    );
    assert.notDeepEqual(
        analyzeResolver(validResolver() + '\nconst workers = 1;'),
        []
    );
});

test('M3D4D Species catalog must exactly track uncommented live first-party race keys', () => {
    assert.deepEqual(analyzeSpeciesCatalog(validCatalog(), validRaces()), []);
    assert.notDeepEqual(
        analyzeSpeciesCatalog(validCatalog(), validRaces().replace('    orc: {},\n', '')),
        []
    );
    assert.notDeepEqual(
        analyzeSpeciesCatalog(validCatalog().replace("['human','orc']", "['human','orc','fake']"), validRaces()),
        []
    );
    assert.deepEqual(
        analyzeSpeciesCatalog(validCatalog(), validRaces().replace('    orc: {},', '    orc: {},\n    /* fake: {}, */')),
        []
    );
});

test('M3D4D resource adapter stays bounded to RNA, Knowledge and the active reviewed Species source', () => {
    assert.deepEqual(analyzeResourceAdapter(validAdapter()), []);
    assert.notDeepEqual(
        analyzeResourceAdapter(validAdapter().replace(
            "['evolve.resource.rna_state','evolve.resource.knowledge_payment_state']",
            "['evolve.resource.rna_state','evolve.resource.knowledge_payment_state','evolve.resource.food_state']"
        )),
        []
    );
    assert.deepEqual(
        analyzeResourceAdapter(validAdapter() + "\n/* 'evolve.resource.food_state' must not widen live scope. */"),
        []
    );
    assert.notDeepEqual(
        analyzeResourceAdapter(validAdapter().replace('SPECIES_LOCAL_IDS.has(parsed.localId)', 'true')),
        []
    );
    assert.notDeepEqual(
        analyzeResourceAdapter(validAdapter().replace('species !== subject.localId', 'false')),
        []
    );
});

test('M3D4D Knowledge mapping lifecycle remains explicit', () => {
    assert.deepEqual(analyzeKnowledgeMapping(validMapping()), []);
    assert.notDeepEqual(analyzeKnowledgeMapping(validMapping().replace("introducedIn:'M3D4D'", "introducedIn:'M3D4C'")), []);
    assert.notDeepEqual(analyzeKnowledgeMapping(validMapping().replace("removeBy:'M6B'", "removeBy:'M9C'")), []);
});

test('M3D4D generic engine remains source-oriented, first-party-free and inert', () => {
    const common = "const kinds = ['resource','prestige','special'];";
    const assessor = 'function assess(){}';
    const plan = "const op = { kind: 'payment.special.settle' };";
    const reads = "const root = ['resource','prestige','pool'];";
    assert.deepEqual(analyzeGenericClosure(common, assessor, plan, reads), []);

    assert.notDeepEqual(analyzeGenericClosure(common + '\nconst Species = true;', assessor, plan, reads), []);
    assert.notDeepEqual(analyzeGenericClosure(common, assessor, plan + '\nconst defaultJobId = 1;', reads), []);
    assert.notDeepEqual(analyzeGenericClosure(common, assessor + '\nexecutePayment();', plan, reads), []);
    assert.notDeepEqual(analyzeGenericClosure(common, assessor, plan, "const root = ['resource','prestige','pool','knowledge'];"), []);
});
