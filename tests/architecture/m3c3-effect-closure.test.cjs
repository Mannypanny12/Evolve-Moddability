'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    analyzeEffectClosureSource,
    findViolations,
} = require('./m3c3-effect-closure.cjs');

const root = path.resolve(__dirname, '../..');

function messages(source, relativePath = 'src/engine/effects/example.mjs'){
    return analyzeEffectClosureSource(source, relativePath).join('\n');
}

test('M3C3 closure keeps first-party Evolve content IDs out of generic effect source', () => {
    assert.match(
        messages("const dna = 'evolve:resource/dna';"),
        /may not embed first-party evolve content IDs/
    );
    assert.match(
        messages('// evolve:resource/dna'),
        /may not embed first-party evolve content IDs/
    );

    assert.deepEqual(
        analyzeEffectClosureSource(
            "const example = 'example:resource/dragon_blood';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure rejects payment and quote ownership inside effect planning', () => {
    for (const source of [
        'const cost = 2;',
        'const payment = {};',
        'const paymentPlan = {};',
        'function quote(){}',
        'function checkAffordable(){}',
        'function payCosts(){}',
    ]){
        assert.match(
            messages(source),
            /may not own cost, quote, affordability, or payment semantics/
        );
    }

    assert.deepEqual(
        analyzeEffectClosureSource(
            "const message = 'payment plan belongs to M3D';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure rejects condition ownership inside effect planning', () => {
    assert.match(
        messages('const condition = {};'),
        /may not embed condition evaluation semantics/
    );
    assert.match(
        messages('function conditionEvaluator(){}'),
        /may not embed condition evaluation semantics/
    );

    assert.deepEqual(
        analyzeEffectClosureSource(
            "const message = 'conditions belong to M3B';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure analysis ignores non-effect production files', () => {
    assert.deepEqual(
        analyzeEffectClosureSource(
            "const dna = 'evolve:resource/dna'; const paymentPlan = {};",
            'src/first-party/evolution/dna.mjs'
        ),
        []
    );
});

test('M3C3 cumulative effect closure passes on the live repository', () => {
    assert.deepEqual(findViolations(root), []);
});
