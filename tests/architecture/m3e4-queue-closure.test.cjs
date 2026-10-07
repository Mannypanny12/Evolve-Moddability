'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    EXPECTED_QUEUE_MODULES,
    analyzeQueueModule,
    analyzeProductionQueueImports,
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

test('M3E4 whole-queue closure rejects extra queue-package files regardless of extension', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm3e4-closure-'));
    try {
        for (const relativePath of EXPECTED_QUEUE_MODULES){
            const filename = path.join(tempRoot, ...relativePath.split('/'));
            fs.mkdirSync(path.dirname(filename), { recursive: true });
            fs.writeFileSync(filename, '', 'utf8');
        }
        fs.writeFileSync(path.join(tempRoot, 'src/engine/queue/config.json'), '{}', 'utf8');
        const violations = findViolations(tempRoot);
        assert.equal(violations.some(value => value.includes('file set drifted')), true);
    }
    finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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

test('M3E4 whole-queue closure rejects state/payment/persistence leakage and first-party content knowledge', () => {
    const forbidden = ['PaymentPlan', 'GameState', 'localStorage', 'setTimeout', 'serialize', 'offline'];
    for (const identifier of forbidden){
        const violations = analyzeQueueModule(`export const bad = ${identifier};`, 'src/engine/queue/work-item.mjs');
        assert.equal(violations.some(value => value.includes(identifier)), true, identifier);
    }
    assert.notDeepEqual(
        analyzeQueueModule("export const id = 'evolve:command/evolution/dna';", 'src/engine/queue/work-item.mjs'),
        []
    );
    assert.notDeepEqual(
        analyzeQueueModule("export const id = 'evolve:resource/rna';", 'src/engine/queue/work-item.mjs'),
        []
    );
});

test('M3E4 whole-queue closure rejects premature production consumption of queue modules', () => {
    const vanilla = "import { createWorkQueue } from './engine/queue/work-queue.mjs';";
    const vanillaViolations = analyzeProductionQueueImports(vanilla, 'src/example.js');
    assert.equal(vanillaViolations.length, 1);
    assert.match(vanillaViolations[0], /before reviewed cutover/);

    const engine = "import { createWorkQueue } from '../queue/work-queue.mjs';";
    const engineViolations = analyzeProductionQueueImports(engine, 'src/engine/commands/example.mjs');
    assert.equal(engineViolations.length, 1);
    assert.match(engineViolations[0], /before reviewed cutover/);

    assert.deepEqual(
        analyzeProductionQueueImports("import './resources.js';", 'src/example.js'),
        []
    );
});
