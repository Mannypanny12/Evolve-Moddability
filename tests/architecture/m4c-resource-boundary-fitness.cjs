'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences } = require('./architecture-fitness.cjs');
const { productionCalculationConsumers } = require('./m4a-calculation-boundary-fitness.cjs');

const CALCULATION_ROOT = 'src/engine/calculations';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const RESOURCE_MODULES = Object.freeze([
    'src/engine/calculations/resource-contract.mjs',
    'src/engine/calculations/resource-primitives.mjs',
    'src/engine/calculations/resource-delta.mjs',
]);
const CORE_CALCULATION_MODULES = Object.freeze([
    'src/engine/calculations/calculation-context.mjs',
    'src/engine/calculations/calculation-engine.mjs',
    'src/engine/calculations/calculation-result.mjs',
    'src/engine/calculations/common.mjs',
    'src/engine/calculations/modifier-contract.mjs',
    'src/engine/calculations/modifier-pipeline.mjs',
]);
const RESOURCE_MODULE_SET = new Set(RESOURCE_MODULES);

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function listCalculationSources(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listCalculationSources(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function coreResourceCouplingViolations(root){
    const violations = [];
    const calculationDir = path.join(root, ...CALCULATION_ROOT.split('/'));
    for (const filename of listCalculationSources(calculationDir)){
        const relative = normalize(path.relative(root, filename));
        if (RESOURCE_MODULE_SET.has(relative)) continue;

        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relative, reference.specifier);
            if (RESOURCE_MODULE_SET.has(target)){
                violations.push(`${relative}: generic calculation core may not depend on M4C resource module ${target}`);
            }
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    for (const relative of RESOURCE_MODULES){
        const filename = path.join(root, ...relative.split('/'));
        if (!fs.existsSync(filename)){
            violations.push(`${relative}: required M4C resource calculation module is missing`);
            continue;
        }
        const stat = fs.lstatSync(filename);
        if (stat.isSymbolicLink() || !stat.isFile()){
            violations.push(`${relative}: M4C resource calculation module must be a regular file`);
        }
    }

    violations.push(...coreResourceCouplingViolations(root));

    const production = productionCalculationConsumers(root);
    for (const consumer of production.consumers){
        violations.push(`${consumer}: M4C must retain zero production calculation consumers before reviewed M4D cutover`);
    }

    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4C resource boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4C resource boundary fitness passed.');
}

module.exports = {
    CALCULATION_ROOT,
    RESOURCE_MODULES,
    CORE_CALCULATION_MODULES,
    coreResourceCouplingViolations,
    findViolations,
};

if (require.main === module) main();
