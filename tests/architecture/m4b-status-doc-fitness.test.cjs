'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    ORIGINAL_FINAL_BRANCH_PROOF,
    SECOND_REVIEW_CODE_PROOF,
    FINAL_SECOND_REVIEW_PROOF,
    SECOND_REVIEW_TRACE_PROVENANCE,
    SECOND_REVIEW_EXPORT_RATCHET,
    STALE_SECOND_REVIEW_PENDING,
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

test('M4B status-document guard preserves historical M4B closure after later M4 slices advance', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M4B status-document guard rejects stale M4B-next markers without owning the current M4 next marker', () => {
    const staleRoadmap = roadmap.replace(
        '### M4B Modifier pipeline - complete',
        '### M4B Modifier pipeline - next'
    );
    const staleBacklog = backlog
        .replace('### M4B - Modifier pipeline - complete', '### M4B - Modifier pipeline - next')
        .replace('M4B modifier pipeline - complete', 'M4B modifier pipeline - next');
    const staleCurrent = currentArchitecture.replace(
        'M4B is complete: **Modifier pipeline**.',
        'M4B is next: **Modifier pipeline**.'
    );

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

test('M4B status-document guard requires actual closure proof and complete second-review evidence', () => {
    const staleAuthority = m4bAuthority
        .replace('## Independent review and hardening', '## Review notes')
        .replace(ORIGINAL_FINAL_BRANCH_PROOF, 'Original closure passed.')
        .replace('## Second post-merge independent review and hardening', '## Later review')
        .replace(SECOND_REVIEW_CODE_PROOF, 'Second review passed.')
        .replace(FINAL_SECOND_REVIEW_PROOF, 'Final second review passed.')
        .replace(SECOND_REVIEW_TRACE_PROVENANCE, '**Trace notes.**')
        .replace(SECOND_REVIEW_EXPORT_RATCHET, '**Architecture notes.**')
        .replace('hidden mutable closure state is not a valid calculation input', 'closure state is acceptable')
        .replace('complete exported surface of `src/engine/calculations/**` is ratcheted', 'calculation exports are unconstrained')
        .replace('M4C Resource calculation primitives is the next slice.', 'Resource primitives come later.');
    const violations = violationsFor({ m4bAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('Independent review and hardening')));
    assert.ok(violations.some(value => value.includes('920c4633')));
    assert.ok(violations.some(value => value.includes('Second post-merge independent review and hardening')));
    assert.ok(violations.some(value => value.includes('e67b2ba3')));
    assert.ok(violations.some(value => value.includes('acc61049')));
    assert.ok(violations.some(value => value.includes('Direct modifier traces could omit base provenance')));
    assert.ok(violations.some(value => value.includes('Dynamic-authority enforcement was partly name-based')));
    assert.ok(violations.some(value => value.includes('hidden mutable closure state')));
    assert.ok(violations.some(value => value.includes('complete exported surface')));
    assert.ok(violations.some(value => value.includes('M4C Resource calculation primitives is the next slice.')));
});

test('M4B status-document guard rejects obsolete pre-merge and second-review-pending status text', () => {
    const staleAuthority = `${m4bAuthority}\nImplementation and independent review/hardening are complete on the dedicated M4B branch.\n${STALE_SECOND_REVIEW_PENDING}\n`;
    const violations = violationsFor({ m4bAuthorityText: staleAuthority });
    assert.equal(violations.filter(value => value.includes('stale status text')).length >= 2, true);
});
