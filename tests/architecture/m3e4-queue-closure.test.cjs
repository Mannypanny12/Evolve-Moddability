'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    EXPECTED_QUEUE_MODULES,
    analyzeQueueModule,
    analyzeVanillaQueueImports,
    findViolations,
} = require('./m3e4-queue-closure.cjs');

const root = path.resolve(__dirname, '../..');

test('M3E4 whole-queue closure gate passes the production tree', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3E4 whole-queue closure pins the reviewed four-module production set', () => {
    assert.deepEqual(EXPECTED_QUEUE_MODULES, [
        'src/engine/queue/work-item-contract.mjs',
        'src/engine/queue/work-item.mjs',
        'src/engine/queue/work-queue.mjs',
        'src/engine/queue/work-selection.mjs',
    ]);
    assert.equal(Object.isFrozen(EXPECTED_QUEUE_MODULES), true);
});

test('M3E4 whole-queue closure rejects legacy admission, reconciliation and special-case authority', () => {
    const forbidden = [
        'queue_complete',
        'no_queue',
        'checkTechRequirements',
        'gainTech',
        'buildArpa',
        'buildTPShipQueue',
        'buildMechQueue',
        'arpaTimeCheck',
        'calcQueueMax',
        'calcRQueueMax',
    ];
    for (const identifier of forbidden){
        const violations = analyzeQueueModule(`export const bad = ${identifier};`, 'src/engine/queue/work-queue.mjs');
        assert.equal(violations.some(value => value.includes(identifier)), true, identifier);
    }
});

test('M3E4 whole-queue closure rejects execution, scheduler/persistence and first-party command knowledge', () => {
    const forbidden = ['dispatch', 'execute', 'PaymentPlan', 'GameState', 'localStorage', 'setTimeout', 'serialize', 'offline'];
    for (const identifier of forbidden){
        const violations = analyzeQueueModule(`export const bad = ${identifier};`, 'src/engine/queue/work-item.mjs');
        assert.equal(violations.some(value => value.includes(identifier)), true, identifier);
    }
    assert.notDeepEqual(
        analyzeQueueModule("export const id = 'evolve:command/evolution/dna';", 'src/engine/queue/work-item.mjs'),
        []
    );
});

test('M3E4 whole-queue closure rejects premature vanilla consumption of queue modules', () => {
    const source = "import { createWorkQueue } from './engine/queue/work-queue.mjs';";
    const violations = analyzeVanillaQueueImports(source, 'src/example.js');
    assert.equal(violations.length, 1);
    assert.match(violations[0], /before reviewed cutover/);

    assert.deepEqual(
        analyzeVanillaQueueImports("import './resources.js';", 'src/example.js'),
        []
    );
});
