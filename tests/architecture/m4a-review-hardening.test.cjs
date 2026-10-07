'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    productionCalculationConsumers,
} = require('./m4a-calculation-boundary-fitness.cjs');

test('M4A zero-production-consumer scanner rejects synthetic static, dynamic, and CommonJS consumers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4a-consumer-negative-control-'));
    try {
        const applicationDir = path.join(root, 'src', 'application');
        fs.mkdirSync(applicationDir, { recursive: true });
        fs.writeFileSync(
            path.join(applicationDir, 'static-consumer.mjs'),
            "import '../engine/calculations/calculation-engine.mjs';\n"
        );
        fs.writeFileSync(
            path.join(applicationDir, 'dynamic-consumer.mjs'),
            "export const load = () => import('../engine/calculations/calculation-engine.mjs');\n"
        );
        fs.writeFileSync(
            path.join(applicationDir, 'commonjs-consumer.cjs'),
            "require('../engine/calculations/calculation-engine.mjs');\n"
        );
        fs.writeFileSync(
            path.join(applicationDir, 'safe-consumer.mjs'),
            "import '../engine/commands/command-bus.mjs';\n"
        );

        assert.deepEqual(
            productionCalculationConsumers(root).consumers,
            [
                'src/application/commonjs-consumer.cjs',
                'src/application/dynamic-consumer.mjs',
                'src/application/static-consumer.mjs',
            ]
        );
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
