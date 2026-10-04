'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const { parseStrictGameStateRootFields } = require('./m2c-syntax-hardening.cjs');

const CONTRACT_VERSION = 1;
const CONTRACT_FILE = 'm2e-state-domain-contract.json';
const GAME_STATE_FILE = path.posix.join('src', 'engine', 'state', 'game-state.mjs');
const ENGINE_STATE_PREFIX = 'src/engine/state/';
const ROOT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const OWNER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SYMBOL_PATTERN = /^[$A-Z_a-z][$\w]*$/;

function isRecord(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObject(value){
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function sortedKeys(value){
    return isRecord(value) ? Object.keys(value).sort() : [];
}

function checkClosedObject(value, expectedKeys, label, violations){
    if (!isRecord(value)){
        violations.push(`${label} must be an object`);
        return false;
    }
    const actual = sortedKeys(value);
    const expected = [...expectedKeys].sort();
    if (!isDeepStrictEqual(actual, expected)){
        violations.push(`${label} fields must be exactly ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
        return false;
    }
    return true;
}

function validateRootName(value, label, violations){
    if (typeof value !== 'string' || !ROOT_NAME_PATTERN.test(value)){
        violations.push(`${label} must be a simple GameState root identifier`);
        return false;
    }
    return true;
}

function validateOwner(value, label, violations){
    if (typeof value !== 'string' || !OWNER_ID_PATTERN.test(value)){
        violations.push(`${label} must be a stable lowercase owner id matching ${OWNER_ID_PATTERN}`);
        return false;
    }
    return true;
}

function validateSymbol(value, label, violations){
    if (typeof value !== 'string' || !SYMBOL_PATTERN.test(value)){
        violations.push(`${label} must name a JavaScript identifier export`);
        return false;
    }
    return true;
}

function validateModulePath(value, label, violations){
    if (typeof value !== 'string' || value.length === 0){
        violations.push(`${label} must be a repository-relative module path`);
        return false;
    }
    if (value.includes('\\') || path.posix.isAbsolute(value)){
        violations.push(`${label} must use a repository-relative POSIX path`);
        return false;
    }
    if (value.split('/').includes('..') || path.posix.normalize(value) !== value){
        violations.push(`${label} must not contain traversal or non-canonical path segments`);
        return false;
    }
    if (!value.startsWith(ENGINE_STATE_PREFIX) || !value.endsWith('.mjs')){
        violations.push(`${label} must point to an .mjs module inside ${ENGINE_STATE_PREFIX}`);
        return false;
    }
    return true;
}

function validateOwnershipContractShape(contract){
    const violations = [];
    if (!checkClosedObject(contract, ['contractVersion', 'metadataRoots', 'domains'], 'M2E ownership contract', violations)){
        return violations;
    }
    if (contract.contractVersion !== CONTRACT_VERSION){
        violations.push(`M2E ownership contractVersion must be ${CONTRACT_VERSION}`);
    }
    if (!isRecord(contract.metadataRoots)){
        violations.push('M2E metadataRoots must be an object');
    }
    if (!isRecord(contract.domains)){
        violations.push('M2E domains must be an object');
    }
    if (violations.length) return violations;

    for (const [rootName, metadata] of Object.entries(contract.metadataRoots)){
        validateRootName(rootName, `M2E metadata root ${JSON.stringify(rootName)}`, violations);
        if (!checkClosedObject(metadata, ['owner'], `M2E metadata root ${rootName}`, violations)) continue;
        validateOwner(metadata.owner, `M2E metadata root ${rootName}.owner`, violations);
    }

    if (!Object.prototype.hasOwnProperty.call(contract.metadataRoots, 'schemaVersion')){
        violations.push('M2E schemaVersion must be explicitly classified as GameState root metadata');
    }
    else if (contract.metadataRoots.schemaVersion.owner !== 'game-state-schema'){
        violations.push('M2E schemaVersion metadata must be owned by game-state-schema');
    }

    for (const [rootName, domain] of Object.entries(contract.domains)){
        validateRootName(rootName, `M2E domain root ${JSON.stringify(rootName)}`, violations);
        if (rootName === 'schemaVersion'){
            violations.push('M2E schemaVersion is GameState metadata and may not be declared as an authoritative domain');
        }
        if (Object.prototype.hasOwnProperty.call(contract.metadataRoots, rootName)){
            violations.push(`M2E root ${rootName} may not be classified as both metadata and an authoritative domain`);
        }
        if (!checkClosedObject(
            domain,
            ['owner', 'schema', 'selectors', 'mutationService'],
            `M2E domain ${rootName}`,
            violations
        )) continue;
        validateOwner(domain.owner, `M2E domain ${rootName}.owner`, violations);

        if (checkClosedObject(domain.schema, ['module', 'validator', 'emptyFactory'], `M2E domain ${rootName}.schema`, violations)){
            validateModulePath(domain.schema.module, `M2E domain ${rootName}.schema.module`, violations);
            validateSymbol(domain.schema.validator, `M2E domain ${rootName}.schema.validator`, violations);
            validateSymbol(domain.schema.emptyFactory, `M2E domain ${rootName}.schema.emptyFactory`, violations);
        }
        if (checkClosedObject(domain.selectors, ['module'], `M2E domain ${rootName}.selectors`, violations)){
            validateModulePath(domain.selectors.module, `M2E domain ${rootName}.selectors.module`, violations);
        }
        if (checkClosedObject(domain.mutationService, ['module', 'factory'], `M2E domain ${rootName}.mutationService`, violations)){
            validateModulePath(domain.mutationService.module, `M2E domain ${rootName}.mutationService.module`, violations);
            validateSymbol(domain.mutationService.factory, `M2E domain ${rootName}.mutationService.factory`, violations);
        }

        if (domain.schema && domain.selectors && domain.mutationService){
            const modules = [domain.schema.module, domain.selectors.module, domain.mutationService.module]
                .filter(value => typeof value === 'string');
            if (new Set(modules).size !== modules.length){
                violations.push(`M2E domain ${rootName} schema, selector, and mutation-service modules must be distinct`);
            }
        }
    }

    return violations;
}

function compareGameStateRoots(actualRoots, contract){
    const violations = [];
    if (!Array.isArray(actualRoots)){
        return ['M2E cannot inspect GAME_STATE_ROOT_FIELDS; ownership review fails closed'];
    }
    if (new Set(actualRoots).size !== actualRoots.length){
        violations.push('M2E GAME_STATE_ROOT_FIELDS must not contain duplicate roots');
    }

    const classifiedRoots = [
        ...Object.keys(contract.metadataRoots || {}),
        ...Object.keys(contract.domains || {}),
    ];
    const actualSet = new Set(actualRoots);
    const classifiedSet = new Set(classifiedRoots);

    for (const rootName of [...actualSet].sort()){
        if (!classifiedSet.has(rootName)){
            violations.push(`M2E GameState root ${JSON.stringify(rootName)} has no reviewed ownership classification`);
        }
    }
    for (const rootName of [...classifiedSet].sort()){
        if (!actualSet.has(rootName)){
            violations.push(`M2E ownership contract contains stale root ${JSON.stringify(rootName)} not present in GameState`);
        }
    }
    return violations;
}

function skipJsonWhitespace(text, index){
    while (index < text.length && /\s/.test(text[index])) index++;
    return index;
}

function scanJsonString(text, index){
    if (text[index] !== '"') throw new Error(`expected JSON string at offset ${index}`);
    let cursor = index + 1;
    while (cursor < text.length){
        if (text[cursor] === '\\'){
            cursor += 2;
            continue;
        }
        if (text[cursor] === '"'){
            const raw = text.slice(index, cursor + 1);
            return { value: JSON.parse(raw), end: cursor + 1 };
        }
        cursor++;
    }
    throw new Error(`unterminated JSON string at offset ${index}`);
}

function skipJsonPrimitive(text, index){
    let cursor = index;
    while (cursor < text.length && !/[\s,\]}]/.test(text[cursor])) cursor++;
    if (cursor === index) throw new Error(`expected JSON value at offset ${index}`);
    return cursor;
}

function scanJsonValue(text, index){
    let cursor = skipJsonWhitespace(text, index);
    if (text[cursor] === '"') return scanJsonString(text, cursor).end;
    if (text[cursor] === '{') return scanJsonObject(text, cursor);
    if (text[cursor] === '[') return scanJsonArray(text, cursor);
    return skipJsonPrimitive(text, cursor);
}

function scanJsonArray(text, index){
    let cursor = skipJsonWhitespace(text, index + 1);
    if (text[cursor] === ']') return cursor + 1;
    while (cursor < text.length){
        cursor = scanJsonValue(text, cursor);
        cursor = skipJsonWhitespace(text, cursor);
        if (text[cursor] === ']') return cursor + 1;
        if (text[cursor] !== ',') throw new Error(`expected JSON array separator at offset ${cursor}`);
        cursor = skipJsonWhitespace(text, cursor + 1);
    }
    throw new Error(`unterminated JSON array at offset ${index}`);
}

function scanJsonObject(text, index){
    const keys = new Set();
    let cursor = skipJsonWhitespace(text, index + 1);
    if (text[cursor] === '}') return cursor + 1;
    while (cursor < text.length){
        const key = scanJsonString(text, cursor);
        if (keys.has(key.value)){
            throw new Error(`duplicate JSON object key ${JSON.stringify(key.value)}`);
        }
        keys.add(key.value);
        cursor = skipJsonWhitespace(text, key.end);
        if (text[cursor] !== ':') throw new Error(`expected JSON object colon at offset ${cursor}`);
        cursor = scanJsonValue(text, cursor + 1);
        cursor = skipJsonWhitespace(text, cursor);
        if (text[cursor] === '}') return cursor + 1;
        if (text[cursor] !== ',') throw new Error(`expected JSON object separator at offset ${cursor}`);
        cursor = skipJsonWhitespace(text, cursor + 1);
    }
    throw new Error(`unterminated JSON object at offset ${index}`);
}

function parseOwnershipContractText(text){
    const start = skipJsonWhitespace(text, 0);
    const end = scanJsonValue(text, start);
    if (skipJsonWhitespace(text, end) !== text.length){
        throw new Error('ownership contract contains trailing JSON content');
    }
    return JSON.parse(text);
}

function readOwnershipContract(root){
    const file = path.join(root, 'tests', 'architecture', CONTRACT_FILE);
    try {
        return parseOwnershipContractText(fs.readFileSync(file, 'utf8'));
    }
    catch (error){
        throw new Error(`M2E ownership contract cannot be read as strict JSON: ${error.message}`);
    }
}

function readGameStateRoots(root){
    const source = fs.readFileSync(path.join(root, ...GAME_STATE_FILE.split('/')), 'utf8');
    return parseStrictGameStateRootFields(source);
}

function repositoryModulePath(root, relativePath){
    return path.resolve(root, ...relativePath.split('/'));
}

function pathEscapes(parent, candidate){
    const relative = path.relative(parent, candidate);
    return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function symlinkSegment(relativePath, root){
    let current = root;
    for (const segment of relativePath.split('/')){
        current = path.join(current, segment);
        if (!fs.existsSync(current)) return null;
        if (fs.lstatSync(current).isSymbolicLink()) return current;
    }
    return null;
}

function inspectOwnedModuleFile(root, relativePath, label, violations){
    if (!validateModulePath(relativePath, label, violations)) return null;
    const file = repositoryModulePath(root, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()){
        violations.push(`${label} does not exist: ${relativePath}`);
        return null;
    }
    const linkedSegment = symlinkSegment(relativePath, root);
    if (linkedSegment){
        violations.push(`${label} may not traverse symbolic links: ${relativePath}`);
        return null;
    }
    const engineStateRoot = fs.realpathSync(path.join(root, 'src', 'engine', 'state'));
    const realFile = fs.realpathSync(file);
    if (pathEscapes(engineStateRoot, realFile)){
        violations.push(`${label} resolves outside the engine state layer: ${relativePath}`);
        return null;
    }
    return { file, realFile };
}

async function importModuleForOwnership(root, relativePath, label, violations){
    const inspected = inspectOwnedModuleFile(root, relativePath, label, violations);
    if (!inspected) return null;
    try {
        return {
            namespace: await import(pathToFileURL(inspected.file).href),
            realFile: inspected.realFile,
        };
    }
    catch (error){
        violations.push(`${label} could not be imported: ${error.message}`);
        return null;
    }
}

function requireFunctionExport(imported, exportName, label, violations){
    if (!imported) return null;
    const value = imported.namespace[exportName];
    if (typeof value !== 'function'){
        violations.push(`${label} must export function ${exportName}`);
        return null;
    }
    return value;
}

function relativeImportTarget(fromRelativePath, specifier){
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function staticNamedImports(source, sourceRelativePath){
    const masked = maskNonCode(source);
    const imports = new Map();
    const pattern = /\bimport\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"\r\n]+)\2\s*;?/g;
    let match;
    while ((match = pattern.exec(source)) !== null){
        if (masked.slice(match.index, match.index + 6) !== 'import') continue;
        const target = relativeImportTarget(sourceRelativePath, match[3]);
        if (!target) continue;
        const bindings = imports.get(target) || new Map();
        const cleanBody = maskNonCode(match[1]);
        for (const part of cleanBody.split(',')){
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

function requireNamedImport(imports, modulePath, exportName, label, violations){
    const bindings = imports.get(modulePath);
    const localName = bindings && bindings.get(exportName);
    if (!localName){
        violations.push(`${label} must statically import ${exportName} from ${modulePath}`);
        return null;
    }
    return localName;
}

function escapeRegex(value){
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function functionCalls(body, localName){
    if (body === null || !localName) return false;
    return new RegExp(`\\b${escapeRegex(localName)}\\s*\\(`).test(maskNonCode(body));
}

function factoryOwnsRootInitialization(body, rootName, localFactory){
    if (body === null || !localFactory) return false;
    return new RegExp(
        `\\b${escapeRegex(rootName)}\\s*:\\s*${escapeRegex(localFactory)}\\s*\\(\\s*\\)`
    ).test(maskNonCode(body));
}

function compositionWiring(source, contract, violations){
    let references;
    try {
        references = extractModuleReferences(source, GAME_STATE_FILE);
    }
    catch (error){
        violations.push(`M2E GameState composition module could not be parsed: ${error.message}`);
        return;
    }
    const namedImports = staticNamedImports(source, GAME_STATE_FILE);
    const referenceTargets = new Set(references
        .filter(reference => reference.kind === 'import-statement')
        .map(reference => relativeImportTarget(GAME_STATE_FILE, reference.specifier))
        .filter(Boolean));
    const emptyBody = extractFunctionBody(source, 'createEmptyGameState');
    const validateBody = extractFunctionBody(source, 'validateGameState');
    const runtimeBody = extractFunctionBody(source, 'createGameStateRuntime');

    for (const [rootName, domain] of Object.entries(contract.domains)){
        for (const modulePath of [domain.schema.module, domain.mutationService.module]){
            if (!referenceTargets.has(modulePath)){
                violations.push(`M2E GameState composition must statically reference declared domain module ${modulePath}`);
            }
        }

        const emptyLocal = requireNamedImport(
            namedImports,
            domain.schema.module,
            domain.schema.emptyFactory,
            `M2E domain ${rootName} composition`,
            violations
        );
        const validatorLocal = requireNamedImport(
            namedImports,
            domain.schema.module,
            domain.schema.validator,
            `M2E domain ${rootName} composition`,
            violations
        );
        const serviceLocal = requireNamedImport(
            namedImports,
            domain.mutationService.module,
            domain.mutationService.factory,
            `M2E domain ${rootName} composition`,
            violations
        );

        if (!factoryOwnsRootInitialization(emptyBody, rootName, emptyLocal)){
            violations.push(`M2E createEmptyGameState() must initialize ${rootName} directly through ${domain.schema.emptyFactory}()`);
        }
        if (!functionCalls(validateBody, validatorLocal)){
            violations.push(`M2E validateGameState() must call declared validator ${domain.schema.validator} for ${rootName}`);
        }
        if (!functionCalls(runtimeBody, serviceLocal)){
            violations.push(`M2E createGameStateRuntime() must call declared mutation-service factory ${domain.mutationService.factory} for ${rootName}`);
        }
    }
}

async function inspectDomainImplementations(root, contract, actualRoots, violations){
    const gameStateSource = fs.readFileSync(repositoryModulePath(root, GAME_STATE_FILE), 'utf8');
    compositionWiring(gameStateSource, contract, violations);

    const gameStateModule = await importModuleForOwnership(
        root,
        GAME_STATE_FILE,
        'M2E GameState module',
        violations
    );
    const createEmptyGameState = requireFunctionExport(
        gameStateModule,
        'createEmptyGameState',
        'M2E GameState module',
        violations
    );
    const validateGameState = requireFunctionExport(
        gameStateModule,
        'validateGameState',
        'M2E GameState module',
        violations
    );

    let gameStateDefault;
    let gameStateDefaultCreated = false;
    if (createEmptyGameState){
        try {
            gameStateDefault = createEmptyGameState();
            gameStateDefaultCreated = true;
        }
        catch (error){
            violations.push(`M2E GameState empty factory threw: ${error.message}`);
        }
    }
    if (gameStateDefaultCreated){
        if (!isPlainObject(gameStateDefault)){
            violations.push('M2E createEmptyGameState() must return a plain root object');
        }
        else {
            const defaultRoots = Object.keys(gameStateDefault).sort();
            const expectedRoots = [...actualRoots].sort();
            if (!isDeepStrictEqual(defaultRoots, expectedRoots)){
                violations.push(`M2E GameState empty factory roots ${JSON.stringify(defaultRoots)} do not match GAME_STATE_ROOT_FIELDS ${JSON.stringify(expectedRoots)}`);
            }
        }
        if (validateGameState){
            try {
                const validatedRoot = validateGameState(gameStateDefault);
                if (!isDeepStrictEqual(validatedRoot, gameStateDefault)){
                    violations.push('M2E createEmptyGameState() must already return validateGameState() canonical root state');
                }
            }
            catch (error){
                violations.push(`M2E GameState empty state fails validateGameState(): ${error.message}`);
            }
        }
    }

    for (const [rootName, domain] of Object.entries(contract.domains)){
        const schemaModule = await importModuleForOwnership(
            root,
            domain.schema.module,
            `M2E domain ${rootName} schema module`,
            violations
        );
        const selectorModule = await importModuleForOwnership(
            root,
            domain.selectors.module,
            `M2E domain ${rootName} selector module`,
            violations
        );
        const serviceModule = await importModuleForOwnership(
            root,
            domain.mutationService.module,
            `M2E domain ${rootName} mutation-service module`,
            violations
        );

        const realModules = [schemaModule, selectorModule, serviceModule]
            .filter(Boolean)
            .map(module => module.realFile);
        if (realModules.length === 3 && new Set(realModules).size !== 3){
            violations.push(`M2E domain ${rootName} schema, selector, and mutation-service paths must resolve to distinct real files`);
        }

        const validator = requireFunctionExport(
            schemaModule,
            domain.schema.validator,
            `M2E domain ${rootName} schema module`,
            violations
        );
        const emptyFactory = requireFunctionExport(
            schemaModule,
            domain.schema.emptyFactory,
            `M2E domain ${rootName} schema module`,
            violations
        );
        requireFunctionExport(
            serviceModule,
            domain.mutationService.factory,
            `M2E domain ${rootName} mutation-service module`,
            violations
        );

        if (selectorModule){
            const selectorFunctions = Object.entries(selectorModule.namespace)
                .filter(([, value]) => typeof value === 'function')
                .map(([name]) => name)
                .sort();
            if (selectorFunctions.length === 0){
                violations.push(`M2E domain ${rootName} selector module must export at least one named selector function`);
            }
        }

        let emptyState;
        let emptyStateCreated = false;
        if (emptyFactory){
            try {
                emptyState = emptyFactory();
                emptyStateCreated = true;
            }
            catch (error){
                violations.push(`M2E domain ${rootName} empty factory threw: ${error.message}`);
            }
        }
        if (validator && emptyStateCreated){
            try {
                const validated = validator(emptyState);
                if (validated === undefined){
                    violations.push(`M2E domain ${rootName} validator returned undefined for its empty state`);
                }
                else if (!isDeepStrictEqual(validated, emptyState)){
                    violations.push(`M2E domain ${rootName} empty factory must already return the validator's canonical empty representation`);
                }
            }
            catch (error){
                violations.push(`M2E domain ${rootName} empty state fails its declared validator: ${error.message}`);
            }
        }
        if (gameStateDefaultCreated && isRecord(gameStateDefault) && emptyStateCreated){
            if (!Object.prototype.hasOwnProperty.call(gameStateDefault, rootName)){
                violations.push(`M2E GameState empty factory omits authoritative domain ${rootName}`);
            }
            else if (!isDeepStrictEqual(gameStateDefault[rootName], emptyState)){
                violations.push(`M2E GameState empty domain ${rootName} must exactly match ${domain.schema.emptyFactory}()`);
            }
        }
    }
}

async function scanStateOwnership(root, contract = readOwnershipContract(root)){
    const violations = validateOwnershipContractShape(contract);
    if (violations.length){
        return {
            summary: { contractVersion: contract && contract.contractVersion, metadataRootCount: 0, domainCount: 0, rootCount: 0 },
            violations,
        };
    }

    const actualRoots = readGameStateRoots(root);
    violations.push(...compareGameStateRoots(actualRoots, contract));
    if (Array.isArray(actualRoots)){
        await inspectDomainImplementations(root, contract, actualRoots, violations);
    }

    return {
        summary: {
            contractVersion: contract.contractVersion,
            rootCount: Array.isArray(actualRoots) ? actualRoots.length : 0,
            metadataRootCount: Object.keys(contract.metadataRoots).length,
            domainCount: Object.keys(contract.domains).length,
            metadataRoots: Object.keys(contract.metadataRoots).sort(),
            domains: Object.entries(contract.domains)
                .map(([rootName, domain]) => ({ root: rootName, owner: domain.owner }))
                .sort((a, b) => a.root.localeCompare(b.root)),
        },
        violations: violations.sort(),
    };
}

async function runStateOwnershipCheck(root, logger = console){
    const result = await scanStateOwnership(root);
    logger.log('M2E1 state-domain ownership summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2E1 state-domain ownership violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2E1 state-domain ownership gate passed.');
    return { exitCode: 0, result };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = (await runStateOwnershipCheck(root)).exitCode;
}

module.exports = {
    CONTRACT_VERSION,
    validateOwnershipContractShape,
    validateModulePath,
    compareGameStateRoots,
    parseOwnershipContractText,
    readOwnershipContract,
    readGameStateRoots,
    compositionWiring,
    scanStateOwnership,
    runStateOwnershipCheck,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
