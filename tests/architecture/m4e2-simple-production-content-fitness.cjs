'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const CONTENT = 'src/content/evolve/calculations/simple-production.mjs';
const ALLOWED_CONTENT_IMPORTS = new Set([
    'src/engine/identity.mjs',
    'src/engine/calculations/common.mjs',
    'src/engine/calculations/resource-primitives.mjs',
]);

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function importViolations(source){
    const violations = [];
    for (const reference of extractModuleReferences(source, CONTENT)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${CONTENT}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${CONTENT}: external or root-style import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(CONTENT, reference.specifier);
        if (!ALLOWED_CONTENT_IMPORTS.has(target)){
            violations.push(`${CONTENT}: unsupported M4E2 dependency ${target}`);
        }
    }
    return violations;
}

function analyzeContentSource(source){
    const violations = [];
    const code = maskNonCode(source);

    for (const [label, pattern] of [
        ['legacy/global runtime state', /\b(?:global|globalThis|self)\b/],
        ['legacy production module', /\bproduction\s*\(|\bprod\.js\b/],
        ['legacy biome/governor helpers', /\b(?:biomes|govActive|govEffect)\b/],
        ['browser/UI capability', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
        ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
        ['Node/platform global', /\b(?:process|Buffer)\b/],
        ['mutation authority', /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal)\b/],
        ['clock/random capability', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
        ['timer or microtask scheduling', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
        ['dynamic code capability', /\be[v]al\s*\(|\bnew\s+F[u]nction\b|\bWebA[s]sembly\b/],
        ['async/Promise/dynamic loading', /\b(?:async|await|Promise)\b|\bimport\s*\(|\brequire\s*\(/],
    ]){
        if (pattern.test(code)){
            violations.push(`${CONTENT}: first-party simple-production calculation may not access ${label}`);
        }
    }

    violations.push(...importViolations(source));

    for (const marker of [
        'export const SIMPLE_PRODUCTION_CALCULATION_IDS = Object.freeze({',
        'export function createSimpleProductionRegistrations(){',
        'return readClosedCalculationObject(rawInputs, {',
        'return calculateProduction({ contributions: [value] });',
    ]){
        if (!source.includes(marker)){
            violations.push(`${CONTENT}: reviewed M4E2 content marker is missing: ${marker}`);
        }
    }

    return [...new Set(violations)].sort();
}

function findViolations(root){
    const filename = path.join(root, ...CONTENT.split('/'));
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()){
        return [`${CONTENT}: required simple-production calculation module is missing`];
    }
    if (fs.lstatSync(filename).isSymbolicLink()){
        return [`${CONTENT}: first-party simple-production calculation module may not be a symbolic link`];
    }
    return analyzeContentSource(fs.readFileSync(filename, 'utf8'));
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M4E2 simple-production content fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4E2 simple-production content fitness passed.');
}

module.exports = {
    CONTENT,
    ALLOWED_CONTENT_IMPORTS,
    resolveRelative,
    importViolations,
    analyzeContentSource,
    findViolations,
};

if (require.main === module) main();
