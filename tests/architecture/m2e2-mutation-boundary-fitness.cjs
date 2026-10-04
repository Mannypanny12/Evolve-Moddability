'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const { parseStrictStringArrayBody } = require('./m2c-syntax-hardening.cjs');
const {
    readOwnershipContract,
    validateOwnershipContractShape,
} = require('./m2e1-state-ownership-fitness.cjs');

const GAME_STATE_FILE = 'src/engine/state/game-state.mjs';
const STATE_STORE_FILE = 'src/engine/state/state-store.mjs';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const RAW_AUTHORITY_IDENTIFIERS = Object.freeze(['mutationAuthority', 'createMutationScope']);
const FORBIDDEN_PUBLIC_CAPABILITIES = new Set([
    'createMutationScope',
    'mutationAuthority',
    'mutationScope',
    'scope',
    'transaction',
]);

function escapeRegex(value){
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSource(root, relativePath){
    return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
}

function listSourceModulesRecursive(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listSourceModulesRecursive(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function parseStrictFrozenStringArray(source, constantName){
    const name = escapeRegex(constantName);
    const pattern = new RegExp(
        `const\\s+${name}\\s*=\\s*Object\\.freeze\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)\\s*;`,
        'g'
    );
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) return null;
    const values = parseStrictStringArrayBody(matches[0][1]);
    if (!Array.isArray(values) || new Set(values).size !== values.length) return null;
    return values;
}

function extractFunctionBody(source, functionName){
    const masked = maskNonCode(source);
    const name = escapeRegex(functionName);
    const pattern = new RegExp(`\\b(?:export\\s+)?function\\s+${name}\\s*\\(`);
    const match = pattern.exec(masked);
    if (!match) return null;
    let cursor = match.index + match[0].length;
    let parenDepth = 1;
    while (cursor < masked.length && parenDepth > 0){
        if (masked[cursor] === '(') parenDepth++;
        else if (masked[cursor] === ')') parenDepth--;
        cursor++;
    }
    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    if (masked[cursor] !== '{') return null;
    const open = cursor;
    let braceDepth = 1;
    cursor++;
    while (cursor < masked.length && braceDepth > 0){
        if (masked[cursor] === '{') braceDepth++;
        else if (masked[cursor] === '}') braceDepth--;
        cursor++;
    }
    if (braceDepth !== 0) return null;
    return source.slice(open + 1, cursor - 1);
}

function countIdentifier(source, identifier){
    const matches = maskNonCode(source).match(new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g'));
    return matches ? matches.length : 0;
}

function countCalls(source, functionName){
    const matches = maskNonCode(source).match(new RegExp(`\\b${escapeRegex(functionName)}\\s*\\(`, 'g'));
    return matches ? matches.length : 0;
}

function relativeImportTarget(fromRelativePath, specifier){
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function staticNamedImports(source, sourceRelativePath){
    const imports = new Map();
    const masked = maskNonCode(source);
    const pattern = /\bimport\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"\r\n]+)\2\s*;?/g;
    let match;
    while ((match = pattern.exec(source)) !== null){
        if (masked.slice(match.index, match.index + 6) !== 'import') continue;
        const target = relativeImportTarget(sourceRelativePath, match[3]);
        if (!target) continue;
        const bindings = imports.get(target) || new Map();
        for (const part of maskNonCode(match[1]).split(',')){
            const binding = part.trim();
            if (!binding) continue;
            const parsed = binding.match(/^([$A-Z_a-z][$\w]*)(?:\s+as\s+([$A-Z_a-z][$\w]*))?$/);
            if (!parsed) continue;
            bindings.set(parsed[1], parsed[2] || parsed[1]);
        }
        imports.set(target, bindings);
    }
    return imports;
}

function requireImportedLocal(imports, modulePath, exportName){
    const bindings = imports.get(modulePath);
    return bindings ? bindings.get(exportName) || null : null;
}

function parseScopeDeclarations(runtimeBody){
    if (runtimeBody === null) return null;
    const masked = maskNonCode(runtimeBody);
    const pattern = /\bconst\s+([$A-Z_a-z][$\w]*)\s*=\s*mutationAuthority\s*\.\s*createMutationScope\s*\(\s*\{\s*id\s*:\s*(['"])([^'"\r\n]+)\2\s*,\s*fields\s*:\s*\[\s*(['"])([^'"\r\n]+)\4\s*\]\s*,?\s*\}\s*\)\s*;/g;
    const scopes = [];
    let match;
    while ((match = pattern.exec(runtimeBody)) !== null){
        if (masked.slice(match.index, match.index + 5) !== 'const') continue;
        scopes.push({ variable: match[1], id: match[3], field: match[5] });
    }
    const callCount = (masked.match(/\bcreateMutationScope\s*\(/g) || []).length;
    if (callCount !== scopes.length) return null;
    return scopes;
}

function parseFrozenReturnObject(body){
    if (body === null) return null;
    const masked = maskNonCode(body);
    const pattern = /\breturn\s+Object\.freeze\s*\(\s*\{([\s\S]*?)\}\s*\)\s*;/g;
    const matches = [...masked.matchAll(pattern)];
    if (matches.length !== 1) return null;
    const entries = new Map();
    for (const raw of matches[0][1].split(',')){
        const entry = raw.trim();
        if (!entry) continue;
        let parsed = entry.match(/^([$A-Z_a-z][$\w]*)$/);
        if (parsed){
            if (entries.has(parsed[1])) return null;
            entries.set(parsed[1], parsed[1]);
            continue;
        }
        parsed = entry.match(/^([$A-Z_a-z][$\w]*)\s*:\s*([$A-Z_a-z][$\w]*)$/);
        if (!parsed || entries.has(parsed[1])) return null;
        entries.set(parsed[1], parsed[2]);
    }
    return entries;
}

function expectedWritableRoots(contract){
    return Object.keys(contract.domains).sort();
}

function sameSortedStrings(left, right){
    return isDeepStrictEqual([...left].sort(), [...right].sort());
}

function analyzeGameStateComposition(source, contract){
    const violations = [];
    const expectedRoots = expectedWritableRoots(contract);
    const metadataRoots = Object.keys(contract.metadataRoots);
    const readOnlyRoots = parseStrictFrozenStringArray(source, 'GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS');
    const runtimeRoots = parseStrictFrozenStringArray(source, 'GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS');

    if (readOnlyRoots === null){
        violations.push('M2E2 read-only writable-root declaration must remain one frozen literal string array');
    }
    else if (readOnlyRoots.length !== 0){
        violations.push(`M2E2 createGameStateStore infrastructure must have zero writable roots; got ${JSON.stringify(readOnlyRoots)}`);
    }
    if (runtimeRoots === null){
        violations.push('M2E2 runtime writable-root declaration must remain one frozen literal string array');
    }
    else {
        if (!sameSortedStrings(runtimeRoots, expectedRoots)){
            violations.push(`M2E2 runtime writable roots must exactly equal reviewed authoritative domains ${JSON.stringify(expectedRoots)}; got ${JSON.stringify(runtimeRoots)}`);
        }
        for (const rootName of runtimeRoots){
            if (metadataRoots.includes(rootName)) violations.push(`M2E2 GameState metadata root ${rootName} may not be runtime writable`);
        }
    }

    const infrastructureBody = extractFunctionBody(source, 'createGameStateInfrastructure');
    if (infrastructureBody === null){
        violations.push('M2E2 cannot inspect createGameStateInfrastructure()');
    }
    else {
        const compact = maskNonCode(infrastructureBody).replace(/\s+/g, ' ').trim();
        const callPattern = /^return createStateStore\s*\(\s*\{\s*initialState\s*,\s*validateState\s*:\s*validateGameState\s*,\s*writableFields\s*,?\s*\}\s*\)\s*;?$/;
        if (!callPattern.test(compact)){
            violations.push('M2E2 createGameStateInfrastructure() must pass initialState, validateGameState, and the exact writableFields capability directly to createStateStore()');
        }
    }

    const storeBody = extractFunctionBody(source, 'createGameStateStore');
    if (storeBody === null || !/createGameStateInfrastructure\s*\(\s*initialState\s*,\s*GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS\s*\)/.test(maskNonCode(storeBody))){
        violations.push('M2E2 createGameStateStore() must use only GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS');
    }

    const runtimeBody = extractFunctionBody(source, 'createGameStateRuntime');
    if (runtimeBody === null){
        violations.push('M2E2 cannot inspect createGameStateRuntime()');
        return { violations, summary: { expectedRoots, readOnlyRoots, runtimeRoots, scopes: [] } };
    }
    const maskedRuntime = maskNonCode(runtimeBody);
    if (!/const\s*\{\s*store\s*,\s*mutationAuthority\s*\}\s*=\s*createGameStateInfrastructure\s*\(\s*initialState\s*,\s*GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS\s*\)\s*;/.test(maskedRuntime)){
        violations.push('M2E2 createGameStateRuntime() must retain store plus raw mutationAuthority only from the reviewed runtime infrastructure');
    }
    if (countCalls(source, 'createGameStateInfrastructure') !== 3){
        violations.push('M2E2 createGameStateInfrastructure() must have exactly two callers: createGameStateStore() and createGameStateRuntime()');
    }

    const imports = staticNamedImports(source, GAME_STATE_FILE);
    const createStateStoreLocal = requireImportedLocal(imports, STATE_STORE_FILE, 'createStateStore');
    if (!createStateStoreLocal || countCalls(source, createStateStoreLocal) !== 1){
        violations.push('M2E2 GameState composition must statically import createStateStore and call it only inside createGameStateInfrastructure()');
    }

    const scopes = parseScopeDeclarations(runtimeBody);
    if (scopes === null){
        violations.push('M2E2 every mutation scope must be minted through an inspectable literal { id, fields: [root] } declaration');
        return { violations, summary: { expectedRoots, readOnlyRoots, runtimeRoots, scopes: [] } };
    }
    if (scopes.length !== expectedRoots.length){
        violations.push(`M2E2 runtime must mint exactly one scope per writable domain; expected ${expectedRoots.length}, got ${scopes.length}`);
    }

    const serviceVariables = new Map();
    for (const [rootName, domain] of Object.entries(contract.domains)){
        const matchingScopes = scopes.filter(scope => scope.id === domain.owner && scope.field === rootName);
        if (matchingScopes.length !== 1){
            violations.push(`M2E2 domain ${rootName} must receive exactly one scope with id ${JSON.stringify(domain.owner)} and fields [${JSON.stringify(rootName)}]`);
            continue;
        }
        const scope = matchingScopes[0];
        if (countIdentifier(runtimeBody, scope.variable) !== 2){
            violations.push(`M2E2 raw scope ${scope.variable} for ${rootName} may only be declared and passed once to its mutation service`);
        }

        const factoryLocal = requireImportedLocal(imports, domain.mutationService.module, domain.mutationService.factory);
        if (!factoryLocal){
            violations.push(`M2E2 domain ${rootName} mutation-service factory must be a static named import from ${domain.mutationService.module}`);
            continue;
        }
        if (countCalls(source, factoryLocal) !== 1){
            violations.push(`M2E2 mutation-service factory ${domain.mutationService.factory} for ${rootName} must be called exactly once in GameState composition`);
        }
        const scopeArgument = scope.variable === 'mutationScope'
            ? 'mutationScope'
            : `mutationScope\\s*:\\s*${escapeRegex(scope.variable)}`;
        const servicePattern = new RegExp(
            `\\bconst\\s+([$A-Z_a-z][$\\w]*)\\s*=\\s*${escapeRegex(factoryLocal)}\\s*\\(\\s*\\{\\s*${scopeArgument}\\s*,?\\s*\\}\\s*\\)\\s*;`
        );
        const serviceMatch = servicePattern.exec(maskedRuntime);
        if (!serviceMatch){
            violations.push(`M2E2 domain ${rootName} scope must flow directly into ${domain.mutationService.factory}({ mutationScope })`);
            continue;
        }
        serviceVariables.set(rootName, serviceMatch[1]);
    }

    if (countIdentifier(runtimeBody, 'mutationAuthority') !== 1 + scopes.length){
        violations.push('M2E2 raw mutationAuthority may only be captured once and used to mint the reviewed domain scopes');
    }

    const returned = parseFrozenReturnObject(runtimeBody);
    if (!returned){
        violations.push('M2E2 createGameStateRuntime() must return one inspectable frozen object');
    }
    else {
        const expectedKeys = ['store', ...expectedRoots].sort();
        if (!sameSortedStrings(returned.keys(), expectedKeys)){
            violations.push(`M2E2 runtime public surface must be exactly ${JSON.stringify(expectedKeys)}; got ${JSON.stringify([...returned.keys()].sort())}`);
        }
        if (returned.get('store') !== 'store') violations.push('M2E2 runtime store property must expose only the read-side store facade');
        for (const rootName of expectedRoots){
            const serviceVariable = serviceVariables.get(rootName);
            if (serviceVariable && returned.get(rootName) !== serviceVariable){
                violations.push(`M2E2 runtime property ${rootName} must expose only its declared semantic mutation service`);
            }
        }
    }

    return {
        violations,
        summary: {
            expectedRoots,
            readOnlyRoots,
            runtimeRoots,
            scopes: scopes.map(scope => ({ id: scope.id, field: scope.field })).sort((a, b) => a.field.localeCompare(b.field)),
        },
    };
}

function localReferenceTargets(sourceFile, specifier, targetFile){
    if (!specifier || !specifier.startsWith('.')) return false;
    const base = path.resolve(path.dirname(sourceFile), specifier);
    const target = path.resolve(targetFile);
    if (base === target) return true;
    for (const extension of SOURCE_EXTENSIONS){
        if (base + extension === target) return true;
    }
    return false;
}

function productionCapabilityConsumerViolations(root, contract){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    const gameStateFile = path.join(root, ...GAME_STATE_FILE.split('/'));
    const stateStoreFile = path.join(root, ...STATE_STORE_FILE.split('/'));
    const serviceFiles = new Map(Object.entries(contract.domains).map(([rootName, domain]) => [
        path.resolve(root, ...domain.mutationService.module.split('/')),
        rootName,
    ]));

    for (const file of listSourceModulesRecursive(srcRoot)){
        let references;
        const source = fs.readFileSync(file, 'utf8');
        try {
            references = extractModuleReferences(source, file);
        }
        catch (error){
            violations.push(`${path.relative(root, file)}: M2E2 cannot parse production module references: ${error.message}`);
            continue;
        }
        for (const reference of references){
            if (localReferenceTargets(file, reference.specifier, stateStoreFile) && path.resolve(file) !== path.resolve(gameStateFile)){
                violations.push(`${path.relative(root, file)}: M2E2 only GameState composition may consume state-store.mjs`);
            }
            for (const [serviceFile, rootName] of serviceFiles){
                if (localReferenceTargets(file, reference.specifier, serviceFile) && path.resolve(file) !== path.resolve(gameStateFile)){
                    violations.push(`${path.relative(root, file)}: M2E2 only GameState composition may construct the ${rootName} mutation service`);
                }
            }
        }
    }

    const engineRoot = path.join(srcRoot, 'engine');
    for (const file of listSourceModulesRecursive(engineRoot)){
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (relative === GAME_STATE_FILE || relative === STATE_STORE_FILE) continue;
        const code = maskNonCode(fs.readFileSync(file, 'utf8'));
        for (const identifier of RAW_AUTHORITY_IDENTIFIERS){
            if (new RegExp(`\\b${escapeRegex(identifier)}\\b`).test(code)){
                violations.push(`${relative}: M2E2 raw capability identifier ${identifier} is reserved to state-store.mjs and GameState composition`);
            }
        }
    }
    return violations;
}

async function importModule(root, relativePath){
    return import(pathToFileURL(path.join(root, ...relativePath.split('/'))).href);
}

function sortedOwnKeys(value){
    return Reflect.ownKeys(value).filter(key => typeof key === 'string').sort();
}

async function runtimeCapabilityViolations(root, contract){
    const violations = [];
    let storeModule;
    let gameStateModule;
    try {
        [storeModule, gameStateModule] = await Promise.all([
            importModule(root, STATE_STORE_FILE),
            importModule(root, GAME_STATE_FILE),
        ]);
    }
    catch (error){
        return [`M2E2 could not import state capability modules: ${error.message}`];
    }

    try {
        const infrastructure = storeModule.createStateStore({
            initialState: { alpha: {} },
            validateState: value => value,
            writableFields: ['alpha'],
        });
        if (!isDeepStrictEqual(sortedOwnKeys(infrastructure), ['mutationAuthority', 'store'])){
            violations.push('M2E2 createStateStore() must expose exactly store plus mutationAuthority to its composition caller');
        }
        if (!Object.isFrozen(infrastructure) || !Object.isFrozen(infrastructure.store) || !Object.isFrozen(infrastructure.mutationAuthority)){
            violations.push('M2E2 state-store infrastructure and both capability facades must remain frozen');
        }
        if (!isDeepStrictEqual(sortedOwnKeys(infrastructure.mutationAuthority), ['createMutationScope'])){
            violations.push('M2E2 raw mutationAuthority must expose only createMutationScope');
        }
        const scope = infrastructure.mutationAuthority.createMutationScope({ id: 'm2e2-probe', fields: ['alpha'] });
        if (!Object.isFrozen(scope) || !isDeepStrictEqual(sortedOwnKeys(scope), ['fields', 'id', 'transaction'])){
            violations.push('M2E2 minted mutation scopes must expose exactly frozen id, fields, and transaction capability');
        }
    }
    catch (error){
        violations.push(`M2E2 low-level state capability probe failed: ${error.message}`);
    }

    let runtime;
    try {
        runtime = gameStateModule.createGameStateRuntime();
        const expectedRuntimeKeys = ['store', ...expectedWritableRoots(contract)].sort();
        if (!Object.isFrozen(runtime) || !isDeepStrictEqual(sortedOwnKeys(runtime), expectedRuntimeKeys)){
            violations.push(`M2E2 runtime object must be frozen with exactly ${JSON.stringify(expectedRuntimeKeys)}`);
        }
        for (const forbidden of FORBIDDEN_PUBLIC_CAPABILITIES){
            if (Object.prototype.hasOwnProperty.call(runtime, forbidden)) violations.push(`M2E2 runtime may not expose raw capability ${forbidden}`);
        }
    }
    catch (error){
        violations.push(`M2E2 GameState runtime probe failed: ${error.message}`);
    }

    for (const [rootName, domain] of Object.entries(contract.domains)){
        let module;
        try {
            module = await importModule(root, domain.mutationService.module);
        }
        catch (error){
            violations.push(`M2E2 ${rootName} mutation-service module could not be imported: ${error.message}`);
            continue;
        }
        const factory = module[domain.mutationService.factory];
        if (typeof factory !== 'function'){
            violations.push(`M2E2 ${rootName} mutation-service factory ${domain.mutationService.factory} is not callable`);
            continue;
        }
        let transactionCalls = 0;
        const transaction = () => {
            transactionCalls++;
            throw new Error('M2E2 construction probe must never execute transaction authority');
        };
        const validScope = Object.freeze({ id: domain.owner, fields: Object.freeze([rootName]), transaction });
        let service;
        try {
            service = factory({ mutationScope: validScope });
        }
        catch (error){
            violations.push(`M2E2 ${rootName} service rejected its reviewed owner/root capability: ${error.message}`);
            continue;
        }
        if (transactionCalls !== 0) violations.push(`M2E2 ${rootName} service construction executed raw transaction authority`);
        if (!Object.isFrozen(service)) violations.push(`M2E2 ${rootName} semantic mutation service must be frozen`);
        for (const key of sortedOwnKeys(service)){
            if (FORBIDDEN_PUBLIC_CAPABILITIES.has(key)) violations.push(`M2E2 ${rootName} mutation service may not expose raw capability ${key}`);
            if (service[key] === transaction) violations.push(`M2E2 ${rootName} mutation service may not return its raw transaction closure directly`);
        }
        if (runtime && runtime[rootName] && !isDeepStrictEqual(sortedOwnKeys(runtime[rootName]), sortedOwnKeys(service))){
            violations.push(`M2E2 runtime ${rootName} service surface must match its declared mutation-service factory`);
        }

        const invalidScopes = [
            { id: `${domain.owner}-wrong`, fields: [rootName], transaction },
            { id: domain.owner, fields: [`${rootName}Wrong`], transaction },
            { id: domain.owner, fields: [rootName, `${rootName}Extra`], transaction },
            { id: domain.owner, fields: [rootName] },
            { id: domain.owner, fields: [rootName], transaction, mutationAuthority: {} },
        ];
        for (const invalidScope of invalidScopes){
            let rejected = false;
            try {
                factory({ mutationScope: invalidScope });
            }
            catch {
                rejected = true;
            }
            if (!rejected){
                violations.push(`M2E2 ${rootName} mutation service accepted an unreviewed mutation capability shape`);
                break;
            }
        }
    }
    return violations;
}

async function scanMutationBoundary(root, contract = readOwnershipContract(root)){
    const ownershipViolations = validateOwnershipContractShape(contract);
    if (ownershipViolations.length){
        return {
            summary: { contractVersion: contract && contract.contractVersion, domainCount: 0 },
            violations: ownershipViolations.map(value => `M2E2 ownership prerequisite: ${value}`),
        };
    }

    const composition = analyzeGameStateComposition(readSource(root, GAME_STATE_FILE), contract);
    const violations = [
        ...composition.violations,
        ...productionCapabilityConsumerViolations(root, contract),
        ...await runtimeCapabilityViolations(root, contract),
    ].sort();

    return {
        summary: {
            contractVersion: contract.contractVersion,
            domainCount: Object.keys(contract.domains).length,
            writableRoots: expectedWritableRoots(contract),
            scopes: composition.summary.scopes,
            violationCount: violations.length,
        },
        violations,
    };
}

async function runMutationBoundaryCheck(root, logger = console){
    const result = await scanMutationBoundary(root);
    logger.log('M2E2 mutation-boundary summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2E2 mutation-boundary violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2E2 mutation-boundary gate passed.');
    return { exitCode: 0, result };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = (await runMutationBoundaryCheck(root)).exitCode;
}

module.exports = {
    GAME_STATE_FILE,
    STATE_STORE_FILE,
    parseStrictFrozenStringArray,
    extractFunctionBody,
    parseScopeDeclarations,
    parseFrozenReturnObject,
    expectedWritableRoots,
    analyzeGameStateComposition,
    productionCapabilityConsumerViolations,
    runtimeCapabilityViolations,
    scanMutationBoundary,
    runMutationBoundaryCheck,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
