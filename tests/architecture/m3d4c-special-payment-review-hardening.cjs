'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const POOL_ADAPTER = 'src/legacy/bridge/evolve-special-payment-pool-read-adapter.mjs';
const SOURCE_RESOLVER = 'src/legacy/bridge/evolve-special-payment-source-resolver.mjs';
const EXPECTED_MAPPING_ID = 'evolve.payment_pool.purifier_supply_state';
const EXPECTED_PAYMENT_ID = 'evolve:payment/supply';
const EXPECTED_POOL_ID = 'evolve:payment-pool/purifier_supply';

const EXACT_POOL_MAPPING_LIST = /const\s+SUPPORTED_POOL_MAPPING_IDS\s*=\s*Object\.freeze\(\s*\[\s*['"]evolve\.payment_pool\.purifier_supply_state['"]\s*,?\s*\]\s*\)\s*;/;
const EXACT_SUPPLY_PAYMENT_DECLARATION = /const\s+SUPPLY_PAYMENT_ID\s*=\s*['"]evolve:payment\/supply['"]\s*;/;
const EXACT_PURIFIER_POOL_DECLARATION = /const\s+PURIFIER_SUPPLY_POOL_ID\s*=\s*['"]evolve:payment-pool\/purifier_supply['"]\s*;/;
const MAPPING_ID_LITERAL = /['"](evolve\.payment_pool\.[a-z0-9._-]+)['"]/g;
const PAYMENT_ID_LITERAL = /['"](evolve:payment\/[a-z0-9._/-]+)['"]/g;
const POOL_ID_LITERAL = /['"](evolve:payment-pool\/[a-z0-9._/-]+)['"]/g;
const POOL_STATE_FIELD_READ = /\breadDataField\(\s*record\s*,\s*['"]([^'"]+)['"]/g;

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
        violations.push(`${relativePath}: review-hardening source could not be parsed`);
        return '';
    }
}

function uniqueMatches(source, pattern){
    pattern.lastIndex = 0;
    const values = [...source.matchAll(pattern)].map(match => match[1]);
    pattern.lastIndex = 0;
    return [...new Set(values)].sort();
}

function sameSingleValue(actual, expected){
    return actual.length === 1 && actual[0] === expected;
}

function analyzePoolAdapterReview(source, relativePath = POOL_ADAPTER){
    const violations = [];
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;

    if (!EXACT_POOL_MAPPING_LIST.test(reviewed)){
        violations.push(`${relativePath}: live supported mapping list must remain exactly the purifier supply mapping`);
    }

    const mappingIds = uniqueMatches(reviewed, MAPPING_ID_LITERAL);
    if (!sameSingleValue(mappingIds, EXPECTED_MAPPING_ID)){
        violations.push(`${relativePath}: first-party payment-pool mapping scope must remain purifier-supply only`);
    }

    const stateFields = uniqueMatches(reviewed, POOL_STATE_FIELD_READ);
    if (stateFields.length !== 2 || stateFields[0] !== 'sup_max' || stateFields[1] !== 'supply'){
        violations.push(`${relativePath}: purifier compatibility reads must remain limited to supply and sup_max`);
    }

    return violations;
}

function analyzeSourceResolverReview(source, relativePath = SOURCE_RESOLVER){
    const violations = [];
    const reviewed = sourceWithoutComments(source, relativePath, violations);
    if (!reviewed) return violations;

    if (!EXACT_SUPPLY_PAYMENT_DECLARATION.test(reviewed)){
        violations.push(`${relativePath}: first-party resolver must retain exactly the Supply payment identity declaration`);
    }
    if (!EXACT_PURIFIER_POOL_DECLARATION.test(reviewed)){
        violations.push(`${relativePath}: first-party resolver must retain exactly the purifier supply pool identity declaration`);
    }

    const paymentIds = uniqueMatches(reviewed, PAYMENT_ID_LITERAL);
    if (!sameSingleValue(paymentIds, EXPECTED_PAYMENT_ID)){
        violations.push(`${relativePath}: first-party special payment identity scope must remain Supply-only`);
    }

    const poolIds = uniqueMatches(reviewed, POOL_ID_LITERAL);
    if (!sameSingleValue(poolIds, EXPECTED_POOL_ID)){
        violations.push(`${relativePath}: first-party special payment source scope must remain purifier-supply-only`);
    }

    if (!/\bparsed\.canonical\s*!==\s*SUPPLY_PAYMENT_ID\b/.test(reviewed)){
        violations.push(`${relativePath}: resolver must fail closed for canonical payment IDs other than Supply`);
    }
    if (!/\bkind\s*:\s*['"]pool['"]/.test(reviewed) || !/\bpoolId\s*:\s*PURIFIER_SUPPLY_POOL_ID\b/.test(reviewed)){
        violations.push(`${relativePath}: Supply must resolve only to the purifier pool source`);
    }

    return violations;
}

function findViolations(root){
    const violations = [];
    for (const [relativePath, analyze] of [
        [POOL_ADAPTER, analyzePoolAdapterReview],
        [SOURCE_RESOLVER, analyzeSourceResolverReview],
    ]){
        const filename = path.join(root, ...relativePath.split('/'));
        if (!fs.existsSync(filename)){
            violations.push(`${relativePath}: required M3D4C review-hardening source is missing`);
            continue;
        }
        violations.push(...analyze(fs.readFileSync(filename, 'utf8'), relativePath));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3D4C special payment review hardening failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D4C special payment review hardening passed.');
}

module.exports = {
    analyzePoolAdapterReview,
    analyzeSourceResolverReview,
    findViolations,
};

if (require.main === module) main();
