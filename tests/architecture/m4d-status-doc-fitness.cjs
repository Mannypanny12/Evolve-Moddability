'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4D_AUTHORITY = 'docs/modding/M4D_OIL_WELL_PRODUCTION_CUTOVER.md';

const IMPLEMENTATION_STATUS = 'Status: implementation candidate complete; independent review and hardening pending.';
const ROADMAP_PENDING = '### M4D Migrate one production vertical - next';
const BACKLOG_PENDING = 'M4D migrate one production vertical - next';
const CURRENT_M4_AUTHORITY = '`M4C_RESOURCE_CALCULATIONS.md` is the current M4 authority.';
const PREMATURE_ROADMAP_CLOSURE = '### M4D Migrate one production vertical - complete';

function occurrences(source, needle){
    return source.split(needle).length - 1;
}

function requireExactlyOnce(source, needle, label, violations){
    const count = occurrences(source, needle);
    if (count !== 1){
        violations.push(`${label} must contain exactly one ${JSON.stringify(needle)} marker; found ${count}`);
    }
}

function forbid(source, needle, label, violations){
    if (source.includes(needle)) violations.push(`${label} must not contain premature M4D closure marker ${JSON.stringify(needle)}`);
}

function statusDocViolations(roadmap, backlog, currentArchitecture, m4dAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, ROADMAP_PENDING, ROADMAP, violations);
    requireExactlyOnce(backlog, BACKLOG_PENDING, BACKLOG, violations);
    requireExactlyOnce(currentArchitecture, CURRENT_M4_AUTHORITY, CURRENT_ARCHITECTURE, violations);
    forbid(roadmap, PREMATURE_ROADMAP_CLOSURE, ROADMAP, violations);

    requireExactlyOnce(m4dAuthority, '# M4D Oil Well production cutover', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, IMPLEMENTATION_STATUS, M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`evolve:calculation/production/oil-well`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`src/application/evolve/oil-well-production-runtime.mjs`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`src/prod.js` remains the compatibility seam for this slice.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'The legacy multiplication order is preserved exactly:', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'M4D does not migrate `oil_extractor`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'M4E is not started by this slice.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'The old embedded Oil-Well arithmetic has been removed from the live branch.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'ratchets `src/prod.js` direct `global` access from 113 to 109', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'This document records the implementation candidate only. It does not declare M4D closed.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'The next lifecycle step is an independent review and hardening pass', M4D_AUTHORITY, violations);

    return violations;
}

function findViolations(root){
    return statusDocViolations(
        fs.readFileSync(path.join(root, ROADMAP), 'utf8'),
        fs.readFileSync(path.join(root, BACKLOG), 'utf8'),
        fs.readFileSync(path.join(root, CURRENT_ARCHITECTURE), 'utf8'),
        fs.readFileSync(path.join(root, M4D_AUTHORITY), 'utf8')
    );
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4D status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4D status-document fitness passed.');
}

module.exports = {
    IMPLEMENTATION_STATUS,
    ROADMAP_PENDING,
    BACKLOG_PENDING,
    CURRENT_M4_AUTHORITY,
    PREMATURE_ROADMAP_CLOSURE,
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
