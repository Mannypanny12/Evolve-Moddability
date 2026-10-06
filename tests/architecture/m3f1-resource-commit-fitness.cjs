'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXECUTION_ROOT = 'src/engine/execution';
const RESOURCE_COMMIT = 'src/engine/execution/resource-commit.mjs';
const LEGACY_ADAPTER = 'src/legacy/bridge/evolve-resource-commit-adapter.mjs';
const IDENTITY = 'src/engine/identity.mjs';
const INERT_DATA = 'src/engine/contracts/inert-data.mjs';
const MAPPINGS = 'src/legacy/bridge/evolve-mappings.mjs';

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
function listAllFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listAllFiles(full));
        else if (entry.isFile()) files.push(full);
    }
    return files.sort();
}

function analyzeExecutionPackage(root){
    const dir = path.join(root, ...EXECUTION_ROOT.split('/'));
    if (!fs.existsSync(dir)) return [`${EXECUTION_ROOT}: M3F1 execution package is missing`];
    const files = listAllFiles(dir)
        .map(filename => normalize(path.relative(root, filename)))
        .sort();
    return files.length === 1 && files[0] === RESOURCE_COMMIT
        ? []
        : [`${EXECUTION_ROOT}: M3F1 package must contain exactly resource-commit.mjs; found ${files.join(', ')}`];
}

function analyzeExecutorSource(source){
    const relativePath = RESOURCE_COMMIT;
    const code = maskNonCode(source);
    const violations = [];
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+createResourceCommitExecutor\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code)){
        violations.push(`${relativePath}: public surface must export only createResourceCommitExecutor(rawOptions)`);
    }

    const forbidden = [
        ['legacy state/runtime', /\b(?:global|globalThis|setGlobal|modRes|payCosts)\b/],
        ['DOM/UI', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['state mutation authority', /\b(?:mutationAuthority|createMutationScope|beginTransaction|GameStateStore|StateStore)\b/],
        ['platform/storage', /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket)\b/],
        ['time/random/scheduler', /\b(?:Date|performance|crypto|setTimeout|setInterval|requestAnimationFrame)\b|\bMath\s*\.\s*random\s*\(/],
        ['async control flow', /\b(?:async|await)\b|\bnew\s+Promise\b/],
        ['dynamic loading/code construction', /\bimport\s*\(|\brequire\s*\(|\beval\b|\bWebAssembly\b|\bnew\s+Function\b|\bFunction\s*\(/],
        ['queue/persistence scope', /\b(?:WorkQueue|WorkItem|enqueue|dequeue|serialize|deserialize)\b/],
    ];
    for (const [label, pattern] of forbidden){
        if (pattern.test(code)) violations.push(`${relativePath}: generic resource commit executor may not access ${label}`);
    }
    if (/\bevolve:/i.test(source) || /\bevolution\b|\bdna\b|\brna\b/i.test(code)){
        violations.push(`${relativePath}: generic resource commit executor may not contain first-party Evolve knowledge`);
    }

    const allowedImports = new Set([IDENTITY, INERT_DATA]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relativePath}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: external package import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!allowedImports.has(target)) violations.push(`${relativePath}: unsupported dependency ${target}`);
    }

    for (const literal of ['payment.resource.debit', 'resource.grant', 'resource.consume', 'resource.debit', 'resource.credit']){
        if (!source.includes(`'${literal}'`) && !source.includes(`\"${literal}\"`)){
            violations.push(`${relativePath}: reviewed M3F1 operation literal is missing: ${literal}`);
        }
    }
    for (const forbiddenKind of ['payment.prestige.debit', 'payment.special.settle']){
        if (source.includes(forbiddenKind)) violations.push(`${relativePath}: later payment family execution is outside M3F1: ${forbiddenKind}`);
    }
    return violations;
}

function analyzeAdapterSource(source){
    const relativePath = LEGACY_ADAPTER;
    const code = maskNonCode(source);
    const violations = [];
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+createEvolveLegacyResourceCommitCapability\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/.test(code)){
        violations.push(`${relativePath}: public surface must export only createEvolveLegacyResourceCommitCapability(rawOptions)`);
    }
    if (/\b(?:modRes|payCosts|actions|functions)\b/.test(code)){
        violations.push(`${relativePath}: bounded legacy resource commit adapter may not call legacy gameplay helpers`);
    }
    if (/\b(?:prestige|purifier|species|knowledge|supply)\b/i.test(code)){
        violations.push(`${relativePath}: M3F1 adapter may only own the reviewed RNA/DNA resource vertical`);
    }
    for (const requiredMapping of ['evolve.resource.rna_state', 'evolve.resource.dna_state']){
        if (!source.includes(requiredMapping)) violations.push(`${relativePath}: missing reviewed mapping ${requiredMapping}`);
    }
    const allowedImports = new Set([IDENTITY, INERT_DATA, MAPPINGS]);
    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind !== 'import-statement' || !reference.specifier.startsWith('.')){
            violations.push(`${relativePath}: adapter may use only reviewed static relative imports`);
            continue;
        }
        const target = resolveRelative(relativePath, reference.specifier);
        if (!allowedImports.has(target)) violations.push(`${relativePath}: unsupported dependency ${target}`);
    }
    return violations;
}

function analyzePrematureConsumers(root){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    for (const filename of listSourceFiles(srcRoot)){
        const relative = normalize(path.relative(root, filename));
        if (relative === RESOURCE_COMMIT || relative === LEGACY_ADAPTER) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relative, reference.specifier);
            if (target === RESOURCE_COMMIT || target === LEGACY_ADAPTER){
                violations.push(`${relative}: M3F1 commit authority has a production consumer before the reviewed DNA cutover`);
            }
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [...analyzeExecutionPackage(root)];
    const executorPath = path.join(root, ...RESOURCE_COMMIT.split('/'));
    const adapterPath = path.join(root, ...LEGACY_ADAPTER.split('/'));
    if (!fs.existsSync(executorPath)) violations.push(`${RESOURCE_COMMIT}: missing`);
    else violations.push(...analyzeExecutorSource(fs.readFileSync(executorPath, 'utf8')));
    if (!fs.existsSync(adapterPath)) violations.push(`${LEGACY_ADAPTER}: missing`);
    else violations.push(...analyzeAdapterSource(fs.readFileSync(adapterPath, 'utf8')));
    violations.push(...analyzePrematureConsumers(root));
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3F1 atomic resource commit boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3F1 atomic resource commit boundary fitness passed.');
}

module.exports = { analyzeExecutionPackage, analyzeExecutorSource, analyzeAdapterSource, analyzePrematureConsumers, findViolations };

if (require.main === module) main();
