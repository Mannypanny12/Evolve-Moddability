'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COST_ROOT = 'src/engine/costs';
const PUBLIC_QUOTE = 'src/engine/costs/payment-quote.mjs';
const PUBLIC_ASSESSOR = 'src/engine/costs/payment-assessor.mjs';
const PUBLIC_PLAN = 'src/engine/costs/payment-plan.mjs';
const PAYMENT_READS = 'src/engine/costs/payment-read-capabilities.mjs';
const PAYMENT_RESULT = 'src/engine/costs/payment-assessment-result.mjs';
const LEGACY_ADAPTER = 'src/legacy/bridge/evolve-payment-read-adapter.mjs';
const IDENTITY = 'src/engine/identity.mjs';
const INERT_DATA = 'src/engine/contracts/inert-data.mjs';
const MAPPINGS = 'src/legacy/bridge/evolve-mappings.mjs';

const FORBIDDEN_RUNTIME = [
    ['legacy/global objects', /\b(?:global|globalThis|self)\b/],
    ['browser/UI objects', /\b(?:document|window|navigator|jQuery|Vue)\b|\$\s*\(/],
    ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
    ['platform globals', /\b(?:process|Buffer)\b/],
    ['clock/random source', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
    ['timers/schedulers', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
    ['async/promise control flow', /\b(?:async|await)\b|\bnew\s+Promise\b|\bPromise\s*\./],
    ['generator control flow', /\bfunction\s*\*/],
    ['dynamic code/loading', /\bimport\s*\(|\brequire\b|\b(?:eval|Function|WebAssembly)\b/],
];

const FORBIDDEN_LATER_SCOPE = [
    ['payment execution', /\b[A-Za-z0-9_$]*(?:executePayment|applyPayment|commitPayment|paymentExecutor)[A-Za-z0-9_$]*\b/i],
    ['modifier/calculation pipeline', /\b[A-Za-z0-9_$]*(?:adjustCost|costModifier|priceModifier|modifierPipeline|calculationPipeline)[A-Za-z0-9_$]*\b/i],
    ['queue scheduling/work items', /\b[A-Za-z0-9_$]*(?:enqueue|dequeue|queueWorkItem|queueScheduler|scheduleQueue)[A-Za-z0-9_$]*\b/i],
];
const PAYMENT_PLANNING = /\b[A-Za-z0-9_$]*(?:paymentPlan|debit|credit)[A-Za-z0-9_$]*\b/i;

const FORBIDDEN_AUTHORITY = /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts)\b/;
const FORBIDDEN_LEGACY_COST_HELPERS = /\b(?:checkCosts|checkAffordable|checkMaxCosts|payCosts|adjustCosts)\b/;
const FIRST_PARTY_NAMESPACE = /\bevolve:/i;
const RNA_ONLY_MAPPING_LIST = /const\s+SUPPORTED_PAYMENT_MAPPING_IDS\s*=\s*Object\.freeze\(\s*\[\s*['"]evolve\.resource\.rna_state['"]\s*,?\s*\]\s*\)\s*;/;

function normalize(value){
    return value.split(path.sep).join('/');
}

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

function analyzeAssessorExports(source, relativePath){
    if (relativePath !== PUBLIC_ASSESSOR) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createPaymentAssessor\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    if (exportCount !== 1 || !hasReviewedEntry){
        return [`${relativePath}: M3D2 public assessor must export only synchronous one-argument createPaymentAssessor()`];
    }
    return [];
}

function analyzeCostSource(source, relativePath){
    const violations = [...analyzeAssessorExports(source, relativePath)];
    const code = maskNonCode(source);

    if (FORBIDDEN_AUTHORITY.test(code)){
        violations.push(`${relativePath}: M3D2 cost source may not acquire mutation/payment authority`);
    }
    if (FORBIDDEN_LEGACY_COST_HELPERS.test(code)){
        violations.push(`${relativePath}: M3D2 cost source may not reproduce legacy cost-helper entry points`);
    }
    if (relativePath !== PUBLIC_PLAN && PAYMENT_PLANNING.test(code)){
        violations.push(`${relativePath}: M3D2-owned cost source may not acquire PaymentPlan/debit/credit scope`);
    }
    for (const [label, pattern] of FORBIDDEN_RUNTIME){
        if (pattern.test(code)) violations.push(`${relativePath}: M3D2 cost source may not access ${label}`);
    }
    for (const [label, pattern] of FORBIDDEN_LATER_SCOPE){
        if (pattern.test(code)) violations.push(`${relativePath}: M3D2 cost source may not acquire ${label}`);
    }
    if (FIRST_PARTY_NAMESPACE.test(source)){
        violations.push(`${relativePath}: generic M3D2 cost source may not contain first-party canonical Evolve IDs`);
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D2 cost source may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3D2 cost source may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY || target === INERT_DATA || target.startsWith(`${COST_ROOT}/`)) continue;
        if (target.startsWith('src/engine/conditions/')){
            violations.push(`${relativePath}: M3D2 affordability may not depend on the condition engine: ${target}`);
            continue;
        }
        if (
            target.startsWith('src/engine/state/') ||
            target.startsWith('src/engine/commands/') ||
            target.startsWith('src/engine/effects/') ||
            target.startsWith('src/engine/runtime/') ||
            target.startsWith('src/legacy/') ||
            target.startsWith('src/platform/')
        ){
            violations.push(`${relativePath}: forbidden M3D2 dependency: ${target}`);
            continue;
        }
        violations.push(`${relativePath}: unsupported M3D2 cost import: ${target}`);
    }
    return violations;
}

function analyzeAssessorInternalEdges(source, relativePath){
    const violations = [];
    if (relativePath === PUBLIC_ASSESSOR){
        const allowed = new Set([
            IDENTITY,
            'src/engine/costs/payment-quote-input.mjs',
            PAYMENT_READS,
            PAYMENT_RESULT,
        ]);
        for (const reference of extractModuleReferences(source, relativePath)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relativePath, reference.specifier);
            if (!allowed.has(target)) violations.push(`${relativePath}: unsupported assessor dependency ${target}`);
        }
    }
    if (relativePath === PAYMENT_READS){
        const allowed = new Set([IDENTITY, INERT_DATA]);
        for (const reference of extractModuleReferences(source, relativePath)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relativePath, reference.specifier);
            if (!allowed.has(target)) violations.push(`${relativePath}: payment reads may depend only on identity/inert data; found ${target}`);
        }
    }
    if (relativePath === PAYMENT_RESULT){
        for (const reference of extractModuleReferences(source, relativePath)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relativePath, reference.specifier);
            if (target !== IDENTITY) violations.push(`${relativePath}: payment result may depend only on identity; found ${target}`);
        }
    }
    return violations;
}

function analyzeLegacyAdapter(source, relativePath = LEGACY_ADAPTER){
    const violations = [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createEvolveLegacyPaymentReadProvider\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    if (relativePath === LEGACY_ADAPTER && (exportCount !== 1 || !hasReviewedEntry)){
        violations.push(`${relativePath}: M3D2 legacy payment bridge must export only synchronous one-argument createEvolveLegacyPaymentReadProvider()`);
    }
    if (relativePath === LEGACY_ADAPTER && !RNA_ONLY_MAPPING_LIST.test(source)){
        violations.push(`${relativePath}: M3D2 legacy payment bridge must remain pinned to the single reviewed RNA mapping`);
    }
    if (/\b(?:global|globalThis|window|document|navigator|jQuery|Vue)\b|\$\s*\(/.test(code)){
        violations.push(`${relativePath}: M3D2 legacy payment adapter may not access globals/UI directly`);
    }
    if (/\b(?:modRes|payCosts|setGlobal|mutationAuthority|beginTransaction|commitTransaction)\b/.test(code)){
        violations.push(`${relativePath}: M3D2 legacy payment adapter must remain read-only`);
    }
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D2 legacy payment adapter may use only static ESM imports`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (![IDENTITY, INERT_DATA, MAPPINGS].includes(target)){
            violations.push(`${relativePath}: unsupported M3D2 legacy payment adapter dependency ${target}`);
        }
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
            violations.push(`${relativePath}: M3D2 cost dependencies must use static ESM imports; found ${reference.kind}`);
            continue;
        }
        if (target !== PUBLIC_QUOTE && target !== PUBLIC_ASSESSOR && target !== PUBLIC_PLAN){
            violations.push(`${relativePath}: production code may import only reviewed M3D public entries; found ${target}`);
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    for (const filename of listSourceFiles(costDir)){
        const relative = normalize(path.relative(root, filename));
        const source = fs.readFileSync(filename, 'utf8');
        violations.push(...analyzeCostSource(source, relative));
        violations.push(...analyzeAssessorInternalEdges(source, relative));
    }

    const adapterPath = path.join(root, ...LEGACY_ADAPTER.split('/'));
    if (!fs.existsSync(adapterPath)) violations.push('M3D2 legacy payment read adapter is missing');
    else violations.push(...analyzeLegacyAdapter(fs.readFileSync(adapterPath, 'utf8')));

    const srcDir = path.join(root, 'src');
    for (const filename of listSourceFiles(srcDir)){
        const relative = normalize(path.relative(root, filename));
        if (relative.startsWith(`${COST_ROOT}/`)) continue;
        violations.push(...analyzeProductionConsumer(fs.readFileSync(filename, 'utf8'), relative));
    }

    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3D2 payment assessment boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D2 payment assessment boundary fitness passed.');
}

module.exports = {
    analyzeAssessorExports,
    analyzeCostSource,
    analyzeAssessorInternalEdges,
    analyzeLegacyAdapter,
    analyzeProductionConsumer,
    findViolations,
};

if (require.main === module) main();
