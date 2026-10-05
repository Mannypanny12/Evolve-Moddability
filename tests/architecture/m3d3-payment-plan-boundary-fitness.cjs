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

const FORBIDDEN_PLAN_RUNTIME = [
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
const FORBIDDEN_SPECIAL_SCOPE = /\b(?:prestige|plasmid|antiplasmid|knowledge|supply|species)\b/i;
const FORBIDDEN_SPECIAL_LITERAL = /['"](?:prestige|plasmid|antiplasmid|knowledge|supply|species)['"]/i;
const FORBIDDEN_LATER_SCOPE = /\b(?:adjustCosts|costModifier|priceModifier|modifierPipeline|calculationPipeline|enqueue|dequeue|queueWorkItem|queueScheduler|scheduleQueue)\b/i;
const FIRST_PARTY_NAMESPACE = /\bevolve:/i;
const REVIEWED_PAYMENT_KIND = 'payment.resource.debit';
const PAYMENT_DEBIT_KIND = /['"]payment\.resource\.debit['"]/;
const PAYMENT_KIND_LITERAL = /['"]payment\.[a-z0-9._-]+['"]/ig;

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

function analyzePlanExports(source, relativePath = PUBLIC_PLAN){
    if (relativePath !== PUBLIC_PLAN) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createPaymentPlan\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    if (exportCount !== 1 || !hasReviewedEntry){
        return [`${relativePath}: M3D3 public plan surface must export only synchronous one-argument createPaymentPlan()`];
    }
    return [];
}

function analyzePlanOperationKinds(source, relativePath = PUBLIC_PLAN){
    if (relativePath !== PUBLIC_PLAN) return [];
    const violations = [];
    const code = maskNonCode(source);
    const kindPropertyCount = (code.match(/\bkind\s*:/g) || []).length;
    const paymentKinds = (source.match(PAYMENT_KIND_LITERAL) || []).map(value => value.slice(1, -1).toLowerCase());

    if (kindPropertyCount !== 1 || !PAYMENT_DEBIT_KIND.test(source)){
        violations.push(`${relativePath}: M3D3 PaymentPlan must construct exactly one reviewed kind property using ${REVIEWED_PAYMENT_KIND}`);
    }
    if (paymentKinds.some(kind => kind !== REVIEWED_PAYMENT_KIND)){
        violations.push(`${relativePath}: M3D3 PaymentPlan may not introduce payment operation kinds beyond ${REVIEWED_PAYMENT_KIND}`);
    }
    return violations;
}

function analyzePlanSource(source, relativePath = PUBLIC_PLAN){
    const violations = [
        ...analyzePlanExports(source, relativePath),
        ...analyzePlanOperationKinds(source, relativePath),
    ];
    if (relativePath !== PUBLIC_PLAN) return violations;
    const code = maskNonCode(source);

    for (const [label, pattern] of FORBIDDEN_PLAN_RUNTIME){
        if (pattern.test(code)) violations.push(`${relativePath}: M3D3 PaymentPlan may not access ${label}`);
    }
    if (FORBIDDEN_PLAN_AUTHORITY.test(code)){
        violations.push(`${relativePath}: M3D3 PaymentPlan is inert and may not acquire payment/mutation authority`);
    }
    if (FORBIDDEN_PLAN_READS.test(code)){
        violations.push(`${relativePath}: M3D3 PaymentPlan may not read affordability/capacity state`);
    }
    if (FORBIDDEN_SPECIAL_SCOPE.test(code) || FORBIDDEN_SPECIAL_LITERAL.test(source)){
        violations.push(`${relativePath}: M3D3 ordinary PaymentPlan may not acquire special payment-family semantics`);
    }
    if (FORBIDDEN_LATER_SCOPE.test(code)){
        violations.push(`${relativePath}: M3D3 PaymentPlan may not acquire modifier or queue scope`);
    }
    if (FIRST_PARTY_NAMESPACE.test(source)){
        violations.push(`${relativePath}: generic M3D3 PaymentPlan may not contain first-party Evolve IDs`);
    }

    const references = extractModuleReferences(source, relativePath);
    for (const reference of references){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3D3 PaymentPlan may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: M3D3 PaymentPlan may not import external packages: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (target !== QUOTE_INPUT){
            violations.push(`${relativePath}: M3D3 PaymentPlan may depend only on ${QUOTE_INPUT}; found ${target}`);
        }
    }
    return violations;
}

function analyzeQuoteInputExports(source, relativePath = QUOTE_INPUT){
    if (relativePath !== QUOTE_INPUT) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+normalizePaymentQuoteInput\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code);
    if (exportCount !== 1 || !hasReviewedEntry){
        return [`${relativePath}: shared quote-input helper must export only synchronous one-argument normalizePaymentQuoteInput()`];
    }
    return [];
}

function analyzeQuoteInputSource(source, relativePath = QUOTE_INPUT){
    const violations = [...analyzeQuoteInputExports(source, relativePath)];
    if (relativePath !== QUOTE_INPUT) return violations;
    const code = maskNonCode(source);
    for (const [label, pattern] of FORBIDDEN_PLAN_RUNTIME){
        if (pattern.test(code)) violations.push(`${relativePath}: shared quote input normalization may not access ${label}`);
    }
    if (FORBIDDEN_PLAN_AUTHORITY.test(code)){
        violations.push(`${relativePath}: shared quote input normalization may not acquire payment/mutation authority`);
    }
    if (FORBIDDEN_PLAN_READS.test(code)){
        violations.push(`${relativePath}: shared quote input normalization must remain state-independent validation`);
    }
    if (FORBIDDEN_SPECIAL_SCOPE.test(code) || FORBIDDEN_SPECIAL_LITERAL.test(source)){
        violations.push(`${relativePath}: shared quote input normalization may not acquire special payment-family semantics`);
    }
    if (FORBIDDEN_LATER_SCOPE.test(code)){
        violations.push(`${relativePath}: shared quote input normalization may not acquire modifier or queue scope`);
    }
    if (FIRST_PARTY_NAMESPACE.test(source)){
        violations.push(`${relativePath}: shared quote input normalization may not contain first-party Evolve IDs`);
    }
    if (PAYMENT_DEBIT_KIND.test(source) || (source.match(PAYMENT_KIND_LITERAL) || []).length > 0){
        violations.push(`${relativePath}: shared quote input normalization may validate quotes but may not construct payment operations`);
    }

    const allowed = new Set([IDENTITY, INERT_DATA, PUBLIC_QUOTE]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: shared quote input normalization may use only static ESM imports`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!allowed.has(target)){
            violations.push(`${relativePath}: unsupported shared quote-input dependency ${target}`);
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
    if (relativePath !== PUBLIC_PLAN && PAYMENT_DEBIT_KIND.test(source)){
        violations.push(`${relativePath}: payment.resource.debit semantics are owned by the M3D3 PaymentPlan module`);
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
            violations.push(`${relativePath}: M3D public cost dependencies must use static ESM imports; found ${reference.kind}`);
            continue;
        }
        if (![PUBLIC_QUOTE, PUBLIC_ASSESSOR, PUBLIC_PLAN].includes(target)){
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
        console.error('M3D3 PaymentPlan boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D3 PaymentPlan boundary fitness passed.');
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
