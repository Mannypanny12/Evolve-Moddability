'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';
const CURRENT_ARCHITECTURE = 'docs/modding/CURRENT_ARCHITECTURE.md';
const M3_CLOSURE = 'docs/modding/M3_CLOSURE_REVIEW.md';
const M3_FINAL_REVIEW = 'docs/modding/M3_FINAL_REVIEW_HARDENING.md';

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

function statusDocViolations(roadmap, backlog, currentArchitecture, m3Closure, m3FinalReview){
    const violations = [];

    requireExactlyOnce(roadmap, '## M3: Commands, conditions, effects, and costs - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M3F First real vanilla cutover - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, '#### M3F4 Cutover proof and closure - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M3G Hardening and closure - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M3_CLOSURE_REVIEW.md`.', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M4A Calculation context and trace - next', ROADMAP, violations);
    forbid(roadmap, 'M3G is the active milestone.', ROADMAP, violations);
    forbid(roadmap, '### M3G Hardening and closure - next', ROADMAP, violations);
    forbid(roadmap, '#### M3F4 Cutover proof and closure - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '## M3: Commands, conditions, effects, and costs - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, '### M3F - First real vanilla cutover - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, '- M3F4 cutover proof and M3F closure - complete;', BACKLOG, violations);
    requireExactlyOnce(backlog, '### M3G - Whole-M3 hardening and closure - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M3F1-M3F4 first DNA vertical - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M3G whole-M3 hardening and closure - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M4A calculation context and trace - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M3_CLOSURE_REVIEW.md](M3_CLOSURE_REVIEW.md).', BACKLOG, violations);
    requireExactlyOnce(backlog, 'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;', BACKLOG, violations);
    forbid(backlog, '### M3G - Whole-M3 hardening and closure - next', BACKLOG, violations);
    forbid(backlog, 'M3G whole-M3 hardening and closure - next', BACKLOG, violations);
    forbid(backlog, '- M3G whole-M3 hardening and closure;', BACKLOG, violations);

    requireExactlyOnce(
        currentArchitecture,
        '| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md`, `M3_FINAL_REVIEW_HARDENING.md` |',
        CURRENT_ARCHITECTURE,
        violations
    );
    requireExactlyOnce(
        currentArchitecture,
        'Read `M3_CLOSURE_REVIEW.md` for the integrated milestone design/exit authority and `M3_FINAL_REVIEW_HARDENING.md` for the later whole-M3 audit and post-closure hardening.',
        CURRENT_ARCHITECTURE,
        violations
    );
    requireExactlyOnce(
        currentArchitecture,
        '| M4 Calculation and modifier engine | next | `ROADMAP.md` |',
        CURRENT_ARCHITECTURE,
        violations
    );
    requireExactlyOnce(currentArchitecture, 'M4A is next: **Calculation context and trace**.', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, '| M3 Commands, conditions, effects and costs | next |', CURRENT_ARCHITECTURE, violations);
    forbid(currentArchitecture, 'M3 begins with the command bus.', CURRENT_ARCHITECTURE, violations);

    requireExactlyOnce(m3Closure, '# M3 Closure Review', M3_CLOSURE, violations);
    requireExactlyOnce(m3Closure, '## M3G: integrated hardening and closure', M3_CLOSURE, violations);
    requireExactlyOnce(m3Closure, '## Remaining intentional debt', M3_CLOSURE, violations);
    requireExactlyOnce(m3Closure, '## Closure proof', M3_CLOSURE, violations);
    requireExactlyOnce(m3Closure, 'With M3 closed, the next architectural slice is **M4A Calculation context and trace**.', M3_CLOSURE, violations);

    requireExactlyOnce(m3FinalReview, '# M3 Final Review and Hardening', M3_FINAL_REVIEW, violations);
    requireExactlyOnce(m3FinalReview, '## Overall result', M3_FINAL_REVIEW, violations);
    requireExactlyOnce(m3FinalReview, '## Cross-milestone review', M3_FINAL_REVIEW, violations);
    requireExactlyOnce(m3FinalReview, '## Test review', M3_FINAL_REVIEW, violations);
    requireExactlyOnce(m3FinalReview, '## Exit assessment', M3_FINAL_REVIEW, violations);
    requireExactlyOnce(m3FinalReview, 'M3 remains complete after full review.', M3_FINAL_REVIEW, violations);

    return violations;
}

function findViolations(root){
    const roadmap = fs.readFileSync(path.join(root, ROADMAP), 'utf8');
    const backlog = fs.readFileSync(path.join(root, BACKLOG), 'utf8');
    const currentArchitecture = fs.readFileSync(path.join(root, CURRENT_ARCHITECTURE), 'utf8');
    const m3Closure = fs.readFileSync(path.join(root, M3_CLOSURE), 'utf8');
    const m3FinalReview = fs.readFileSync(path.join(root, M3_FINAL_REVIEW), 'utf8');
    return statusDocViolations(roadmap, backlog, currentArchitecture, m3Closure, m3FinalReview);
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3 status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3 status-document fitness passed.');
}

module.exports = { statusDocViolations, findViolations };

if (require.main === module) main();
