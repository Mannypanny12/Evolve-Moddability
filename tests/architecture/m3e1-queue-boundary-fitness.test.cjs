'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeQueueModule,
    findViolations,
} = require('./m3e1-queue-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3E1 queue boundary accepts only inert contracts, identity and sibling queue imports', () => {
    const cases = [
        `import { EngineContractError } from '../identity.mjs'; export function ok(){ return EngineContractError; }`,
        `import { inspectPlainInertObject } from '../contracts/inert-data.mjs'; export function ok(){ return inspectPlainInertObject; }`,
        `import { helper } from './helper.mjs'; export function ok(){ return helper; }`,
    ];

    for (const source of cases){
        assert.deepEqual(
            analyzeQueueModule(source, 'src/engine/queue/example.mjs'),
            []
        );
    }
});

test('M3E1 queue boundary rejects command internals, state, costs, effects and external imports', () => {
    const cases = [
        [`import { canonicalizeCommandPayload } from '../commands/common.mjs';`, 'commands/common.mjs'],
        [`import { createPaymentPlan } from '../costs/payment-plan.mjs';`, 'costs/payment-plan.mjs'],
        [`import { createEffectPlan } from '../effects/effect-plan.mjs';`, 'effects/effect-plan.mjs'],
        [`import { createGameStateRuntime } from '../state/game-state.mjs';`, 'state/game-state.mjs'],
        [`import x from 'some-package';`, 'external packages'],
        [`export async function load(){ return import('./helper.mjs'); }`, 'dynamic import'],
    ];

    for (const [source, expected] of cases){
        const violations = analyzeQueueModule(source, 'src/engine/queue/example.mjs');
        assert.equal(
            violations.some(item => item.includes(expected)),
            true,
            `${expected}: ${JSON.stringify(violations)}`
        );
    }
});

test('M3E1 queue boundary rejects legacy lookup, policy, UI/cache, readiness, payment/effect and mutation identifiers', () => {
    const identifiers = [
        'qKey',
        'q_merge',
        'qAny',
        'qAny_res',
        'q',
        'qs',
        'queue_size',
        'action',
        'label',
        'cna',
        'time',
        't_max',
        'bres',
        'req',
        'qa',
        'quote',
        'affordable',
        'requirementsMet',
        'timeCheck',
        'payCosts',
        'modRes',
        'callback_queue',
        'mutationAuthority',
        'createMutationScope',
        'paymentPlan',
        'PaymentPlan',
        'PaymentQuote',
        'effectPlan',
        'EffectPlan',
        'handler',
        'callback',
    ];

    for (const identifier of identifiers){
        const violations = analyzeQueueModule(
            `export function bad(){ return ${identifier}; }`,
            'src/engine/queue/example.mjs'
        );
        assert.equal(
            violations.some(item => item.includes(identifier)),
            true,
            `${identifier}: ${JSON.stringify(violations)}`
        );
    }
});

test('M3E1 queue boundary reserves legacy/cache names even when used as object fields', () => {
    const cases = [
        [`export const bad = { action: 1 };`, 'action'],
        [`export function bad(work){ return work.label; }`, 'label'],
        [`export function bad(work){ return work.affordable; }`, 'affordable'],
        [`export const bad = { requirementsMet: false };`, 'requirementsMet'],
        [`export const bad = { q: 1, qs: 1 };`, 'q'],
    ];

    for (const [source, expected] of cases){
        const violations = analyzeQueueModule(source, 'src/engine/queue/example.mjs');
        assert.equal(
            violations.some(item => item.includes(expected)),
            true,
            `${expected}: ${JSON.stringify(violations)}`
        );
    }
});

test('M3E1 current repository satisfies queue boundary fitness', () => {
    assert.deepEqual(findViolations(root), []);
});
