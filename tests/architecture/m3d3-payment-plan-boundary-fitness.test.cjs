'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzePlanExports,
    analyzePlanSource,
    analyzeQuoteInputSource,
    analyzeCostInternalConsumer,
    analyzeProductionConsumer,
    findViolations,
} = require('./m3d3-payment-plan-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3D3 PaymentPlan boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D3 plan exposes exactly one synchronous one-argument factory', () => {
    assert.deepEqual(
        analyzePlanExports(
            "import { normalizePaymentQuoteInput } from './payment-quote-input.mjs'; export function createPaymentPlan(quote){ return { operations: [{ kind: 'payment.resource.debit' }] }; }"
        ),
        []
    );
    for (const source of [
        'export function createPaymentPlan(){}',
        'export function createPaymentPlan(a,b){}',
        'export async function createPaymentPlan(q){}',
        'export function createPaymentPlan(q){} export const bypass = true;',
    ]){
        assert.notDeepEqual(analyzePlanExports(source), []);
    }
});

test('M3D3 plan rejects state reads, mutation/payment execution, special families and unrelated dependencies', () => {
    const prefix = "import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';\n";
    const cases = [
        'mutationAuthority.beginTransaction();',
        'executePayment();',
        'assessCurrentAffordability();',
        'const capacity = 10;',
        'const prestige = true;',
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

test('M3D3 shared quote-input normalizer stays a narrow inert validation helper', () => {
    const valid = "import { EngineContractError } from '../identity.mjs';\n" +
        "import { inspectPlainInertObject } from '../contracts/inert-data.mjs';\n" +
        "import { createPaymentQuote } from './payment-quote.mjs';\n" +
        'export function normalizePaymentQuoteInput(q){ return createPaymentQuote(q.lines); }';
    assert.deepEqual(analyzeQuoteInputSource(valid), []);
    assert.notDeepEqual(analyzeQuoteInputSource(valid + "\nimport '../effects/effect-plan.mjs';"), []);
    assert.notDeepEqual(analyzeQuoteInputSource(valid + '\nmodRes("RNA", -2);'), []);
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
