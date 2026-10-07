'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const COST_ROOT = 'src/engine/costs';
const READ_ADAPTER = 'src/legacy/bridge/evolve-prestige-payment-read-adapter.mjs';
const SOURCE_RESOLVER = 'src/legacy/bridge/evolve-prestige-payment-source-resolver.mjs';
const IDENTITY = 'src/engine/identity.mjs';
const INERT_DATA = 'src/engine/contracts/inert-data.mjs';
const MAPPINGS = 'src/legacy/bridge/evolve-mappings.mjs';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

const FORBIDDEN_ENGINE_EXECUTION = /\b(?:executePayment|applyPayment|commitPayment|paymentExecutor|mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts)\b/;
const FORBIDDEN_ENGINE_EXECUTION_LITERAL = /['"`](?:executePayment|applyPayment|commitPayment|paymentExecutor|mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts)['"`]/;
const FORBIDDEN_PRESTIGE_CAPACITY = /\bprestige\s*\.\s*(?:capacity|available)\b|\breads\s*\.\s*prestige\s*\.\s*(?:capacity|available)\b/;
const FORBIDDEN_PRESTIGE_CAPACITY_BRACKET = /\b(?:reads\s*\.\s*)?prestige\s*\[\s*['"`](?:capacity|available)['"`]\s*\]|\breads\s*\[\s*['"`]prestige['"`]\s*\]\s*(?:\.\s*(?:capacity|available)\b|\[\s*['"`](?:capacity|available)['"`]\s*\])/;
const FIRST_PARTY_ENGINE_NAMES = /\b(?:Plasmid|AntiPlasmid|Supply|Knowledge|Species)\b/;

function normalize(value){ return value.split(path.sep).join('/'); }
function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
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

function analyzeCostSource(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);
    if (FIRST_PARTY_ENGINE_NAMES.test(source)){
        violations.push(`${relativePath}: generic M3D4 cost engine may not contain first-party payment names`);
    }
    if (
        FORBIDDEN_ENGINE_EXECUTION.test(code) ||
        FORBIDDEN_ENGINE_EXECUTION_LITERAL.test(source)
    ){
        violations.push(`${relativePath}: M3D4 cost engine remains inert/read-only and may not execute payment`);
    }
    if (
        FORBIDDEN_PRESTIGE_CAPACITY.test(code) ||
        FORBIDDEN_PRESTIGE_CAPACITY_BRACKET.test(source)
    ){
        violations.push(`${relativePath}: prestige assessment may read holdings only, never availability/capacity`);
    }
    return violations;
}

function analyzeBridgeExports(source, relativePath){
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (relativePath === READ_ADAPTER){
        const ok = /\bexport\s+function\s+createEvolvePrestigePaymentReadProvider\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
        return exportCount === 1 && ok ? [] : [`${relativePath}: must expose only createEvolvePrestigePaymentReadProvider()`];
    }
    if (relativePath === SOURCE_RESOLVER){
        const ok = /\bexport\s+function\s+createEvolvePrestigePaymentSourceResolver\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
        return exportCount === 1 && ok ? [] : [`${relativePath}: must expose only createEvolvePrestigePaymentSourceResolver()`];
    }
    return [];
}

function analyzeBridgeSource(source, relativePath){
    const violations = [...analyzeBridgeExports(source, relativePath)];
    const code = maskNonCode(source);
    if (/\b(?:global|globalThis|window|document|navigator|jQuery|Vue)\b|\$\s*\(/.test(code)){
        violations.push(`${relativePath}: prestige compatibility bridge may not access globals/UI directly`);
    }
    if (/\b(?:modRes|payCosts|setGlobal|mutationAuthority|beginTransaction|commitTransaction)\b/.test(code)){
        violations.push(`${relativePath}: prestige compatibility bridge must remain read-only`);
    }
    if (/\b(?:adjustCosts|costModifier|priceModifier|modifierPipeline)\b/.test(code)){
        violations.push(`${relativePath}: prestige source resolution may not acquire M4 calculation scope`);
    }

    const allowed = relativePath === READ_ADAPTER
        ? new Set([IDENTITY, INERT_DATA, MAPPINGS])
        : new Set([IDENTITY, INERT_DATA]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: prestige bridge may use only static ESM imports`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: prestige bridge may not import external packages`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!allowed.has(target)) violations.push(`${relativePath}: unsupported prestige bridge dependency ${target}`);
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    for (const filename of listSourceFiles(costDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeCostSource(fs.readFileSync(filename, 'utf8'), relative));
    }

    for (const relative of [READ_ADAPTER, SOURCE_RESOLVER]){
        const filename = path.join(root, ...relative.split('/'));
        if (!fs.existsSync(filename)){
            violations.push(`${relative}: required M3D4B prestige bridge file is missing`);
            continue;
        }
        violations.push(...analyzeBridgeSource(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3D4B prestige payment boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D4B prestige payment boundary fitness passed.');
}

module.exports = {
    analyzeCostSource,
    analyzeBridgeExports,
    analyzeBridgeSource,
    findViolations,
};

if (require.main === module) main();
