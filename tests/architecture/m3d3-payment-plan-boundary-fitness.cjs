'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COST_ROOT = 'src/engine/costs';
const PUBLIC_QUOTE = 'src/engine/costs/payment-quote.mjs';
const PUBLIC_ASSESSOR = 'src/engine/costs/payment-assessor.mjs';
const PUBLIC_PLAN = 'src/engine/costs/payment-plan.mjs';
const QUOTE_INPUT = 'src/engine/costs/payment-quote-input.mjs';
const IDENTITY = 'src/engine/identity.mjs';
const INERT_DATA = 'src/engine/contracts/inert-data.mjs';

const REVIEWED_PAYMENT_KINDS = new Set([
    'payment.resource.debit',
    'payment.prestige.debit',
    'payment.special.settle',
]);

const FORBIDDEN_RUNTIME = [
    ['legacy/global objects', /\b(?:global|globalThis|self)\b/],
    ['browser/UI objects', /\b(?:document|window|navigator|jQuery|Vue)\b|\$\s*\(/],
    ['browser/platform services', /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|process|Buffer)\b/],
    ['clock/random source', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
    ['timers/schedulers', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
    ['async/promise control flow', /\b(?:async|await)\b|\bnew\s+Promise\b|\bPromise\s*\./],
    ['generator control flow', /\bfunction\s*\*/],
    ['dynamic code/loading', /\bimport\s*\(|\brequire\b|\b(?:eval|Function|WebAssembly)\b/],
];

const FORBIDDEN_PLAN_AUTHORITY = /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal|payCosts|executePayment|applyPayment|commitPayment|paymentExecutor)\b/;
const FORBIDDEN_PLAN_READS = /\b(?:assessCurrentAffordability|assessQueuePaymentFeasibility|currentAmount|capacity|available)\b/;
const FORBIDDEN_FIRST_PARTY_SCOPE = /\b(?:plasmid|antiplasmid|knowledge|supply|species|purifier)\b/i;
const FORBIDDEN_QUOTE_INPUT_PAYMENT_SCOPE = /\b(?:paymentId|payment\.special|specialPayment|poolId)\b/i;
const FORBIDDEN_LATER_SCOPE = /\b(?:adjustCosts|costModifier|priceModifier|modifierPipeline|calculationPipeline|enqueue|dequeue|queueWorkItem|queueScheduler|scheduleQueue)\b/i;
const FIRST_PARTY_NAMESPACE = /\bevolve:/i;

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

function analyzePlanExports(source, relativePath = PUBLIC_PLAN){
    if (relativePath !== PUBLIC_PLAN) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createPaymentPlan\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    return exportCount === 1 && hasReviewedEntry
        ? []
        : [`${relativePath}: public plan surface must export only synchronous one-argument createPaymentPlan()`];
}

function analyzePlanOperationKinds(source, relativePath = PUBLIC_PLAN){
    if (relativePath !== PUBLIC_PLAN) return [];
    const code = maskNonCode(source);
    if (/\bkind\s*:\s*(?!['"])[A-Za-z_$]/.test(code)){
        return [`${relativePath}: PaymentPlan operation/source kinds must be direct reviewed literals`];
    }
    const found = [...source.matchAll(/\bkind\s*:\s*(['"])(payment\.[^'"\r\n]+)\1/g)]
        .map(match => match[2]);
    if (found.length !== REVIEWED_PAYMENT_KINDS.size || new Set(found).size !== found.length){
        return [`${relativePath}: PaymentPlan must construct exactly the reviewed resource, prestige and special operation kinds`];
    }
    if (found.some(kind => !REVIEWED_PAYMENT_KINDS.has(kind)) ||
        [...REVIEWED_PAYMENT_KINDS].some(kind => !found.includes(kind))){
        return [`${relativePath}: PaymentPlan operation kinds exceed the reviewed M3D4C set`];
    }
    return [];
}

function analyzePlanSource(source, relativePath = PUBLIC_PLAN){
    const violations = [
        ...analyzePlanExports(source, relativePath),
        ...analyzePlanOperationKinds(source, relativePath),
    ];
    if (relativePath !== PUBLIC_PLAN) return violations;
    const code = maskNonCode(source);
    for (const [label, pattern] of FORBIDDEN_RUNTIME){
        if (pattern.test(code)) violations.push(`${relativePath}: PaymentPlan may not access ${label}`);
    }
    if (FORBIDDEN_PLAN_AUTHORITY.test(code)) violations.push(`${relativePath}: PaymentPlan is inert and may not acquire payment/mutation authority`);
    if (FORBIDDEN_PLAN_READS.test(code)) violations.push(`${relativePath}: PaymentPlan may not read affordability/capacity state`);
    if (FORBIDDEN_FIRST_PARTY_SCOPE.test(source)) violations.push(`${relativePath}: generic PaymentPlan may not contain first-party payment names`);
    if (FORBIDDEN_LATER_SCOPE.test(code)) violations.push(`${relativePath}: PaymentPlan may not acquire modifier or queue scope`);
    if (FIRST_PARTY_NAMESPACE.test(source)) violations.push(`${relativePath}: generic PaymentPlan may not contain first-party Evolve IDs`);

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: PaymentPlan may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: PaymentPlan may not import external packages: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (target !== QUOTE_INPUT) violations.push(`${relativePath}: PaymentPlan may depend only on ${QUOTE_INPUT}; found ${target}`);
    }
    return violations;
}

function analyzeQuoteInputExports(source, relativePath = QUOTE_INPUT){
    if (relativePath !== QUOTE_INPUT) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+normalizePaymentQuoteInput\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    return exportCount === 1 && hasReviewedEntry
        ? []
        : [`${relativePath}: shared quote-input helper must export only synchronous one-argument normalizePaymentQuoteInput()`];
}

function analyzeQuoteInputSource(source, relativePath = QUOTE_INPUT){
    const violations = [...analyzeQuoteInputExports(source, relativePath)];
    if (relativePath !== QUOTE_INPUT) return violations;
    const code = maskNonCode(source);
    for (const [label, pattern] of FORBIDDEN_RUNTIME){
        if (pattern.test(code)) violations.push(`${relativePath}: shared quote input normalization may not access ${label}`);
    }
    if (FORBIDDEN_PLAN_AUTHORITY.test(code)) violations.push(`${relativePath}: shared quote input normalization may not acquire payment/mutation authority`);
    if (FORBIDDEN_PLAN_READS.test(code)) violations.push(`${relativePath}: shared quote input normalization must remain state-independent validation`);
    if (FORBIDDEN_FIRST_PARTY_SCOPE.test(source) || FORBIDDEN_QUOTE_INPUT_PAYMENT_SCOPE.test(code)) violations.push(`${relativePath}: shared quote input normalization may not acquire payment-family semantics`);
    if (FORBIDDEN_LATER_SCOPE.test(code)) violations.push(`${relativePath}: shared quote input normalization may not acquire modifier or queue scope`);
    if (FIRST_PARTY_NAMESPACE.test(source)) violations.push(`${relativePath}: shared quote input normalization may not contain first-party Evolve IDs`);
    if (/\bkind\s*:/.test(code) || /['"]payment\.[a-z0-9._-]+['"]/i.test(source)) violations.push(`${relativePath}: shared quote input normalization may validate quotes but may not construct payment operations`);

    const allowed = new Set([IDENTITY, INERT_DATA, PUBLIC_QUOTE]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement') violations.push(`${relativePath}: shared quote input normalization may use only static ESM imports`);
        else if (reference.specifier.startsWith('.')){
            const target = resolveRelative(relativePath, reference.specifier);
            if (!allowed.has(target)) violations.push(`${relativePath}: unsupported shared quote-input dependency ${target}`);
        }
    }
    return violations;
}

function analyzeCostInternalConsumer(source, relativePath){
    const violations = [];
    if (!relativePath.startsWith(`${COST_ROOT}/`) || relativePath === QUOTE_INPUT) return violations;
    for (const reference of extractModuleReferences(source, relativePath)){
        if (!reference.specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, reference.specifier);
        if (target === QUOTE_INPUT && relativePath !== PUBLIC_PLAN && relativePath !== PUBLIC_ASSESSOR){
            violations.push(`${relativePath}: only PaymentAssessor and PaymentPlan may consume the shared quote-input normalizer`);
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
        if (reference.kind !== 'import-statement') violations.push(`${relativePath}: M3D public cost dependencies must use static ESM imports; found ${reference.kind}`);
        else if (![PUBLIC_QUOTE, PUBLIC_ASSESSOR, PUBLIC_PLAN].includes(target)) violations.push(`${relativePath}: production code may import only reviewed M3D public entries; found ${target}`);
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    for (const filename of listSourceFiles(costDir)){
        const relative = normalize(path.relative(root, filename));
        const source = fs.readFileSync(filename, 'utf8');
        violations.push(...analyzePlanSource(source, relative));
        violations.push(...analyzeQuoteInputSource(source, relative));
        violations.push(...analyzeCostInternalConsumer(source, relative));
    }
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
        console.error('M3D3-M3D4C PaymentPlan boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D3-M3D4C PaymentPlan boundary fitness passed.');
}

module.exports = {
    analyzePlanExports,
    analyzePlanOperationKinds,
    analyzePlanSource,
    analyzeQuoteInputExports,
    analyzeQuoteInputSource,
    analyzeCostInternalConsumer,
    analyzeProductionConsumer,
    findViolations,
};

if (require.main === module) main();
