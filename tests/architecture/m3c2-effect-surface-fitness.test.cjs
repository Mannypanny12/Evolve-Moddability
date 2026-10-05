'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { analyzeSource, findViolations } = require('./m3c2-effect-surface-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function messages(source, relativePath){
    return analyzeSource(source, relativePath).join('\n');
}

test('M3C2 effect surface allows external production code to consume only createEffectPlan module', () => {
    assert.deepEqual(
        analyzeSource(
            "import { createEffectPlan } from './engine/effects/effect-plan.mjs';",
            'src/application-entry.mjs'
        ),
        []
    );

    assert.match(
        messages(
            "import { readEffectObjectFields } from './engine/effects/common.mjs';",
            'src/application-entry.mjs'
        ),
        /may import only src\/engine\/effects\/effect-plan\.mjs/
    );
    assert.match(
        messages(
            "import { normalizeCoreEffectOperation } from './engine/effects/core-operations.mjs';",
            'src/application-entry.mjs'
        ),
        /may import only src\/engine\/effects\/effect-plan\.mjs/
    );
});

test('M3C2 effect internals have reviewed consumers only', () => {
    assert.deepEqual(
        analyzeSource(
            "import { readEffectObjectFields } from './common.mjs';\nimport { normalizeCoreEffectOperation } from './core-operations.mjs';",
            'src/engine/effects/effect-plan.mjs'
        ),
        []
    );
    assert.deepEqual(
        analyzeSource(
            "import { assertClosedEffectFields } from './common.mjs';",
            'src/engine/effects/core-operations.mjs'
        ),
        []
    );

    assert.match(
        messages(
            "import { normalizeCoreEffectOperation } from './core-operations.mjs';",
            'src/engine/effects/alternate-planner.mjs'
        ),
        /only effect-plan\.mjs may consume/
    );
    assert.match(
        messages(
            "import { readEffectObjectFields } from './common.mjs';",
            'src/engine/effects/alternate-planner.mjs'
        ),
        /only effect-plan\.mjs and core-operations\.mjs may consume/
    );
});

test('M3C2 effect surface rejects dynamic and path-normalized internal bypasses', () => {
    assert.match(
        messages(
            "import('./engine/effects/effect-plan.mjs');",
            'src/application-entry.mjs'
        ),
        /must use static ESM imports/
    );
    assert.match(
        messages(
            "import { readEffectObjectFields } from './engine/effects/internal/../common.mjs';",
            'src/application-entry.mjs'
        ),
        /may import only src\/engine\/effects\/effect-plan\.mjs/
    );
});

test('M3C2 effect surface fitness passes on the live repository', () => {
    assert.deepEqual(findViolations(root), []);
});
