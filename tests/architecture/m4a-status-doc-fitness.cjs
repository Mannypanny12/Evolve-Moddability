'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4A_AUTHORITY = 'docs/modding/M4A_CALCULATION_CONTEXT_TRACE.md';

function occurrences(source, needle){
    return source.split(needle).length - 1;
}

function requireExactlyOnce(source, needle, label, violations){
    const count = occurrences(source, needle);
    if (count !== 1){
        violations.push(`${label} must contain exactly one ${JSON.stringify(needle)} marker; found ${count}`);
    }
}

function normalizeHorizontalWhitespace(source){
    return source.replace(/[ \t]+/g, ' ');
}

function forbid(source, needle, label, violations){
    if (source.includes(needle)){
        violations.push(`${label} retains stale status text ${JSON.stringify(needle)}`);
    }
}

function statusDocViolations(roadmap, backlog, currentArchitecture, m4aAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, '## M4: Calculation and modifier engine', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M4A Calculation context and trace - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M4A_CALCULATION_CONTEXT_TRACE.md`.', ROADMAP, violations);
    forbid(roadmap, '### M4A Calculation context and trace - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '## M4: Calculation and modifier engine', BACKLOG, violations);
    requireExactlyOnce(backlog, '### M4A - Calculation context and trace - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4A calculation context and trace - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M4A_CALCULATION_CONTEXT_TRACE.md](M4A_CALCULATION_CONTEXT_TRACE.md).', BACKLOG, violations);
    forbid(backlog, 'M4A calculation context and trace - next', BACKLOG, violations);

    requireExactlyOnce(currentArchitecture, 'M4A is complete: **Calculation context and trace**.', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(
        normalizeHorizontalWhitespace(currentArchitecture),
        '+-- calculation context + base trace [M4A]',
        CURRENT_ARCHITECTURE,
        violations
    );
    forbid(currentArchitecture, '| M4 Calculation and modifier engine | next | `ROADMAP.md` |', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, 'M4A is next: **Calculation context and trace**.', CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m4aAuthority, '# M4A Calculation Context and Trace', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, '## Calculation contract', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, '## Architecture boundary', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, '## Independent review and hardening', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, '## Post-merge independent review and hardening', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, 'Code-hardening head `442182acb737e520144ff54e1fe0c6a1c131b263` passed the complete Baseline workflow in run `37673775002`', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, '## Deliberate deferrals', M4A_AUTHORITY, violations);
    requireExactlyOnce(m4aAuthority, 'M4B Modifier pipeline is the next slice.', M4A_AUTHORITY, violations);

    return violations;
}

function findViolations(root){
    return statusDocViolations(
        fs.readFileSync(path.join(root, ROADMAP), 'utf8'),
        fs.readFileSync(path.join(root, BACKLOG), 'utf8'),
        fs.readFileSync(path.join(root, CURRENT_ARCHITECTURE), 'utf8'),
        fs.readFileSync(path.join(root, M4A_AUTHORITY), 'utf8')
    );
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4A status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4A status-document fitness passed.');
}

module.exports = {
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
