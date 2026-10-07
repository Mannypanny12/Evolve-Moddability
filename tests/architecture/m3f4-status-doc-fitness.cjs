'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROADMAP = 'docs/modding/ROADMAP.md';
const BACKLOG = 'docs/modding/BACKLOG.md';

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

function statusDocViolations(roadmap, backlog){
    const violations = [];

    requireExactlyOnce(roadmap, '### M3F First real vanilla cutover - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, '#### M3F4 Cutover proof and closure - complete', ROADMAP, violations);
    requireExactlyOnce(roadmap, '### M3G Hardening and closure - next', ROADMAP, violations);
    requireExactlyOnce(roadmap, 'See `M3F4_CUTOVER_CLOSURE.md`.', ROADMAP, violations);
    forbid(roadmap, 'M3F is the active milestone.', ROADMAP, violations);
    forbid(roadmap, '#### M3F4 Cutover proof and closure - next', ROADMAP, violations);

    requireExactlyOnce(backlog, '### M3F - First real vanilla cutover - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, '- M3F4 cutover proof and M3F closure - complete;', BACKLOG, violations);
    requireExactlyOnce(backlog, '### M3G - Whole-M3 hardening and closure - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M3F1-M3F4 first DNA vertical - complete', BACKLOG, violations);
    requireExactlyOnce(backlog, 'M3G whole-M3 hardening and closure - next', BACKLOG, violations);
    requireExactlyOnce(backlog, 'See [M3F4_CUTOVER_CLOSURE.md](M3F4_CUTOVER_CLOSURE.md).', BACKLOG, violations);
    requireExactlyOnce(backlog, 'the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;', BACKLOG, violations);
    forbid(backlog, '### M3F - First real vanilla cutover - active', BACKLOG, violations);
    forbid(backlog, '- M3F4 cutover proof and M3F closure - next.', BACKLOG, violations);
    forbid(backlog, '### M3G - Whole-M3 hardening and closure - later', BACKLOG, violations);

    return violations;
}

function findViolations(root){
    const roadmap = fs.readFileSync(path.join(root, ROADMAP), 'utf8');
    const backlog = fs.readFileSync(path.join(root, BACKLOG), 'utf8');
    return statusDocViolations(roadmap, backlog);
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3F4 status-document fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3F4 status-document fitness passed.');
}

module.exports = { statusDocViolations, findViolations };

if (require.main === module) main();
