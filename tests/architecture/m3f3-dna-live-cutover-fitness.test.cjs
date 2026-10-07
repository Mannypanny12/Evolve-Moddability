'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeRuntimeSource,
    analyzeActionsSource,
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

test('M3F3 fitness rejects a runtime that captures the current legacy root', () => {
    const hostile = runtimeSource.replace(
        'const readLegacyRoot = () => global;',
        'const legacyRoot = global;\nconst readLegacyRoot = () => legacyRoot;'
    );
    const violations = analyzeRuntimeSource(hostile);
    assert.ok(violations.some(violation => violation.includes('captured legacy root')));
    assert.ok(violations.some(violation => violation.includes('reviewed production composition marker is missing')));
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

test('M3F3 DNA action extractor isolates only the live action body', () => {
    const body = extractDnaActionBody(actionsSource);
    assert.ok(body);
    assert.match(body, /dispatchEvolutionDnaCommand\(\)/);
    assert.doesNotMatch(body, /evoFinalMenu|resource|modRes|RNA|DNA/);
});
