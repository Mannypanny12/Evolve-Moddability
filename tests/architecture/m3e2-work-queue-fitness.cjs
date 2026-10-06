'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');

const WORK_QUEUE_FILE = 'src/engine/queue/work-queue.mjs';
const FORBIDDEN_IDENTIFIERS = Object.freeze([
    'dispatch',
    'execute',
    'scheduler',
    'readiness',
    'readyAt',
    'timeCheck',
    'qAny',
    'qAny_res',
    'PaymentQuote',
    'PaymentPlan',
    'EffectPlan',
    'GameState',
    'localStorage',
    'sessionStorage',
    'setTimeout',
    'setInterval',
    'serialize',
    'deserialize',
    'offline',
    'paused',
]);

function escapeRegex(value){
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function identifierPattern(identifier){
    return new RegExp(`\\b${escapeRegex(identifier)}\\b`);
}

function analyzeWorkQueueModule(source, relativePath = WORK_QUEUE_FILE){
    const code = maskNonCode(source);
    const violations = [];
    for (const identifier of FORBIDDEN_IDENTIFIERS){
        if (identifierPattern(identifier).test(code)){
            violations.push(
                `${relativePath}: M3E2 WorkQueue must remain pure list/capacity logic and may not reference ${identifier}`
            );
        }
    }
    return violations;
}

function findViolations(root){
    const filename = path.join(root, ...WORK_QUEUE_FILE.split('/'));
    if (!fs.existsSync(filename)){
        return [`${WORK_QUEUE_FILE}: M3E2 WorkQueue module is missing`];
    }
    return analyzeWorkQueueModule(fs.readFileSync(filename, 'utf8'), WORK_QUEUE_FILE);
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3E2 work-queue fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3E2 work-queue fitness passed.');
}

module.exports = { analyzeWorkQueueModule, findViolations };

if (require.main === module) main();
