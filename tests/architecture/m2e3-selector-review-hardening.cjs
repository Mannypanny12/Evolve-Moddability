'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const { readOwnershipContract, validateOwnershipContractShape } = require('./m2e1-state-ownership-fitness.cjs');

const ENGINE_IDENTITY_FILE = 'src/engine/identity.mjs';
const GAME_STATE_FILE = 'src/engine/state/game-state.mjs';
const STATE_STORE_FILE = 'src/engine/state/state-store.mjs';
const STATE_COMMON_FILE = 'src/engine/state/common.mjs';
const ACHIEVEMENT_ADAPTER_FILE = 'src/legacy/bridge/achievement-state-adapter.mjs';
const ACHIEVEMENT_SNAPSHOT_ESCAPE = 'achievementStateSnapshot';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function repoPath(root, relativePath){
    return path.resolve(root, ...relativePath.split('/'));
}

function normalizeLocalTarget(sourceRelativePath, specifier){
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
    const suffix = specifier.search(/[?#]/);
    const clean = suffix < 0 ? specifier : specifier.slice(0, suffix);
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), clean));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function resolvedLocalTarget(root, sourceRelativePath, specifier){
    const relative = normalizeLocalTarget(sourceRelativePath, specifier);
    if (!relative) return null;
    const file = repoPath(root, relative);
    if (!fs.existsSync(file)) return { relative, realFile: null };
    let stat;
    try {
        stat = fs.statSync(file);
    }
    catch {
        return { relative, realFile: null };
    }
    if (!stat.isFile()) return { relative, realFile: null };
    return { relative, realFile: fs.realpathSync(file) };
}

function moduleReferences(source, relativePath, violations){
    try {
        return extractModuleReferences(source, relativePath);
    }
    catch (error){
        violations.push(`M2E3 hardening cannot inspect module references for ${relativePath}: ${error.message}`);
        return [];
    }
}

function buildRealRoleMap(root, ownershipContract, violations){
    const declarations = [
        [STATE_COMMON_FILE, { role: 'common' }],
        [STATE_STORE_FILE, { role: 'store' }],
        [GAME_STATE_FILE, { role: 'composition' }],
    ];
    for (const [rootName, domain] of Object.entries(ownershipContract.domains || {})){
        declarations.push([domain.schema.module, { role: 'schema', rootName }]);
        declarations.push([domain.selectors.module, { role: 'selectors', rootName }]);
        declarations.push([domain.mutationService.module, { role: 'mutationService', rootName }]);
    }

    const byModule = new Map();
    const byRealFile = new Map();
    for (const [modulePath, info] of declarations){
        const file = repoPath(root, modulePath);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
        const role = { ...info, modulePath };
        byModule.set(modulePath, role);
        const realFile = fs.realpathSync(file);
        if (byRealFile.has(realFile)){
            const existing = byRealFile.get(realFile);
            if (existing.modulePath !== modulePath){
                violations.push(
                    `M2E3 hardening state roles ${existing.modulePath} and ${modulePath} resolve to the same real file`
                );
            }
        }
        else {
            byRealFile.set(realFile, role);
        }
    }
    return { byModule, byRealFile };
}

function allowedDependency(source, target){
    if (source.role === 'common') return false;
    if (source.role === 'store') return target.role === 'common';
    if (source.role === 'schema') return target.role === 'common';
    if (source.role === 'selectors'){
        return target.role === 'common'
            || (target.role === 'schema' && source.rootName === target.rootName);
    }
    if (source.role === 'mutationService'){
        return target.role === 'common'
            || (target.role === 'schema' && source.rootName === target.rootName);
    }
    if (source.role === 'composition'){
        return target.role === 'common'
            || target.role === 'store'
            || target.role === 'schema'
            || target.role === 'mutationService';
    }
    return false;
}

function reviewedDependencies(source, ownershipContract){
    const shared = [ENGINE_IDENTITY_FILE, STATE_COMMON_FILE];
    if (source.role === 'common') return new Set([ENGINE_IDENTITY_FILE]);
    if (source.role === 'store') return new Set(shared);
    if (source.role === 'schema') return new Set(shared);
    if (source.role === 'selectors' || source.role === 'mutationService'){
        const domain = ownershipContract.domains[source.rootName];
        return new Set([...shared, domain.schema.module]);
    }
    if (source.role === 'composition'){
        const allowed = new Set([...shared, STATE_STORE_FILE]);
        for (const domain of Object.values(ownershipContract.domains || {})){
            allowed.add(domain.schema.module);
            allowed.add(domain.mutationService.module);
        }
        return allowed;
    }
    return new Set();
}

function exactRoleDependencyViolations(root, ownershipContract){
    const violations = [];
    const roles = buildRealRoleMap(root, ownershipContract, violations);

    for (const source of roles.byModule.values()){
        const file = repoPath(root, source.modulePath);
        const code = fs.readFileSync(file, 'utf8');
        const allowed = reviewedDependencies(source, ownershipContract);
        for (const reference of moduleReferences(code, source.modulePath, violations)){
            const target = normalizeLocalTarget(source.modulePath, reference.specifier);
            if (
                reference.kind !== 'import-statement'
                || /[?#]/.test(reference.specifier)
                || !target
                || !allowed.has(target)
            ){
                violations.push(
                    `M2E3 hardening ${source.modulePath} (${source.role}) has unreviewed dependency ` +
                    `${JSON.stringify(reference.specifier)} (${reference.kind})`
                );
            }
        }
    }
    return violations;
}

function realpathDependencyViolations(root, ownershipContract){
    const violations = [];
    const roles = buildRealRoleMap(root, ownershipContract, violations);

    for (const source of roles.byModule.values()){
        const file = repoPath(root, source.modulePath);
        const code = fs.readFileSync(file, 'utf8');
        for (const reference of moduleReferences(code, source.modulePath, violations)){
            const resolved = resolvedLocalTarget(root, source.modulePath, reference.specifier);
            if (!resolved || !resolved.realFile) continue;
            const target = roles.byRealFile.get(resolved.realFile);
            if (!target) continue;
            if (!allowedDependency(source, target)){
                violations.push(
                    `M2E3 hardening realpath dependency ${source.modulePath} (${source.role}) -> ` +
                    `${target.modulePath} (${target.role}) is forbidden; referenced as ${JSON.stringify(reference.specifier)}`
                );
            }
        }
    }
    return violations;
}

function listSourceFiles(directory){
    if (!fs.existsSync(directory)) return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listSourceFiles(target));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
    }
    return files.sort();
}

function unclassifiedStateModuleViolations(root, ownershipContract){
    const violations = [];
    const roles = buildRealRoleMap(root, ownershipContract, violations);
    const stateRoot = path.join(root, 'src', 'engine', 'state');
    for (const file of listSourceFiles(stateRoot)){
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (!roles.byModule.has(relative)){
            violations.push(`M2E3 hardening unclassified engine state module: ${relative}`);
        }
    }
    return violations;
}

function functionDeclarations(masked){
    const declarations = new Map();
    const parameterIndexes = new Set();
    const pattern = /\b(?:export\s+)?function\s+([$A-Z_a-z][$\w]*)\s*\(\s*([$A-Z_a-z][$\w]*)?/g;
    let match;
    while ((match = pattern.exec(masked)) !== null){
        const name = match[1];
        const firstParameter = match[2] || null;
        const nameOffset = match[0].indexOf(name);
        const parameterOffset = firstParameter ? match[0].lastIndexOf(firstParameter) : -1;
        const declaration = {
            name,
            firstParameter,
            nameIndex: match.index + nameOffset,
            parameterIndex: parameterOffset < 0 ? null : match.index + parameterOffset,
        };
        declarations.set(name, declaration);
        if (firstParameter === 'gameState') parameterIndexes.add(declaration.parameterIndex);
    }
    return { declarations, parameterIndexes };
}

function immediatePropertyAccess(masked, endIndex){
    let cursor = endIndex;
    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    return masked[cursor] === '['
        || masked[cursor] === '.'
        || (masked[cursor] === '?' && masked[cursor + 1] === '.');
}

function wholeStateFlowViolations(source, label){
    const masked = maskNonCode(source);
    const { declarations, parameterIndexes } = functionDeclarations(masked);
    const allowedCallArgumentIndexes = new Set();

    for (const declaration of declarations.values()){
        if (declaration.firstParameter !== 'gameState') continue;
        const escaped = declaration.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const callPattern = new RegExp(`\\b${escaped}\\s*\\(\\s*gameState\\b`, 'g');
        let call;
        while ((call = callPattern.exec(masked)) !== null){
            if (call.index === declaration.nameIndex) continue;
            allowedCallArgumentIndexes.add(call.index + call[0].lastIndexOf('gameState'));
        }
    }

    const violations = [];
    const occurrence = /\bgameState\b/g;
    let match;
    while ((match = occurrence.exec(masked)) !== null){
        if (parameterIndexes.has(match.index)) continue;
        if (immediatePropertyAccess(masked, match.index + match[0].length)) continue;
        if (allowedCallArgumentIndexes.has(match.index)) continue;
        violations.push(
            `M2E3 hardening ${label} forwards or aliases the whole gameState value at offset ${match.index}`
        );
    }
    return violations;
}

function selectorWholeStateFlowViolations(root, ownershipContract){
    const violations = [];
    for (const [rootName, domain] of Object.entries(ownershipContract.domains || {})){
        const file = repoPath(root, domain.selectors.module);
        if (!fs.existsSync(file)) continue;
        violations.push(...wholeStateFlowViolations(
            fs.readFileSync(file, 'utf8'),
            `${domain.selectors.module} (${rootName})`
        ));
    }
    return violations;
}

function compositionAliasViolations(root){
    const violations = [];
    const gameStateFile = repoPath(root, GAME_STATE_FILE);
    if (!fs.existsSync(gameStateFile)) return violations;
    const gameStateRealFile = fs.realpathSync(gameStateFile);
    const sourceRoot = path.join(root, 'src');

    for (const file of listSourceFiles(sourceRoot)){
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (relative === GAME_STATE_FILE) continue;
        const source = fs.readFileSync(file, 'utf8');
        for (const reference of moduleReferences(source, relative, violations)){
            const resolved = resolvedLocalTarget(root, relative, reference.specifier);
            if (!resolved?.realFile || resolved.realFile !== gameStateRealFile) continue;
            if (relative !== ACHIEVEMENT_ADAPTER_FILE){
                violations.push(
                    `M2E3 hardening raw GameState composition reached through filesystem alias from ${relative}: ` +
                    JSON.stringify(reference.specifier)
                );
            }
            else if (resolved.relative !== GAME_STATE_FILE || /[?#]/.test(reference.specifier)){
                violations.push(
                    `M2E3 hardening achievement adapter must reference GameState through its canonical path, not ` +
                    JSON.stringify(reference.specifier)
                );
            }
        }
    }
    return violations;
}

function achievementSnapshotEscapeViolations(root){
    const violations = [];
    const adapter = repoPath(root, ACHIEVEMENT_ADAPTER_FILE);
    if (!fs.existsSync(adapter)) return violations;
    const adapterRealFile = fs.realpathSync(adapter);
    const sourceRoot = path.join(root, 'src');

    for (const file of listSourceFiles(sourceRoot)){
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (relative === ACHIEVEMENT_ADAPTER_FILE) continue;
        const source = fs.readFileSync(file, 'utf8');
        const referencesAdapter = moduleReferences(source, relative, violations).some(reference => {
            const resolved = resolvedLocalTarget(root, relative, reference.specifier);
            return resolved?.realFile === adapterRealFile;
        });
        if (referencesAdapter && source.includes(ACHIEVEMENT_SNAPSHOT_ESCAPE)){
            violations.push(
                `M2E3 hardening ${relative} may not consume the raw ${ACHIEVEMENT_SNAPSHOT_ESCAPE} compatibility escape hatch`
            );
        }
    }
    return violations;
}

function achievementBindingReturnViolations(root){
    const violations = [];
    const varsFile = repoPath(root, 'src/vars.js');
    if (!fs.existsSync(varsFile)) return violations;
    const source = fs.readFileSync(varsFile, 'utf8');
    const allowed = new Set([
        'bindLegacyAchievementState(global);',
        'bindLegacyAchievementState(gameState);',
    ]);
    for (const line of source.split(/\r?\n/)){
        if (!line.includes('bindLegacyAchievementState(')) continue;
        const trimmed = line.trim();
        if (!allowed.has(trimmed)){
            violations.push(
                `M2E3 hardening vars.js must ignore the compatibility bind snapshot result; found ${JSON.stringify(trimmed)}`
            );
        }
    }
    return violations;
}

function scanM2E3ReviewHardening(root){
    const ownershipContract = readOwnershipContract(root);
    const ownershipViolations = validateOwnershipContractShape(ownershipContract);
    const violations = [...ownershipViolations];
    if (ownershipViolations.length === 0){
        violations.push(...exactRoleDependencyViolations(root, ownershipContract));
        violations.push(...realpathDependencyViolations(root, ownershipContract));
        violations.push(...unclassifiedStateModuleViolations(root, ownershipContract));
        violations.push(...selectorWholeStateFlowViolations(root, ownershipContract));
        violations.push(...compositionAliasViolations(root));
        violations.push(...achievementSnapshotEscapeViolations(root));
        violations.push(...achievementBindingReturnViolations(root));
    }
    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const violations = scanM2E3ReviewHardening(root);
    if (violations.length){
        console.error('M2E3 selector review-hardening violations:');
        for (const violation of violations) console.error('- ' + violation);
        process.exitCode = 1;
        return;
    }
    console.log('M2E3 selector review-hardening checks passed.');
}

module.exports = {
    normalizeLocalTarget,
    resolvedLocalTarget,
    exactRoleDependencyViolations,
    realpathDependencyViolations,
    unclassifiedStateModuleViolations,
    wholeStateFlowViolations,
    selectorWholeStateFlowViolations,
    compositionAliasViolations,
    achievementSnapshotEscapeViolations,
    achievementBindingReturnViolations,
    scanM2E3ReviewHardening,
};

if (require.main === module){
    main();
}
