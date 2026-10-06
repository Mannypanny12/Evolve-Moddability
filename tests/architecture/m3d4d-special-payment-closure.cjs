'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { maskNonCode } = require('./architecture-fitness.cjs');

const COMMON = 'src/engine/costs/common.mjs';
const ASSESSOR = 'src/engine/costs/payment-assessor.mjs';
const PLAN = 'src/engine/costs/payment-plan.mjs';
const READS = 'src/engine/costs/payment-read-capabilities.mjs';
const RESOLVER = 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs';
const RESOURCE_ADAPTER = 'src/legacy/bridge/evolve-payment-read-adapter.mjs';
const SPECIES_CATALOG = 'src/legacy/bridge/evolve-species-payment-catalog.mjs';
const MAPPINGS = 'src/legacy/bridge/evolve-mappings.mjs';
const RACES = 'src/races.js';

const EXPECTED_PAYMENT_IDS = Object.freeze([
    'evolve:payment/knowledge',
    'evolve:payment/species',
    'evolve:payment/supply',
]);
const EXPECTED_POOL_IDS = Object.freeze([
    'evolve:payment-pool/purifier_supply',
]);
const EXPECTED_STATIC_RESOURCE_MAPPINGS = Object.freeze([
    'evolve.resource.knowledge_payment_state',
    'evolve.resource.rna_state',
]);

const PAYMENT_ID_LITERAL = /['"](evolve:payment\/[a-z0-9_/-]+)['"]/g;
const POOL_ID_LITERAL = /['"](evolve:payment-pool\/[a-z0-9_/-]+)['"]/g;
const STATIC_MAPPING_ID_LITERAL = /['"](evolve\.resource\.(?:rna_state|knowledge_payment_state))['"]/g;
const FORBIDDEN_SETTLEMENT_DETAIL = /\b(?:defaultJobId|default_job|d_job|workerReduction|workers|stats\.know|civic)\b/i;
const FORBIDDEN_EXECUTION = /\b(?:executePayment|applyPayment|commitPayment|paymentExecutor|mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|payCosts|setGlobal)\b/;

function read(root, relative){
    return fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}

function sourceWithoutComments(source, relativePath, violations){
    try {
        return esbuild.transformSync(source, {
            loader: 'js',
            format: 'esm',
            legalComments: 'none',
            minify: false,
            sourcefile: relativePath,
        }).code;
    }
    catch {
        violations.push(`${relativePath}: source could not be parsed for M3D4D closure review`);
        return '';
    }
}

function uniqueMatches(source, pattern){
    pattern.lastIndex = 0;
    const values = [...source.matchAll(pattern)].map(match => match[1]);
    pattern.lastIndex = 0;
    return [...new Set(values)].sort();
}

function sameValues(actual, expected){
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function extractSpeciesCatalogIds(source){
    const startToken = 'export const EVOLVE_SPECIES_PAYMENT_LOCAL_IDS = Object.freeze([';
    const start = source.indexOf(startToken);
    if (start === -1) return [];
    const end = source.indexOf(']);', start + startToken.length);
    if (end === -1) return [];
    const block = source.slice(start + startToken.length, end);
    return [...block.matchAll(/['"]([a-z0-9_]+)['"]/g)].map(match => match[1]).sort();
}

function extractLiveRaceKeys(source){
    const code = maskNonCode(source);
    const startToken = 'export const races = {';
    const start = code.indexOf(startToken);
    if (start === -1) return [];
    const end = code.indexOf('\n};', start + startToken.length);
    if (end === -1) return [];
    const block = code.slice(start + startToken.length, end);
    return [...block.matchAll(/^    ([a-z0-9_]+):/gm)].map(match => match[1]).sort();
}

function analyzeResolver(source, relativePath = RESOLVER){
    const violations = [];
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;

    const paymentIds = uniqueMatches(reviewed, PAYMENT_ID_LITERAL);
    if (!sameValues(paymentIds, [...EXPECTED_PAYMENT_IDS])){
        violations.push(`${relativePath}: first-party special payment IDs must remain exactly Supply, Knowledge and Species`);
    }
    const poolIds = uniqueMatches(reviewed, POOL_ID_LITERAL);
    if (!sameValues(poolIds, [...EXPECTED_POOL_IDS])){
        violations.push(`${relativePath}: special pool scope must remain purifier-supply only`);
    }
    if (!/KNOWLEDGE_RESOURCE_ID\s*=\s*['"]evolve:resource\/knowledge['"]/.test(reviewed)){
        violations.push(`${relativePath}: Knowledge must resolve to evolve:resource/knowledge`);
    }
    if (!/paymentId\s*===\s*SUPPLY_PAYMENT_ID/.test(reviewed) || !/paymentId\s*===\s*KNOWLEDGE_PAYMENT_ID/.test(reviewed)){
        violations.push(`${relativePath}: Supply and Knowledge must retain explicit static source branches`);
    }
    if (!/evolveSpeciesPaymentResourceId\s*\(\s*species\s*\)/.test(reviewed)){
        violations.push(`${relativePath}: Species must resolve through the reviewed first-party species catalog helper`);
    }
    if (FORBIDDEN_SETTLEMENT_DETAIL.test(reviewed)){
        violations.push(`${relativePath}: source resolution may not acquire Knowledge/Species settlement internals`);
    }
    if (FORBIDDEN_EXECUTION.test(maskNonCode(source))){
        violations.push(`${relativePath}: source resolver must remain read-only and inert`);
    }
    return violations;
}

function analyzeSpeciesCatalog(source, racesSource, relativePath = SPECIES_CATALOG){
    const violations = [];
    const catalogIds = extractSpeciesCatalogIds(source);
    const liveIds = extractLiveRaceKeys(racesSource);
    if (catalogIds.length === 0 || liveIds.length === 0 || !sameValues(catalogIds, liveIds)){
        violations.push(`${relativePath}: reviewed Species payment catalog must exactly match live first-party races keys`);
    }
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;
    if (!/SPECIES\.has\(rawSpecies\)/.test(reviewed)){
        violations.push(`${relativePath}: Species ID synthesis must be preceded by reviewed-set membership`);
    }
    if (!/return\s+`evolve:resource\/\$\{rawSpecies\}`/.test(reviewed)){
        violations.push(`${relativePath}: reviewed Species resource identity mapping is missing`);
    }
    return violations;
}

function analyzeResourceAdapter(source, relativePath = RESOURCE_ADAPTER){
    const violations = [];
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;

    const staticMappings = uniqueMatches(reviewed, STATIC_MAPPING_ID_LITERAL);
    if (!sameValues(staticMappings, [...EXPECTED_STATIC_RESOURCE_MAPPINGS])){
        violations.push(`${relativePath}: static payment resource mappings must remain exactly RNA and Knowledge`);
    }
    if (!/SPECIES_LOCAL_IDS\.has\(parsed\.localId\)/.test(reviewed)){
        violations.push(`${relativePath}: active Species resources must be admitted only through the reviewed species catalog`);
    }
    if (!/species\s*!==\s*subject\.localId/.test(reviewed) || !/LEGACY_PAYMENT_SPECIES_CONTEXT_DRIFT/.test(reviewed)){
        violations.push(`${relativePath}: active Species reads must fail closed if context drifts after source resolution`);
    }
    if (!/INVALID_LEGACY_PAYMENT_SPECIES_STATE/.test(reviewed)){
        violations.push(`${relativePath}: missing/malformed active Species state must remain a structured contract failure`);
    }
    if (FORBIDDEN_EXECUTION.test(maskNonCode(source))){
        violations.push(`${relativePath}: resource compatibility reads must remain read-only`);
    }
    return violations;
}

function analyzeKnowledgeMapping(source, relativePath = MAPPINGS){
    const violations = [];
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;
    const required = [
        /id:\s*['"]evolve\.resource\.knowledge_payment_state['"]/,
        /legacyPath:\s*['"]global\.resource\.Knowledge['"]/,
        /canonicalId:\s*['"]evolve:resource\/knowledge['"]/,
        /introducedIn:\s*['"]M3D4D['"]/,
        /removeBy:\s*['"]M6B['"]/,
    ];
    if (required.some(pattern => !pattern.test(reviewed))){
        violations.push(`${relativePath}: Knowledge payment resource mapping/lifecycle is incomplete or widened`);
    }
    return violations;
}

function analyzeGenericClosure(common, assessor, plan, reads){
    const violations = [];
    for (const [relativePath, source] of [[COMMON, common], [ASSESSOR, assessor], [PLAN, plan], [READS, reads]]){
        if (/\b(?:Knowledge|Species|Supply|stats\.know|defaultJobId|default_job|d_job)\b/i.test(source)){
            violations.push(`${relativePath}: generic payment engine may not contain first-party special-payment semantics`);
        }
        if (FORBIDDEN_EXECUTION.test(maskNonCode(source))){
            violations.push(`${relativePath}: M3D4 closure remains inert and may not execute payment`);
        }
    }
    if (FORBIDDEN_SETTLEMENT_DETAIL.test(sourceWithoutComments(plan, PLAN, violations))){
        violations.push(`${PLAN}: inert special settlement operations may not cache commit-time Knowledge/Species internals`);
    }
    if (!/\['resource',\s*'prestige',\s*'pool'\]/.test(reads) && !/\["resource",\s*"prestige",\s*"pool"\]/.test(reads)){
        violations.push(`${READS}: D4 closure must not add Knowledge/Species-specific read families`);
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const common = read(root, COMMON);
    const assessor = read(root, ASSESSOR);
    const plan = read(root, PLAN);
    const reads = read(root, READS);
    violations.push(...analyzeGenericClosure(common, assessor, plan, reads));
    violations.push(...analyzeResolver(read(root, RESOLVER)));
    violations.push(...analyzeSpeciesCatalog(read(root, SPECIES_CATALOG), read(root, RACES)));
    violations.push(...analyzeResourceAdapter(read(root, RESOURCE_ADAPTER)));
    violations.push(...analyzeKnowledgeMapping(read(root, MAPPINGS)));
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3D4D special payment closure failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D4D special payment closure passed.');
}

module.exports = {
    extractSpeciesCatalogIds,
    extractLiveRaceKeys,
    analyzeResolver,
    analyzeSpeciesCatalog,
    analyzeResourceAdapter,
    analyzeKnowledgeMapping,
    analyzeGenericClosure,
    findViolations,
};

if (require.main === module) main();
