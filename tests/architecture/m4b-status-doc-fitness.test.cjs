'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    CURRENT_M4_ROW,
    statusDocViolations,
} = require('./m4b-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const m4bAuthority = fs.readFileSync(path.join(root, 'docs/modding/M4B_MODIFIER_PIPELINE.md'), 'utf8');

function violationsFor({
    roadmapText = roadmap,
    backlogText = backlog,
    currentArchitectureText = currentArchitecture,
    m4bAuthorityText = m4bAuthority,
} = {}){
    return statusDocViolations(roadmapText, backlogText, currentArchitectureText, m4bAuthorityText);
}

test('M4B status-document guard accepts M4B complete with M4C next', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M4B status-document guard rejects stale M4B-next markers', () => {
    const staleRoadmap = roadmap
        .replace('### M4B Modifier pipeline - complete', '### M4B Modifier pipeline - next')
        .replace('### M4C Resource calculation primitives - next', '### M4C Resource calculation primitives');
    const staleBacklog = backlog
        .replace('### M4B - Modifier pipeline - complete', '### M4B - Modifier pipeline - next')
        .replace('M4B modifier pipeline - complete', 'M4B modifier pipeline - next')
        .replace('M4C resource calculation primitives - next', 'M4C resource calculation primitives');
    const staleCurrent = currentArchitecture
        .replace(CURRENT_M4_ROW, '| M4 Calculation and modifier engine | in progress | `M4A_CALCULATION_CONTEXT_TRACE.md`, `ROADMAP.md` |')
        .replace('M4B is complete: **Modifier pipeline**.', 'M4B is next: **Modifier pipeline**.')
        .replace('M4C is next: **Resource calculation primitives**.', 'M4C remains later work.');

    const violations = violationsFor({
        roadmapText: staleRoadmap,
        backlogText: staleBacklog,
        currentArchitectureText: staleCurrent,
    });
    assert.ok(violations.some(value => value.includes('M4B Modifier pipeline - next')));
    assert.ok(violations.some(value => value.includes('M4B modifier pipeline - next')));
    assert.ok(violations.some(value => value.includes('M4B is next')));
});

test('M4B status-document guard rejects truncated roadmap tail', () => {
    const tailStart = roadmap.indexOf('\nAndroid packages the engine. It must not become a separate gameplay implementation.');
    assert.notEqual(tailStart, -1);
    const truncatedRoadmap = roadmap.slice(0, tailStart);
    const violations = violationsFor({ roadmapText: truncatedRoadmap });
    assert.ok(violations.some(value => value.includes('Android packages the engine')));
    assert.ok(violations.some(value => value.includes('Cross-cutting migration rules')));
    assert.ok(violations.some(value => value.includes('Behavioral compatibility is more important')));
});

test('M4B status-document guard pins architecture report version without inventing a new schema version', () => {
    const staleCurrent = currentArchitecture.replace(
        'Architecture report version 6 currently combines:',
        'Architecture report version 7 currently combines:'
    );
    const violations = violationsFor({ currentArchitectureText: staleCurrent });
    assert.ok(violations.some(value => value.includes('Architecture report version 6')));
});

test('M4B status-document guard requires review proof and explicit M4C handoff', () => {
    const staleAuthority = m4bAuthority
        .replace('## Independent review and hardening', '## Review notes')
        .replace('Code-hardening head `9b94f0e4c7bb62d72987c637e2e8a447a1586ae1` passed the complete Baseline workflow in run `37727211512`.', 'Code hardening passed.')
        .replace('M4C Resource calculation primitives is the next slice.', 'Resource primitives come later.');
    const violations = violationsFor({ m4bAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('Independent review and hardening')));
    assert.ok(violations.some(value => value.includes('9b94f0e4')));
    assert.ok(violations.some(value => value.includes('M4C Resource calculation primitives is the next slice.')));
});
