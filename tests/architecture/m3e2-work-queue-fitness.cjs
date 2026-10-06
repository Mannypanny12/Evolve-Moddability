'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const QUEUE_ROOT = 'src/engine/queue';
const WORK_QUEUE_FILE = `${QUEUE_ROOT}/work-queue.mjs`;
const INTERNAL_WORK_ITEM_CONTRACT = `${QUEUE_ROOT}/work-item-contract.mjs`;
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

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function listSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listSourceFiles(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

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

function analyzeInternalContractReference(source, relativePath){
    if (relativePath.startsWith(`${QUEUE_ROOT}/`)) return [];
    const violations = [];
    for (const reference of extractModuleReferences(source, relativePath)){
        if (!reference.specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, reference.specifier);
        if (target === INTERNAL_WORK_ITEM_CONTRACT){
            violations.push(
                `${relativePath}: ${INTERNAL_WORK_ITEM_CONTRACT} is queue-internal and may not be imported outside ${QUEUE_ROOT}`
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

    const violations = analyzeWorkQueueModule(fs.readFileSync(filename, 'utf8'), WORK_QUEUE_FILE);
    const srcDir = path.join(root, 'src');
    for (const sourceFile of listSourceFiles(srcDir)){
        const relativePath = normalize(path.relative(root, sourceFile));
        if (relativePath.startsWith(`${QUEUE_ROOT}/`)) continue;
        violations.push(...analyzeInternalContractReference(
            fs.readFileSync(sourceFile, 'utf8'),
            relativePath
        ));
    }
    return violations;
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

module.exports = {
    analyzeInternalContractReference,
    analyzeWorkQueueModule,
    findViolations,
};

if (require.main === module) main();
