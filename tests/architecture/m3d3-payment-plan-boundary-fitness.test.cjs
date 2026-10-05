'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzePlanExports,
    analyzePlanOperationKinds,
    analyzePlanSource,
    analyzeQuoteInputExports,
    analyzeQuoteInputSource,
    analyzeCostInternalConsumer,
    analyzeProductionConsumer,
    findViolations,
} = require('./m3d3-payment-plan-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function validPlanSource(){
    return "import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';\n" +
        "export function createPaymentPlan(q){ const quote = normalizePaymentQuoteInput(q); return { operations: quote.lines.map(line => ({ kind: 'payment.resource.debit', resourceId: line.resourceId, amount: line.amount })) }; }";
}

function validQuoteInputSource(){
    return "import { EngineContractError } from '../identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../contracts/inert-data.mjs';\n" +
        "import { createPaymentQuote } from './payment-quote.mjs';\n" +
        'export function normalizePaymentQuoteInput(q){ return createPaymentQuote(q.lines); }';
}

test('M3D3 PaymentPlan boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D3 plan exposes exactly one synchronous one-argument factory', () => {
    assert.deepEqual(analyzePlanExports(validPlanSource()), []);
    for (const source of [
        'export function createPaymentPlan(){}',
        'export function createPaymentPlan(a,b){}',
        'export async function createPaymentPlan(q){}',
        'export function createPaymentPlan(q){} export const bypass = true;',
    ]){
        assert.notDeepEqual(analyzePlanExports(source), []);
    }
});

test('M3D3 plan constructs only the reviewed payment.resource.debit operation kind', () => {
    assert.deepEqual(analyzePlanOperationKinds(validPlanSource()), []);

    const missingKind = validPlanSource().replace("kind: 'payment.resource.debit', ", '');
    assert.notDeepEqual(analyzePlanOperationKinds(missingKind), []);

    const secondKind = validPlanSource().replace(
        'return { operations:',
        "const extra = { kind: 'resource.consume' }; return { operations:"
    );
    assert.notDeepEqual(analyzePlanOperationKinds(secondKind), []);

    const specialPaymentKind = validPlanSource().replace(
        "kind: 'payment.resource.debit'",
        "kind: 'payment.prestige.debit'"
    );
    assert.notDeepEqual(analyzePlanOperationKinds(specialPaymentKind), []);

    const variableKind = validPlanSource().replace(
        "kind: 'payment.resource.debit'",
        "kind: operationKind"
    ).replace(
        'export function createPaymentPlan(q){',
        "const operationKind = 'payment.resource.debit'; export function createPaymentPlan(q){"
    );
    assert.notDeepEqual(analyzePlanOperationKinds(variableKind), []);
});

test('M3D3 plan rejects state reads, mutation/payment execution, special families and unrelated dependencies', () => {
    const prefix = "import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';\n";
    const cases = [
        'mutationAuthority.beginTransaction();',
        'executePayment();',
        'assessCurrentAffordability();',
        'const capacity = 10;',
        'const prestige = true;',
        "const family = 'prestige';",
        'adjustCosts();',
        "const id = 'evolve:resource/rna';",
        "import '../effects/effect-plan.mjs';",
        'async function helper(){}',
        'Promise.resolve(1);',
    ];
    for (const body of cases){
        const source = prefix + body + "\nexport function createPaymentPlan(q){ return { operations: [{ kind: 'payment.resource.debit' }] }; }";
        assert.notDeepEqual(analyzePlanSource(source), []);
    }
});

test('M3D3 shared quote-input normalizer exposes only its reviewed one-argument helper', () => {
    const valid = validQuoteInputSource();
    assert.deepEqual(analyzeQuoteInputExports(valid), []);

    for (const source of [
        valid.replace('normalizePaymentQuoteInput(q)', 'normalizePaymentQuoteInput()'),
        valid.replace('normalizePaymentQuoteInput(q)', 'normalizePaymentQuoteInput(a,b)'),
        valid.replace('export function normalizePaymentQuoteInput', 'export async function normalizePaymentQuoteInput'),
        valid + '\nexport const bypass = true;',
    ]){
        assert.notDeepEqual(analyzeQuoteInputExports(source), []);
    }
});

test('M3D3 shared quote-input normalizer stays a narrow state-independent quote validation helper', () => {
    const valid = validQuoteInputSource();
    assert.deepEqual(analyzeQuoteInputSource(valid), []);

    for (const addition of [
        "\nimport '../effects/effect-plan.mjs';",
        '\nmodRes("RNA", -2);',
        '\nconst capacity = 10;',
        '\nconst prestige = true;',
        "\nconst family = 'prestige';",
        "\nconst id = 'evolve:resource/rna';",
        "\nconst op = { kind: 'payment.resource.debit' };",
        '\nadjustCosts();',
    ]){
        assert.notDeepEqual(analyzeQuoteInputSource(valid + addition), []);
    }
});

test('M3D3 quote-input helper and debit operation ownership cannot spread through cost internals', () => {
    assert.notDeepEqual(
        analyzeCostInternalConsumer("import './payment-quote-input.mjs';", 'src/engine/costs/random-helper.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeCostInternalConsumer("const kind = 'payment.resource.debit';", 'src/engine/costs/random-helper.mjs'),
        []
    );
});

test('M3D3 production consumers may use only reviewed public cost entries', () => {
    assert.deepEqual(
        analyzeProductionConsumer("import './engine/costs/payment-plan.mjs';", 'src/example.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer("import './engine/costs/payment-quote-input.mjs';", 'src/example.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer("import('./engine/costs/payment-plan.mjs');", 'src/example.mjs'),
        []
    );
});
