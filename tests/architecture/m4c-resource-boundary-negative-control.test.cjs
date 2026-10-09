'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    coreResourceCouplingViolations,
} = require('./m4c-resource-boundary-fitness.cjs');

test('M4C boundary gate rejects resource-specific authority leaking into the generic calculation core', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4c-core-coupling-negative-control-'));
    try {
        const calculationDir = path.join(root, 'src', 'engine', 'calculations');
        fs.mkdirSync(calculationDir, { recursive: true });
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
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
