'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL = 'docs/modding/EXECUTION_PROTOCOL.md';

const REQUIRED_MARKERS = [
    '## CI observation rule',
    'Do not make more than two consecutive status reads of the same workflow run when they report no meaningful state change.',
    'After the second unchanged observation, stop polling that run in the current tool sequence.',
    'A content-identical merge does not require blocking on a second full CI run when the exact merged tree already passed the complete required chain before merge.',
    'Post-merge workflow status may be checked once for additional evidence; if it is still in progress, record it as pending and stop polling.',
];

function protocolViolations(source){
    const violations = [];
    for (const marker of REQUIRED_MARKERS){
        const count = source.split(marker).length - 1;
        if (count !== 1){
            violations.push(`${PROTOCOL}: expected exactly one ${JSON.stringify(marker)} marker; found ${count}`);
        }
    }
    return violations;
}

function findViolations(root){
    const protocolPath = path.join(root, PROTOCOL);
    if (!fs.existsSync(protocolPath)) return [`${PROTOCOL}: file is missing`];
    return protocolViolations(fs.readFileSync(protocolPath, 'utf8'));
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('Execution protocol fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('Execution protocol fitness passed.');
}

module.exports = { REQUIRED_MARKERS, protocolViolations, findViolations };

if (require.main === module) main();
