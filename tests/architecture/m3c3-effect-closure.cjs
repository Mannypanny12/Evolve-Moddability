'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');
const { findViolations: findM3C1Violations } = require('./m3c1-effect-boundary-fitness.cjs');
const { findViolations: findM3C2Violations } = require('./m3c2-effect-surface-fitness.cjs');

const EFFECT_ROOT = 'src/engine/effects';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const FIRST_PARTY_NAMESPACE_KNOWLEDGE = /\bevolve\b/i;
const FORBIDDEN_PAYMENT_IDENTIFIERS = /\b(?:cost|costs|costPlan|costPlans|price|prices|pricing|payment|payments|paymentPlan|paymentPlans|quote|quotes|quotePlan|quotePlans|affordable|affordability|payCosts|checkCosts|checkAffordable)\b/;
const FORBIDDEN_CONDITION_IDENTIFIERS = /\b(?:condition|conditions|conditionEvaluator|requirement|requirements|predicate|predicates|eligibility|canExecute)\b/;

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function listEffectSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            files.push(...listEffectSourceFiles(full));
        }
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))){
            files.push(full);
        }
    }
    return files.sort();
}

function analyzeEffectClosureSource(source, relativePath){
    if (!relativePath.startsWith(`${EFFECT_ROOT}/`)) return [];

    const violations = [];
    if (FIRST_PARTY_NAMESPACE_KNOWLEDGE.test(source)){
        violations.push(`${relativePath}: M3C3 generic effect source may not contain first-party Evolve namespace knowledge`);
    }

    const code = maskNonCode(source);
    if (FORBIDDEN_PAYMENT_IDENTIFIERS.test(code)){
        violations.push(`${relativePath}: M3C3 effect planning may not own cost, quote, affordability, or payment semantics`);
    }
    if (FORBIDDEN_CONDITION_IDENTIFIERS.test(code)){
        violations.push(`${relativePath}: M3C3 effect planning may not embed condition, requirement, predicate, or execution-eligibility semantics`);
    }

    return violations;
}

function findViolations(root){
    const violations = [];

    for (const violation of findM3C1Violations(root)){
        violations.push(`M3C1 cumulative boundary: ${violation}`);
    }
    for (const violation of findM3C2Violations(root)){
        violations.push(`M3C2 cumulative surface: ${violation}`);
    }

    const effectDir = path.join(root, ...EFFECT_ROOT.split('/'));
    if (!fs.existsSync(effectDir)){
        violations.push('M3C3 effect source directory is missing');
        return violations;
    }

    for (const filename of listEffectSourceFiles(effectDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeEffectClosureSource(fs.readFileSync(filename, 'utf8'), relative));
    }

    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3C3 effect closure fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3C3 effect closure fitness passed.');
}

module.exports = { analyzeEffectClosureSource, findViolations };

if (require.main === module) main();
