'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const RNA_ID = 'evolve:resource/rna';
const DNA_ID = 'evolve:resource/dna';

let adapterPromise;
function loadAdapter(){
    if (!adapterPromise){
        adapterPromise = import(
            pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-resource-commit-adapter.mjs')).href
        );
    }
    return adapterPromise;
}

function makeState({ rnaRecord = null, dnaRecord = null } = {}){
    return {
        resource: {
            RNA: rnaRecord || { amount: 10, max: 100, display: true },
            DNA: dnaRecord || { amount: 0, max: 100, display: true },
        },
    };
}

function transaction(){
    return [
        { kind: 'resource.debit', resourceId: RNA_ID, amount: 2 },
        { kind: 'resource.credit', resourceId: DNA_ID, amount: 1 },
    ];
}

function sideEffectResource({ amount = 10, max = 100, onFirstWrite }){
    const target = { amount, max, display: true };
    let writes = 0;
    return new Proxy(target, {
        set(record, field, value){
            const result = Reflect.set(record, field, value);
            if (field === 'amount'){
                writes++;
                if (writes === 1 && onFirstWrite) onFirstWrite(value);
            }
            return result;
        },
    });
}

function transformedFirstWriteResource({ amount = 10, max = 100 } = {}){
    const target = { amount, max, display: true };
    let writes = 0;
    return new Proxy(target, {
        set(record, field, value){
            if (field !== 'amount') return Reflect.set(record, field, value);
            writes++;
            return Reflect.set(record, field, writes === 1 ? value + 1 : value);
        },
    });
}

function assertCode(fn, expectedCode){
    assert.throws(
        fn,
        error => error && error.name === 'EngineContractError' && error.code === expectedCode
    );
}

test('post-closure settlement reads back each write and rolls back a silently transformed amount', async () => {
    const { createEvolveLegacyResourceCommitCapability } = await loadAdapter();
    const rna = transformedFirstWriteResource();
    const state = makeState({ rnaRecord: rna });
    const capability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state });

    assertCode(
        () => capability.commitResourceChanges(transaction()),
        'LEGACY_RESOURCE_COMMIT_STATE_DRIFT'
    );
    assert.equal(rna.amount, 10, 'the transformed RNA debit must be restored');
    assert.equal(state.resource.DNA.amount, 0, 'DNA must remain untouched');
});

test('post-closure settlement rejects capacity drift introduced by an earlier resource write', async () => {
    const { createEvolveLegacyResourceCommitCapability } = await loadAdapter();
    const dna = { amount: 0, max: 100, display: true };
    const rna = sideEffectResource({
        onFirstWrite(){
            dna.max = 0;
        },
    });
    const state = makeState({ rnaRecord: rna, dnaRecord: dna });
    const capability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state });

    assertCode(
        () => capability.commitResourceChanges(transaction()),
        'LEGACY_RESOURCE_COMMIT_STATE_DRIFT'
    );
    assert.equal(rna.amount, 10, 'the earlier RNA debit must be restored');
    assert.equal(dna.amount, 0, 'the stale DNA projection must not be written');
    assert.equal(dna.max, 0, 'the externally introduced capacity change remains visible');
});

test('post-closure settlement rejects replacement of a mapped resource record during application', async () => {
    const { createEvolveLegacyResourceCommitCapability } = await loadAdapter();
    const originalDna = { amount: 0, max: 100, display: true };
    const replacementDna = { amount: 7, max: 100, display: true };
    let state;
    const rna = sideEffectResource({
        onFirstWrite(){
            state.resource.DNA = replacementDna;
        },
    });
    state = makeState({ rnaRecord: rna, dnaRecord: originalDna });
    const capability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state });

    assertCode(
        () => capability.commitResourceChanges(transaction()),
        'LEGACY_RESOURCE_COMMIT_STATE_DRIFT'
    );
    assert.equal(rna.amount, 10, 'the earlier RNA debit must be restored');
    assert.equal(originalDna.amount, 0, 'the detached old DNA record must not be mutated');
    assert.equal(state.resource.DNA, replacementDna, 'the replacement record remains live');
    assert.equal(replacementDna.amount, 7, 'the replacement record must not receive the stale projected grant');
});
