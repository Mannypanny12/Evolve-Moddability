'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    HARDENED_CODE_PROOF,
    ORIGINAL_FINAL_CLOSURE_PROOF,
    BOUNDED_ZERO_FINDING,
    FRACTIONAL_EVIDENCE_FINDING,
    SECOND_REVIEW_HEADING,
    SECOND_REVIEW_DEPENDENCY_FINDING,
    SECOND_REVIEW_CLOSURE_FINDING,
    SECOND_REVIEW_SCOPE_FINDING,
    SECOND_REVIEW_CODE_PROOF,
    SECOND_REVIEW_FINAL_CLOSURE_PROOF,
    THIRD_REVIEW_HEADING,
    THIRD_REVIEW_ALIAS_FINDING,
    THIRD_REVIEW_CONSUMER_FINDING,
    THIRD_REVIEW_CLOSURE_FINDING,
    THIRD_REVIEW_CODE_PROOF,
    THIRD_REVIEW_FINAL_CLOSURE_PROOF,
    STALE_FINAL_PROOF_PENDING,
    statusDocViolations,
} = require('./m4c-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const m4cAuthority = fs.readFileSync(path.join(root, 'docs/modding/M4C_RESOURCE_CALCULATIONS.md'), 'utf8');

function violationsFor({
    roadmapText = roadmap,
    backlogText = backlog,
    currentArchitectureText = currentArchitecture,
    m4cAuthorityText = m4cAuthority,
} = {}){
    return statusDocViolations(roadmapText, backlogText, currentArchitectureText, m4cAuthorityText);
}

test('M4C status-document guard preserves historical M4C closure after later M4 slices advance', () => {
    assert.deepEqual(violationsFor(), []);
});

test('M4C status-document guard rejects stale M4C-next markers without owning current M4 progression', () => {
    const staleRoadmap = roadmap
        .replace('### M4C Resource calculation primitives - complete', '### M4C Resource calculation primitives - next');
    const staleBacklog = backlog
        .replace('### M4C - Resource calculation primitives - complete', '### M4C - Resource calculation primitives - next')
        .replace('M4C resource calculation primitives - complete', 'M4C resource calculation primitives - next');
    const staleCurrent = currentArchitecture
        .replace('M4C is complete: **Resource calculation primitives**.', 'M4C is next: **Resource calculation primitives**.');

    const violations = violationsFor({
        roadmapText: staleRoadmap,
        backlogText: staleBacklog,
        currentArchitectureText: staleCurrent,
    });
    assert.ok(violations.some(value => value.includes('M4C Resource calculation primitives - next')));
    assert.ok(violations.some(value => value.includes('M4C resource calculation primitives - next')));
    assert.ok(violations.some(value => value.includes('M4C is next')));
});

test('M4C status-document guard rejects truncated roadmap tail', () => {
    const tailStart = roadmap.indexOf('\nAndroid packages the engine. It must not become a separate gameplay implementation.');
    assert.notEqual(tailStart, -1);
    const violations = violationsFor({ roadmapText: roadmap.slice(0, tailStart) });
    assert.ok(violations.some(value => value.includes('Android packages the engine')));
    assert.ok(violations.some(value => value.includes('Cross-cutting migration rules')));
    assert.ok(violations.some(value => value.includes('Behavioral compatibility is more important')));
});

test('M4C status-document guard requires original closure and all independent hardening records', () => {
    const staleAuthority = m4cAuthority
        .replace('## Independent review and hardening', '## Review notes')
        .replace(HARDENED_CODE_PROOF, 'Hardening passed.')
        .replace(ORIGINAL_FINAL_CLOSURE_PROOF, 'Original closure passed.')
        .replace(BOUNDED_ZERO_FINDING, '**Buffer notes.**')
        .replace(FRACTIONAL_EVIDENCE_FINDING, '**Arithmetic notes.**')
        .replace(SECOND_REVIEW_HEADING, '## Later review')
        .replace(SECOND_REVIEW_DEPENDENCY_FINDING, '**Dependency notes.**')
        .replace(SECOND_REVIEW_CLOSURE_FINDING, '**Closure notes.**')
        .replace(SECOND_REVIEW_SCOPE_FINDING, '**Legacy notes.**')
        .replace(SECOND_REVIEW_CODE_PROOF, 'Second review passed.')
        .replace(SECOND_REVIEW_FINAL_CLOSURE_PROOF, 'Second review closure passed.')
        .replace(THIRD_REVIEW_HEADING, '## Another review')
        .replace(THIRD_REVIEW_ALIAS_FINDING, '**Alias notes.**')
        .replace(THIRD_REVIEW_CONSUMER_FINDING, '**Consumer notes.**')
        .replace(THIRD_REVIEW_CLOSURE_FINDING, '**Durability notes.**')
        .replace(THIRD_REVIEW_CODE_PROOF, 'Third review passed.')
        .replace(THIRD_REVIEW_FINAL_CLOSURE_PROOF, 'Third review closure passed.');

    const violations = violationsFor({ m4cAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('Independent review and hardening')));
    assert.ok(violations.some(value => value.includes('37879876389')));
    assert.ok(violations.some(value => value.includes('11548b584f95116')));
    assert.ok(violations.some(value => value.includes('Bounded-zero buffering')));
    assert.ok(violations.some(value => value.includes('Fractional clamp evidence')));
    assert.ok(violations.some(value => value.includes('Second post-merge independent review and hardening')));
    assert.ok(violations.some(value => value.includes('one-way dependency gate')));
    assert.ok(violations.some(value => value.includes('in-repo closure authority')));
    assert.ok(violations.some(value => value.includes('Legacy parity wording')));
    assert.ok(violations.some(value => value.includes('384529a1ceeb6683')));
    assert.ok(violations.some(value => value.includes('1bb81295c1fab825')));
    assert.ok(violations.some(value => value.includes('Third post-merge independent review and hardening')));
    assert.ok(violations.some(value => value.includes('Repeated resource-delta operation identity')));
    assert.ok(violations.some(value => value.includes('Zero-production-consumer discovery')));
    assert.ok(violations.some(value => value.includes('second review\'s final closure chain')));
    assert.ok(violations.some(value => value.includes('8cbc4ef0d9b2760c')));
    assert.ok(violations.some(value => value.includes('a65cb725877c9582')));
});

test('M4C status-document guard rejects losing third-review contract clarifications', () => {
    const staleAuthority = m4cAuthority
        .replace('Each operation must also be a distinct input object identity.', 'Operation objects may be reused.')
        .replace(
            'Consumer discovery covers ordinary relative imports plus repository/root-style calculation imports, including dynamic imports',
            'Consumer discovery covers ordinary relative imports'
        );
    const violations = violationsFor({ m4cAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('distinct input object identity')));
    assert.ok(violations.some(value => value.includes('repository/root-style calculation imports')));
});

test('M4C status-document guard rejects obsolete pending-proof prose', () => {
    const staleAuthority = `${m4cAuthority}\n${STALE_FINAL_PROOF_PENDING}\n`;
    const violations = violationsFor({ m4cAuthorityText: staleAuthority });
    assert.ok(violations.some(value => value.includes('stale status text')));
});
