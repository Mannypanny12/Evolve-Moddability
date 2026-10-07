'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COMMAND_ROOT = 'src/content/evolve/commands';
const DNA_COMMAND = 'src/content/evolve/commands/evolution-dna.mjs';
const ALLOWED_IMPORTS = new Set([
    'src/engine/identity.mjs',
    'src/engine/contracts/inert-data.mjs',
    'src/engine/conditions/result.mjs',
    'src/engine/commands/result.mjs',
    'src/engine/costs/payment-quote.mjs',
    'src/engine/costs/payment-plan.mjs',
    'src/engine/effects/effect-plan.mjs',
]);

function normalize(value){ return value.split(path.sep).join('/'); }
function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}
function listFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(full));
        else if (entry.isFile()) files.push(full);
    }
    return files.sort();
}
function listSourceFiles(dir){
    return listFiles(dir).filter(file => SOURCE_EXTENSIONS.has(path.extname(file)));
}

function analyzeCommandPackage(root){
    const dir = path.join(root, ...COMMAND_ROOT.split('/'));
    const files = listFiles(dir).map(file => normalize(path.relative(root, file))).sort();
    return files.length === 1 && files[0] === DNA_COMMAND
        ? []
        : [`${COMMAND_ROOT}: M3F2 package must contain exactly evolution-dna.mjs; found ${files.join(', ')}`];
}

function analyzeDnaSource(source){
    const relativePath = DNA_COMMAND;
    const code = maskNonCode(source);
    const violations = [];

    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+createEvolutionDnaCommandRegistration\s*\(/.test(code)){
        violations.push(`${relativePath}: public surface must export only createEvolutionDnaCommandRegistration(rawOptions)`);
    }

    const forbidden = [
        ['legacy state/runtime', /\b(?:global|globalThis|setGlobal|modRes|payCosts)\b/],
        ['DOM/UI', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['application settings', /\bsettings\b/],
        ['GameState mutation authority', /\b(?:mutationAuthority|createMutationScope|beginTransaction|GameStateStore|StateStore)\b/],
        ['queue authority', /\b(?:WorkQueue|WorkItem|enqueue|dequeue|isQueue)\b/],
        ['presentation qualification', /\b(?:evoFinalMenu|display)\b/],
        ['current-affordability authorization', /\bassessCurrentAffordability\b|\bpayment\.current\./],
        ['async control flow', /\b(?:async|await)\b|\bnew\s+Promise\b/],
        ['dynamic loading/code construction', /\bimport\s*\(|\brequire\s*\(|\beval\b|\bnew\s+Function\b|\bFunction\s*\(/],
    ];
    for (const [label, pattern] of forbidden){
        if (pattern.test(code)) violations.push(`${relativePath}: DNA command composition may not access ${label}`);
    }

    if (source.includes('resource.available')){
        violations.push(`${relativePath}: DNA execution must not use presentation-backed resource.available`);
    }
    for (const required of [
        'evolve:command/evolution/dna',
        'evolve:resource/rna',
        'evolve:resource/dna',
        'resource.below_capacity',
        'resource.grant',
        'createPaymentQuote',
        'createPaymentPlan',
        'createEffectPlan',
        'DNA_COMMAND_REENTRANCY',
    ]){
        if (!source.includes(required)) violations.push(`${relativePath}: reviewed M3F2 contract marker is missing: ${required}`);
    }
    if (!/\bRNA_PRICE\s*=\s*2\b/.test(code)) violations.push(`${relativePath}: reviewed RNA price must remain exactly 2`);
    if (!/\bDNA_GRANT\s*=\s*1\b/.test(code)) violations.push(`${relativePath}: reviewed DNA grant must remain exactly 1`);
    if (!/\bfunction\s+execute\s*\(\s*payload\s*\)\s*\{[\s\S]*?\bvalidatePayload\s*\(\s*payload\s*\)\s*;/.test(code)){
        violations.push(`${relativePath}: exposed execute(payload) must revalidate the closed DNA payload defensively`);
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: external package import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!ALLOWED_IMPORTS.has(target)){
            violations.push(`${relativePath}: unsupported dependency ${target}`);
        }
    }
    return violations;
}

function analyzePrematureConsumers(root){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    for (const filename of listSourceFiles(srcRoot)){
        const relative = normalize(path.relative(root, filename));
        if (relative === DNA_COMMAND) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relative, reference.specifier);
            if (target === DNA_COMMAND){
                violations.push(`${relative}: M3F2 DNA registration has a production consumer before M3F3 legacy caller cutover`);
            }
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [...analyzeCommandPackage(root)];
    const filename = path.join(root, ...DNA_COMMAND.split('/'));
    if (!fs.existsSync(filename)) violations.push(`${DNA_COMMAND}: missing`);
    else violations.push(...analyzeDnaSource(fs.readFileSync(filename, 'utf8')));
    violations.push(...analyzePrematureConsumers(root));
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3F2 DNA command composition fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3F2 DNA command composition fitness passed.');
}

module.exports = { analyzeCommandPackage, analyzeDnaSource, analyzePrematureConsumers, findViolations };

if (require.main === module) main();
