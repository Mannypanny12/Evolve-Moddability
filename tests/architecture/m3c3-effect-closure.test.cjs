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

test('M3C3 closure keeps all first-party Evolve namespace knowledge out of generic effect source', () => {
    for (const source of [
        "const dna = 'evolve:resource/dna';",
        '// evolve:resource/dna',
        "const namespace = 'evolve'; const id = namespace + ':resource/dna';",
        'const EVOLVE = `namespace`;'
    ]){
        assert.match(
            messages(source),
            /may not contain first-party Evolve namespace knowledge/
        );
    }

    assert.deepEqual(
        analyzeEffectClosureSource(
            "const example = 'example:resource/dragon_blood';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure rejects ordinary payment, pricing, quote and affordability vocabulary inside effect planning', () => {
    for (const source of [
        'const cost = 2;',
        'const costPlans = [];',
        'const pricing = {};',
        'const payment = {};',
        'const paymentPlans = [];',
        'function quote(){}',
        'function quotePlan(){}',
        'const affordable = true;',
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
            "const message = 'payment plans and pricing belong to M3D';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure rejects condition, requirement and execution-eligibility ownership inside effect planning', () => {
    for (const source of [
        'const condition = {};',
        'function conditionEvaluator(){}',
        'const requirements = [];',
        'const predicate = () => true;',
        'const eligibility = true;',
        'function canExecute(){}',
    ]){
        assert.match(
            messages(source),
            /may not embed condition, requirement, predicate, or execution-eligibility semantics/
        );
    }

    assert.deepEqual(
        analyzeEffectClosureSource(
            "const message = 'conditions and requirements belong outside M3C';",
            'src/engine/effects/example.mjs'
        ),
        []
    );
});

test('M3C3 closure analysis ignores non-effect production files', () => {
    assert.deepEqual(
        analyzeEffectClosureSource(
            "const namespace = 'evolve'; const paymentPlan = {}; const requirements = [];",
            'src/first-party/evolution/dna.mjs'
        ),
        []
    );
});

test('M3C3 cumulative effect closure passes on the live repository', () => {
    assert.deepEqual(findViolations(root), []);
});
