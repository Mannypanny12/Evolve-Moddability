'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    coreResourceCouplingViolations,
} = require('./m4c-resource-boundary-fitness.cjs');

function withCalculationRoot(prefix, callback){
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    try {
        const calculationDir = path.join(root, 'src', 'engine', 'calculations');
        fs.mkdirSync(calculationDir, { recursive: true });
        callback({ root, calculationDir });
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('M4C boundary gate rejects resource-specific authority leaking into the known generic calculation core', () => {
    withCalculationRoot('m4c-core-coupling-negative-control-', ({ root, calculationDir }) => {
        fs.writeFileSync(
            path.join(calculationDir, 'calculation-engine.mjs'),
            "import { resolveResourceDelta } from './resource-delta.mjs';\nexport const leaked = resolveResourceDelta;\n"
        );
        fs.writeFileSync(
            path.join(calculationDir, 'resource-delta.mjs'),
            'export function resolveResourceDelta(){}\n'
        );

        assert.deepEqual(coreResourceCouplingViolations(root), [
            'src/engine/calculations/calculation-engine.mjs: generic calculation core may not depend on M4C resource module src/engine/calculations/resource-delta.mjs',
        ]);
    });
});

test('M4C boundary gate also rejects resource coupling from future generic calculation modules', () => {
    withCalculationRoot('m4c-future-core-coupling-negative-control-', ({ root, calculationDir }) => {
        fs.mkdirSync(path.join(calculationDir, 'future'), { recursive: true });
        fs.writeFileSync(
            path.join(calculationDir, 'future', 'calculation-helper.mjs'),
            "import { calculateProduction } from '../resource-primitives.mjs';\nexport const leaked = calculateProduction;\n"
        );
        fs.writeFileSync(
            path.join(calculationDir, 'resource-primitives.mjs'),
            'export function calculateProduction(){}\n'
        );

        assert.deepEqual(coreResourceCouplingViolations(root), [
            'src/engine/calculations/future/calculation-helper.mjs: generic calculation core may not depend on M4C resource module src/engine/calculations/resource-primitives.mjs',
        ]);
    });
});
