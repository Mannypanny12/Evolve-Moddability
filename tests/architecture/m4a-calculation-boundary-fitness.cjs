'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const CALCULATION_ROOT = 'src/engine/calculations';
const IDENTITY_FILE = 'src/engine/identity.mjs';
const INERT_DATA_CONTRACT_FILE = 'src/engine/contracts/inert-data.mjs';
const REVIEWED_PRODUCTION_CALCULATION_CONSUMERS = Object.freeze([
    'src/application/evolve/production-calculation-runtime.mjs',
    'src/content/evolve/calculations/oil-well-production.mjs',
    'src/content/evolve/calculations/simple-production.mjs',
]);
const REVIEWED_PRODUCTION_CALCULATION_CONSUMER_SET = new Set(REVIEWED_PRODUCTION_CALCULATION_CONSUMERS);

const FORBIDDEN_RUNTIME_PATTERNS = [
    ['legacy/global objects', /\b(?:global|globalThis|self)\b/],
    ['browser/UI objects', /\b(?:document|window|navigator|jQuery|Vue)\b|\$\s*\(/],
    ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
    ['Node/platform global', /\b(?:process|Buffer)\b/],
    ['runtime clock/random source', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
    ['timer or microtask scheduling', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
    ['dynamic code capability', /\be[v]al\s*\(|\bnew\s+F[u]nction\b|\bWebA[s]sembly\b/],
];

const FORBIDDEN_AUTHORITY_PATTERN = /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal)\b/;

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function listSourceFiles(dir, root, violations){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()){
            violations.push(`${normalize(path.relative(root, full))}: M4A calculation source may not be a symbolic link`);
        }
        else if (entry.isDirectory()){
            files.push(...listSourceFiles(full, root, violations));
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

function analyzeCalculationModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);

    if (FORBIDDEN_AUTHORITY_PATTERN.test(code)){
        violations.push(`${relativePath}: M4A calculations may not reference mutation or transaction authority`);
    }
    if (source.includes('evolve:')){
        violations.push(`${relativePath}: M4A generic calculation package may not embed first-party evolve: identities`);
    }
    for (const [label, pattern] of FORBIDDEN_RUNTIME_PATTERNS){
        if (pattern.test(code)){
            violations.push(`${relativePath}: M4A calculations may not access ${label}`);
        }
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M4A calculation modules may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M4A calculation modules may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE || target === INERT_DATA_CONTRACT_FILE) continue;
        if (target.startsWith(`${CALCULATION_ROOT}/`)){
            if (!SOURCE_EXTENSIONS.has(path.posix.extname(target))){
                violations.push(`${relativePath}: sibling calculation imports must target JavaScript source: ${target}`);
            }
            continue;
        }
        if (target === 'src/engine/registry.mjs'){
            violations.push(`${relativePath}: executable calculations may not use the inert M1 Registry`);
            continue;
        }
        if (target.startsWith('src/engine/state/')){
            violations.push(`${relativePath}: M4A calculations may not import GameState/state infrastructure: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/runtime/')){
            violations.push(`${relativePath}: M4A calculations may not import runtime capabilities: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/commands/')
            || target.startsWith('src/engine/conditions/')
            || target.startsWith('src/engine/costs/')
            || target.startsWith('src/engine/effects/')
            || target.startsWith('src/engine/execution/')
            || target.startsWith('src/engine/queue/')){
            violations.push(`${relativePath}: M4A calculation foundation may not depend on M3 semantic packages: ${target}`);
            continue;
        }
        if (target.startsWith('src/legacy/') || target.startsWith('src/platform/')){
            violations.push(`${relativePath}: M4A calculations may not import legacy/platform adapters: ${target}`);
            continue;
        }
        violations.push(`${relativePath}: unsupported M4A calculation import: ${target}`);
    }

    return violations;
}

function listProductionSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listProductionSourceFiles(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function resolveProductionCalculationReference(fromRelativePath, specifier){
    if (specifier.startsWith('.')) return resolveRelative(fromRelativePath, specifier);
    if (specifier.startsWith('/')) return path.posix.normalize(specifier.slice(1));
    if (specifier.startsWith(`${CALCULATION_ROOT}/`)) return path.posix.normalize(specifier);
    return null;
}

function productionCalculationConsumers(root){
    const srcRoot = path.join(root, 'src');
    const files = listProductionSourceFiles(srcRoot);
    const consumers = [];
    for (const filename of files){
        const relative = normalize(path.relative(root, filename));
        if (relative.startsWith(`${CALCULATION_ROOT}/`)) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            const target = resolveProductionCalculationReference(relative, reference.specifier);
            if (target && target.startsWith(`${CALCULATION_ROOT}/`)){
                consumers.push(relative);
                break;
            }
        }
    }
    return { consumers: [...new Set(consumers)].sort() };
}

function unreviewedProductionCalculationConsumers(root){
    return productionCalculationConsumers(root).consumers.filter(
        consumer => !REVIEWED_PRODUCTION_CALCULATION_CONSUMER_SET.has(consumer)
    );
}

function findViolations(root){
    const violations = [];
    const calculationDir = path.join(root, ...CALCULATION_ROOT.split('/'));
    if (!fs.existsSync(calculationDir)){
        return ['M4A calculation source directory is missing'];
    }
    const stat = fs.lstatSync(calculationDir);
    if (stat.isSymbolicLink()){
        violations.push('M4A calculation source directory may not be a symbolic link');
    }
    else if (!stat.isDirectory()){
        violations.push('M4A calculation source path must be a directory');
    }
    else {
        for (const filename of listSourceFiles(calculationDir, root, violations)){
            const relative = normalize(path.relative(root, filename));
            violations.push(...analyzeCalculationModule(fs.readFileSync(filename, 'utf8'), relative));
        }
    }

    for (const consumer of unreviewedProductionCalculationConsumers(root)){
        violations.push(`${consumer}: calculation-package production consumer is outside the reviewed M4 production composition`);
    }
    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4A resource boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4A calculation boundary fitness passed.');
}

module.exports = {
    CALCULATION_ROOT,
    REVIEWED_PRODUCTION_CALCULATION_CONSUMERS,
    analyzeCalculationModule,
    productionCalculationConsumers,
    unreviewedProductionCalculationConsumers,
    findViolations,
};

if (require.main === module) main();
