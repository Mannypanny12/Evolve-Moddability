'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const inertPromise = import(pathToFileURL(path.join(root, 'src/engine/contracts/inert-data.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [inert, identity] = await Promise.all([inertPromise, identityPromise]);
    return { ...inert, ...identity };
}

test('M3C1 shared inert array inspection enforces maxLength before own-key enumeration', async () => {
    const { inspectDenseInertArray, EngineContractError } = await modules();
    let ownKeysCalls = 0;
    const value = new Proxy(new Array(5), {
        ownKeys(){
            ownKeysCalls++;
            throw new Error('ownKeys should not run after the length ceiling is already exceeded');
        },
    });

    assert.throws(
        () => inspectDenseInertArray(value, {
            path: 'data',
            code: 'INVALID_TEST_DATA',
            maxLength: 4,
        }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_TEST_DATA' &&
            error.details?.length === 5 &&
            error.details?.maxLength === 4
    );
    assert.equal(ownKeysCalls, 0);
});

test('M3C1 shared inert array inspection still validates keys after an accepted length', async () => {
    const { inspectDenseInertArray, EngineContractError } = await modules();
    let ownKeysCalls = 0;
    const value = new Proxy([1], {
        ownKeys(target){
            ownKeysCalls++;
            return Reflect.ownKeys(target);
        },
    });

    assert.deepEqual(
        inspectDenseInertArray(value, {
            path: 'data',
            code: 'INVALID_TEST_DATA',
            maxLength: 4,
        }),
        [1]
    );
    assert.equal(ownKeysCalls, 1);

    const extra = [1];
    extra.extra = true;
    assert.throws(
        () => inspectDenseInertArray(extra, {
            path: 'data',
            code: 'INVALID_TEST_DATA',
            maxLength: 4,
        }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_TEST_DATA' &&
            error.details?.path === 'data.extra'
    );
});
