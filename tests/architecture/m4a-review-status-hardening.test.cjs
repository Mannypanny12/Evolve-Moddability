'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { statusDocViolations } = require('./m4a-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const roadmap = fs.readFileSync(path.join(root, 'docs/modding/ROADMAP.md'), 'utf8');
const backlog = fs.readFileSync(path.join(root, 'docs/modding/BACKLOG.md'), 'utf8');
const currentArchitecture = fs.readFileSync(path.join(root, 'docs/modding/CURRENT_ARCHITECTURE.md'), 'utf8');
const authority = fs.readFileSync(path.join(root, 'docs/modding/M4A_CALCULATION_CONTEXT_TRACE.md'), 'utf8');

function violationsFor(authorityText){
    return statusDocViolations(roadmap, backlog, currentArchitecture, authorityText);
}

test('M4A status guard requires the post-merge independent review authority', () => {
    const stale = authority.replace(
        '## Post-merge independent review and hardening',
        '## Additional notes'
    );
    const violations = violationsFor(stale);
    assert.ok(violations.some(value => value.includes('Post-merge independent review and hardening')));
});

test('M4A status guard requires exact code-hardening CI evidence', () => {
    const stale = authority.replace(
        'Code-hardening head `442182acb737e520144ff54e1fe0c6a1c131b263` passed the complete Baseline workflow in run `37673775002`',
        'The code-hardening checkpoint passed CI'
    );
    const violations = violationsFor(stale);
    assert.ok(violations.some(value => value.includes('442182acb737e520144ff54e1fe0c6a1c131b263')));
});
