'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    CURRENT_M4_ROW,
    statusDocViolations,
} = require('./m4a-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const m4aAuthority = fs.readFileSync(path.join(root, 'docs/modding/M4A_CALCULATION_CONTEXT_TRACE.md'), 'utf8');

function violationsFor({
    roadmapText = roadmap,
    backlogText = backlog,
    currentArchitectureText = currentArchitecture,
    m4aAuthorityText = m4aAuthority,
} = {}){
    return statusDocViolations(roadmapText, backlogText, currentArchitectureText, m4aAuthorityText);
}

test('M4A status-document guard accepts M4A complete with M4B next', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M4A status-document guard rejects stale M4A-next markers', () => {
    const staleRoadmap = roadmap
        .replace('### M4A Calculation context and trace - complete', '### M4A Calculation context and trace - next')
        .replace('### M4B Modifier pipeline - next', '### M4B Modifier pipeline');
    const staleBacklog = backlog
        .replace('### M4A - Calculation context and trace - complete', '### M4A - Calculation context and trace - next')
        .replace('M4A calculation context and trace - complete', 'M4A calculation context and trace - next')
        .replace('M4B modifier pipeline - next', 'M4B modifier pipeline');
    const staleCurrent = currentArchitecture
        .replace(CURRENT_M4_ROW, '| M4 Calculation and modifier engine | next | `ROADMAP.md` |')
        .replace('M4A is complete: **Calculation context and trace**.', 'M4A is next: **Calculation context and trace**.')
        .replace('M4B is next: **Modifier pipeline**.', 'M4B remains later work.');

    const violations = violationsFor({
        roadmapText: staleRoadmap,
        backlogText: staleBacklog,
        currentArchitectureText: staleCurrent,
    });
    assert.ok(violations.some(value => value.includes('M4A Calculation context and trace - next')));
    assert.ok(violations.some(value => value.includes('M4A calculation context and trace - next')));
    assert.ok(violations.some(value => value.includes('M4 Calculation and modifier engine | next')));
    assert.ok(violations.some(value => value.includes('M4A is next')));
});

test('M4A status-document guard rejects stale architecture report prose', () => {
    const staleCurrent = currentArchitecture.replace(
        'Architecture report version 6 currently combines:',
        'Architecture report version 5 currently combines:'
    );
    const violations = violationsFor({ currentArchitectureText: staleCurrent });
    assert.ok(violations.some(value => value.includes('Architecture report version 6')));
});

test('M4A status-document guard requires the slice authority and its deferral boundary', () => {
    const staleAuthority = m4aAuthority
        .replace('## Calculation contract', '## Calculator notes')
        .replace('## Deliberate deferrals', '## Later')
        .replace('M4B Modifier pipeline is the next slice.', 'Modifier work comes later.');
    const violations = violationsFor({ m4aAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('Calculation contract')));
    assert.ok(violations.some(value => value.includes('Deliberate deferrals')));
    assert.ok(violations.some(value => value.includes('M4B Modifier pipeline is the next slice.')));
});
