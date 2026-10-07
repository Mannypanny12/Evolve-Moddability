'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    loadBaseline,
    scanRepository,
} = require('./architecture-fitness.cjs');
const { scanPlatform } = require('./platform-fitness.cjs');
const { scanLegacyBridge } = require('./legacy-bridge-fitness.cjs');
const { scanM1Kernel } = require('./m1-kernel-inspector.cjs');
const { loadBoundaryBaseline, scanM2CBoundary } = require('./m2c-boundary-fitness.cjs');
const { scanM2CSyntaxHardening } = require('./m2c-syntax-hardening.cjs');
const { scanM2MigrationGates } = require('./m2-migration-gate-adapter.cjs');
const { scanStateOwnership } = require('./m2e1-state-ownership-fitness.cjs');
const { scanMutationBoundary } = require('./m2e2-mutation-boundary-fitness.cjs');
const { scanMutationBoundaryReviewHardening } = require('./m2e2-mutation-boundary-review-hardening.cjs');
const { capabilitySurfaceHardeningViolations } = require('./m2e2-capability-surface-hardening.cjs');
const { scanDynamicEngineLoaders } = require('./m2e2-dynamic-loader-hardening.cjs');
const { scanSelectorStateDependencies } = require('./m2e3-selector-state-dependencies-fitness.cjs');
const { scanM2E3ReviewHardening } = require('./m2e3-selector-review-hardening.cjs');
const { scanM3GCommandArchitecture } = require('./m3g-command-architecture-closure.cjs');

const ARCHITECTURE_REPORT_VERSION = 6;

function sortedUnique(values){
    return [...new Set(values)].sort();
}

function normalizeViolationOnlyGate(violations, summary = {}){
    const normalized = sortedUnique(violations || []);
    return {
        summary: {
            ...summary,
            violationCount: normalized.length,
        },
        violations: normalized,
    };
}

function assertJsonData(value, label = '$', ancestors = new Set(), seenObjects = new Set()){
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
        if (Object.is(value, -0)) throw new Error(`${label} contains negative zero, which JSON cannot preserve`);
        return;
    }
    if (typeof value !== 'object'){
        throw new Error(`${label} contains unsupported JSON value type ${typeof value}`);
    }
    if (ancestors.has(value)) throw new Error(`${label} contains a cycle`);
    if (seenObjects.has(value)) throw new Error(`${label} contains a shared object reference that JSON would duplicate`);

    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)){
        if (prototype !== Array.prototype) throw new Error(`${label} must use a normal Array prototype`);
    }
    else if (prototype !== Object.prototype && prototype !== null){
        throw new Error(`${label} must use a plain or null object prototype`);
    }

    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key === 'symbol')) throw new Error(`${label} contains symbol keys`);
    const ownStringKeys = keys.filter(key => typeof key === 'string');
    if (Array.isArray(value)){
        const expected = new Set([...value.keys()].map(String).concat('length'));
        for (const key of ownStringKeys){
            if (!expected.has(key)) throw new Error(`${label} array contains extra property ${JSON.stringify(key)}`);
        }
        for (let index = 0; index < value.length; index++){
            if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error(`${label} contains a sparse array slot at ${index}`);
        }
    }

    ancestors.add(value);
    seenObjects.add(value);
    for (const key of ownStringKeys){
        if (Array.isArray(value) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')){
            throw new Error(`${label}.${key} must be a data property`);
        }
        if (!descriptor.enumerable && !Array.isArray(value)){
            throw new Error(`${label}.${key} must be enumerable`);
        }
        assertJsonData(descriptor.value, `${label}.${key}`, ancestors, seenObjects);
    }
    ancestors.delete(value);
}

function normalizeJsonData(value){
    assertJsonData(value);
    const normalized = JSON.parse(JSON.stringify(value));
    assertJsonData(normalized);
    return normalized;
}

async function buildArchitectureReport(root){
    const baseline = loadBaseline(root);
    const architecture = scanRepository(root, baseline);
    const platform = scanPlatform(root);
    const bridge = scanLegacyBridge(root);
    const m1Kernel = await scanM1Kernel(root);
    const stateBoundary = scanM2CBoundary(root, loadBoundaryBaseline(root));
    const stateSyntax = scanM2CSyntaxHardening(root);
    const migration = scanM2MigrationGates(root);
    const ownership = await scanStateOwnership(root);
    const mutation = await scanMutationBoundary(root);
    const mutationReview = await scanMutationBoundaryReviewHardening(root);
    const capabilitySurface = normalizeViolationOnlyGate(
        await capabilitySurfaceHardeningViolations(root),
        { domainCount: ownership.summary.domainCount || 0 }
    );
    const dynamicLoaders = normalizeViolationOnlyGate(scanDynamicEngineLoaders(root));
    const selectors = scanSelectorStateDependencies(root);
    const selectorReview = normalizeViolationOnlyGate(
        scanM2E3ReviewHardening(root),
        { domainCount: selectors.summary.domainCount || 0 }
    );
    const commandArchitecture = await scanM3GCommandArchitecture(root);

    const mappingModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);
    const inspectorModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/inspector.mjs')).href);
    const mappings = inspectorModule.inspectLegacyMappings(mappingModule.createEvolveLegacyMappingCatalog());

    return normalizeJsonData({
        reportVersion: ARCHITECTURE_REPORT_VERSION,
        legacy: {
            baselineSourceCommit: baseline.sourceCommit,
            moduleCount: architecture.summary.legacyModuleCount,
            counters: architecture.summary.legacyTotals,
            largestSccSize: architecture.summary.largestLegacySccSize,
            cyclicMembers: architecture.summary.cyclicMembers,
        },
        protectedLayers: {
            engineFileCount: architecture.summary.engineFileCount,
            platformFileCount: platform.summary.platformFileCount,
            bridgeFileCount: bridge.summary.bridgeFileCount,
        },
        engineKernel: m1Kernel.summary,
        stateArchitecture: {
            boundary: stateBoundary.summary,
            syntax: stateSyntax.summary,
            migration: migration.summary,
            ownership: ownership.summary,
            mutation: mutation.summary,
            mutationReview: mutationReview.summary,
            capabilitySurface: capabilitySurface.summary,
            dynamicLoaders: dynamicLoaders.summary,
            selectors: selectors.summary,
            selectorReview: selectorReview.summary,
        },
        commandArchitecture: commandArchitecture.summary,
        legacyMappings: mappings,
        gateViolations: {
            architecture: architecture.violations,
            platform: platform.violations,
            bridge: bridge.violations,
            m1Kernel: m1Kernel.violations,
            stateBoundary: stateBoundary.violations,
            stateSyntax: stateSyntax.violations,
            achievementMigration: migration.violations,
            stateOwnership: ownership.violations,
            mutationBoundary: mutation.violations,
            mutationBoundaryReview: mutationReview.violations,
            capabilitySurface: capabilitySurface.violations,
            dynamicLoaders: dynamicLoaders.violations,
            selectorDependencies: selectors.violations,
            selectorReview: selectorReview.violations,
            commandArchitecture: commandArchitecture.violations,
        },
    });
}

function reportViolations(report){
    return Object.values(report.gateViolations || {}).flat();
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    const report = await buildArchitectureReport(root);
    const serialized = JSON.stringify(report, null, 2);
    JSON.parse(serialized);
    console.log(serialized);
    if (reportViolations(report).length > 0) process.exitCode = 1;
}

module.exports = {
    ARCHITECTURE_REPORT_VERSION,
    normalizeViolationOnlyGate,
    assertJsonData,
    normalizeJsonData,
    buildArchitectureReport,
    reportViolations,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
