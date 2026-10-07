'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { analyzeWorkSelectionModule, findViolations } = require('./m3e3-work-selection-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const selectionPath = 'src/engine/queue/work-selection.mjs';

test('M3E3 work-selection architecture guard passes the production tree', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3E3 work-selection architecture guard rejects scheduler/execution/payment leakage', () => {
    const cases = [
        ['export const bad = scheduler;', 'scheduler'],
        ['export const bad = timeCheck;', 'timeCheck'],
        ['export const bad = checkAffordable;', 'checkAffordable'],
        ['export const bad = qAny;', 'qAny'],
        ['export const bad = PaymentPlan;', 'PaymentPlan'],
        ['export const bad = GameState;', 'GameState'],
        ['export const bad = setTimeout;', 'setTimeout'],
    ];
    for (const [source, expected] of cases){
        assert.equal(
            analyzeWorkSelectionModule(source, selectionPath).some(value => value.includes(expected)),
            true,
            expected
        );
    }
});

test('M3E3 work-selection architecture guard rejects transient readiness cache fields', () => {
    const cases = [
        ['export const bad = { time: 1 };', 'time'],
        ['export const bad = { req: true };', 'req'],
        ['export const bad = { affordable: true };', 'affordable'],
        ['export const bad = { readyAt: 1 };', 'readyAt'],
        ['export const bad = { paymentPlan: null };', 'paymentPlan'],
    ];
    for (const [source, expected] of cases){
        assert.equal(
            analyzeWorkSelectionModule(source, selectionPath).some(value => value.includes(expected)),
            true,
            expected
        );
    }
});

test('M3E3 work-selection architecture guard pins the dependency closure', () => {
    const allowed = [
        "import '../identity.mjs';",
        "import '../contracts/inert-data.mjs';",
        "import './work-item-contract.mjs';",
        "import './work-queue.mjs';",
    ].join('\n');
    assert.deepEqual(analyzeWorkSelectionModule(allowed, selectionPath), []);

    const forbidden = [
        "import '../conditions/evaluator.mjs';",
        "import '../costs/payment-assessor.mjs';",
        "import '../commands/command-bus.mjs';",
        "import '../../legacy/bridge/example.mjs';",
        "import 'left-pad';",
        "const later = import('./future.mjs');",
    ];
    for (const source of forbidden){
        assert.notDeepEqual(analyzeWorkSelectionModule(source, selectionPath), []);
    }
});
