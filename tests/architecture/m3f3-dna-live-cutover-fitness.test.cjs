'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeRuntimeSource,
    analyzeActionsSource,
    extractRuntimeDispatchBody,
    extractDnaActionBody,
    findViolations,
} = require('./m3f3-dna-live-cutover-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const runtimePath = path.join(root, 'src/application/evolve/evolution-dna-command-runtime.mjs');
const actionsPath = path.join(root, 'src/actions.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const actionsSource = fs.readFileSync(actionsPath, 'utf8');

test('M3F3 production cutover passes the cumulative live-cutover architecture gate', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M3F3 fitness rejects a runtime that replaces the live-root provider with a captured root', () => {
    const hostile = runtimeSource.replace(
        'const readLegacyRoot = () => global;',
        'const legacyRoot = global;\nconst readLegacyRoot = () => legacyRoot;'
    );
    const violations = analyzeRuntimeSource(hostile);
    assert.ok(violations.some(violation => violation.includes('reviewed production composition marker is missing')));
});

test('M3F3 fitness rejects alternate-name stale-root capture even when the approved live provider marker remains', () => {
    const hostile = runtimeSource
        .replace(
            'const readLegacyRoot = () => global;',
            'const snapshot = global;\nconst readLegacyRoot = () => global;'
        )
        .replace(
            'const conditionReads = createEvolveLegacyConditionReadProvider({ readLegacyRoot });',
            'const conditionReads = createEvolveLegacyConditionReadProvider({ readLegacyRoot: () => snapshot });'
        );
    const violations = analyzeRuntimeSource(hostile);
    assert.ok(violations.some(violation => violation.includes('global may appear only')));
});

test('M3F3 fitness keeps the exported dispatcher as a pure command-bus call', () => {
    const body = extractRuntimeDispatchBody(runtimeSource);
    assert.ok(body);
    assert.match(body, /return commandBus\.dispatch\(DNA_COMMAND\)/);

    const hostile = runtimeSource.replace(
        'return commandBus.dispatch(DNA_COMMAND);',
        "resourceCommitCapability.commitResourceChanges([]);\n    return commandBus.dispatch(DNA_COMMAND);"
    );
    const violations = analyzeRuntimeSource(hostile);
    assert.ok(violations.some(violation => violation.includes('pure command-bus dispatch')));
    assert.ok(violations.some(violation => violation.includes('resource capability forwarding')));
});

test('M3F3 fitness rejects extra top-level settlement calls outside the reviewed composition wiring', () => {
    const hostile = runtimeSource.replace(
        'export function dispatchEvolutionDnaCommand(){',
        'resourceCommitCapability.commitResourceChanges([]);\n\nexport function dispatchEvolutionDnaCommand(){'
    );
    const violations = analyzeRuntimeSource(hostile);
    assert.ok(violations.some(violation => violation.includes('resource capability forwarding')));
});

test('M3F3 fitness rejects direct resource authority returning to the DNA action shim', () => {
    const hostile = actionsSource.replace(
        'dispatchEvolutionDnaCommand();\n                return false;',
        "modRes('RNA', -2, true);\n                dispatchEvolutionDnaCommand();\n                return false;"
    );
    const violations = analyzeActionsSource(hostile);
    assert.ok(violations.some(violation => violation.includes('two-step compatibility shim')));
    assert.ok(violations.some(violation => violation.includes('direct resource mutation')));
});

test('M3F3 fitness rejects exception swallowing in the DNA action shim', () => {
    const hostile = actionsSource.replace(
        'dispatchEvolutionDnaCommand();\n                return false;',
        'try { dispatchEvolutionDnaCommand(); } catch {}\n                return false;'
    );
    const violations = analyzeActionsSource(hostile);
    assert.ok(violations.some(violation => violation.includes('two-step compatibility shim')));
    assert.ok(violations.some(violation => violation.includes('error swallowing')));
});

test('M3F3 fitness rejects ambiguous duplicate evolution-dna identities instead of extracting a decoy action', () => {
    const hostile = actionsSource.replace(
        'export const actions = {',
        "const dnaDecoy = { id: 'evolution-dna', action(args){ return true; } };\n\nexport const actions = {"
    );
    const violations = analyzeActionsSource(hostile);
    assert.ok(violations.some(violation => violation.includes('identity must occur exactly once')));
    assert.ok(violations.some(violation => violation.includes('could not be located unambiguously')));
});

test('M3F3 DNA action extractor isolates only the live action body', () => {
    const body = extractDnaActionBody(actionsSource);
    assert.ok(body);
    assert.match(body, /dispatchEvolutionDnaCommand\(\)/);
    assert.doesNotMatch(body, /evoFinalMenu|resource|modRes|RNA|DNA/);
});
