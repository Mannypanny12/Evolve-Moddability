'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { parseStrictGameStateRootFields } = require('./m2c-syntax-hardening.cjs');

const CONTRACT_VERSION = 1;
const CONTRACT_FILE = 'm2e-state-domain-contract.json';
const GAME_STATE_FILE = path.join('src', 'engine', 'state', 'game-state.mjs');
const ENGINE_STATE_PREFIX = 'src/engine/state/';
const ROOT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const OWNER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SYMBOL_PATTERN = /^[$A-Z_a-z][$\w]*$/;

function isRecord(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function readOwnershipContract(root){
    const file = path.join(root, 'tests', 'architecture', CONTRACT_FILE);
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch (error){
        throw new Error(`M2E ownership contract cannot be read as JSON: ${error.message}`);
    }
    return parsed;
}

function readGameStateRoots(root){
    const source = fs.readFileSync(path.join(root, GAME_STATE_FILE), 'utf8');
    return parseStrictGameStateRootFields(source);
}

function repositoryModulePath(root, relativePath){
    return path.resolve(root, ...relativePath.split('/'));
}

async function importModuleForOwnership(root, relativePath, label, violations){
    if (!validateModulePath(relativePath, label, violations)) return null;
    const file = repositoryModulePath(root, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()){
        violations.push(`${label} does not exist: ${relativePath}`);
        return null;
    }
    try {
        return await import(pathToFileURL(file).href);
    }
    catch (error){
        violations.push(`${label} could not be imported: ${error.message}`);
        return null;
    }
}

function requireFunctionExport(moduleNamespace, exportName, label, violations){
    if (!moduleNamespace) return null;
    const value = moduleNamespace[exportName];
    if (typeof value !== 'function'){
        violations.push(`${label} must export function ${exportName}`);
        return null;
    }
    return value;
}

async function inspectDomainImplementations(root, contract, actualRoots, violations){
    const gameStateModule = await importModuleForOwnership(
        root,
        GAME_STATE_FILE.split(path.sep).join('/'),
        'M2E GameState module',
        violations
    );
    const createEmptyGameState = requireFunctionExport(
        gameStateModule,
        'createEmptyGameState',
        'M2E GameState module',
        violations
    );
    let gameStateDefault = null;
    if (createEmptyGameState){
        try {
            gameStateDefault = createEmptyGameState();
        }
        catch (error){
            violations.push(`M2E GameState empty factory threw: ${error.message}`);
        }
    }
    if (gameStateDefault && isRecord(gameStateDefault)){
        const defaultRoots = Object.keys(gameStateDefault).sort();
        const expectedRoots = [...actualRoots].sort();
        if (!isDeepStrictEqual(defaultRoots, expectedRoots)){
            violations.push(`M2E GameState empty factory roots ${JSON.stringify(defaultRoots)} do not match GAME_STATE_ROOT_FIELDS ${JSON.stringify(expectedRoots)}`);
        }
    }
    else if (gameStateDefault !== null){
        violations.push('M2E createEmptyGameState() must return a plain root object');
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
            const selectorFunctions = Object.entries(selectorModule)
                .filter(([, value]) => typeof value === 'function')
                .map(([name]) => name)
                .sort();
            if (selectorFunctions.length === 0){
                violations.push(`M2E domain ${rootName} selector module must export at least one named selector function`);
            }
        }

        let emptyState;
        if (emptyFactory){
            try {
                emptyState = emptyFactory();
            }
            catch (error){
                violations.push(`M2E domain ${rootName} empty factory threw: ${error.message}`);
            }
        }
        if (validator && emptyFactory && emptyState !== undefined){
            let validated;
            try {
                validated = validator(emptyState);
            }
            catch (error){
                violations.push(`M2E domain ${rootName} empty state fails its declared validator: ${error.message}`);
            }
            if (validated !== undefined && !isDeepStrictEqual(validated, emptyState)){
                violations.push(`M2E domain ${rootName} empty factory must already return the validator's canonical empty representation`);
            }
        }
        if (gameStateDefault && emptyFactory && emptyState !== undefined){
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
    readOwnershipContract,
    readGameStateRoots,
    scanStateOwnership,
    runStateOwnershipCheck,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
