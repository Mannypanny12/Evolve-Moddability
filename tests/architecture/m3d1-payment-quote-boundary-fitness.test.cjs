'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzePaymentQuoteExports,
    analyzeCostModule,
    analyzeProductionConsumer,
    findViolations,
} = require('./m3d1-payment-quote-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3D1 payment quote boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3D1 public quote entry is a single synchronous one-argument function', () => {
    assert.deepEqual(
        analyzePaymentQuoteExports(
            'export function createPaymentQuote(resolvedLines){ return resolvedLines; }',
            'src/engine/costs/payment-quote.mjs'
        ),
        []
    );

    for (const source of [
        'export function createPaymentQuote(){ return []; }',
        'export function createPaymentQuote(a, b){ return [a, b]; }',
        'export async function createPaymentQuote(lines){ return lines; }',
        'export function createPaymentQuote(lines){ return lines; } export const bypass = true;',
    ]){
        assert.notDeepEqual(
            analyzePaymentQuoteExports(source, 'src/engine/costs/payment-quote.mjs'),
            []
        );
    }
});

test('M3D1 cost modules reject state, legacy, effect, runtime, and mutation authority', () => {
    const cases = [
        ["import '../state/state-store.mjs';", 'state'],
        ["import '../../legacy/bridge/evolve-condition-read-adapter.mjs';", 'legacy'],
        ["import '../effects/effect-plan.mjs';", 'effect'],
        ["import '../runtime/clock.mjs';", 'runtime'],
        ['global.resource.RNA.amount;', 'global'],
        ['mutationAuthority.beginTransaction();', 'authority'],
        ['payCosts({}, {});', 'payment'],
    ];

    for (const [source, label] of cases){
        assert.notDeepEqual(
            analyzeCostModule(source, 'src/engine/costs/probe.mjs'),
            [],
            label
        );
    }
});

test('M3D1 quote construction cannot quietly absorb later affordability, queue, payment-plan, or modifier scope', () => {
    const cases = [
        ['function assessAffordability(){}', 'affordability'],
        ['const queueCapacity = 1;', 'queue/capacity'],
        ['const paymentPlan = [];', 'payment plan'],
        ['function executePayment(){}', 'payment execution'],
        ['function adjustCosts(){}', 'cost adjustment'],
        ['const modifierPipeline = [];', 'modifier pipeline'],
    ];

    for (const [source, label] of cases){
        assert.notDeepEqual(
            analyzeCostModule(source, 'src/engine/costs/probe.mjs'),
            [],
            label
        );
    }

    assert.deepEqual(
        analyzeCostModule('// affordability and queue semantics belong to M3D2', 'src/engine/costs/probe.mjs'),
        []
    );
});

test('M3D1 generic cost source rejects first-party namespace knowledge even in strings or comments', () => {
    assert.notDeepEqual(
        analyzeCostModule("const id = 'evolve:resource/rna';", 'src/engine/costs/probe.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeCostModule('// evolve-specific payment branch', 'src/engine/costs/probe.mjs'),
        []
    );
});

test('M3D1 production consumers may not bypass or dynamically load the payment quote entry module', () => {
    assert.deepEqual(
        analyzeProductionConsumer(
            "import { createPaymentQuote } from './engine/costs/payment-quote.mjs';",
            'src/example.mjs'
        ),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer(
            "import { normalizePaymentQuoteLine } from './engine/costs/common.mjs';",
            'src/example.mjs'
        ),
        []
    );
    assert.notDeepEqual(
        analyzeProductionConsumer(
            "const quote = import('./engine/costs/payment-quote.mjs');",
            'src/example.mjs'
        ),
        []
    );
});
