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
        "function operationFor(line){ if(line.kind === 'prestige'){ return { kind: 'payment.prestige.debit', prestigeId: line.prestigeId, amount: line.amount }; } return { kind: 'payment.resource.debit', resourceId: line.resourceId, amount: line.amount }; }\n" +
        "export function createPaymentPlan(q){ const quote = normalizePaymentQuoteInput(q); return { operations: quote.lines.map(operationFor) }; }";
}

function validQuoteInputSource(){
    return "import { EngineContractError } from '../identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../contracts/inert-data.mjs';\n" +
        "import { createPaymentQuote } from './payment-quote.mjs';\n" +
        'export function normalizePaymentQuoteInput(q){ return createPaymentQuote(q.lines); }';
}

test('M3D3/M3D4B PaymentPlan boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('PaymentPlan exposes exactly one synchronous one-argument factory', () => {
    assert.deepEqual(analyzePlanExports(validPlanSource()), []);
    for (const source of [
        'export function createPaymentPlan(){}',
        'export function createPaymentPlan(a,b){}',
        'export async function createPaymentPlan(q){}',
        'export function createPaymentPlan(q){} export const bypass = true;',
    ]) assert.notDeepEqual(analyzePlanExports(source), []);
});

test('PaymentPlan constructs exactly the reviewed resource and prestige debit kinds', () => {
    assert.deepEqual(analyzePlanOperationKinds(validPlanSource()), []);
    assert.notDeepEqual(analyzePlanOperationKinds(validPlanSource().replace("kind: 'payment.prestige.debit', ", '')), []);
    assert.notDeepEqual(analyzePlanOperationKinds(validPlanSource().replace("kind: 'payment.prestige.debit'", "kind: 'payment.special.debit'")), []);
    assert.notDeepEqual(analyzePlanOperationKinds(validPlanSource().replace("kind: 'payment.resource.debit'", 'kind: operationKind')), []);
});

test('PaymentPlan rejects state reads, execution authority, first-party names, future special scope and unrelated dependencies', () => {
    const prefix = "import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';\n";
    const cases = [
        'mutationAuthority.beginTransaction();',
        'executePayment();',
        'assessCurrentAffordability();',
        'const capacity = 10;',
        'const Plasmid = true;',
        "const paymentId = 'example:payment/test';",
        'adjustCosts();',
        "const id = 'evolve:prestige/test';",
        "import '../effects/effect-plan.mjs';",
        'async function helper(){}',
        'Promise.resolve(1);',
    ];
    for (const body of cases){
        const source = prefix + body + '\n' + validPlanSource().split('\n').slice(1).join('\n');
        assert.notDeepEqual(analyzePlanSource(source), []);
    }
});

test('shared quote-input normalizer exposes only its reviewed helper and stays state-independent', () => {
    const valid = validQuoteInputSource();
    assert.deepEqual(analyzeQuoteInputExports(valid), []);
    assert.deepEqual(analyzeQuoteInputSource(valid), []);
    for (const addition of [
        "\nimport '../effects/effect-plan.mjs';",
        '\nmodRes("RNA", -2);',
        '\nconst capacity = 10;',
        '\nconst paymentId = "example:payment/test";',
        "\nconst id = 'evolve:resource/rna';",
        "\nconst op = { kind: 'payment.resource.debit' };",
        '\nadjustCosts();',
    ]) assert.notDeepEqual(analyzeQuoteInputSource(valid + addition), []);
});

test('quote-input helper cannot spread through cost internals', () => {
    assert.notDeepEqual(
        analyzeCostInternalConsumer("import './payment-quote-input.mjs';", 'src/engine/costs/random-helper.mjs'),
        []
    );
});

test('production consumers may use only reviewed public cost entries', () => {
    assert.deepEqual(analyzeProductionConsumer("import './engine/costs/payment-plan.mjs';", 'src/example.mjs'), []);
    assert.notDeepEqual(analyzeProductionConsumer("import './engine/costs/payment-quote-input.mjs';", 'src/example.mjs'), []);
    assert.notDeepEqual(analyzeProductionConsumer("import('./engine/costs/payment-plan.mjs');", 'src/example.mjs'), []);
});
