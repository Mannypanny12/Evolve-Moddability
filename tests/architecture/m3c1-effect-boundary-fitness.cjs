'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EFFECT_ROOT = 'src/engine/effects';
const IDENTITY_FILE = 'src/engine/identity.mjs';
const INERT_DATA_CONTRACT_FILE = 'src/engine/contracts/inert-data.mjs';

const FORBIDDEN_RUNTIME_PATTERNS = [
    ['legacy/global objects', /\b(?:global|globalThis|self)\b/],
    ['browser/UI objects', /\b(?:document|window|navigator|jQuery|Vue)\b|\$\s*\(/],
    ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
    ['Node/platform global', /\b(?:process|Buffer)\b/],
    ['runtime clock/random source', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
    ['timer or microtask scheduling', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
    ['dynamic code capability', /\b(?:eval|Function|WebAssembly)\b/],
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
            violations.push(`${normalize(path.relative(root, full))}: M3C1 effect source may not be a symbolic link`);
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

function analyzeEffectModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);

    if (FORBIDDEN_AUTHORITY_PATTERN.test(code)){
        violations.push(`${relativePath}: M3C1 effect planning may not reference mutation or transaction authority`);
    }
    for (const [label, pattern] of FORBIDDEN_RUNTIME_PATTERNS){
        if (pattern.test(code)){
            violations.push(`${relativePath}: M3C1 effect planning may not access ${label}`);
        }
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: M3C1 effect modules may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3C1 effect modules may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE || target === INERT_DATA_CONTRACT_FILE) continue;
        if (target.startsWith(`${EFFECT_ROOT}/`)){
            if (!SOURCE_EXTENSIONS.has(path.posix.extname(target))){
                violations.push(`${relativePath}: sibling effect imports must target JavaScript source: ${target}`);
            }
            continue;
        }
        if (target.startsWith('src/engine/state/')){
            violations.push(`${relativePath}: M3C1 effect planning may not import GameState/state infrastructure: ${target}`);
            continue;
        }
        if (target.startsWith('src/legacy/') || target.startsWith('src/platform/')){
            violations.push(`${relativePath}: M3C1 effect planning may not import legacy/platform adapters: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/runtime/')){
            violations.push(`${relativePath}: M3C1 effect planning may not import runtime capabilities: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/commands/') || target.startsWith('src/engine/conditions/')){
            violations.push(`${relativePath}: M3C1 effect planning may not depend on command/condition execution modules: ${target}`);
            continue;
        }
        if (target === 'src/engine/registry.mjs'){
            violations.push(`${relativePath}: M3C1 effect planning may not depend on the inert definition Registry`);
            continue;
        }
        violations.push(`${relativePath}: unsupported M3C1 effect import: ${target}`);
    }

    return violations;
}

function analyzeInertDataContract(source, relativePath = INERT_DATA_CONTRACT_FILE){
    const violations = [];
    const code = maskNonCode(source);
    if (FORBIDDEN_AUTHORITY_PATTERN.test(code)){
        violations.push(`${relativePath}: inert-data contract may not reference mutation or transaction authority`);
    }
    for (const [label, pattern] of FORBIDDEN_RUNTIME_PATTERNS){
        if (pattern.test(code)){
            violations.push(`${relativePath}: inert-data contract may not access ${label}`);
        }
    }
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: inert-data contract may use only static ESM imports; found ${reference.kind}`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: inert-data contract may not import external packages: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (target !== IDENTITY_FILE){
            violations.push(`${relativePath}: inert-data contract may import only identity.mjs: ${target}`);
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const effectDir = path.join(root, ...EFFECT_ROOT.split('/'));
    if (!fs.existsSync(effectDir)){
        return ['M3C1 effect source directory is missing'];
    }
    if (fs.lstatSync(effectDir).isSymbolicLink()){
        violations.push('M3C1 effect source directory may not be a symbolic link');
    }
    else {
        for (const filename of listSourceFiles(effectDir, root, violations)){
            const relative = normalize(path.relative(root, filename));
            violations.push(...analyzeEffectModule(fs.readFileSync(filename, 'utf8'), relative));
        }
    }

    const contractPath = path.join(root, ...INERT_DATA_CONTRACT_FILE.split('/'));
    if (!fs.existsSync(contractPath)){
        violations.push('M3C1 inert-data contract is missing');
    }
    else if (fs.lstatSync(contractPath).isSymbolicLink()){
        violations.push('M3C1 inert-data contract may not be a symbolic link');
    }
    else {
        violations.push(...analyzeInertDataContract(fs.readFileSync(contractPath, 'utf8')));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3C1 effect boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3C1 effect boundary fitness passed.');
}

module.exports = { analyzeEffectModule, analyzeInertDataContract, findViolations };

if (require.main === module) main();
