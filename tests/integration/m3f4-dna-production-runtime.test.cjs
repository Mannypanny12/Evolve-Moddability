'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

require('../legacy/browser-shim.cjs');

const root = path.resolve(__dirname, '../..');

let modulesPromise;
function loadModules(){
    if (!modulesPromise){
        modulesPromise = Promise.all([
            import(pathToFileURL(path.join(root, 'src/vars.js')).href),
            import(pathToFileURL(path.join(root, 'src/application/evolve/evolution-dna-command-runtime.mjs')).href),
        ]).then(([varsModule, runtimeModule]) => ({ varsModule, runtimeModule }));
    }
    return modulesPromise;
}

function makeState({ rna = 2, rnaMax = 100, dna = 0, dnaMax = 100 } = {}){
    return {
        stats: { achieve: {} },
        resource: {
            RNA: { amount: rna, max: rnaMax, display: true },
            DNA: { amount: dna, max: dnaMax, display: true },
        },
    };
}

async function installState(options){
    const { varsModule } = await loadModules();
    const state = makeState(options);
    varsModule.setGlobal(state);
    return state;
}

function assertFrozenCommandResult(result){
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.reasons));
    for (const reason of result.reasons){
        assert.ok(Object.isFrozen(reason));
        if (reason.details !== null) assert.ok(Object.isFrozen(reason.details));
    }
}

test('M3F4 production runtime returns the normalized structured success result and commits DNA atomically', async () => {
    const { runtimeModule } = await loadModules();
    const state = await installState({ rna: 2, dna: 0, dnaMax: 100 });

    const result = runtimeModule.dispatchEvolutionDnaCommand();

    assert.deepEqual(result, {
        commandId: 'evolve:command/evolution/dna',
        status: 'succeeded',
        data: null,
        reasons: [],
    });
    assertFrozenCommandResult(result);
    assert.equal(state.resource.RNA.amount, 0);
    assert.equal(state.resource.DNA.amount, 1);
});

test('M3F4 production runtime returns a structured insufficient-resource rejection without mutation', async () => {
    const { runtimeModule } = await loadModules();
    const state = await installState({ rna: 1, dna: 3, dnaMax: 100 });
    const before = structuredClone(state);

    const result = runtimeModule.dispatchEvolutionDnaCommand();

    assert.equal(result.commandId, 'evolve:command/evolution/dna');
    assert.equal(result.status, 'rejected');
    assert.equal(result.data, null);
    assert.equal(result.reasons.length, 1);
    assert.equal(result.reasons[0].code, 'insufficient_resource');
    assert.deepEqual(result.reasons[0].details, {
        resourceId: 'evolve:resource/rna',
        required: 2,
        available: 1,
    });
    assertFrozenCommandResult(result);
    assert.deepEqual(state, before);
});

test('M3F4 production runtime returns the DNA-capacity condition rejection before settlement', async () => {
    const { runtimeModule } = await loadModules();
    const state = await installState({ rna: 10, dna: 10, dnaMax: 10 });
    const before = structuredClone(state);

    const result = runtimeModule.dispatchEvolutionDnaCommand();

    assert.equal(result.commandId, 'evolve:command/evolution/dna');
    assert.equal(result.status, 'rejected');
    assert.equal(result.data, null);
    assert.equal(result.reasons.length, 1);
    assert.deepEqual(result.reasons[0], {
        code: 'condition.resource.at_capacity',
        details: {
            resourceId: 'evolve:resource/dna',
            actualAmount: 10,
            capacity: 10,
        },
    });
    assertFrozenCommandResult(result);
    assert.deepEqual(state, before);
});
