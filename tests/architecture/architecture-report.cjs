'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    loadBaseline,
    scanRepository,
} = require('./architecture-fitness.cjs');
const { scanPlatform } = require('./platform-fitness.cjs');
const { scanLegacyBridge } = require('./legacy-bridge-fitness.cjs');

async function buildArchitectureReport(root){
    const baseline = loadBaseline(root);
    const architecture = scanRepository(root, baseline);
    const platform = scanPlatform(root);
    const bridge = scanLegacyBridge(root);
    const mappingModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);
    const inspectorModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/inspector.mjs')).href);
    const mappings = inspectorModule.inspectLegacyMappings(mappingModule.createEvolveLegacyMappingCatalog());

    return {
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
        legacyMappings: mappings,
        gateViolations: {
            architecture: architecture.violations,
            platform: platform.violations,
            bridge: bridge.violations,
        },
    };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    const report = await buildArchitectureReport(root);
    console.log(JSON.stringify(report, null, 2));
    const violations = Object.values(report.gateViolations).flat();
    if (violations.length > 0) process.exitCode = 1;
}

module.exports = { buildArchitectureReport };

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
