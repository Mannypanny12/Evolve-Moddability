'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M4C_AUTHORITY = 'docs/modding/M4C_RESOURCE_CALCULATIONS.md';

const CURRENT_M4_ROW = '| M4 Calculation and modifier engine | in progress | `M4C_RESOURCE_CALCULATIONS.md`, `ROADMAP.md` |';
const HARDENED_CODE_PROOF = 'The hardened code-bearing head passed complete Baseline run `37879876389`, including Node tests, cumulative architecture fitness, game/wiki build, generated-output cleanliness, the injected startup-failure browser negative control and the normal real-browser smoke.';
const ORIGINAL_FINAL_CLOSURE_PROOF = 'The original final M4C branch head `11548b584f95116b3060bdfbf72045e88365600c` passed Baseline run `37880678649`; PR #59 passed Baseline run `37880877583`, merged as `4ad71b8233023fdaba758bf4011c0da98e63269d`, and merged master passed Baseline run `37881028936` plus Android test-site run `37881028942`, including Pages deployment.';
const BOUNDED_ZERO_FINDING = '**Bounded-zero buffering was initially too permissive.**';
const FRACTIONAL_EVIDENCE_FINDING = '**Fractional clamp evidence could become semantically false through floating-point subtraction.**';
const SECOND_REVIEW_HEADING = '## Second post-merge independent review and hardening';
const SECOND_REVIEW_DEPENDENCY_FINDING = '**The one-way dependency gate only knew the six current generic-core filenames.**';
const SECOND_REVIEW_CLOSURE_FINDING = '**The in-repo closure authority did not pin the actual final M4C proof chain.**';
const SECOND_REVIEW_SCOPE_FINDING = '**Legacy parity wording needed a narrower boundary.**';
const SECOND_REVIEW_CODE_PROOF = 'The second-review code-bearing head `384529a1ceeb6683a5cadce9d1653ec5398932e6` passed complete Baseline run `37881759568`: Node tests, cumulative architecture fitness, game/wiki build, generated-output cleanliness, injected startup-failure browser negative control and normal real-browser smoke all passed.';
const STALE_FINAL_PROOF_PENDING = 'The final documentation/status-bearing head still requires its own complete CI proof before closure.';

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

function statusDocViolations(roadmap, backlog, currentArchitecture, m4cAuthority){
    const violations = [];

    requireExactlyOnce(roadmap, '### M4C Resource calculation primitives - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M4C_RESOURCE_CALCULATIONS.md`.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M4D Migrate one production vertical - next', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Android packages the engine. It must not become a separate gameplay implementation.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '## Cross-cutting migration rules', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'Behavioral compatibility is more important than preserving legacy file structure.', ROADMAP, violations);
    forbid(roadmap, '### M4C Resource calculation primitives - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '### M4C - Resource calculation primitives - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4C resource calculation primitives - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4D migrate one production vertical - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M4C_RESOURCE_CALCULATIONS.md](M4C_RESOURCE_CALCULATIONS.md).', BACKLOG, violations);
    forbid(backlog, 'M4C resource calculation primitives - next', BACKLOG, violations);

    requireExactlyOnce(currentArchitecture, CURRENT_M4_ROW, CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, '`M4C_RESOURCE_CALCULATIONS.md` is the current M4 authority.', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, '+-- resource calculation primitives                 [M4C]', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, 'M4C is complete: **Resource calculation primitives**.', CURRENT_ARCHITECTURE, violations);
    requireExactlyOnce(currentArchitecture, 'M4D is next: **Migrate one production vertical**.', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, 'M4C is next: **Resource calculation primitives**.', CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m4cAuthority, '# M4C Resource calculation primitives', M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, '## Independent review and hardening', M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, HARDENED_CODE_PROOF, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, ORIGINAL_FINAL_CLOSURE_PROOF, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, BOUNDED_ZERO_FINDING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, FRACTIONAL_EVIDENCE_FINDING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, SECOND_REVIEW_HEADING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, SECOND_REVIEW_DEPENDENCY_FINDING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, SECOND_REVIEW_CLOSURE_FINDING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, SECOND_REVIEW_SCOPE_FINDING, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, SECOND_REVIEW_CODE_PROOF, M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, '## Architecture boundary', M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, '## Deliberate deferrals', M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, '## Closure criteria', M4C_AUTHORITY, violations);
    requireExactlyOnce(m4cAuthority, 'M4D owns the first reviewed live production vertical', M4C_AUTHORITY, violations);
    forbid(m4cAuthority, STALE_FINAL_PROOF_PENDING, M4C_AUTHORITY, violations);

    return violations;
}

function findViolations(root){
    return statusDocViolations(
        fs.readFileSync(path.join(root, ROADMAP), 'utf8'),
        fs.readFileSync(path.join(root, BACKLOG), 'utf8'),
        fs.readFileSync(path.join(root, CURRENT_ARCHITECTURE), 'utf8'),
        fs.readFileSync(path.join(root, M4C_AUTHORITY), 'utf8')
    );
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4C status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4C status-document fitness passed.');
}

module.exports = {
    CURRENT_M4_ROW,
    HARDENED_CODE_PROOF,
    ORIGINAL_FINAL_CLOSURE_PROOF,
    BOUNDED_ZERO_FINDING,
    FRACTIONAL_EVIDENCE_FINDING,
    SECOND_REVIEW_HEADING,
    SECOND_REVIEW_DEPENDENCY_FINDING,
    SECOND_REVIEW_CLOSURE_FINDING,
    SECOND_REVIEW_SCOPE_FINDING,
    SECOND_REVIEW_CODE_PROOF,
    STALE_FINAL_PROOF_PENDING,
    statusDocViolations,
    findViolations,
};

if (require.main === module) main();
