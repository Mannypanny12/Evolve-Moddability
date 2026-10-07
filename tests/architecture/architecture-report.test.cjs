'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    ARCHITECTURE_REPORT_VERSION,
    assertJsonData,
    normalizeJsonData,
    buildArchitectureReport,
    reportViolations,
} = require('./architecture-report.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M3G architecture report is complete, JSON-safe, and reflects the guarded repository state', async () => {
    const report = await buildArchitectureReport(root);

    assert.equal(report.reportVersion, ARCHITECTURE_REPORT_VERSION);
    assert.equal(report.legacy.moduleCount > 0, true);
    assert.equal(report.legacy.counters.global > 0, true);
    assert.equal(report.legacy.largestSccSize > 0, true);
    assert.equal(report.protectedLayers.engineFileCount > 0, true);
    assert.equal(report.protectedLayers.platformFileCount > 0, true);
    assert.equal(report.protectedLayers.bridgeFileCount > 0, true);

    assert.equal(report.engineKernel.identity.exports.includes('formatContentId'), true);
    assert.equal(report.engineKernel.registry.registryClass, 'Registry');
    const definitionByFamily = new Map(
        report.engineKernel.definitions.families.map(value => [value.family, value])
    );
    for (const family of ['achievement', 'resource', 'technology']){
        assert.equal(definitionByFamily.has(family), true, `missing M1 core definition family ${family}`);
        assert.equal(definitionByFamily.get(family).schemaVersion, 1);
        assert.equal(definitionByFamily.get(family).registryType, family);
    }
    const runtimePorts = new Set(report.engineKernel.runtime.ports.map(value => value.port));
    for (const port of ['clock', 'logger', 'rng', 'storage']){
        assert.equal(runtimePorts.has(port), true, `missing M1 core runtime port ${port}`);
    }
    assert.equal(report.engineKernel.runtime.environment.factory, 'createRuntimeEnvironment');
    assert.equal(
        report.engineKernel.inspection.modules.some(
            value => value.module === 'src/engine/inspection/registry-inspector.mjs'
        ),
        true
    );

    assert.equal(report.stateArchitecture.boundary.settingsReferenceCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.nestedSettingsModuleCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.nestedSettingsReferenceCount > 0, true);
    assert.equal(report.stateArchitecture.boundary.reviewedNestedSettingPaths.length > 0, true);
    assert.equal(report.stateArchitecture.boundary.runtimeBindingCount > 0, true);
    assert.equal(report.stateArchitecture.ownership.domainCount, 1);
    assert.deepEqual(report.stateArchitecture.ownership.metadataRoots, ['schemaVersion']);
    assert.deepEqual(report.stateArchitecture.ownership.domains, [
        { root: 'achievements', owner: 'achievement-state' },
    ]);
    assert.deepEqual(report.stateArchitecture.mutation.writableRoots, ['achievements']);
    assert.deepEqual(report.stateArchitecture.mutationReview.reviewedSurfaces.map(value => value.root), ['achievements']);
    assert.equal(report.stateArchitecture.migration.gates.achievementAuthority.passed, true);
    assert.equal(report.stateArchitecture.migration.gates.achievementAuthority.details.consumerCount, 3);
    assert.equal(report.stateArchitecture.migration.gates.achievementReaders.passed, true);
    assert.equal(report.stateArchitecture.migration.gates.achievementReaders.details.readerExportCount, 6);
    assert.equal(report.stateArchitecture.selectors.domainCount, 1);

    assert.deepEqual(report.commandArchitecture.reviewedLiveCommandIds, ['evolve:command/evolution/dna']);
    assert.deepEqual(report.commandArchitecture.reviewedCommandModules, ['src/content/evolve/commands/evolution-dna.mjs']);
    assert.deepEqual(report.commandArchitecture.productionRuntimes, ['src/application/evolve/evolution-dna-command-runtime.mjs']);
    assert.deepEqual(report.commandArchitecture.semanticBoundaries, {
        commandBus: 'src/engine/commands/command-bus.mjs',
        conditions: 'src/engine/conditions/condition-evaluator.mjs',
        payments: 'src/engine/costs/payment-plan.mjs',
        effects: 'src/engine/effects/effect-plan.mjs',
        queueModel: 'src/engine/queue/work-queue.mjs',
        settlement: 'src/engine/execution/resource-commit.mjs',
    });
    assert.deepEqual(report.commandArchitecture.executionAuthorities, ['src/engine/execution/resource-commit.mjs']);
    assert.deepEqual(report.commandArchitecture.legacyWriteCapabilities, ['src/legacy/bridge/evolve-resource-commit-adapter.mjs']);
    assert.deepEqual(report.commandArchitecture.legacyCompatibilityDebt, [{
        capability: 'src/legacy/bridge/evolve-resource-commit-adapter.mjs',
        removalTarget: 'M6B',
    }]);
    assert.equal(report.commandArchitecture.genericPackageRoots.length, 6);
    assert.equal(report.commandArchitecture.queueAuthority, 'inert-no-production-consumers');
    assert.equal(report.commandArchitecture.queueProductionConsumerCount, 0);
    assert.deepEqual(report.commandArchitecture.queueProductionConsumers, []);
    assert.equal(report.commandArchitecture.queueAuthorityViolationCount, 0);
    assert.deepEqual(report.commandArchitecture.prerequisiteViolationCounts, {
        command: 0,
        condition: 0,
        effect: 0,
        payment: 0,
        queue: 0,
        cutover: 0,
    });
    assert.equal(report.commandArchitecture.crossLayerViolationCount, 0);
    assert.equal(report.commandArchitecture.violationCount, 0);

    assert.equal(report.legacyMappings.size, report.legacyMappings.mappings.length);
    assert.equal(report.legacyMappings.size >= 2, true, 'later milestones may extend the M1D legacy mapping catalog');
    const mappingIds = new Set(report.legacyMappings.mappings.map(mapping => mapping.id));
    assert.equal(mappingIds.has('evolve.resource.food_state'), true, 'M1D Food mapping must remain represented');
    assert.equal(mappingIds.has('evolve.technology.primitive_progression'), true, 'M1D primitive mapping must remain represented');
    assert.equal(typeof report.legacyMappings.byDomain, 'object');
    assert.deepEqual(reportViolations(report), []);

    assert.doesNotThrow(() => assertJsonData(report));
    const serialized = JSON.stringify(report);
    const roundTrip = JSON.parse(serialized);
    assert.deepEqual(roundTrip, report);
    assert.equal(roundTrip.legacyMappings.size, report.legacyMappings.size, 'legacy mapping count must survive report serialization');
    assert.equal(roundTrip.legacyMappings.mappings.length, report.legacyMappings.mappings.length, 'legacy mapping records must survive report serialization');
});

test('M3G JSON normalization fails closed instead of silently losing unsupported report data', () => {
    assert.throws(() => normalizeJsonData({ hidden: undefined }), /unsupported JSON value type undefined/);
    assert.throws(() => normalizeJsonData({ count: Infinity }), /non-finite number/);
    assert.throws(() => normalizeJsonData({ count: -0 }), /negative zero/);
    assert.throws(() => normalizeJsonData(new Map([['hidden', true]])), /plain or null object prototype/);

    const symbolData = { visible: true };
    symbolData[Symbol('hidden')] = true;
    assert.throws(() => normalizeJsonData(symbolData), /symbol keys/);

    const cycle = {};
    cycle.self = cycle;
    assert.throws(() => normalizeJsonData(cycle), /cycle/);

    const shared = { value: true };
    assert.throws(
        () => normalizeJsonData({ first: shared, second: shared }),
        /shared object reference that JSON would duplicate/
    );
});
