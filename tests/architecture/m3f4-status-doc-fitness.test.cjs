'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { statusDocViolations } = require('./m3f4-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');

function closedRoadmap(){
    return roadmap
        .replace('M3E is closed without modifying vanilla build/research gameplay. M3F is the active milestone.', 'M3E is closed without modifying vanilla build/research gameplay. M3F is closed; M3G is the active milestone.')
        .replace('### M3F First real vanilla cutover\n', '### M3F First real vanilla cutover - complete\n')
        .replace('#### M3F4 Cutover proof and closure - next\n\nReconcile the first live cutover as a complete vertical: confirm downward architecture ratchets, run the complete CI/build/browser proof on the final M3F head, close any integration-only gaps exposed by production composition, and record M3F closure without broadening into M3G\'s whole-milestone audit.\n\n### M3G Hardening and closure\n', '#### M3F4 Cutover proof and closure - complete\n\nReconciles the first live cutover as a complete vertical, including the real-browser Vue-reactive resource compatibility gap, cumulative architecture ratchets, and final CI/build/browser proof. See `M3F4_CUTOVER_CLOSURE.md`.\n\n### M3G Hardening and closure - next\n');
}

function closedBacklog(){
    return backlog
        .replace('the public bus exposes only `dispatch`, `has`, and deterministic `ids`;', 'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;')
        .replace('### M3F - First real vanilla cutover - active', '### M3F - First real vanilla cutover - complete')
        .replace('- M3F4 cutover proof and M3F closure - next.', '- M3F4 cutover proof and M3F closure - complete;')
        .replace('The live DNA callback now delegates gameplay authority through the command/condition/payment/effect/atomic-settlement path while retaining its historical legacy return protocol. See [M3F3_DNA_LIVE_CUTOVER.md](M3F3_DNA_LIVE_CUTOVER.md).', 'The live DNA callback delegates gameplay authority through the command/condition/payment/effect/atomic-settlement path while retaining its historical legacy return protocol. The full vertical is closed by the cumulative production/browser proof. See [M3F4_CUTOVER_CLOSURE.md](M3F4_CUTOVER_CLOSURE.md).')
        .replace('### M3G - Whole-M3 hardening and closure - later', '### M3G - Whole-M3 hardening and closure - next')
        .replace('After M3F closes, audit the complete M3 command/condition/effect/payment/queue/cutover architecture as one milestone and record the whole-M3 closure review.', 'Audit the complete M3 command/condition/effect/payment/queue/cutover architecture as one milestone and record the whole-M3 closure review.')
        .replace('M3F1-M3F3 first DNA vertical - complete\n   |\nM3F4 cutover proof and M3F closure - next\n   |\nM3G whole-M3 hardening and closure', 'M3F1-M3F4 first DNA vertical - complete\n   |\nM3G whole-M3 hardening and closure - next');
}

test('M3F4 status-document guard accepts the intended closed-M3F repository state', () => {
    assert.deepEqual(statusDocViolations(closedRoadmap(), closedBacklog()), []);
});

test('M3F4 status-document guard rejects stale active/next milestone text', () => {
    const violations = statusDocViolations(roadmap, backlog);
    assert.ok(violations.some(violation => violation.includes('M3F is the active milestone')));
    assert.ok(violations.some(violation => violation.includes('M3F4 Cutover proof and closure - next')));
    assert.ok(violations.some(violation => violation.includes('First real vanilla cutover - active')));
});

test('M3F4 status-document guard rejects loss of CommandBus.prepare documentation', () => {
    const badBacklog = closedBacklog().replace(
        'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;',
        'the public bus exposes only `dispatch`, `has`, and deterministic `ids`;'
    );
    const violations = statusDocViolations(closedRoadmap(), badBacklog);
    assert.ok(violations.some(violation => violation.includes('prepare')));
});
