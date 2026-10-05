'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COST_ROOT = 'src/engine/costs';
const PUBLIC_QUOTE_FILE = 'src/engine/costs/payment-quote.mjs';
const IDENTITY_FILE = 'src/engine/identity.mjs';
const INERT_DATA_CONTRACT_FILE = 'src/engine/contracts/inert-data.mjs';

const FORBIDDEN_RUNTIME_PATTERNS = [
    ['legacy/global objects', /\b(?:global|globalThis|self)\b/],
    ['browser/UI objects', /\b(?:document|window|navigator|jQuery|Vue)\b|\$\s*\(/],
    ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
    ['Node/platform global', /\b(?:process|Buffer)\b/],
    ['runtime clock/random source', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
    ['timer or microtask scheduling', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
    ['dynamic module loading', /\bimport\s*\(|\brequire\b/],
    ['dynamic code capability', /\b(?:eval|Function|WebAssembly)\b/],
];

const FORBIDDEN_D1_SCOPE_PATTERNS = [
    ['affordability semantics', /\b(?:afford(?:able|ability)?|canAfford|checkAffordable|checkCosts|maxAffordable)\b/i],
    ['queue/capacity feasibility semantics', /\b(?:queue|capacity|feasib(?:le|ility))\b/i],
    ['payment planning/execution semantics', /\b(?:paymentPlans?|executePayment|applyPayment|commitPayment|paymentExecutor|debit)\b/i],
    ['cost calculation/modifier semantics', /\b(?:adjustCosts?|costModifier|priceModifier|modifierPipeline)\b/i],
];

const FORBIDDEN_AUTHORITY_PATTERN = /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts)\b/;
const FIRST_PARTY_NAMESPACE_PATTERN = /\bevolve\b/i;

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function listSourceFiles(dir, root, violations){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()){
            violations.push(`${normalize(path.relative(root, full))}: M3D1 source traversal may not pass through a symbolic link`);
        }
        else if (entry.isDirectory()){
            files.push(...listSourceFiles(full, root, violations));
        }
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))){
            files.push(full);
        }
    }
    return files.sort();
}

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function analyzePaymentQuoteExports(source, relativePath){
    if (relativePath !== PUBLIC_QUOTE_FILE) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createPaymentQuote\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    if (exportCount !== 1 || !hasReviewedEntry){
        return [`${relativePath}: M3D1 production quote entry must export only synchronous one-argument createPaymentQuote()`];
    }
    return [];
}

function analyzeCostModule(source, relativePath){
    const violations = [...analyzePaymentQuoteExports(source, relativePath)];
    const code = maskNonCode(source);

    if (FORBIDDEN_AUTHORITY_PATTERN.test(code)){
        violations.push(`${relativePath}: M3D1 quote construction may not reference payment/mutation authority`);
    }
    for (const [label, pattern] of FORBIDDEN_RUNTIME_PATTERNS){
        if (pattern.test(code)){
            violations.push(`${relativePath}: M3D1 quote construction may not access ${label}`);
        }
    }
    for (const [label, pattern] of FORBIDDEN_D1_SCOPE_PATTERNS){
        if (pattern.test(code)){
            violations.push(`${relativePath}: M3D1 quote construction may not acquire ${label}`);
        }
    }
    if (FIRST_PARTY_NAMESPACE_PATTERN.test(source)){
        violations.push(`${relativePath}: generic M3D1 cost source may not contain first-party Evolve namespace knowledge`);
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D1 cost modules may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3D1 cost modules may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE || target === INERT_DATA_CONTRACT_FILE) continue;
        if (target.startsWith(`${COST_ROOT}/`)) continue;
        if (target.startsWith('src/engine/state/')){
            violations.push(`${relativePath}: M3D1 quote construction may not import GameState/state infrastructure: ${target}`);
            continue;
        }
        if (target.startsWith('src/legacy/') || target.startsWith('src/platform/')){
            violations.push(`${relativePath}: M3D1 quote construction may not import legacy/platform adapters: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/runtime/')){
            violations.push(`${relativePath}: M3D1 quote construction may not import runtime capabilities: ${target}`);
            continue;
        }
        if (
            target.startsWith('src/engine/commands/') ||
            target.startsWith('src/engine/conditions/') ||
            target.startsWith('src/engine/effects/')
        ){
            violations.push(`${relativePath}: M3D1 quote construction may not depend on command/condition/effect modules: ${target}`);
            continue;
        }
        if (target === 'src/engine/registry.mjs'){
            violations.push(`${relativePath}: M3D1 quote construction may not depend on the definition Registry`);
            continue;
        }
        violations.push(`${relativePath}: unsupported M3D1 cost import: ${target}`);
    }
    return violations;
}

function analyzeProductionConsumer(source, relativePath){
    const violations = [];
    for (const reference of extractModuleReferences(source, relativePath)){
        if (!reference.specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, reference.specifier);
        if (!target.startsWith(`${COST_ROOT}/`)) continue;
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D1 cost dependencies must use static ESM imports; found ${reference.kind} for ${target}`);
            continue;
        }
        if (target !== PUBLIC_QUOTE_FILE){
            violations.push(`${relativePath}: production code may consume M3D1 costs only through ${PUBLIC_QUOTE_FILE}`);
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    if (!fs.existsSync(costDir)) return ['M3D1 cost source directory is missing'];

    const costStat = fs.lstatSync(costDir);
    if (costStat.isSymbolicLink()){
        violations.push('M3D1 cost source directory may not be a symbolic link');
    }
    else if (!costStat.isDirectory()){
        violations.push('M3D1 cost source path must be a directory');
    }
    else {
        for (const filename of listSourceFiles(costDir, root, violations)){
            const relative = normalize(path.relative(root, filename));
            violations.push(...analyzeCostModule(fs.readFileSync(filename, 'utf8'), relative));
        }
    }

    const publicQuotePath = path.join(root, ...PUBLIC_QUOTE_FILE.split('/'));
    if (!fs.existsSync(publicQuotePath)){
        violations.push('M3D1 public payment quote entry is missing');
    }
    else {
        const publicQuoteStat = fs.lstatSync(publicQuotePath);
        if (publicQuoteStat.isSymbolicLink()){
            violations.push('M3D1 public payment quote entry may not be a symbolic link');
        }
        else if (!publicQuoteStat.isFile()){
            violations.push('M3D1 public payment quote entry must be a regular file');
        }
    }

    const srcDir = path.join(root, 'src');
    for (const filename of listSourceFiles(srcDir, root, violations)){
        const relative = normalize(path.relative(root, filename));
        if (relative.startsWith(`${COST_ROOT}/`)) continue;
        violations.push(...analyzeProductionConsumer(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3D1 payment quote boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D1 payment quote boundary fitness passed.');
}

module.exports = {
    analyzePaymentQuoteExports,
    analyzeCostModule,
    analyzeProductionConsumer,
    findViolations,
};

if (require.main === module) main();
