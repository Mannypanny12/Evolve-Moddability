'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4B_AUTHORITY = 'docs/modding/M4B_MODIFIER_PIPELINE.md';

const ORIGINAL_FINAL_BRANCH_PROOF = 'The final original M4B branch head `920c46331364f3959143eb25f908ada3aeb2861b` passed Baseline PR run `37751341942`, merged as `a096634a71a1bc0ccd74295ef11a20f3caed89dd`, and the merged master commit passed Baseline run `37751803143`.';
const SECOND_REVIEW_CODE_PROOF = 'Code-bearing second-review head `e67b2ba30e86ee79701d5fa8192d2470cbf69d51` passed the complete Baseline workflow in run `37755684579`: Node tests, cumulative architecture gates, production build/cleanliness, injected-startup-failure browser negative control and normal real-browser smoke all passed.';
const FINAL_SECOND_REVIEW_PROOF = 'The final second-review head `acc61049c03f9670e707e8d5b105901d33208c5d` passed complete Baseline PR run `37759833839`, merged through PR #56 as `bc0bf6031083f2f74faffb9806495b1f2991a8fc`, and the merged master commit passed Baseline run `37760263363`; Android test-site run `37760263358` also completed its build and Pages deployment successfully.';
const SECOND_REVIEW_TRACE_PROVENANCE = '**Direct modifier traces could omit base provenance.**';
const SECOND_REVIEW_EXPORT_RATCHET = '**Dynamic-authority enforcement was partly name-based.**';
const STALE_SECOND_REVIEW_PENDING = 'The final documentation-bearing head must still pass the same complete exact-head chain before this second review can be merged.';

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

function statusDocViolations(roadmap, backlog, currentArchitecture, m4bAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, '### M4B Modifier pipeline - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M4B_MODIFIER_PIPELINE.md`.', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Android packages the engine. It must not become a separate gameplay implementation.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '## Cross-cutting migration rules', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### No permanent dual systems', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Behavioral compatibility is more important than preserving legacy file structure.', ROADMAP, violations);
    forbid(roadmap, '### M4B Modifier pipeline - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '### M4B - Modifier pipeline - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4B modifier pipeline - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M4B_MODIFIER_PIPELINE.md](M4B_MODIFIER_PIPELINE.md).', BACKLOG, violations);
    forbid(backlog, 'M4B modifier pipeline - next', BACKLOG, violations);

    requireExactlyOnce(currentArchitecture, 'Architecture report version 6 currently combines:', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(
        normalizeHorizontalWhitespace(currentArchitecture),
        '+-- deterministic modifier pipeline [M4B]',
        CURRENT_ARCHITECTURE,
        violations
    );
    requireExactlyOnce(currentArchitecture, 'M4B is complete: **Modifier pipeline**.', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, 'M4B is next: **Modifier pipeline**.', CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m4bAuthority, '# M4B Modifier Pipeline', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Modifier registration contract', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Independent review and hardening', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, ORIGINAL_FINAL_BRANCH_PROOF, M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Second post-merge independent review and hardening', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, SECOND_REVIEW_CODE_PROOF, M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, FINAL_SECOND_REVIEW_PROOF, M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, SECOND_REVIEW_TRACE_PROVENANCE, M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, SECOND_REVIEW_EXPORT_RATCHET, M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, 'hidden mutable closure state is not a valid calculation input', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, 'complete exported surface of `src/engine/calculations/**` is ratcheted', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, '## Deliberate deferrals', M4B_AUTHORITY, violations);
    requireExactlyOnce(m4bAuthority, 'M4C Resource calculation primitives is the next slice.', M4B_AUTHORITY, violations);
    forbid(m4bAuthority, 'Implementation and independent review/hardening are complete on the dedicated M4B branch.', M4B_AUTHORITY, violations);
    forbid(m4bAuthority, STALE_SECOND_REVIEW_PENDING, M4B_AUTHORITY, violations);

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
    ORIGINAL_FINAL_BRANCH_PROOF,
    SECOND_REVIEW_CODE_PROOF,
    FINAL_SECOND_REVIEW_PROOF,
    SECOND_REVIEW_TRACE_PROVENANCE,
    SECOND_REVIEW_EXPORT_RATCHET,
    STALE_SECOND_REVIEW_PENDING,
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
