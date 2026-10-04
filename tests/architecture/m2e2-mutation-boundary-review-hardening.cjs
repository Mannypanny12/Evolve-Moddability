'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const { parseStrictStringArrayBody } = require('./m2c-syntax-hardening.cjs');
const {
    parseOwnershipContractText,
    readOwnershipContract,
} = require('./m2e1-state-ownership-fitness.cjs');
const {
    GAME_STATE_FILE,
    STATE_STORE_FILE,
    expectedWritableRoots,
} = require('./m2e2-mutation-boundary-fitness.cjs');

const SURFACE_CONTRACT_VERSION = 1;
const SURFACE_CONTRACT_FILE = 'm2e2-mutation-surface-contract.json';
const SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);
const IDENTIFIER_PATTERN = /^[$A-Z_a-z][$\w]*$/;
const READ_STORE_KEYS = Object.freeze([
    'getLastChange',
    'getRevision',
    'read',
    'select',
    'snapshot',
]);

function isRecord(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sorted(value){
    return [...value].sort();
}

function escapeRegex(value){
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function validateMutationSurfaceContract(contract, ownershipContract){
    const violations = [];
    if (!checkClosedObject(contract, ['contractVersion', 'domains'], 'M2E2 mutation-surface contract', violations)){
        return violations;
    }
    if (contract.contractVersion !== SURFACE_CONTRACT_VERSION){
        violations.push(`M2E2 mutation-surface contractVersion must be ${SURFACE_CONTRACT_VERSION}`);
    }
    if (!isRecord(contract.domains)){
        violations.push('M2E2 mutation-surface domains must be an object');
        return violations;
    }

    const actualRoots = Object.keys(contract.domains).sort();
    const expectedRoots = Object.keys(ownershipContract.domains || {}).sort();
    if (!isDeepStrictEqual(actualRoots, expectedRoots)){
        violations.push(`M2E2 mutation-surface domains must exactly match ownership domains ${JSON.stringify(expectedRoots)}; got ${JSON.stringify(actualRoots)}`);
    }

    for (const [rootName, entry] of Object.entries(contract.domains)){
        if (!checkClosedObject(entry, ['publicMethods'], `M2E2 mutation surface ${rootName}`, violations)) continue;
        if (!Array.isArray(entry.publicMethods) || entry.publicMethods.length === 0){
            violations.push(`M2E2 mutation surface ${rootName}.publicMethods must be a non-empty array`);
            continue;
        }
        const seen = new Set();
        for (const method of entry.publicMethods){
            if (typeof method !== 'string' || !IDENTIFIER_PATTERN.test(method)){
                violations.push(`M2E2 mutation surface ${rootName}.publicMethods must contain only JavaScript identifier names`);
                continue;
            }
            if (seen.has(method)){
                violations.push(`M2E2 mutation surface ${rootName}.publicMethods contains duplicate ${JSON.stringify(method)}`);
            }
            seen.add(method);
        }
    }
    return violations;
}

function readMutationSurfaceContract(root){
    const file = path.join(root, 'tests', 'architecture', SURFACE_CONTRACT_FILE);
    try {
        return parseOwnershipContractText(fs.readFileSync(file, 'utf8'));
    }
    catch (error){
        throw new Error(`M2E2 mutation-surface contract cannot be read as strict JSON: ${error.message}`);
    }
}

function parseExecutableFrozenStringArray(source, constantName){
    const name = escapeRegex(constantName);
    const pattern = new RegExp(
        `const\\s+${name}\\s*=\\s*Object\\.freeze\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)\\s*;`,
        'g'
    );
    const masked = maskNonCode(source);
    const executable = [];
    let match;
    while ((match = pattern.exec(source)) !== null){
        if (masked.slice(match.index, match.index + 5) !== 'const') continue;
        executable.push(match);
    }
    if (executable.length !== 1) return null;
    const values = parseStrictStringArrayBody(executable[0][1]);
    if (!Array.isArray(values) || new Set(values).size !== values.length) return null;
    return values;
}

function countCodeIdentifier(source, identifier){
    const matches = maskNonCode(source).match(new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g'));
    return matches ? matches.length : 0;
}

function executableDeclarationViolations(source, ownershipContract){
    const violations = [];
    const expectedRoots = expectedWritableRoots(ownershipContract);
    const readOnly = parseExecutableFrozenStringArray(source, 'GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS');
    const runtime = parseExecutableFrozenStringArray(source, 'GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS');

    if (!isDeepStrictEqual(readOnly, [])){
        violations.push('M2E2 hardening requires one executable frozen literal read-only writable-root declaration equal to []');
    }
    if (!isDeepStrictEqual(runtime && sorted(runtime), sorted(expectedRoots))){
        violations.push(`M2E2 hardening requires one executable frozen literal runtime writable-root declaration equal to ${JSON.stringify(expectedRoots)}`);
    }

    if (countCodeIdentifier(source, 'createGameStateInfrastructure') !== 3){
        violations.push('M2E2 createGameStateInfrastructure may appear only in its declaration and the two reviewed direct callers; aliases are forbidden');
    }
    return violations;
}

function stripSpecifierSuffix(specifier){
    const query = specifier.indexOf('?');
    const hash = specifier.indexOf('#');
    let end = specifier.length;
    if (query >= 0) end = Math.min(end, query);
    if (hash >= 0) end = Math.min(end, hash);
    return specifier.slice(0, end);
}

function resolveRealLocalImport(sourceFile, specifier){
    if (typeof specifier !== 'string') return null;
    const clean = stripSpecifierSuffix(specifier);
    if (!clean.startsWith('.')) return null;
    const base = path.resolve(path.dirname(sourceFile), clean);
    const candidates = [base];
    if (!path.extname(base)){
        for (const extension of SOURCE_EXTENSIONS) candidates.push(base + extension);
    }
    for (const candidate of candidates){
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
        }
        catch {
            return null;
        }
    }
    return null;
}

function collectProductionSources(dir, root, violations){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            files.push(...collectProductionSources(full, root, violations));
            continue;
        }
        if (entry.isSymbolicLink()){
            let stat;
            try {
                stat = fs.statSync(full);
            }
            catch (error){
                violations.push(`${path.relative(root, full)}: M2E2 cannot inspect production symlink target: ${error.message}`);
                continue;
            }
            if (stat.isDirectory()){
                violations.push(`${path.relative(root, full)}: M2E2 production source directory symlinks are not allowed because they can hide capability consumers`);
                continue;
            }
            if (stat.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) files.push(full);
            continue;
        }
        if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function canonicalCapabilityConsumerViolations(root, ownershipContract){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    const files = collectProductionSources(srcRoot, root, violations);
    const gameStateFile = path.join(root, ...GAME_STATE_FILE.split('/'));
    const stateStoreFile = path.join(root, ...STATE_STORE_FILE.split('/'));
    let gameStateReal;
    let stateStoreReal;
    try {
        gameStateReal = fs.realpathSync(gameStateFile);
        stateStoreReal = fs.realpathSync(stateStoreFile);
    }
    catch (error){
        violations.push(`M2E2 cannot resolve canonical GameState capability modules: ${error.message}`);
        return violations;
    }

    const serviceTargets = new Map();
    for (const [rootName, domain] of Object.entries(ownershipContract.domains)){
        try {
            serviceTargets.set(fs.realpathSync(path.join(root, ...domain.mutationService.module.split('/'))), rootName);
        }
        catch (error){
            violations.push(`M2E2 cannot resolve canonical ${rootName} mutation-service module: ${error.message}`);
        }
    }

    for (const file of files){
        let sourceReal;
        try {
            sourceReal = fs.realpathSync(file);
        }
        catch (error){
            violations.push(`${path.relative(root, file)}: M2E2 cannot resolve production source: ${error.message}`);
            continue;
        }
        let references;
        try {
            references = extractModuleReferences(fs.readFileSync(file, 'utf8'), file);
        }
        catch (error){
            violations.push(`${path.relative(root, file)}: M2E2 cannot parse production module references during canonical hardening: ${error.message}`);
            continue;
        }
        for (const reference of references){
            const target = resolveRealLocalImport(file, reference.specifier);
            if (!target) continue;
            if (target === stateStoreReal && sourceReal !== gameStateReal){
                violations.push(`${path.relative(root, file)}: M2E2 canonical import identity reveals an unreviewed state-store.mjs consumer`);
            }
            const serviceRoot = serviceTargets.get(target);
            if (serviceRoot && sourceReal !== gameStateReal){
                violations.push(`${path.relative(root, file)}: M2E2 canonical import identity reveals an unreviewed ${serviceRoot} mutation-service consumer`);
            }
        }
    }
    return violations;
}

function inspectClosedDataSurface(value, expectedKeys, label, violations, { functions = false } = {}){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')){
        violations.push(`${label} must be an object capability surface`);
        return false;
    }
    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch (error){
        violations.push(`${label} keys could not be inspected: ${error.message}`);
        return false;
    }
    const symbolKeys = keys.filter(key => typeof key === 'symbol');
    if (symbolKeys.length){
        violations.push(`${label} may not hide capabilities behind symbol keys`);
    }
    const stringKeys = keys.filter(key => typeof key === 'string').sort();
    const expected = [...expectedKeys].sort();
    if (!isDeepStrictEqual(stringKeys, expected)){
        violations.push(`${label} keys must be exactly ${JSON.stringify(expected)}; got ${JSON.stringify(stringKeys)}`);
    }

    for (const key of expectedKeys){
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch (error){
            violations.push(`${label}.${key} descriptor could not be inspected: ${error.message}`);
            continue;
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            violations.push(`${label}.${key} must be an enumerable data field, not an accessor`);
            continue;
        }
        if (functions && typeof descriptor.value !== 'function'){
            violations.push(`${label}.${key} must be a function`);
        }
    }
    return symbolKeys.length === 0 && isDeepStrictEqual(stringKeys, expected);
}

function rejected(factory, options){
    try {
        factory(options);
        return false;
    }
    catch {
        return true;
    }
}

function hostileCapabilityInputs(rootName, owner, transaction){
    const symbolScope = { id: owner, fields: [rootName], transaction };
    symbolScope[Symbol('hidden')] = true;

    const exoticScope = Object.create({ inherited: true });
    Object.assign(exoticScope, { id: owner, fields: [rootName], transaction });

    const accessorScope = { fields: [rootName], transaction };
    Object.defineProperty(accessorScope, 'id', {
        enumerable: true,
        get(){ return owner; },
    });

    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'mutationScope', {
        enumerable: true,
        get(){ return { id: owner, fields: [rootName], transaction }; },
    });

    const symbolOptions = { mutationScope: { id: owner, fields: [rootName], transaction } };
    symbolOptions[Symbol('hidden')] = true;

    const exoticOptions = Object.create({ inherited: true });
    exoticOptions.mutationScope = { id: owner, fields: [rootName], transaction };

    return [
        { mutationScope: { id: `${owner}-wrong`, fields: [rootName], transaction } },
        { mutationScope: { id: owner, fields: [`${rootName}Wrong`], transaction } },
        { mutationScope: { id: owner, fields: [rootName, `${rootName}Extra`], transaction } },
        { mutationScope: { id: owner, fields: [rootName] } },
        { mutationScope: { id: owner, fields: [rootName], transaction, extra: true } },
        { mutationScope: symbolScope },
        { mutationScope: exoticScope },
        { mutationScope: accessorScope },
        { mutationScope: { id: owner, fields: [rootName], transaction }, extra: true },
        accessorOptions,
        symbolOptions,
        exoticOptions,
    ];
}

async function importModule(root, relativePath){
    return import(pathToFileURL(path.join(root, ...relativePath.split('/'))).href);
}

async function runtimeSurfaceHardeningViolations(root, ownershipContract, surfaceContract){
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
        return [`M2E2 hardening could not import state capability modules: ${error.message}`];
    }

    try {
        const infrastructure = storeModule.createStateStore({
            initialState: { alpha: {} },
            validateState: value => value,
            writableFields: ['alpha'],
        });
        inspectClosedDataSurface(infrastructure, ['store', 'mutationAuthority'], 'M2E2 state-store infrastructure', violations);
        inspectClosedDataSurface(infrastructure.store, READ_STORE_KEYS, 'M2E2 read store', violations, { functions: true });
        inspectClosedDataSurface(infrastructure.mutationAuthority, ['createMutationScope'], 'M2E2 mutationAuthority', violations, { functions: true });
        if (!Object.isFrozen(infrastructure) || !Object.isFrozen(infrastructure.store) || !Object.isFrozen(infrastructure.mutationAuthority)){
            violations.push('M2E2 state-store infrastructure and capability facades must remain frozen');
        }

        const scope = infrastructure.mutationAuthority.createMutationScope({ id: 'm2e2-hardening-probe', fields: ['alpha'] });
        inspectClosedDataSurface(scope, ['id', 'fields', 'transaction'], 'M2E2 mutation scope', violations);
        if (!Object.isFrozen(scope) || !Object.isFrozen(scope.fields)){
            violations.push('M2E2 mutation scope and its field list must remain frozen');
        }
        if (scope.id !== 'm2e2-hardening-probe' || !isDeepStrictEqual(scope.fields, ['alpha']) || typeof scope.transaction !== 'function'){
            violations.push('M2E2 mutation scope must preserve the reviewed id, exact fields, and transaction function');
        }
    }
    catch (error){
        violations.push(`M2E2 low-level capability hardening probe failed: ${error.message}`);
    }

    let runtime;
    try {
        runtime = gameStateModule.createGameStateRuntime();
        inspectClosedDataSurface(runtime, ['store', ...expectedWritableRoots(ownershipContract)], 'M2E2 GameState runtime', violations);
        if (!Object.isFrozen(runtime)) violations.push('M2E2 GameState runtime must remain frozen');
    }
    catch (error){
        violations.push(`M2E2 GameState runtime hardening probe failed: ${error.message}`);
    }

    for (const [rootName, domain] of Object.entries(ownershipContract.domains)){
        const reviewedMethods = surfaceContract.domains[rootName].publicMethods;
        let module;
        try {
            module = await importModule(root, domain.mutationService.module);
        }
        catch (error){
            violations.push(`M2E2 ${rootName} mutation-service hardening import failed: ${error.message}`);
            continue;
        }
        const factory = module[domain.mutationService.factory];
        if (typeof factory !== 'function'){
            violations.push(`M2E2 ${rootName} declared mutation-service factory is not callable`);
            continue;
        }

        let transactionCalls = 0;
        const transaction = () => {
            transactionCalls++;
            throw new Error('M2E2 service construction must not execute transaction authority');
        };
        const validScope = Object.freeze({
            id: domain.owner,
            fields: Object.freeze([rootName]),
            transaction,
        });
        let service;
        try {
            service = factory({ mutationScope: validScope });
        }
        catch (error){
            violations.push(`M2E2 ${rootName} service rejected its reviewed capability during hardening: ${error.message}`);
            continue;
        }
        if (transactionCalls !== 0) violations.push(`M2E2 ${rootName} service construction executed transaction authority`);
        inspectClosedDataSurface(service, reviewedMethods, `M2E2 ${rootName} semantic service`, violations, { functions: true });
        if (!Object.isFrozen(service)) violations.push(`M2E2 ${rootName} semantic service must remain frozen`);
        for (const method of reviewedMethods){
            const descriptor = Object.getOwnPropertyDescriptor(service, method);
            if (descriptor && descriptor.value === transaction){
                violations.push(`M2E2 ${rootName}.${method} may not expose the raw transaction closure directly`);
            }
        }

        if (runtime && Object.prototype.hasOwnProperty.call(runtime, rootName)){
            inspectClosedDataSurface(runtime[rootName], reviewedMethods, `M2E2 runtime.${rootName}`, violations, { functions: true });
            if (!Object.isFrozen(runtime[rootName])) violations.push(`M2E2 runtime.${rootName} service must remain frozen`);
        }

        for (const hostile of hostileCapabilityInputs(rootName, domain.owner, transaction)){
            if (!rejected(factory, hostile)){
                violations.push(`M2E2 ${rootName} mutation service accepted a hostile or widened capability/options shape`);
                break;
            }
        }
    }

    return violations;
}

async function scanMutationBoundaryReviewHardening(
    root,
    ownershipContract = readOwnershipContract(root),
    surfaceContract = readMutationSurfaceContract(root)
){
    const surfaceViolations = validateMutationSurfaceContract(surfaceContract, ownershipContract);
    if (surfaceViolations.length){
        return {
            summary: {
                surfaceContractVersion: surfaceContract && surfaceContract.contractVersion,
                domainCount: 0,
                violationCount: surfaceViolations.length,
            },
            violations: surfaceViolations.sort(),
        };
    }

    const gameStateSource = fs.readFileSync(path.join(root, ...GAME_STATE_FILE.split('/')), 'utf8');
    const violations = [
        ...executableDeclarationViolations(gameStateSource, ownershipContract),
        ...canonicalCapabilityConsumerViolations(root, ownershipContract),
        ...await runtimeSurfaceHardeningViolations(root, ownershipContract, surfaceContract),
    ].sort();

    return {
        summary: {
            surfaceContractVersion: surfaceContract.contractVersion,
            domainCount: Object.keys(ownershipContract.domains).length,
            reviewedSurfaces: Object.entries(surfaceContract.domains)
                .map(([rootName, entry]) => ({ root: rootName, publicMethods: [...entry.publicMethods].sort() }))
                .sort((a, b) => a.root.localeCompare(b.root)),
            violationCount: violations.length,
        },
        violations,
    };
}

async function runMutationBoundaryReviewHardening(root, logger = console){
    const result = await scanMutationBoundaryReviewHardening(root);
    logger.log('M2E2 mutation-boundary review-hardening summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2E2 mutation-boundary review-hardening violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2E2 mutation-boundary review-hardening gate passed.');
    return { exitCode: 0, result };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = (await runMutationBoundaryReviewHardening(root)).exitCode;
}

module.exports = {
    SURFACE_CONTRACT_VERSION,
    validateMutationSurfaceContract,
    readMutationSurfaceContract,
    parseExecutableFrozenStringArray,
    executableDeclarationViolations,
    stripSpecifierSuffix,
    resolveRealLocalImport,
    canonicalCapabilityConsumerViolations,
    inspectClosedDataSurface,
    hostileCapabilityInputs,
    runtimeSurfaceHardeningViolations,
    scanMutationBoundaryReviewHardening,
    runMutationBoundaryReviewHardening,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
