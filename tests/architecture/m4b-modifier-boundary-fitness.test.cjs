'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findViolations } = require('./m4b-modifier-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function createFixture(){
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'm4b-boundary-'));
    fs.mkdirSync(path.join(fixture, 'src/engine/calculations'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'src/application'), { recursive: true });
    fs.writeFileSync(
        path.join(fixture, 'src/engine/calculations/modifier-contract.mjs'),
        'export const MODIFIER_OPERATIONS = [];\n'
    );
    fs.writeFileSync(path.join(fixture, 'src/engine/calculations/modifier-pipeline.mjs'), 'export function createModifierPipeline(){}\n');
    fs.writeFileSync(
        path.join(fixture, 'src/engine/calculations/calculation-engine.mjs'),
        "import { createModifierPipeline } from './modifier-pipeline.mjs';\nconst config = { allowed: ['registrations', 'modifiers'] };\n"
    );
    return fixture;
}

test('M4B modifier package satisfies its dedicated architecture boundary', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4B boundary rejects production consumers before M4D', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/application/illegal.mjs'),
            "import { createCalculationEngine } from '../engine/calculations/calculation-engine.mjs';\nexport { createCalculationEngine };\n"
        );
        const violations = findViolations(fixture);
        assert.equal(violations.some(value => value.includes('zero production calculation consumers')), true);
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4B boundary rejects dynamic modifier registration authority anywhere in calculation sources', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/engine/calculations/modifier-pipeline.mjs'),
            'export function createModifierPipeline(){}\nexport function registerModifier(){}\n'
        );
        const violations = findViolations(fixture);
        assert.equal(violations.some(value => value.includes('dynamic modifier registration authority')), true);
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4B boundary rejects unreviewed calculation-package exports regardless of API naming', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/engine/calculations/modifier-pipeline.mjs'),
            'export function createModifierPipeline(){}\nexport function attachContribution(){}\n'
        );
        const violations = findViolations(fixture);
        assert.equal(
            violations.some(value => value.includes('unreviewed calculation-package export "attachContribution"')),
            true
        );
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4B boundary rejects exports from unreviewed new calculation-package modules', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/engine/calculations/hidden-authority.mjs'),
            'export function attachContribution(){}\n'
        );
        const violations = findViolations(fixture);
        assert.equal(
            violations.some(value => value.includes('hidden-authority.mjs') && value.includes('unreviewed calculation-package export')),
            true
        );
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4B boundary rejects unreviewed new calculation-package modules even without exports', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/engine/calculations/hidden-side-effect.mjs'),
            'const internalAuthority = new Map();\ninternalAuthority.set("hidden", true);\n'
        );
        const violations = findViolations(fixture);
        assert.equal(
            violations.some(value => value.includes('hidden-side-effect.mjs') && value.includes('unreviewed calculation-package module')),
            true
        );
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('M4B dynamic-authority guard ignores comments and strings', () => {
    const fixture = createFixture();
    try {
        fs.writeFileSync(
            path.join(fixture, 'src/engine/calculations/modifier-pipeline.mjs'),
            "export function createModifierPipeline(){}\n// registerModifier is forbidden API terminology\nconst note = 'removeModifier';\n"
        );
        assert.deepEqual(findViolations(fixture), []);
    }
    finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});
