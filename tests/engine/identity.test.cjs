'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const identityPromise = import(pathToFileURL(path.resolve(__dirname, '../../src/engine/identity.mjs')).href);

async function identity(){
    return identityPromise;
}

async function expectCode(fn, code){
    const { EngineContractError } = await identity();
    assert.throws(fn, error => error instanceof EngineContractError && error.code === code);
}

test('M1A parses canonical namespaced content IDs into immutable components', async () => {
    const { parseContentId } = await identity();
    const parsed = parseContentId('evolve:structure/space/mars/mining_outpost');
    assert.deepEqual(parsed, {
        canonical: 'evolve:structure/space/mars/mining_outpost',
        namespace: 'evolve',
        type: 'structure',
        localId: 'space/mars/mining_outpost',
    });
    assert.equal(Object.isFrozen(parsed), true);
});

test('M1A formats and parses canonical IDs without normalization', async () => {
    const { formatContentId, parseContentId } = await identity();
    const id = formatContentId({ namespace: 'warcraft', type: 'unit', localId: 'human/footman_2' });
    assert.equal(id, 'warcraft:unit/human/footman_2');
    assert.equal(parseContentId(id).canonical, id);

    await expectCode(() => parseContentId('Evolve:resource/food'), 'INVALID_NAMESPACE');
    await expectCode(() => parseContentId('evolve:Resource/food'), 'INVALID_CONTENT_TYPE');
    await expectCode(() => parseContentId('evolve:resource/Food'), 'INVALID_LOCAL_ID');
    await expectCode(() => parseContentId(' evolve:resource/food'), 'INVALID_NAMESPACE');
    await expectCode(() => parseContentId('evolve:resource/food '), 'INVALID_LOCAL_ID');
});

test('M1A rejects malformed content ID structure and local paths', async () => {
    const { parseContentId } = await identity();
    for (const invalid of [
        '',
        'food',
        'evolve',
        'evolve:',
        'evolve:resource',
        'evolve:resource/',
        'evolve::resource/food',
        'evolve:resource//food',
        'evolve:resource/food/',
        'evolve:resource/food.bar',
    ]){
        assert.throws(() => parseContentId(invalid), error => typeof error.code === 'string');
    }
    await expectCode(() => parseContentId(null), 'INVALID_CONTENT_ID');
});

test('M1A validates identity components independently', async () => {
    const { assertNamespace, assertContentType, assertLocalId } = await identity();
    assert.equal(assertNamespace('example_mod'), 'example_mod');
    assert.equal(assertContentType('technology'), 'technology');
    assert.equal(assertLocalId('deep_space/gas_moon'), 'deep_space/gas_moon');

    await expectCode(() => assertNamespace('Example'), 'INVALID_NAMESPACE');
    await expectCode(() => assertContentType('resource/item'), 'INVALID_CONTENT_TYPE');
    await expectCode(() => assertLocalId('bad//path'), 'INVALID_LOCAL_ID');
});

test('M1A validation diagnostics stay structured for hostile values', async () => {
    const { assertNamespace, formatContentId, parseContentId } = await identity();
    const circular = {};
    circular.self = circular;

    await expectCode(() => assertNamespace(1n), 'INVALID_NAMESPACE');
    await expectCode(() => parseContentId(1n), 'INVALID_CONTENT_ID');
    await expectCode(() => parseContentId(circular), 'INVALID_CONTENT_ID');
    await expectCode(() => formatContentId(null), 'INVALID_CONTENT_ID');
    await expectCode(() => formatContentId([]), 'INVALID_CONTENT_ID');
});

test('M1A canonical-ID predicate never treats malformed or legacy strings as canonical', async () => {
    const { isCanonicalContentId } = await identity();
    assert.equal(isCanonicalContentId('evolve:resource/food'), true);
    assert.equal(isCanonicalContentId('Food'), false);
    assert.equal(isCanonicalContentId('tech-agriculture'), false);
    assert.equal(isCanonicalContentId('evolve:resource/Food'), false);
    assert.equal(isCanonicalContentId(undefined), false);
    assert.equal(isCanonicalContentId(1n), false);
});
