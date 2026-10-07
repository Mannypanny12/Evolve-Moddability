'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const IDENTITY_MODULE = 'src/engine/identity.mjs';
const REGISTRY_MODULE = 'src/engine/registry.mjs';
const DEFINITIONS_DIR = 'src/engine/definitions';
const RUNTIME_DIR = 'src/engine/runtime';
const INSPECTION_DIR = 'src/engine/inspection';
const RUNTIME_ENVIRONMENT_MODULE = 'src/engine/runtime/environment.mjs';
const CORE_DEFINITION_FAMILIES = Object.freeze(['achievement', 'resource', 'technology']);
const CORE_RUNTIME_PORTS = Object.freeze(['clock', 'logger', 'rng', 'storage']);

function relativeModulePath(root, file){
    return path.relative(root, file).split(path.sep).join('/');
}

function listMjsFiles(directory){
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
        .map(entry => path.join(directory, entry.name))
        .sort();
}

async function importModule(root, relativePath, label, violations){
    const file = path.join(root, ...relativePath.split('/'));
    if (!fs.existsSync(file)){
        violations.push(`M1 inspector missing ${label}: ${relativePath}`);
        return null;
    }
    try {
        return await import(pathToFileURL(file).href);
    }
    catch (error){
        violations.push(`M1 inspector could not import ${label} ${relativePath}: ${error.message}`);
        return null;
    }
}

function exportedNames(module){
    return module ? Object.keys(module).sort() : [];
}

function matchingExports(module, predicate){
    return Object.entries(module || {}).filter(([name]) => predicate(name));
}

async function inspectDefinitionFamilies(root, violations){
    const directory = path.join(root, ...DEFINITIONS_DIR.split('/'));
    const files = listMjsFiles(directory).filter(file => path.basename(file) !== 'common.mjs');
    const families = [];
    const extensionModules = [];

    for (const file of files){
        const relativePath = relativeModulePath(root, file);
        const stem = path.basename(file, '.mjs');
        const module = await importModule(root, relativePath, `definition module ${stem}`, violations);
        if (!module) continue;

        const schemaExports = matchingExports(module, name => name.endsWith('_DEFINITION_SCHEMA_VERSION'));
        const validatorExports = matchingExports(module, name => /^validate.+Definition$/.test(name));
        const factoryExports = matchingExports(module, name => /^create.+Registry$/.test(name));
        const looksLikeFamily = schemaExports.length > 0 || validatorExports.length > 0 || factoryExports.length > 0;

        if (!looksLikeFamily){
            extensionModules.push({ module: relativePath, exports: exportedNames(module) });
            continue;
        }

        if (schemaExports.length !== 1){
            violations.push(`M1 definition ${relativePath} must export exactly one *_DEFINITION_SCHEMA_VERSION`);
        }
        if (validatorExports.length !== 1 || typeof validatorExports[0]?.[1] !== 'function'){
            violations.push(`M1 definition ${relativePath} must export exactly one validate*Definition function`);
        }
        if (factoryExports.length !== 1 || typeof factoryExports[0]?.[1] !== 'function'){
            violations.push(`M1 definition ${relativePath} must export exactly one create*Registry function`);
        }

        const schemaVersion = schemaExports[0]?.[1];
        if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1){
            violations.push(`M1 definition ${relativePath} has invalid schema version ${JSON.stringify(schemaVersion)}`);
        }

        let registryType = null;
        if (factoryExports.length === 1 && typeof factoryExports[0][1] === 'function'){
            try {
                const registry = factoryExports[0][1]();
                registryType = registry?.type ?? null;
            }
            catch (error){
                violations.push(`M1 definition ${relativePath} registry factory threw: ${error.message}`);
            }
        }
        if (registryType !== stem){
            violations.push(
                `M1 definition ${relativePath} registry type ${JSON.stringify(registryType)} must match module family ${JSON.stringify(stem)}`
            );
        }

        families.push({
            family: stem,
            module: relativePath,
            schemaVersion: Number.isSafeInteger(schemaVersion) ? schemaVersion : null,
            validator: validatorExports[0]?.[0] || null,
            registryFactory: factoryExports[0]?.[0] || null,
            registryType,
            exports: exportedNames(module),
        });
    }

    const discovered = new Set(families.map(value => value.family));
    for (const family of CORE_DEFINITION_FAMILIES){
        if (!discovered.has(family)) violations.push(`M1 core definition family ${family} is missing`);
    }

    return {
        families: families.sort((a, b) => a.family.localeCompare(b.family)),
        extensionModules: extensionModules.sort((a, b) => a.module.localeCompare(b.module)),
    };
}

async function inspectRuntime(root, violations){
    const directory = path.join(root, ...RUNTIME_DIR.split('/'));
    const files = listMjsFiles(directory)
        .filter(file => !['common.mjs', 'environment.mjs'].includes(path.basename(file)));
    const ports = [];
    const extensionModules = [];

    for (const file of files){
        const relativePath = relativeModulePath(root, file);
        const port = path.basename(file, '.mjs');
        const module = await importModule(root, relativePath, `runtime module ${port}`, violations);
        if (!module) continue;

        if (!CORE_RUNTIME_PORTS.includes(port)){
            extensionModules.push({ module: relativePath, exports: exportedNames(module) });
            continue;
        }

        const expectedFactory = 'create' + port[0].toUpperCase() + port.slice(1);
        if (typeof module[expectedFactory] !== 'function'){
            violations.push(`M1 runtime port ${relativePath} must export ${expectedFactory}()`);
        }
        ports.push({
            port,
            module: relativePath,
            factory: typeof module[expectedFactory] === 'function' ? expectedFactory : null,
            exports: exportedNames(module),
        });
    }

    const discovered = new Set(ports.map(value => value.port));
    for (const port of CORE_RUNTIME_PORTS){
        if (!discovered.has(port)) violations.push(`M1 core runtime port ${port} is missing`);
    }

    const environment = await importModule(
        root,
        RUNTIME_ENVIRONMENT_MODULE,
        'runtime environment composition',
        violations
    );
    if (environment && typeof environment.createRuntimeEnvironment !== 'function'){
        violations.push('M1 runtime environment must export createRuntimeEnvironment()');
    }

    return {
        corePortCount: ports.length,
        ports: ports.sort((a, b) => a.port.localeCompare(b.port)),
        extensionModules: extensionModules.sort((a, b) => a.module.localeCompare(b.module)),
        environment: {
            module: RUNTIME_ENVIRONMENT_MODULE,
            factory: environment && typeof environment.createRuntimeEnvironment === 'function'
                ? 'createRuntimeEnvironment'
                : null,
            exports: exportedNames(environment),
        },
    };
}

async function inspectInspectionSurface(root, violations){
    const directory = path.join(root, ...INSPECTION_DIR.split('/'));
    const modules = [];
    for (const file of listMjsFiles(directory)){
        const relativePath = relativeModulePath(root, file);
        const module = await importModule(root, relativePath, `inspection module ${relativePath}`, violations);
        modules.push({ module: relativePath, exports: exportedNames(module) });
    }
    return {
        moduleCount: modules.length,
        modules,
    };
}

async function scanM1Kernel(root){
    const violations = [];
    const identity = await importModule(root, IDENTITY_MODULE, 'identity module', violations);
    const registry = await importModule(root, REGISTRY_MODULE, 'registry module', violations);

    if (identity && exportedNames(identity).length === 0){
        violations.push('M1 identity module must expose a non-empty public kernel surface');
    }
    if (registry && typeof registry.Registry !== 'function'){
        violations.push('M1 registry module must export Registry');
    }

    const definitionInspection = await inspectDefinitionFamilies(root, violations);
    const runtime = await inspectRuntime(root, violations);
    const inspection = await inspectInspectionSurface(root, violations);

    return {
        summary: {
            identity: {
                module: IDENTITY_MODULE,
                exports: exportedNames(identity),
            },
            registry: {
                module: REGISTRY_MODULE,
                exports: exportedNames(registry),
                registryClass: registry && typeof registry.Registry === 'function' ? 'Registry' : null,
            },
            definitions: {
                coreFamilies: [...CORE_DEFINITION_FAMILIES],
                familyCount: definitionInspection.families.length,
                families: definitionInspection.families,
                extensionModules: definitionInspection.extensionModules,
            },
            runtime,
            inspection,
        },
        violations: [...new Set(violations)].sort(),
    };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    const result = await scanM1Kernel(root);
    console.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        console.error('\nM1 kernel inspection violations:');
        for (const violation of result.violations) console.error('- ' + violation);
        process.exitCode = 1;
    }
}

module.exports = {
    IDENTITY_MODULE,
    REGISTRY_MODULE,
    DEFINITIONS_DIR,
    RUNTIME_DIR,
    INSPECTION_DIR,
    CORE_DEFINITION_FAMILIES,
    CORE_RUNTIME_PORTS,
    scanM1Kernel,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
