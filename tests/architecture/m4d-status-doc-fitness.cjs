'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4D_AUTHORITY = 'docs/modding/M4D_OIL_WELL_PRODUCTION_CUTOVER.md';

const CLOSURE_STATUS = 'Status: complete after independent review and hardening; final exact-head CI is the closure authority.';
const ROADMAP_COMPLETE = '### M4D Migrate one production vertical - complete';
const ROADMAP_IN_PROGRESS = '### M4E Expand across `prod.js` - in progress';
const BACKLOG_COMPLETE = '### M4D - First live production vertical - complete';
const BACKLOG_IN_PROGRESS = '### M4E - Expand across `prod.js` - in progress';
const CURRENT_M4_AUTHORITY = '`M4E_PRODUCTION_MIGRATION.md` is the current M4 working authority.';
const CURRENT_M4E1_ROOT = '`src/application/evolve/production-calculation-runtime.mjs` is now the shared first-party production composition root.';
const STALE_IMPLEMENTATION_STATUS = 'Status: implementation candidate complete; independent review and hardening pending.';
const STALE_ROADMAP_PENDING = '### M4D Migrate one production vertical - next';
const STALE_ROADMAP_NEXT = '### M4E Expand across `prod.js` - next';
const STALE_BACKLOG_NEXT = 'M4E expand across `prod.js` - next';
const STALE_M4C_AUTHORITY = '`M4C_RESOURCE_CALCULATIONS.md` is the current M4 authority.';
const STALE_M4D_AUTHORITY = '`M4D_OIL_WELL_PRODUCTION_CUTOVER.md` is the current M4 authority.';

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
    if (source.includes(needle)) violations.push(`${label} must not contain stale M4 lifecycle marker ${JSON.stringify(needle)}`);
}

function statusDocViolations(roadmap, backlog, currentArchitecture, m4dAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, ROADMAP_COMPLETE, ROADMAP, violations);
    requireExactlyOnce(roadmap, ROADMAP_IN_PROGRESS, ROADMAP, violations);
    requireExactlyOnce(backlog, BACKLOG_COMPLETE, BACKLOG, violations);
    requireExactlyOnce(backlog, BACKLOG_IN_PROGRESS, BACKLOG, violations);
    requireExactlyOnce(currentArchitecture, CURRENT_M4_AUTHORITY, CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, CURRENT_M4E1_ROOT, CURRENT_ARCHITECTURE, violations);

    forbid(roadmap, STALE_ROADMAP_PENDING, ROADMAP, violations);
    forbid(roadmap, STALE_ROADMAP_NEXT, ROADMAP, violations);
    forbid(backlog, STALE_BACKLOG_NEXT, BACKLOG, violations);
    forbid(currentArchitecture, STALE_M4C_AUTHORITY, CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, STALE_M4D_AUTHORITY, CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m4dAuthority, '# M4D Oil Well production cutover', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, CLOSURE_STATUS, M4D_AUTHORITY, violations);
    forbid(m4dAuthority, STALE_IMPLEMENTATION_STATUS, M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`evolve:calculation/production/oil-well`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`src/application/evolve/oil-well-production-runtime.mjs`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '`src/prod.js` remains the compatibility seam for this slice.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'The legacy multiplication order is preserved exactly:', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'M4D does not migrate `oil_extractor`', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'The old embedded Oil-Well arithmetic has been removed from the live branch.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'ratchets `src/prod.js` direct `global` access from 113 to 109', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '## Independent review and hardening', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '**Biome absence became explicit.**', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '**Runtime-consumer enforcement was closed against alternate import spellings.**', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '**The real legacy composition seam is now executed.**', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '**Exact floating-point proof was tightened.**', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '**Hidden runtime capability bypasses are now blocked.**', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, '19b361962adb437f9d4662a24d4545890b893321', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'workflow run 1330', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'M4D is complete.', M4D_AUTHORITY, violations);
    requireExactlyOnce(m4dAuthority, 'M4E is next.', M4D_AUTHORITY, violations);

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
        console.error('M4D/M4E progression status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4D/M4E progression status-document fitness passed.');
}

module.exports = {
    CLOSURE_STATUS,
    ROADMAP_COMPLETE,
    ROADMAP_IN_PROGRESS,
    BACKLOG_COMPLETE,
    BACKLOG_IN_PROGRESS,
    CURRENT_M4_AUTHORITY,
    CURRENT_M4E1_ROOT,
    STALE_IMPLEMENTATION_STATUS,
    STALE_ROADMAP_PENDING,
    STALE_ROADMAP_NEXT,
    STALE_BACKLOG_NEXT,
    STALE_M4C_AUTHORITY,
    STALE_M4D_AUTHORITY,
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
