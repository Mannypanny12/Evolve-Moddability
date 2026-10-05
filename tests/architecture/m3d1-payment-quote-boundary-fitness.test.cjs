'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeCostModule,
    analyzeProductionConsumer,
    findViolations,
} = require('./m3d1-payment-quote-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3D1 payment quote boundary is clean in the repository', () => {
    assert.deepEqual(findViolations(root), []);
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

test('M3D1 production consumers may not bypass the payment quote entry module', () => {
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
});
