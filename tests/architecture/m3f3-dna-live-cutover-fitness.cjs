'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const RUNTIME = 'src/application/evolve/evolution-dna-command-runtime.mjs';
const ACTIONS = 'src/actions.js';
const ALLOWED_RUNTIME_IMPORTS = new Set([
    'src/vars.js',
    'src/engine/commands/command-bus.mjs',
    'src/engine/conditions/condition-evaluator.mjs',
    'src/engine/conditions/core-requirements.mjs',
    'src/engine/execution/resource-commit.mjs',
    'src/content/evolve/commands/evolution-dna.mjs',
    'src/legacy/bridge/evolve-condition-read-adapter.mjs',
    'src/legacy/bridge/evolve-resource-commit-adapter.mjs',
]);

function normalize(value){ return value.split(path.sep).join('/'); }
function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}
function listFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(full));
        else if (entry.isFile()) files.push(full);
    }
    return files.sort();
}
function listSourceFiles(dir){
    return listFiles(dir).filter(file => SOURCE_EXTENSIONS.has(path.extname(file)));
}

function extractFunctionBody(source, signaturePattern){
    const code = maskNonCode(source);
    const match = signaturePattern.exec(code);
    if (!match) return null;
    const open = code.indexOf('{', match.index + match[0].length);
    if (open < 0) return null;
    let depth = 0;
    for (let index = open; index < code.length; index++){
        if (code[index] === '{') depth++;
        else if (code[index] === '}'){
            depth--;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }
    return null;
}

function extractRuntimeDispatchBody(source){
    return extractFunctionBody(
        source,
        /\bexport\s+function\s+dispatchEvolutionDnaCommand\s*\(\s*\)/
    );
}

function executableDnaIdPositions(source){
    const code = maskNonCode(source);
    const positions = [];
    const pattern = /\bid\s*:\s*['"]evolution-dna['"]/g;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)){
        if (code.slice(match.index, match.index + 2) === 'id') positions.push(match.index);
    }
    return positions;
}

function analyzeRuntimeSource(source){
    const violations = [];
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+dispatchEvolutionDnaCommand\s*\(\s*\)/.test(code)){
        violations.push(`${RUNTIME}: public surface must export only dispatchEvolutionDnaCommand()`);
    }

    for (const required of [
        "const readLegacyRoot = () => global;",
        "id: 'evolve:command/evolution/dna'",
        'createCommandBus',
        'createConditionEvaluator',
        'createCoreRequirementRegistrations',
        'createResourceCommitExecutor',
        'createEvolutionDnaCommandRegistration',
        'createEvolveLegacyConditionReadProvider',
        'createEvolveLegacyResourceCommitCapability',
    ]){
        if (!source.includes(required)) violations.push(`${RUNTIME}: reviewed production composition marker is missing: ${required}`);
    }

    const globalReferences = code.match(/\bglobal\b/g) || [];
    if (globalReferences.length !== 2){
        violations.push(`${RUNTIME}: global may appear only in the reviewed live import and readLegacyRoot provider`);
    }

    const dispatchBody = extractRuntimeDispatchBody(source);
    if (dispatchBody === null){
        violations.push(`${RUNTIME}: dispatchEvolutionDnaCommand() body could not be located`);
    }
    else {
        const normalizedDispatch = maskNonCode(dispatchBody).replace(/\s+/g, ' ').trim();
        if (normalizedDispatch !== 'return commandBus.dispatch(DNA_COMMAND);'){
            violations.push(`${RUNTIME}: dispatchEvolutionDnaCommand() must remain a pure command-bus dispatch`);
        }
    }

    const forbidden = [
        ['legacy rebinding authority', /\bsetGlobal\b/],
        ['direct legacy resource mutation', /\b(?:modRes|payCosts)\b/],
        ['DOM/UI', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['queue authority', /\b(?:WorkQueue|WorkItem|enqueue|dequeue|queue_complete|isQueue)\b/],
        ['GameState mutation authority', /\b(?:mutationAuthority|createMutationScope|beginTransaction|GameStateStore|StateStore)\b/],
        ['async control flow', /\b(?:async|await)\b|\bnew\s+Promise\b/],
        ['dynamic loading/code construction', /\bimport\s*\(|\brequire\s*\(|\beval\b|\bnew\s+Function\b|\bFunction\s*\(/],
    ];
    for (const [label, pattern] of forbidden){
        if (pattern.test(code)) violations.push(`${RUNTIME}: production composition may not access ${label}`);
    }

    for (const reference of extractModuleReferences(source, RUNTIME)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${RUNTIME}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${RUNTIME}: external package import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(RUNTIME, reference.specifier);
        if (!ALLOWED_RUNTIME_IMPORTS.has(target)){
            violations.push(`${RUNTIME}: unsupported production composition dependency ${target}`);
        }
    }
    return violations;
}

function extractDnaActionBody(source){
    const code = maskNonCode(source);
    const positions = executableDnaIdPositions(source);
    if (positions.length !== 1) return null;
    const dnaId = positions[0];
    const actionStart = code.indexOf('action(args)', dnaId);
    if (actionStart < 0) return null;
    const open = code.indexOf('{', actionStart);
    if (open < 0) return null;
    let depth = 0;
    for (let index = open; index < code.length; index++){
        if (code[index] === '{') depth++;
        else if (code[index] === '}'){
            depth--;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }
    return null;
}

function analyzeActionsSource(source){
    const violations = [];
    const importPattern = /import\s*\{\s*dispatchEvolutionDnaCommand\s*\}\s*from\s*['"]\.\/application\/evolve\/evolution-dna-command-runtime\.mjs['"]\s*;/;
    if (!importPattern.test(source)){
        violations.push(`${ACTIONS}: DNA legacy shim must import only dispatchEvolutionDnaCommand from the reviewed runtime`);
    }
    if (source.includes("./content/evolve/commands/evolution-dna.mjs")){
        violations.push(`${ACTIONS}: legacy actions may not import the DNA registration directly`);
    }

    const dnaIds = executableDnaIdPositions(source);
    if (dnaIds.length !== 1){
        violations.push(`${ACTIONS}: executable evolution-dna identity must occur exactly once; found ${dnaIds.length}`);
    }

    const body = extractDnaActionBody(source);
    if (body === null){
        violations.push(`${ACTIONS}: evolution.dna.action(args) could not be located unambiguously`);
        return violations;
    }
    const normalized = maskNonCode(body).replace(/\s+/g, ' ').trim();
    if (normalized !== 'dispatchEvolutionDnaCommand(); return false;'){
        violations.push(`${ACTIONS}: evolution.dna.action(args) must remain a two-step compatibility shim: dispatch then historical false return`);
    }
    for (const [label, pattern] of [
        ['direct state access', /\bglobal\b/],
        ['direct resource mutation', /\b(?:modRes|payCosts)\b/],
        ['embedded RNA/DNA rules', /\b(?:RNA|DNA|resource)\b/],
        ['error swallowing', /\b(?:try|catch|finally)\b/],
        ['queue behavior', /\b(?:queue|isQueue|WorkItem|WorkQueue)\b/],
    ]){
        if (pattern.test(maskNonCode(body))) violations.push(`${ACTIONS}: evolution.dna.action(args) may not regain ${label}`);
    }
    return violations;
}

function analyzeRuntimeConsumers(root){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    for (const filename of listSourceFiles(srcRoot)){
        const relative = normalize(path.relative(root, filename));
        if (relative === RUNTIME) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (!reference.specifier.startsWith('.')) continue;
            const target = resolveRelative(relative, reference.specifier);
            if (target === RUNTIME && relative !== ACTIONS){
                violations.push(`${relative}: M3F3 DNA runtime may only be consumed by the reviewed legacy action shim`);
            }
        }
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const runtimePath = path.join(root, ...RUNTIME.split('/'));
    const actionsPath = path.join(root, ...ACTIONS.split('/'));
    if (!fs.existsSync(runtimePath)) violations.push(`${RUNTIME}: missing`);
    else violations.push(...analyzeRuntimeSource(fs.readFileSync(runtimePath, 'utf8')));
    if (!fs.existsSync(actionsPath)) violations.push(`${ACTIONS}: missing`);
    else violations.push(...analyzeActionsSource(fs.readFileSync(actionsPath, 'utf8')));
    violations.push(...analyzeRuntimeConsumers(root));
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M3F3 DNA live-cutover fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3F3 DNA live-cutover fitness passed.');
}

module.exports = {
    analyzeRuntimeSource,
    extractRuntimeDispatchBody,
    extractDnaActionBody,
    analyzeActionsSource,
    analyzeRuntimeConsumers,
    findViolations,
};

if (require.main === module) main();
