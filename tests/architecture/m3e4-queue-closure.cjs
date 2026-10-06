'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const QUEUE_ROOT = 'src/engine/queue';
const EXPECTED_QUEUE_MODULES = Object.freeze([
    `${QUEUE_ROOT}/work-item-contract.mjs`,
    `${QUEUE_ROOT}/work-item.mjs`,
    `${QUEUE_ROOT}/work-queue.mjs`,
    `${QUEUE_ROOT}/work-selection.mjs`,
]);
const FORBIDDEN_IDENTIFIERS = Object.freeze([
    'global',
    'queue_complete',
    'no_queue',
    'checkTechRequirements',
    'gainTech',
    'buildArpa',
    'buildTPShipQueue',
    'buildMechQueue',
    'arpaTimeCheck',
    'calcQueueMax',
    'calcRQueueMax',
    'dispatch',
    'execute',
    'PaymentPlan',
    'PaymentQuote',
    'EffectPlan',
    'GameState',
    'localStorage',
    'sessionStorage',
    'setTimeout',
    'setInterval',
    'serialize',
    'deserialize',
    'offline',
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

function analyzeQueueModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);
    for (const identifier of FORBIDDEN_IDENTIFIERS){
        if (identifierPattern(identifier).test(code)){
            violations.push(`${relativePath}: M3E closure forbids generic queue ownership of ${identifier}`);
        }
    }
    if (source.includes('evolve:command/')){
        violations.push(`${relativePath}: M3E generic queue modules may not embed first-party command IDs`);
    }
    return violations;
}

function analyzeVanillaQueueImports(source, relativePath){
    const violations = [];
    for (const reference of extractModuleReferences(source, relativePath)){
        if (!reference.specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, reference.specifier);
        if (target.startsWith(`${QUEUE_ROOT}/`)){
            violations.push(`${relativePath}: vanilla production source may not consume M3E queue modules before reviewed cutover: ${target}`);
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const queueDir = path.join(root, ...QUEUE_ROOT.split('/'));
    const queueFiles = listSourceFiles(queueDir).map(filename => normalize(path.relative(root, filename)));
    if (JSON.stringify(queueFiles) !== JSON.stringify([...EXPECTED_QUEUE_MODULES].sort())){
        violations.push(
            `M3E queue production module set drifted: expected ${JSON.stringify([...EXPECTED_QUEUE_MODULES].sort())}, got ${JSON.stringify(queueFiles)}`
        );
    }
    for (const relativePath of queueFiles){
        const filename = path.join(root, ...relativePath.split('/'));
        violations.push(...analyzeQueueModule(fs.readFileSync(filename, 'utf8'), relativePath));
    }

    const srcDir = path.join(root, 'src');
    for (const filename of listSourceFiles(srcDir)){
        const relativePath = normalize(path.relative(root, filename));
        if (relativePath.startsWith('src/engine/')) continue;
        violations.push(...analyzeVanillaQueueImports(fs.readFileSync(filename, 'utf8'), relativePath));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3E4 queue closure fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3E4 queue closure fitness passed.');
}

module.exports = {
    EXPECTED_QUEUE_MODULES,
    analyzeQueueModule,
    analyzeVanillaQueueImports,
    findViolations,
};

if (require.main === module) main();
