'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const COST_ROOT = 'src/engine/costs';
const COMMON = 'src/engine/costs/common.mjs';
const READ_CAPABILITIES = 'src/engine/costs/payment-read-capabilities.mjs';
const ASSESSOR = 'src/engine/costs/payment-assessor.mjs';
const PLAN = 'src/engine/costs/payment-plan.mjs';
const POOL_ADAPTER = 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs';
const SOURCE_RESOLVER = 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs';
const IDENTITY = 'src/engine/identity.mjs';
const INERT_DATA = 'src/engine/contracts/inert-data.mjs';
const MAPPINGS = 'src/legacy/bridge/evolve-mappings.mjs';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

const FORBIDDEN_EXECUTION = /\b(?:executePayment|applyPayment|commitPayment|paymentExecutor|mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts)\b/;
const FORBIDDEN_LATER_SCOPE = /\b(?:adjustCosts|costModifier|priceModifier|modifierPipeline|calculationPipeline|enqueue|dequeue|queueWorkItem|queueScheduler|scheduleQueue)\b/i;
const FIRST_PARTY_ENGINE_TERMS = /\b(?:Plasmid|AntiPlasmid|Supply|Knowledge|Species|purifier|sup_max)\b/i;
const DEFERRED_SPECIAL_TERMS = /\b(?:Knowledge|Species|defaultJob|default_job|stats\.know)\b/i;
const POOL_MAPPING_LIST = /const\s+SUPPORTED_POOL_MAPPING_IDS\s*=\s*Object\.freeze\(\s*\[\s*['"]evolve\.payment_pool\.purifier_supply_state['"]\s*,?\s*\]\s*\)\s*;/;

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

function analyzeGenericCostSource(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);
    if (FIRST_PARTY_ENGINE_TERMS.test(source)){
        violations.push(`${relativePath}: generic M3D4C cost engine may not contain first-party special-payment terms`);
    }
    if (FORBIDDEN_EXECUTION.test(code)){
        violations.push(`${relativePath}: M3D4C cost engine remains inert/read-only and may not execute payment`);
    }
    if (FORBIDDEN_LATER_SCOPE.test(code)){
        violations.push(`${relativePath}: M3D4C cost engine may not acquire modifier or queue scope`);
    }
    return violations;
}

function analyzeReviewedContractShape(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);
    if (relativePath === COMMON){
        if (!/\bvalue\s*!==\s*['"]resource['"]\s*&&\s*value\s*!==\s*['"]prestige['"]\s*&&\s*value\s*!==\s*['"]special['"]/.test(code)){
            violations.push(`${relativePath}: quote kind union must remain exactly resource | prestige | special`);
        }
        if (!/\bkind\s*!==\s*['"]pool['"]/.test(code)){
            violations.push(`${relativePath}: M3D4C special source union must remain pool-only`);
        }
        if (!/['"]payment-pool['"]/.test(source) || !/['"]payment['"]/.test(source)){
            violations.push(`${relativePath}: special quote identities must retain typed payment and payment-pool validation`);
        }
    }
    if (relativePath === READ_CAPABILITIES){
        if (!/\['resource',\s*'prestige',\s*'pool'\]/.test(source)){
            violations.push(`${relativePath}: payment read root must retain optional prestige and pool families`);
        }
        if (!/\['present',\s*'amount',\s*'capacity'\]/.test(source)){
            violations.push(`${relativePath}: pool read family must remain exactly present/amount/capacity`);
        }
    }
    if (relativePath === ASSESSOR){
        if (!/family:\s*['"]pool['"]/.test(source) || !/readFamily:\s*['"]pool['"]/.test(source)){
            violations.push(`${relativePath}: pool-backed special assessment source handling is missing`);
        }
    }
    if (relativePath === PLAN){
        if (!/kind:\s*['"]payment\.special\.settle['"]/.test(source)){
            violations.push(`${relativePath}: special quotes must plan only payment.special.settle`);
        }
        if (!/kind:\s*['"]pool['"]/.test(source)){
            violations.push(`${relativePath}: M3D4C special settlement source must remain pool-backed inert data`);
        }
    }
    return violations;
}

function analyzeBridgeExports(source, relativePath){
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (relativePath === POOL_ADAPTER){
        const ok = /\bexport\s+function\s+createEvolveSpecialPaymentPoolReadProvider\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
        return exportCount === 1 && ok ? [] : [`${relativePath}: must expose only createEvolveSpecialPaymentPoolReadProvider(options)`];
    }
    if (relativePath === SOURCE_RESOLVER){
        const ok = /\bexport\s+function\s+createEvolveSpecialPaymentSourceResolver\s*\(\s*\)/.test(code);
        return exportCount === 1 && ok ? [] : [`${relativePath}: must expose only createEvolveSpecialPaymentSourceResolver()`];
    }
    return [];
}

function analyzeBridgeSource(source, relativePath){
    const violations = [...analyzeBridgeExports(source, relativePath)];
    const code = maskNonCode(source);
    if (/\b(?:global|globalThis|window|document|navigator|jQuery|Vue)\b|\$\s*\(/.test(code)){
        violations.push(`${relativePath}: M3D4C compatibility bridge may not access globals/UI directly`);
    }
    if (FORBIDDEN_EXECUTION.test(code)){
        violations.push(`${relativePath}: M3D4C compatibility bridge must remain read-only`);
    }
    if (FORBIDDEN_LATER_SCOPE.test(code)){
        violations.push(`${relativePath}: M3D4C compatibility bridge may not acquire M4/queue scope`);
    }
    if (DEFERRED_SPECIAL_TERMS.test(source)){
        violations.push(`${relativePath}: M3D4D Knowledge/Species semantics are deferred`);
    }
    if (relativePath === POOL_ADAPTER && !POOL_MAPPING_LIST.test(source)){
        violations.push(`${relativePath}: pool adapter must remain pinned to the single purifier supply mapping`);
    }

    const allowed = relativePath === POOL_ADAPTER
        ? new Set([IDENTITY, INERT_DATA, MAPPINGS])
        : new Set([IDENTITY]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D4C bridge may use only static ESM imports`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: M3D4C bridge may not import external packages`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!allowed.has(target)) violations.push(`${relativePath}: unsupported M3D4C bridge dependency ${target}`);
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    for (const filename of listSourceFiles(costDir)){
        const relative = normalize(path.relative(root, filename));
        const source = fs.readFileSync(filename, 'utf8');
        violations.push(...analyzeGenericCostSource(source, relative));
        violations.push(...analyzeReviewedContractShape(source, relative));
    }

    for (const relative of [POOL_ADAPTER, SOURCE_RESOLVER]){
        const filename = path.join(root, ...relative.split('/'));
        if (!fs.existsSync(filename)){
            violations.push(`${relative}: required M3D4C bridge file is missing`);
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
        console.error('M3D4C special payment boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D4C special payment boundary fitness passed.');
}

module.exports = {
    analyzeGenericCostSource,
    analyzeReviewedContractShape,
    analyzeBridgeExports,
    analyzeBridgeSource,
    findViolations,
};

if (require.main === module) main();
