'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    CURRENT_M3_ROW,
    CURRENT_M3_AUTHORITY,
    statusDocViolations,
} = require('./m3f4-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const m3Closure = fs.readFileSync(path.join(root, 'docs/modding/M3_CLOSURE_REVIEW.md'), 'utf8');
const m3FinalReview = fs.readFileSync(path.join(root, 'docs/modding/M3_FINAL_REVIEW_HARDENING.md'), 'utf8');

function violationsFor({
    roadmapText = roadmap,
    backlogText = backlog,
    currentArchitectureText = currentArchitecture,
    m3ClosureText = m3Closure,
    m3FinalReviewText = m3FinalReview,
} = {}){
    return statusDocViolations(
        roadmapText,
        backlogText,
        currentArchitectureText,
        m3ClosureText,
        m3FinalReviewText
    );
}

test('M3 status-document guard accepts the intended closed-and-reviewed M3 repository state', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M3 status-document guard rejects stale M3G-next and M3-next authority text', () => {
    const staleRoadmap = roadmap.replace('### M3G Hardening and closure - complete', '### M3G Hardening and closure - next');
    const staleBacklog = backlog
        .replace('### M3G - Whole-M3 hardening and closure - complete', '### M3G - Whole-M3 hardening and closure - next')
        .replace('M3G whole-M3 hardening and closure - complete', 'M3G whole-M3 hardening and closure - next');
    const staleCurrentArchitecture = currentArchitecture.replace(
        CURRENT_M3_ROW,
        '| M3 Commands, conditions, effects and costs | next | `ROADMAP.md` |'
    );

    const violations = violationsFor({
        roadmapText: staleRoadmap,
        backlogText: staleBacklog,
        currentArchitectureText: staleCurrentArchitecture,
    });

    assert.ok(violations.some(violation => violation.includes('M3G Hardening and closure - next')));
    assert.ok(violations.some(violation => violation.includes('Whole-M3 hardening and closure - next')));
    assert.ok(violations.some(violation => violation.includes('M3 Commands, conditions, effects and costs | next')));
});

test('M3 status-document guard rejects loss of the post-closure hardening authority', () => {
    const staleCurrentArchitecture = currentArchitecture
        .replace(
            CURRENT_M3_ROW,
            '| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md`, `M0_M3_RETROSPECTIVE_HARDENING.md` |'
        )
        .replace(
            CURRENT_M3_AUTHORITY,
            'Read `M3_CLOSURE_REVIEW.md` for the integrated milestone design/exit authority and `M0_M3_RETROSPECTIVE_HARDENING.md` for the subsequent cross-milestone pre-M4 revalidation.'
        );
    const violations = violationsFor({ currentArchitectureText: staleCurrentArchitecture });

    assert.ok(violations.some(violation => violation.includes('M3_FINAL_REVIEW_HARDENING.md')));
});

test('M3 status-document guard rejects loss of the cumulative retrospective authority', () => {
    const staleCurrentArchitecture = currentArchitecture
        .replace(
            CURRENT_M3_ROW,
            '| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md`, `M3_FINAL_REVIEW_HARDENING.md` |'
        )
        .replace(
            CURRENT_M3_AUTHORITY,
            'Read `M3_CLOSURE_REVIEW.md` for the integrated milestone design/exit authority and `M3_FINAL_REVIEW_HARDENING.md` for the later whole-M3 audit and post-closure hardening.'
        );
    const violations = violationsFor({ currentArchitectureText: staleCurrentArchitecture });

    assert.ok(violations.some(violation => violation.includes('M0_M3_RETROSPECTIVE_HARDENING.md')));
});

test('M3 status-document guard rejects loss of CommandBus.prepare documentation', () => {
    const badBacklog = backlog.replace(
        'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;',
        'the public bus exposes only `dispatch`, `has`, and deterministic `ids`;'
    );
    const violations = violationsFor({ backlogText: badBacklog });
    assert.ok(violations.some(violation => violation.includes('prepare')));
});

test('M3 status-document guard requires the closure review, final review, and historical M4A handoff', () => {
    const badClosure = m3Closure
        .replace('## M3G: integrated hardening and closure', '## M3G')
        .replace(
            'With M3 closed, the next architectural slice is **M4A Calculation context and trace**.',
            'M3 is closed.'
        );
    const badFinalReview = m3FinalReview
        .replace('## Cross-milestone review', '## Milestone notes')
        .replace('M3 remains complete after full review.', 'M3 review finished.');
    const violations = violationsFor({
        m3ClosureText: badClosure,
        m3FinalReviewText: badFinalReview,
    });

    assert.ok(violations.some(violation => violation.includes('integrated hardening and closure')));
    assert.ok(violations.some(violation => violation.includes('M4A Calculation context and trace')));
    assert.ok(violations.some(violation => violation.includes('Cross-milestone review')));
    assert.ok(violations.some(violation => violation.includes('M3 remains complete after full review.')));
});
