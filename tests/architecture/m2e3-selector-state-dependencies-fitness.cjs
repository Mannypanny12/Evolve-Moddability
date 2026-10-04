'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const {
    parseOwnershipContractText,
    readOwnershipContract,
    validateOwnershipContractShape,
} = require('./m2e1-state-ownership-fitness.cjs');

const SELECTOR_CONTRACT_VERSION = 1;
const SELECTOR_CONTRACT_FILE = 'tests/architecture/m2e3-selector-surface-contract.json';
const GAME_STATE_FILE = 'src/engine/state/game-state.mjs';
const STATE_STORE_FILE = 'src/engine/state/state-store.mjs';
const STATE_COMMON_FILE = 'src/engine/state/common.mjs';
const ENGINE_IDENTITY_FILE = 'src/engine/identity.mjs';
const LEGACY_ACHIEVEMENT_ADAPTER_FILE = 'src/legacy/bridge/achievement-state-adapter.mjs';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SYMBOL_PATTERN = /^[$A-Z_a-z][$\w]*$/;

function isRecord(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sorted(value){
    return [...value].sort();
}

function sameStrings(left, right){
    return isDeepStrictEqual(sorted(left), sorted(right));
}

function checkClosedObject(value, expectedKeys, label, violations){
    if (!isRecord(value)){
        violations.push(`${label} must be an object`);
        return false;
    }
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (!isDeepStrictEqual(actual, expected)){
        violations.push(`${label} fields must be exactly ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
        return false;
    }
    return true;
}

function readSelectorContract(root){
    const file = path.join(root, ...SELECTOR_CONTRACT_FILE.split('/'));
    try {
        return parseOwnershipContractText(fs.readFileSync(file, 'utf8'));
    }
    catch (error){
        throw new Error(`M2E3 selector contract cannot be read as strict JSON: ${error.message}`);
    }
}

function validateSelectorContractShape(selectorContract, ownershipContract){
    const violations = [];
    if (!checkClosedObject(selectorContract, ['contractVersion', 'domains'], 'M2E3 selector contract', violations)){
        return violations;
    }
    if (selectorContract.contractVersion !== SELECTOR_CONTRACT_VERSION){
        violations.push(`M2E3 selector contractVersion must be ${SELECTOR_CONTRACT_VERSION}`);
    }
    if (!isRecord(selectorContract.domains)){
        violations.push('M2E3 selector contract domains must be an object');
        return violations;
    }

    const expectedDomains = Object.keys(ownershipContract.domains).sort();
    const actualDomains = Object.keys(selectorContract.domains).sort();
    if (!isDeepStrictEqual(actualDomains, expectedDomains)){
        violations.push(
            `M2E3 selector contract domains must exactly equal M2E authoritative domains ` +
            `${JSON.stringify(expectedDomains)}; got ${JSON.stringify(actualDomains)}`
        );
    }

    for (const [rootName, declaration] of Object.entries(selectorContract.domains)){
        if (!checkClosedObject(declaration, ['selectors'], `M2E3 selector domain ${rootName}`, violations)) continue;
        if (!Array.isArray(declaration.selectors) || declaration.selectors.length === 0){
            violations.push(`M2E3 selector domain ${rootName}.selectors must be a non-empty array`);
            continue;
        }
        const seen = new Set();
        for (const selector of declaration.selectors){
            if (typeof selector !== 'string' || !SYMBOL_PATTERN.test(selector)){
                violations.push(`M2E3 selector domain ${rootName} contains invalid selector name ${JSON.stringify(selector)}`);
                continue;
            }
            if (seen.has(selector)){
                violations.push(`M2E3 selector domain ${rootName} contains duplicate selector ${selector}`);
            }
            seen.add(selector);
        }
        if (!isDeepStrictEqual(declaration.selectors, [...declaration.selectors].sort())){
            violations.push(`M2E3 selector domain ${rootName}.selectors must use deterministic sorted order`);
        }
    }
    return violations;
}

function repoPath(root, relativePath){
    return path.resolve(root, ...relativePath.split('/'));
}

function pathEscapes(parent, candidate){
    const relative = path.relative(parent, candidate);
    return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function symlinkSegment(root, relativePath){
    let current = root;
    for (const segment of relativePath.split('/')){
        current = path.join(current, segment);
        if (!fs.existsSync(current)) return null;
        if (fs.lstatSync(current).isSymbolicLink()) return current;
    }
    return null;
}

function inspectStateModule(root, relativePath, label, violations){
    if (
        typeof relativePath !== 'string'
        || !relativePath.startsWith('src/engine/state/')
        || !relativePath.endsWith('.mjs')
        || relativePath.includes('\\')
        || path.posix.normalize(relativePath) !== relativePath
        || relativePath.split('/').includes('..')
    ){
        violations.push(`${label} must be a canonical .mjs path inside src/engine/state`);
        return null;
    }

    const file = repoPath(root, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()){
        violations.push(`${label} does not exist: ${relativePath}`);
        return null;
    }
    if (symlinkSegment(root, relativePath)){
        violations.push(`${label} may not traverse symbolic links: ${relativePath}`);
        return null;
    }

    const realStateRoot = fs.realpathSync(path.join(root, 'src', 'engine', 'state'));
    const realFile = fs.realpathSync(file);
    if (pathEscapes(realStateRoot, realFile)){
        violations.push(`${label} resolves outside src/engine/state: ${relativePath}`);
        return null;
    }
    return { file, realFile };
}

function normalizeLocalTarget(fromRelativePath, specifier){
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function moduleReferences(source, relativePath, violations){
    try {
        return extractModuleReferences(source, relativePath);
    }
    catch (error){
        violations.push(`M2E3 cannot inspect module references for ${relativePath}: ${error.message}`);
        return [];
    }
}

function exportedFunctions(source){
    const code = maskNonCode(source);
    return [...code.matchAll(/\bexport\s+function\s+([$A-Z_a-z][$\w]*)\s*\(/g)]
        .map(match => match[1])
        .sort();
}

function exportDeclarationCount(source){
    return (maskNonCode(source).match(/\bexport\b/g) || []).length;
}

function selectorFunctionFirstParameter(source, selectorName){
    const code = maskNonCode(source);
    const escaped = selectorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\bexport\\s+function\\s+${escaped}\\s*\\(\\s*([$A-Z_a-z][$\\w]*)`);
    const match = pattern.exec(code);
    return match ? match[1] : null;
}

function readProperty(source, masked, index){
    let cursor = index;
    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;

    if (masked[cursor] === '?' && masked[cursor + 1] === '.'){
        cursor += 2;
        while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    }
    else if (masked[cursor] === '.'){
        cursor++;
        while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    }
    else if (masked[cursor] !== '['){
        return null;
    }

    if (masked[cursor] === '['){
        const close = masked.indexOf(']', cursor + 1);
        if (close < 0) return { dynamic: true, value: null, end: masked.length };
        const raw = source.slice(cursor + 1, close).trim();
        const match = raw.match(/^(['"`])([^'"`]+)\1$/);
        return match
            ? { dynamic: false, value: match[2], end: close + 1 }
            : { dynamic: true, value: null, end: close + 1 };
    }

    const identifier = masked.slice(cursor).match(/^[$A-Z_a-z][$\w]*/);
    return identifier
        ? { dynamic: false, value: identifier[0], end: cursor + identifier[0].length }
        : null;
}

function directStateRootAccesses(source, stateIdentifier = 'gameState'){
    const masked = maskNonCode(source);
    const escaped = stateIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    const accesses = [];
    let match;
    while ((match = pattern.exec(masked)) !== null){
        const property = readProperty(source, masked, match.index + match[0].length);
        if (!property) continue;
        accesses.push({
            dynamic: property.dynamic,
            root: property.value,
            index: match.index,
        });
    }
    return accesses;
}

function selectorRootViolations(source, ownRoot, allGameStateRoots){
    const violations = [];
    const authoritativeRoots = new Set(allGameStateRoots);

    for (const access of directStateRootAccesses(source, 'gameState')){
        if (access.dynamic){
            violations.push(`dynamic gameState root access is forbidden in ${ownRoot} selectors`);
        }
        else if (authoritativeRoots.has(access.root) && access.root !== ownRoot){
            violations.push(`selector domain ${ownRoot} may not read GameState root ${access.root}`);
        }
    }

    const masked = maskNonCode(source);
    if (/\b(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*gameState\b/.test(masked)){
        violations.push(`selector domain ${ownRoot} may not alias gameState before property access`);
    }
    if (/\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*gameState\b/.test(masked)){
        violations.push(`selector domain ${ownRoot} may not destructure gameState`);
    }
    return violations;
}

function roleMap(ownershipContract){
    const roles = new Map([
        [STATE_COMMON_FILE, { role: 'common' }],
        [STATE_STORE_FILE, { role: 'store' }],
        [GAME_STATE_FILE, { role: 'composition' }],
    ]);
    for (const [rootName, domain] of Object.entries(ownershipContract.domains)){
        roles.set(domain.schema.module, { role: 'schema', rootName });
        roles.set(domain.selectors.module, { role: 'selectors', rootName });
        roles.set(domain.mutationService.module, { role: 'mutationService', rootName });
    }
    return roles;
}

function allowedStateDependency(sourceRole, targetRole, sourceInfo, targetInfo){
    if (sourceRole === 'common') return false;
    if (sourceRole === 'store') return targetRole === 'common';
    if (sourceRole === 'schema') return targetRole === 'common';
    if (sourceRole === 'selectors'){
        return targetRole === 'common'
            || (targetRole === 'schema' && sourceInfo.rootName === targetInfo.rootName);
    }
    if (sourceRole === 'mutationService'){
        return targetRole === 'common'
            || (targetRole === 'schema' && sourceInfo.rootName === targetInfo.rootName);
    }
    if (sourceRole === 'composition'){
        return targetRole === 'common'
            || targetRole === 'store'
            || targetRole === 'schema'
            || targetRole === 'mutationService';
    }
    return false;
}

function stateLayerDependencyViolations(root, ownershipContract){
    const violations = [];
    const roles = roleMap(ownershipContract);

    for (const [sourceRelativePath, sourceInfo] of roles){
        const file = repoPath(root, sourceRelativePath);
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const refs = moduleReferences(source, sourceRelativePath, violations);
        for (const reference of refs){
            const targetRelativePath = normalizeLocalTarget(sourceRelativePath, reference.specifier);
            if (!targetRelativePath || !roles.has(targetRelativePath)) continue;
            const targetInfo = roles.get(targetRelativePath);
            if (!allowedStateDependency(sourceInfo.role, targetInfo.role, sourceInfo, targetInfo)){
                violations.push(
                    `M2E3 state dependency ${sourceRelativePath} (${sourceInfo.role}) -> ` +
                    `${targetRelativePath} (${targetInfo.role}) is forbidden`
                );
            }
        }
    }
    return violations;
}

function listSourceModulesRecursive(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listSourceModulesRecursive(target));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
    }
    return files.sort();
}

function referencesTarget(source, sourceRelativePath, targetRelativePath, violations){
    return moduleReferences(source, sourceRelativePath, violations)
        .filter(reference => normalizeLocalTarget(sourceRelativePath, reference.specifier) === targetRelativePath);
}

function rawReadBoundaryViolations(root){
    const violations = [];
    const sourceRoot = path.join(root, 'src');

    for (const file of listSourceModulesRecursive(sourceRoot)){
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (relative === GAME_STATE_FILE) continue;
        const source = fs.readFileSync(file, 'utf8');
        const references = referencesTarget(source, relative, GAME_STATE_FILE, violations);
        if (!references.length) continue;

        if (relative !== LEGACY_ACHIEVEMENT_ADAPTER_FILE){
            violations.push(
                `M2E3 raw GameState composition may not be imported by ordinary production source: ${relative}`
            );
            continue;
        }

        if (references.length !== 1 || references[0].kind !== 'import-statement'){
            violations.push('M2E3 legacy achievement adapter may have exactly one static GameState module reference');
        }
        const code = maskNonCode(source);
        const importMatch = source.match(
            /\bimport\s*\{([\s\S]*?)\}\s*from\s*(['"])\.\.\/\.\.\/engine\/state\/game-state\.mjs\2\s*;?/
        );
        if (!importMatch){
            violations.push('M2E3 legacy achievement adapter must use one inspectable static named GameState import');
            continue;
        }
        const names = importMatch[1].split(',').map(value => value.trim()).filter(Boolean).sort();
        const expected = ['GAME_STATE_SCHEMA_VERSION', 'createGameStateRuntime'].sort();
        if (!isDeepStrictEqual(names, expected)){
            violations.push(
                `M2E3 legacy achievement adapter GameState import must remain exactly ${JSON.stringify(expected)}; ` +
                `got ${JSON.stringify(names)}`
            );
        }
        if ((code.match(/\bcreateGameStateStore\b/g) || []).length){
            violations.push('M2E3 compatibility adapter may not construct the generic read-only GameState store');
        }
    }

    return violations;
}

function inspectSelectorModules(root, ownershipContract, selectorContract){
    const violations = [];
    const allRoots = [
        ...Object.keys(ownershipContract.metadataRoots),
        ...Object.keys(ownershipContract.domains),
    ];

    for (const [rootName, domain] of Object.entries(ownershipContract.domains)){
        const inspected = inspectStateModule(
            root,
            domain.selectors.module,
            `M2E3 domain ${rootName} selector module`,
            violations
        );
        if (!inspected) continue;

        const source = fs.readFileSync(inspected.file, 'utf8');
        const expectedSelectors = selectorContract.domains?.[rootName]?.selectors || [];
        const actualSelectors = exportedFunctions(source);

        if (exportDeclarationCount(source) !== actualSelectors.length){
            violations.push(
                `M2E3 selector module ${domain.selectors.module} may export only reviewed named functions`
            );
        }
        if (!sameStrings(actualSelectors, expectedSelectors)){
            violations.push(
                `M2E3 selector surface for ${rootName} must exactly equal ${JSON.stringify([...expectedSelectors].sort())}; ` +
                `got ${JSON.stringify(actualSelectors)}`
            );
        }

        for (const selectorName of expectedSelectors){
            const parameter = selectorFunctionFirstParameter(source, selectorName);
            if (parameter !== 'gameState'){
                violations.push(
                    `M2E3 selector ${selectorName} for ${rootName} must take gameState as its first parameter`
                );
            }
        }

        const refs = moduleReferences(source, domain.selectors.module, violations);
        const allowedTargets = new Set([
            ENGINE_IDENTITY_FILE,
            STATE_COMMON_FILE,
            domain.schema.module,
        ]);
        for (const reference of refs){
            const target = normalizeLocalTarget(domain.selectors.module, reference.specifier);
            if (!target || !allowedTargets.has(target)){
                violations.push(
                    `M2E3 selector module ${domain.selectors.module} has forbidden dependency ` +
                    `${JSON.stringify(reference.specifier)} (${reference.kind})`
                );
            }
            if (reference.kind !== 'import-statement'){
                violations.push(
                    `M2E3 selector module ${domain.selectors.module} may use only static import statements; ` +
                    `found ${reference.kind} for ${JSON.stringify(reference.specifier)}`
                );
            }
        }

        violations.push(...selectorRootViolations(source, rootName, allRoots).map(
            violation => `M2E3 ${domain.selectors.module}: ${violation}`
        ));
    }

    return violations;
}

function scanSelectorStateDependencies(root){
    const violations = [];
    const ownershipContract = readOwnershipContract(root);
    violations.push(...validateOwnershipContractShape(ownershipContract));
    const selectorContract = readSelectorContract(root);
    violations.push(...validateSelectorContractShape(selectorContract, ownershipContract));

    violations.push(...inspectSelectorModules(root, ownershipContract, selectorContract));
    violations.push(...stateLayerDependencyViolations(root, ownershipContract));
    violations.push(...rawReadBoundaryViolations(root));

    return {
        summary: {
            selectorContractVersion: selectorContract.contractVersion,
            domainCount: Object.keys(ownershipContract.domains).length,
            domains: Object.entries(ownershipContract.domains)
                .map(([rootName, domain]) => ({
                    root: rootName,
                    selectorModule: domain.selectors.module,
                    selectorCount: selectorContract.domains?.[rootName]?.selectors?.length || 0,
                }))
                .sort((left, right) => left.root.localeCompare(right.root)),
        },
        violations: [...new Set(violations)].sort(),
    };
}

function runSelectorStateDependencyCheck(root, logger = console){
    const result = scanSelectorStateDependencies(root);
    logger.log('M2E3 selector/state dependency summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2E3 selector/state dependency violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2E3 selector/state dependency gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runSelectorStateDependencyCheck(root).exitCode;
}

module.exports = {
    SELECTOR_CONTRACT_VERSION,
    validateSelectorContractShape,
    exportedFunctions,
    selectorRootViolations,
    stateLayerDependencyViolations,
    rawReadBoundaryViolations,
    inspectSelectorModules,
    scanSelectorStateDependencies,
    runSelectorStateDependencyCheck,
};

if (require.main === module){
    main();
}
