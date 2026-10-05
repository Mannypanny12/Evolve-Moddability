'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SOURCE_ROOT = 'src';
const EFFECT_ROOT = 'src/engine/effects';
const EFFECT_PLAN = `${EFFECT_ROOT}/effect-plan.mjs`;
const EFFECT_COMMON = `${EFFECT_ROOT}/common.mjs`;
const CORE_OPERATIONS = `${EFFECT_ROOT}/core-operations.mjs`;

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function listSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            files.push(...listSourceFiles(full));
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

function analyzeEffectPlanExports(source, relativePath){
    if (relativePath !== EFFECT_PLAN) return [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    const hasReviewedEntry = /\bexport\s+function\s+createEffectPlan\s*\(/.test(code);
    if (exportCount !== 1 || !hasReviewedEntry){
        return [`${relativePath}: M3C2 production effect entry must export only synchronous createEffectPlan()`];
    }
    return [];
}

function analyzeSource(source, relativePath){
    const violations = [...analyzeEffectPlanExports(source, relativePath)];
    const sourceIsEffectModule = relativePath.startsWith(`${EFFECT_ROOT}/`);

    // Outside the effect layer every relevant relative import necessarily names the effects directory.
    // Avoid parsing the much larger legacy source tree when a file cannot reference this boundary.
    if (!sourceIsEffectModule && !source.includes('effects')) return violations;

    for (const reference of extractModuleReferences(source, relativePath)){
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, specifier);
        if (!target.startsWith(`${EFFECT_ROOT}/`)) continue;

        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: effect-layer dependencies must use static ESM imports; found ${reference.kind} for ${target}`);
            continue;
        }

        if (!sourceIsEffectModule){
            if (target !== EFFECT_PLAN){
                violations.push(`${relativePath}: production code outside the effect layer may import only ${EFFECT_PLAN}; found ${target}`);
            }
            continue;
        }

        if (target === EFFECT_COMMON && relativePath !== EFFECT_PLAN && relativePath !== CORE_OPERATIONS){
            violations.push(`${relativePath}: only effect-plan.mjs and core-operations.mjs may consume the M3C2 common effect helpers`);
        }
        if (target === CORE_OPERATIONS && relativePath !== EFFECT_PLAN){
            violations.push(`${relativePath}: only effect-plan.mjs may consume the M3C2 core operation normalizer`);
        }
    }

    return violations;
}

function findViolations(root){
    const srcDir = path.join(root, SOURCE_ROOT);
    if (!fs.existsSync(srcDir)) return ['M3C2 production source root is missing'];

    const violations = [];
    for (const filename of listSourceFiles(srcDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeSource(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3C2 effect surface fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3C2 effect surface fitness passed.');
}

module.exports = { analyzeEffectPlanExports, analyzeSource, findViolations };

if (require.main === module) main();
