'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-resource-commit-adapter.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

test('M3F3 review hardening rolls back a resource whose hostile write mutates before throwing', async () => {
    const [{ createEvolveLegacyResourceCommitCapability }, { EngineContractError }] = await Promise.all([
        adapterPromise,
        identityPromise,
    ]);

    const rna = { amount: 4, max: 10, display: true };
    const dnaTarget = { amount: 2, max: 5, display: true };
    let projectedWriteFailed = false;
    const dna = new Proxy(dnaTarget, {
        set(target, property, value, receiver){
            if (property === 'amount' && value === 3 && !projectedWriteFailed){
                projectedWriteFailed = true;
                target.amount = value;
                throw new Error('hostile partial DNA write');
            }
            return Reflect.set(target, property, value, receiver);
        },
    });
    const state = { resource: { RNA: rna, DNA: dna } };
    const capability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot: () => state });

    assert.throws(
        () => capability.commitResourceChanges([
            { kind: 'resource.debit', resourceId: 'evolve:resource/rna', amount: 2 },
            { kind: 'resource.credit', resourceId: 'evolve:resource/dna', amount: 1 },
        ]),
        error => error instanceof EngineContractError && error.code === 'LEGACY_RESOURCE_COMMIT_WRITE_FAILURE'
    );

    assert.equal(projectedWriteFailed, true);
    assert.equal(rna.amount, 4);
    assert.equal(dnaTarget.amount, 2);
});
