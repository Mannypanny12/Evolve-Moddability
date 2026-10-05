'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const readsPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/read-capabilities.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [reads, identity] = await Promise.all([readsPromise, identityPromise]);
    return { ...reads, ...identity };
}

function validReads(overrides = {}){
    return {
        technology: { has: () => false, ...(overrides.technology || {}) },
        resource: {
            amount: () => 0,
            available: () => false,
            capacity: () => 0,
            ...(overrides.resource || {}),
        },
        structure: {
            count: () => 0,
            activeCount: () => 0,
            ...(overrides.structure || {}),
        },
        trait: { has: () => false, ...(overrides.trait || {}) },
    };
}

test('M3B2 read capabilities snapshot function references, freeze the facade, and invoke reads without this', async () => {
    const { createConditionReadCapabilities } = await modules();
    const observations = {};
    const raw = validReads({
        technology: {
            has(id){
                observations.thisValue = this;
                observations.id = id;
                return true;
            },
        },
    });
    const original = raw.technology.has;
    const reads = createConditionReadCapabilities(raw);

    raw.technology.has = () => false;

    assert.equal(reads.technology.has('evolve:technology/test'), true);
    assert.equal(observations.thisValue, undefined);
    assert.equal(observations.id, 'evolve:technology/test');
    assert.notEqual(raw.technology.has, original);
    assert.equal(Object.isFrozen(reads), true);
    assert.equal(Object.isFrozen(reads.technology), true);
    assert.equal(Object.isFrozen(reads.resource), true);
    assert.deepEqual(Object.keys(reads), ['technology', 'resource', 'structure', 'trait']);
});

test('M3B2 read capability surface is closed and rejects mutation-like or accessor fields', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    const extra = validReads();
    extra.resource.setAmount = () => {};

    assert.throws(
        () => createConditionReadCapabilities(extra),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_CAPABILITIES'
    );

    const accessor = validReads();
    Object.defineProperty(accessor.trait, 'has', {
        enumerable: true,
        get(){ throw new Error('must not execute'); },
    });
    assert.throws(
        () => createConditionReadCapabilities(accessor),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_CAPABILITIES'
    );
});

test('M3B2 read capability registration rejects async, generator, and class functions', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();

    for (const bad of [async () => false, function* generator(){ yield false; }, class BadRead {}]){
        const raw = validReads({ technology: { has: bad } });
        assert.throws(
            () => createConditionReadCapabilities(raw),
            error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_CAPABILITIES'
        );
    }
});

test('M3B2 read facade independently validates canonical subject IDs and content types before invoking providers', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    let calls = 0;
    const reads = createConditionReadCapabilities(validReads({
        technology: { has: () => { calls++; return false; } },
    }));

    for (const subjectId of ['primitive', 'evolve:resource/food']){
        assert.throws(
            () => reads.technology.has(subjectId),
            error => {
                assert.equal(error instanceof EngineContractError, true);
                assert.equal(error.code, 'INVALID_CONDITION_READ_SUBJECT_ID');
                assert.equal(error.details.readFamily, 'technology');
                assert.equal(error.details.readOperation, 'has');
                assert.equal(error.details.expectedType, 'technology');
                return true;
            }
        );
    }
    assert.equal(calls, 0);
});

test('M3B2 read capabilities validate semantic result types and normalize negative zero', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    const reads = createConditionReadCapabilities(validReads({
        technology: { has: () => 'yes' },
        resource: { amount: () => -0, capacity: () => null },
    }));

    assert.equal(Object.is(reads.resource.amount('evolve:resource/test'), -0), false);
    assert.equal(reads.resource.capacity('evolve:resource/test'), null);
    assert.throws(
        () => reads.technology.has('evolve:technology/test'),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_RESULT'
    );

    const badCount = createConditionReadCapabilities(validReads({ structure: { count: () => 1.5 } }));
    assert.throws(
        () => badCount.structure.count('evolve:structure/test'),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_RESULT'
    );

    const badCapacity = createConditionReadCapabilities(validReads({ resource: { capacity: () => -1 } }));
    assert.throws(
        () => badCapacity.resource.capacity('evolve:resource/test'),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_RESULT'
    );
});

test('M3B2 read capabilities preserve safe machine diagnostics when a provider throws an EngineContractError', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    const reads = createConditionReadCapabilities(validReads({
        trait: {
            has: () => {
                throw new EngineContractError('CORRUPT_TRAIT_STATE', 'Corrupt trait state.', { unsafeDetail: 'ignored by read boundary' });
            },
        },
    }));

    assert.throws(
        () => reads.trait.has('evolve:trait/test'),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'CONDITION_READ_FAILURE');
            assert.equal(error.details.readFamily, 'trait');
            assert.equal(error.details.readOperation, 'has');
            assert.equal(error.details.subjectId, 'evolve:trait/test');
            assert.equal(error.details.readerCauseCode, 'CORRUPT_TRAIT_STATE');
            assert.equal(Object.prototype.hasOwnProperty.call(error.details, 'unsafeDetail'), false);
            return true;
        }
    );
});

test('M3B2 read failures remain normalized even when a provider throws a hostile value', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    const hostile = Proxy.revocable({}, {});
    hostile.revoke();
    const reads = createConditionReadCapabilities(validReads({
        technology: { has: () => { throw hostile.proxy; } },
    }));

    assert.throws(
        () => reads.technology.has('evolve:technology/test'),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'CONDITION_READ_FAILURE');
            assert.equal(error.details.readerCauseCode, null);
            return true;
        }
    );
});

test('M3B2 read capabilities fail closed on thrown reads and Promise/thenable leakage', async () => {
    const { createConditionReadCapabilities, EngineContractError } = await modules();
    const throwing = createConditionReadCapabilities(validReads({
        trait: { has: () => { throw new Error('boom'); } },
    }));
    assert.throws(
        () => throwing.trait.has('evolve:trait/test'),
        error => error instanceof EngineContractError && error.code === 'CONDITION_READ_FAILURE'
    );

    const promised = createConditionReadCapabilities(validReads({
        resource: { available: () => Promise.resolve(true) },
    }));
    assert.throws(
        () => promised.resource.available('evolve:resource/test'),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_RESULT'
    );

    const thenable = createConditionReadCapabilities(validReads({
        resource: { amount: () => ({ then(){} }) },
    }));
    assert.throws(
        () => thenable.resource.amount('evolve:resource/test'),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONDITION_READ_RESULT'
    );
});
