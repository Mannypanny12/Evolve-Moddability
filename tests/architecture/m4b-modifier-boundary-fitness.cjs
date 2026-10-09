'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { maskNonCode } = require('./architecture-fitness.cjs');
const { unreviewedProductionCalculationConsumers } = require('./m4a-calculation-boundary-fitness.cjs');

const REQUIRED_FILES = Object.freeze([
    'src/engine/calculations/modifier-contract.mjs',
    'src/engine/calculations/modifier-pipeline.mjs',
]);
const CALCULATION_ROOT = 'src/engine/calculations';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const DYNAMIC_MODIFIER_AUTHORITY_PATTERN = /\b(?:registerModifier|unregisterModifier|addModifier|removeModifier)\b/;
const REVIEWED_CALCULATION_EXPORTS = Object.freeze({
    'calculation-context.mjs': Object.freeze(['normalizeCalculationContext']),
    'calculation-engine.mjs': Object.freeze(['createCalculationEngine']),
    'calculation-result.mjs': Object.freeze(['createCalculationResult', 'normalizeCalculationValue']),
    'common.mjs': Object.freeze([
        'MAX_CALCULATION_COLLECTION_LENGTH',
        'MAX_CALCULATION_DATA_NESTING_DEPTH',
        'MAX_CALCULATION_OBJECT_FIELDS',
        'MAX_CALCULATION_THENABLE_PROTOTYPE_DEPTH',
        'assertCalculationId',
        'assertSynchronousCalculationFunction',
        'canonicalizeCalculationData',
        'canonicalizeCalculationInputs',
        'isCalculationPromiseLike',
        'readClosedCalculationObject',
        'readDenseCalculationArray',
    ]),
    'modifier-contract.mjs': Object.freeze([
        'MODIFIER_OPERATIONS',
        'assertModifierId',
        'assertModifierOperation',
        'assertModifierOrder',
    ]),
    'modifier-pipeline.mjs': Object.freeze(['createModifierPipeline']),
    'resource-contract.mjs': Object.freeze([
        'RESOURCE_CAPACITY_MODES',
        'RESOURCE_DELTA_KINDS',
        'assertResourceMagnitude',
        'normalizeResourceCapacity',
        'normalizeResourceDeltaOperations',
    ]),
    'resource-delta.mjs': Object.freeze(['resolveResourceDelta']),
    'resource-primitives.mjs': Object.freeze([
        'calculateCapacity',
        'calculateConsumption',
        'calculateProduction',
        'calculateStorageCapacity',
    ]),
});

function listCalculationSources(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listCalculationSources(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function reviewedModulePath(root, filename){
    return path.relative(
        path.join(root, ...CALCULATION_ROOT.split('/')),
        filename
    ).split(path.sep).join('/');
}

function exportedNames(source, sourcefile){
    const result = esbuild.buildSync({
        stdin: {
            contents: source,
            sourcefile,
            resolveDir: path.dirname(path.resolve(sourcefile)),
            loader: path.extname(sourcefile) === '.cjs' ? 'js' : 'js',
        },
        bundle: true,
        external: ['*'],
        platform: 'neutral',
        format: 'esm',
        write: false,
        metafile: true,
        logLevel: 'silent',
    });
    const output = Object.values(result.metafile.outputs)[0];
    return [...(output && output.exports || [])].sort();
}

function moduleSurfaceViolations(root, filename, source){
    const relativeToCalculationRoot = reviewedModulePath(root, filename);
    const relative = path.relative(root, filename).split(path.sep).join('/');
    const reviewed = Object.prototype.hasOwnProperty.call(
        REVIEWED_CALCULATION_EXPORTS,
        relativeToCalculationRoot
    );
    const violations = [];
    if (!reviewed){
        violations.push(`${relative}: unreviewed calculation-package module could create new runtime authority`);
    }

    const allowed = new Set(reviewed ? REVIEWED_CALCULATION_EXPORTS[relativeToCalculationRoot] : []);
    let exports;
    try {
        exports = exportedNames(source, filename);
    }
    catch (error){
        violations.push(`${relative}: calculation export surface could not be parsed (${error.message})`);
        return violations;
    }
    violations.push(...exports
        .filter(name => !allowed.has(name))
        .map(name => `${relative}: unreviewed calculation-package export ${JSON.stringify(name)} could create new runtime authority`));
    return violations;
}

function findViolations(root){
    const violations = [];
    for (const relative of REQUIRED_FILES){
        if (!fs.existsSync(path.join(root, relative))){
            violations.push(`${relative}: required M4B modifier pipeline file is missing`);
        }
    }

    const enginePath = path.join(root, 'src/engine/calculations/calculation-engine.mjs');
    if (!fs.existsSync(enginePath)){
        violations.push('src/engine/calculations/calculation-engine.mjs: M4B calculation engine is missing');
    }
    else {
        const engineSource = fs.readFileSync(enginePath, 'utf8');
        if (!engineSource.includes("import { createModifierPipeline } from './modifier-pipeline.mjs';")){
            violations.push('calculation-engine.mjs: M4B must compose the modifier pipeline through the existing calculation runner');
        }
        if (!engineSource.includes("allowed: ['registrations', 'modifiers']")){
            violations.push('calculation-engine.mjs: M4B modifiers must be fixed engine-construction registrations');
        }
    }

    const calculationDir = path.join(root, ...CALCULATION_ROOT.split('/'));
    for (const filename of listCalculationSources(calculationDir)){
        const rawSource = fs.readFileSync(filename, 'utf8');
        const source = maskNonCode(rawSource);
        if (DYNAMIC_MODIFIER_AUTHORITY_PATTERN.test(source)){
            const relative = path.relative(root, filename).split(path.sep).join('/');
            violations.push(`${relative}: M4B must not expose dynamic modifier registration authority`);
        }
        violations.push(...moduleSurfaceViolations(root, filename, rawSource));
    }

    for (const consumer of unreviewedProductionCalculationConsumers(root)){
        violations.push(`${consumer}: M4B production calculation consumer is outside the reviewed M4D Oil Well cutover`);
    }

    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4B modifier boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4B modifier boundary fitness passed.');
}

module.exports = { REQUIRED_FILES, REVIEWED_CALCULATION_EXPORTS, findViolations };

if (require.main === module) main();
