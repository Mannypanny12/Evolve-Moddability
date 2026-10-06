'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const WORK_SELECTION_FILE = 'src/engine/queue/work-selection.mjs';
const ALLOWED_IMPORTS = new Set([
    'src/engine/identity.mjs',
    'src/engine/contracts/inert-data.mjs',
    'src/engine/queue/work-item-contract.mjs',
    'src/engine/queue/work-queue.mjs',
]);
const FORBIDDEN_IDENTIFIERS = Object.freeze([
    'dispatch',
    'execute',
    'scheduler',
    'timeCheck',
    'arpaTimeCheck',
    'checkAffordable',
    'checkTechRequirements',
    'qAny',
    'qAny_res',
    'PaymentQuote',
    'PaymentPlan',
    'EffectPlan',
    'GameState',
    'mutationAuthority',
    'createMutationScope',
    'localStorage',
    'sessionStorage',
    'setTimeout',
    'setInterval',
    'serialize',
    'deserialize',
    'offline',
    'paused',
]);
const FORBIDDEN_DATA_FIELDS = Object.freeze([
    'cna',
    'time',
    't_max',
    'bres',
    'req',
    'qa',
    'affordable',
    'requirementsMet',
    'readyAt',
    'estimate',
    'quote',
    'paymentPlan',
    'effectPlan',
    'handler',
    'callback',
]);

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

function dataFieldPatterns(field){
    const escaped = escapeRegex(field);
    return [
        new RegExp(`\\.\\s*${escaped}\\b`),
        new RegExp(`(?:^|[,{])\\s*${escaped}\\s*:`, 'm'),
        new RegExp(`(?:^|[,{])\\s*${escaped}\\s*(?=[,}])`, 'm'),
    ];
}

function analyzeWorkSelectionModule(source, relativePath = WORK_SELECTION_FILE){
    const violations = [];
    const code = maskNonCode(source);

    for (const identifier of FORBIDDEN_IDENTIFIERS){
        if (identifierPattern(identifier).test(code)){
            violations.push(
                `${relativePath}: M3E3 selection must remain scheduler/execution independent and may not reference ${identifier}`
            );
        }
    }
    for (const field of FORBIDDEN_DATA_FIELDS){
        if (dataFieldPatterns(field).some(pattern => pattern.test(code))){
            violations.push(
                `${relativePath}: M3E3 readiness is transient and may not expose cached/legacy field ${field}`
            );
        }
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind === 'dynamic-import'){
            violations.push(`${relativePath}: M3E3 selection may not use dynamic import`);
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3E3 selection may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (!ALLOWED_IMPORTS.has(target)){
            violations.push(`${relativePath}: M3E3 selection dependency set is closed; unsupported import ${target}`);
        }
    }
    return violations;
}

function findViolations(root){
    const filename = path.join(root, ...WORK_SELECTION_FILE.split('/'));
    if (!fs.existsSync(filename)){
        return [`${WORK_SELECTION_FILE}: M3E3 work-selection module is missing`];
    }
    return analyzeWorkSelectionModule(fs.readFileSync(filename, 'utf8'), WORK_SELECTION_FILE);
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3E3 work-selection fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3E3 work-selection fitness passed.');
}

module.exports = { analyzeWorkSelectionModule, findViolations };

if (require.main === module) main();
