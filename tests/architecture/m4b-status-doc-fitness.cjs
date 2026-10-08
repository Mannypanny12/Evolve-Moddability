'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4B_AUTHORITY = 'docs/modding/M4B_MODIFIER_PIPELINE.md';

const CURRENT_M4_ROW = '| M4 Calculation and modifier engine | in progress | `M4B_MODIFIER_PIPELINE.md`, `ROADMAP.md` |';

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
    if (source.includes(needle)){
        violations.push(`${label} retains stale status text ${JSON.stringify(needle)}`);
    }
}

function statusDocViolations(roadmap, backlog, currentArchitecture, m4bAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, '### M4B Modifier pipeline - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M4B_MODIFIER_PIPELINE.md`.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M4C Resource calculation primitives - next', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Android packages the engine. It must not become a separate gameplay implementation.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '## Cross-cutting migration rules', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### No permanent dual systems', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Behavioral compatibility is more important than preserving legacy file structure.', ROADMAP, violations);
    forbid(roadmap, '### M4B Modifier pipeline - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '### M4B - Modifier pipeline - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, '### M4C - Resource calculation primitives - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4B modifier pipeline - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4C resource calculation primitives - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M4B_MODIFIER_PIPELINE.md](M4B_MODIFIER_PIPELINE.md).', BACKLOG, violations);
    forbid(backlog, 'M4B modifier pipeline - next', BACKLOG, violations);

    requireExactlyOnce(currentArchitecture, CURRENT_M4_ROW, CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, 'Architecture report version 6 currently combines:', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, '`M4B_MODIFIER_PIPELINE.md` is the current M4 authority.', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, '+-- deterministic modifier pipeline                 [M4B]', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, 'M4B is complete: **Modifier pipeline**.', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, 'M4C is next: **Resource calculation primitives**.', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, 'M4B is next: **Modifier pipeline**.', CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m4bAuthority, '# M4B Modifier Pipeline', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Modifier registration contract', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Independent review and hardening', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, 'Code-hardening head `9b94f0e4c7bb62d72987c637e2e8a447a1586ae1` passed the complete Baseline workflow in run `37727211512`.', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Deliberate deferrals', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, 'M4C Resource calculation primitives is the next slice.', M4B_AUTHORITY, violations);

    return violations;
}

function findViolations(root){
    return statusDocViolations(
        fs.readFileSync(path.join(root, ROADMAP), 'utf8'),
        fs.readFileSync(path.join(root, BACKLOG), 'utf8'),
        fs.readFileSync(path.join(root, CURRENT_ARCHITECTURE), 'utf8'),
        fs.readFileSync(path.join(root, M4B_AUTHORITY), 'utf8')
    );
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4B status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4B status-document fitness passed.');
}

module.exports = {
    CURRENT_M4_ROW,
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
