'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { engineSourceViolations } = require('./architecture-fitness.cjs');
const { platformSourceViolations } = require('./platform-fitness.cjs');
const { bridgeSourceViolations } = require('./legacy-bridge-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const srcRoot = path.join(root, 'src');
const engineRoot = path.join(srcRoot, 'engine');
const platformRoot = path.join(srcRoot, 'platform');
const bridgeRoot = path.join(srcRoot, 'legacy', 'bridge');

function expectViolation(violations, fragment){
    assert.ok(
        violations.some(message => message.includes(fragment)),
        `Expected violation containing ${fragment}, got: ${violations.join(' | ')}`
    );
}

test('M1 closure bridge rejects all bare/package imports, including renamed UI and Node dependencies', () => {
    const filename = path.join(bridgeRoot, 'negative-control.mjs');
    const roots = { srcRoot, engineRoot, bridgeRoot };

    expectViolation(
        bridgeSourceViolations("import jqAlias from 'jquery';\nexport const x = jqAlias;", filename, roots),
        'bare/package import is forbidden: jquery'
    );
    expectViolation(
        bridgeSourceViolations("const fs = import('node:fs');\nexport { fs };", filename, roots),
        'bare/package import is forbidden: node:fs'
    );
});

test('M1 closure explicitly pins engine and platform away from the legacy bridge', () => {
    const engineFile = path.join(engineRoot, 'negative-control.mjs');
    expectViolation(
        engineSourceViolations(
            "import { LegacyMappingCatalog } from '../legacy/bridge/mapping-catalog.mjs';",
            engineFile,
            engineRoot
        ),
        'engine import escapes src/engine'
    );

    const platformFile = path.join(platformRoot, 'browser', 'negative-control.mjs');
    const roots = { srcRoot, engineRoot, platformRoot };
    expectViolation(
        platformSourceViolations(
            "import { createEvolveLegacyMappingCatalog } from '../../legacy/bridge/evolve-mappings.mjs';",
            platformFile,
            roots
        ),
        'platform import escapes allowed platform/engine layers'
    );
});
