'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { statusDocViolations } = require('./m3f4-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const m3Closure = fs.readFileSync(path.join(root, 'docs/modding/M3_CLOSURE_REVIEW.md'), 'utf8');

function violationsFor({
    roadmapText = roadmap,
    backlogText = backlog,
    currentArchitectureText = currentArchitecture,
    m3ClosureText = m3Closure,
} = {}){
    return statusDocViolations(
        roadmapText,
        backlogText,
        currentArchitectureText,
        m3ClosureText
    );
}

test('M3 status-document guard accepts the intended closed-M3 repository state', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M3 status-document guard rejects stale M3G-next and M3-next authority text', () => {
    const staleRoadmap = roadmap
        .replace('### M3G Hardening and closure - complete', '### M3G Hardening and closure - next')
        .replace('### M4A Calculation context and trace - next', '### M4A Calculation context and trace');
    const staleBacklog = backlog
        .replace('### M3G - Whole-M3 hardening and closure - complete', '### M3G - Whole-M3 hardening and closure - next')
        .replace('M3G whole-M3 hardening and closure - complete', 'M3G whole-M3 hardening and closure - next')
        .replace('M4A calculation context and trace - next', 'M4A calculation context and trace');
    const staleCurrentArchitecture = currentArchitecture
        .replace(
            '| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md` |',
            '| M3 Commands, conditions, effects and costs | next | `ROADMAP.md` |'
        )
        .replace('M4A is next: **Calculation context and trace**.', 'M3 begins with the command bus.');

    const violations = violationsFor({
        roadmapText: staleRoadmap,
        backlogText: staleBacklog,
        currentArchitectureText: staleCurrentArchitecture,
    });

    assert.ok(violations.some(violation => violation.includes('M3G Hardening and closure - next')));
    assert.ok(violations.some(violation => violation.includes('Whole-M3 hardening and closure - next')));
    assert.ok(violations.some(violation => violation.includes('M3 Commands, conditions, effects and costs | next')));
    assert.ok(violations.some(violation => violation.includes('M3 begins with the command bus')));
});

test('M3 status-document guard rejects loss of CommandBus.prepare documentation', () => {
    const badBacklog = backlog.replace(
        'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;',
        'the public bus exposes only `dispatch`, `has`, and deterministic `ids`;'
    );
    const violations = violationsFor({ backlogText: badBacklog });
    assert.ok(violations.some(violation => violation.includes('prepare')));
});

test('M3 status-document guard requires the closure review and M4A handoff', () => {
    const badClosure = m3Closure
        .replace('## M3G: integrated hardening and closure', '## M3G')
        .replace(
            'With M3 closed, the next architectural slice is **M4A Calculation context and trace**.',
            'M3 is closed.'
        );
    const violations = violationsFor({ m3ClosureText: badClosure });
    assert.ok(violations.some(violation => violation.includes('integrated hardening and closure')));
    assert.ok(violations.some(violation => violation.includes('M4A Calculation context and trace')));
});
