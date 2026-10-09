'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const contractPromise = import(pathToFileURL(path.join(root, 'src/engine/calculations/resource-contract.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    return Object.assign({}, ...await Promise.all([contractPromise, identityPromise]));
}

test('M4C delta operations reject repeated object identity', async () => {
    const { normalizeResourceDeltaOperations, EngineContractError } = await modules();
    const operation = { kind: 'credit', amount: 1 };

    assert.throws(
        () => normalizeResourceDeltaOperations([operation, operation]),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_RESOURCE_DELTA'
            && error.details.path === 'resourceDelta.operations[1]'
    );
});

test('M4C alias rejection prevents a repeated stateful Proxy from being re-inspected', async () => {
    const { normalizeResourceDeltaOperations, EngineContractError } = await modules();
    const target = { kind: 'credit', amount: 1 };
    let amountDescriptorReads = 0;
    const operation = new Proxy(target, {
        getOwnPropertyDescriptor(object, key){
            if (key === 'amount'){
                amountDescriptorReads++;
                const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
                return {
                    ...descriptor,
                    value: amountDescriptorReads === 1 ? 1 : 999,
                };
            }
            return Reflect.getOwnPropertyDescriptor(object, key);
        },
    });

    assert.throws(
        () => normalizeResourceDeltaOperations([operation, operation]),
        error => error instanceof EngineContractError
            && error.code === 'INVALID_RESOURCE_DELTA'
    );
    assert.equal(amountDescriptorReads, 1, 'duplicate identity must be rejected before a second semantic inspection');
});
