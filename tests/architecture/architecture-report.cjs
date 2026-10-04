'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    loadBaseline,
    scanRepository,
} = require('./architecture-fitness.cjs');
const { scanPlatform } = require('./platform-fitness.cjs');
const { scanLegacyBridge } = require('./legacy-bridge-fitness.cjs');
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

const ARCHITECTURE_REPORT_VERSION = 2;

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

function normalizeJsonData(value){
    return JSON.parse(JSON.stringify(value));
}

async function buildArchitectureReport(root){
    const baseline = loadBaseline(root);
    const architecture = scanRepository(root, baseline);
    const platform = scanPlatform(root);
    const bridge = scanLegacyBridge(root);
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
        legacyMappings: mappings,
        gateViolations: {
            architecture: architecture.violations,
            platform: platform.violations,
            bridge: bridge.violations,
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
