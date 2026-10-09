'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');
const path = require('node:path');
const {
    REVIEWED_PRODUCTION_CALCULATION_CONSUMERS,
    analyzeCalculationModule,
    productionCalculationConsumers,
    unreviewedProductionCalculationConsumers,
    findViolations,
} = require('./m4a-calculation-boundary-fitness.cjs');

const root = path.resolve(__dirname, '../..');

test('M4A calculation package satisfies its dedicated architecture boundary with only the reviewed M4D consumers', () => {
    assert.deepEqual(findViolations(root), []);
    assert.deepEqual(productionCalculationConsumers(root).consumers, REVIEWED_PRODUCTION_CALCULATION_CONSUMERS);
    assert.deepEqual(unreviewedProductionCalculationConsumers(root), []);
});

test('M4A calculation boundary rejects state, legacy, M3, runtime and inert Registry dependencies', () => {
    const cases = [
        ["import '../state/game-state.mjs';", 'GameState/state infrastructure'],
        ["import '../../legacy/bridge/example.mjs';", 'legacy/platform adapters'],
        ["import '../commands/command-bus.mjs';", 'M3 semantic packages'],
        ["import '../runtime/environment.mjs';", 'runtime capabilities'],
        ["import '../registry.mjs';", 'inert M1 Registry'],
    ];
    for (const [source, expected] of cases){
        assert.equal(
            analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs').some(value => value.includes(expected)),
            true,
            source
        );
    }
});

test('M4A calculation boundary rejects hidden runtime capabilities, mutation authority and first-party identities', () => {
    const source = `
        const now = Date.now();
        const roll = Math.random();
        mutationAuthority.write();
        const id = 'evolve:calculation/resource/food';
    `;
    const violations = analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs');
    assert.equal(violations.some(value => value.includes('runtime clock/random source')), true);
    assert.equal(violations.some(value => value.includes('mutation or transaction authority')), true);
    assert.equal(violations.some(value => value.includes('first-party evolve: identities')), true);
});

test('M4A calculation boundary rejects actual dynamic code construction without rejecting Function introspection', () => {
    const constructedDynamicCode = ['new F', 'unction("return 1")'].join('');
    const dynamicViolations = analyzeCalculationModule(
        constructedDynamicCode,
        'src/engine/calculations/probe.mjs'
    );
    assert.equal(dynamicViolations.some(value => value.includes('dynamic code capability')), true);

    const introspection = 'const source = Function.prototype.toString.call(value);';
    const introspectionViolations = analyzeCalculationModule(
        introspection,
        'src/engine/calculations/probe.mjs'
    );
    assert.equal(introspectionViolations.some(value => value.includes('dynamic code capability')), false);
});

test('M4A calculation boundary permits only identity, inert-data and sibling calculation imports', () => {
    const source = `
        import { EngineContractError } from '../identity.mjs';
        import { inspectPlainInertObject } from '../contracts/inert-data.mjs';
        import { normalizeCalculationContext } from './calculation-context.mjs';
        export const probe = EngineContractError && inspectPlainInertObject && normalizeCalculationContext;
    `;
    assert.deepEqual(analyzeCalculationModule(source, 'src/engine/calculations/probe.mjs'), []);
});

test('M4A production-consumer scanner rejects root-style, bare repository and unreviewed calculation imports', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm4a-root-consumer-negative-control-'));
    try {
        const src = path.join(tempRoot, 'src');
        fs.mkdirSync(src, { recursive: true });
        fs.writeFileSync(
            path.join(src, 'root-static.js'),
            "import '/src/engine/calculations/resource-delta.mjs';\n"
        );
        fs.writeFileSync(
            path.join(src, 'root-dynamic.js'),
            "export const load = () => import('/src/engine/calculations/resource-primitives.mjs');\n"
        );
        fs.writeFileSync(
            path.join(src, 'bare-repository.js'),
            "import 'src/engine/calculations/resource-contract.mjs';\n"
        );

        const expected = [
            'src/bare-repository.js',
            'src/root-dynamic.js',
            'src/root-static.js',
        ];
        assert.deepEqual(productionCalculationConsumers(tempRoot).consumers, expected);
        assert.deepEqual(unreviewedProductionCalculationConsumers(tempRoot), expected);
    }
    finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
