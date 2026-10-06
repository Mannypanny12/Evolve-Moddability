'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const QUEUE_ROOT = 'src/engine/queue';
const IDENTITY_FILE = 'src/engine/identity.mjs';
const INERT_DATA_CONTRACT_FILE = 'src/engine/contracts/inert-data.mjs';

const FORBIDDEN_IDENTIFIERS = [
    'global',
    'qKey',
    'q_merge',
    'qAny',
    'qAny_res',
    'q',
    'qs',
    'queue_size',
    'action',
    'label',
    'cna',
    'time',
    't_max',
    'bres',
    'req',
    'qa',
    'quote',
    'affordable',
    'requirementsMet',
    'timeCheck',
    'payCosts',
    'modRes',
    'callback_queue',
    'mutationAuthority',
    'createMutationScope',
    'paymentPlan',
    'PaymentPlan',
    'PaymentQuote',
    'effectPlan',
    'EffectPlan',
    'handler',
    'callback',
];

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

function identifierPattern(identifier){
    return new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function analyzeQueueModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);

    for (const identifier of FORBIDDEN_IDENTIFIERS){
        if (identifierPattern(identifier).test(code)){
            violations.push(`${relativePath}: M3E1 queue modules may not reference ${identifier}`);
        }
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind === 'dynamic-import'){
            violations.push(`${relativePath}: M3E1 queue modules may not use dynamic import`);
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3E1 queue modules may not import external packages: ${specifier}`);
            continue;
        }

        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE || target === INERT_DATA_CONTRACT_FILE) continue;
        if (target.startsWith(`${QUEUE_ROOT}/`)) continue;

        violations.push(
            `${relativePath}: M3E1 queue modules may import only identity.mjs, inert-data.mjs, or sibling queue modules: ${target}`
        );
    }

    return violations;
}

function findViolations(root){
    const queueDir = path.join(root, ...QUEUE_ROOT.split('/'));
    if (!fs.existsSync(queueDir)){
        return ['M3E1 queue source directory is missing'];
    }

    const violations = [];
    for (const filename of listSourceFiles(queueDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeQueueModule(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3E1 queue boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3E1 queue boundary fitness passed.');
}

module.exports = { analyzeQueueModule, findViolations };

if (require.main === module) main();
