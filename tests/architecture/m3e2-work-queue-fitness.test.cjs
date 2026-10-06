'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeInternalContractReference,
    analyzeWorkQueueModule,
    findViolations,
} = require('./m3e2-work-queue-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M3E2 WorkQueue architecture guard passes the repository', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3E2 WorkQueue architecture guard rejects scheduling, execution, payment and persistence drift', () => {
    const fixtures = [
        'function dispatch(){}',
        'function execute(){}',
        'const scheduler = {};',
        'const readiness = true;',
        'const timeCheck = () => 0;',
        'const PaymentQuote = {};',
        'const PaymentPlan = {};',
        'const EffectPlan = {};',
        'const GameState = {};',
        'const localStorage = {};',
        'const serialized = serialize(queue);',
        'const saved = offline;',
        'const state = paused;',
    ];

    for (const source of fixtures){
        assert.notDeepEqual(
            analyzeWorkQueueModule(source, 'src/engine/queue/work-queue.mjs'),
            [],
            source
        );
    }
});

test('M3E2 WorkQueue architecture guard does not reject ordinary pure list vocabulary', () => {
    const source = `
        const capacity = 3;
        const mergePolicy = 'adjacent';
        const remaining = 7;
        const unitsPerSlot = 3;
        const slotUsage = Math.ceil(remaining / unitsPerSlot);
        const nextQueue = Object.freeze([]);
    `;
    assert.deepEqual(
        analyzeWorkQueueModule(source, 'src/engine/queue/work-queue.mjs'),
        []
    );
});

test('M3E2 keeps the shared WorkItem contract internal to the queue package', () => {
    assert.notDeepEqual(
        analyzeInternalContractReference(
            "import { assertQueuedWorkItem } from './engine/queue/work-item-contract.mjs';",
            'src/example.mjs'
        ),
        []
    );

    assert.deepEqual(
        analyzeInternalContractReference(
            "import { assertQueuedWorkItem } from './work-item-contract.mjs';",
            'src/engine/queue/work-queue.mjs'
        ),
        []
    );
});
