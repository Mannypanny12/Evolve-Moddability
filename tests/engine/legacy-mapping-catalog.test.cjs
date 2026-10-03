'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const catalogPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/mapping-catalog.mjs')).href);
const evolvePromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);
const inspectorPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/inspector.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function directRecord(overrides = {}){
    return {
        id: 'evolve.resource.test',
        domain: 'resources',
        family: 'resource',
        mode: 'direct',
        legacyPath: 'global.resource.Test',
        canonicalIds: ['evolve:resource/test'],
        contextKeys: [],
        owner: { packageId: 'evolve', source: 'test' },
        introducedIn: 'M1D',
        removeBy: 'M6B',
        stateSemantics: 'Test mapping.',
        sourceLocations: ['src/resources.js'],
        ...overrides,
    };
}

test('M1D legacy mapping catalog validates and deterministically enumerates mappings', async () => {
    const { LegacyMappingCatalog } = await catalogPromise;
    const catalog = new LegacyMappingCatalog();
    const second = directRecord({
        id: 'evolve.resource.zeta',
        legacyPath: 'global.resource.Zeta',
        canonicalIds: ['evolve:resource/zeta'],
    });
    const first = directRecord({
        id: 'evolve.resource.alpha',
        legacyPath: 'global.resource.Alpha',
        canonicalIds: ['evolve:resource/alpha'],
    });
    catalog.register(second);
    catalog.register(first);

    assert.deepEqual(catalog.entries().map(item => item.id), [
        'evolve.resource.alpha',
        'evolve.resource.zeta',
    ]);
    assert.ok(Object.isFrozen(catalog.getRequired('evolve.resource.alpha')));
});

test('M1D legacy mapping catalog rejects family mismatch, malformed contextual mappings and duplicates', async () => {
    const [{ LegacyMappingCatalog }, { EngineContractError }] = await Promise.all([catalogPromise, identityPromise]);
    const catalog = new LegacyMappingCatalog();

    assert.throws(
        () => catalog.register(directRecord({ canonicalIds: ['evolve:technology/test'] })),
        error => error instanceof EngineContractError && error.code === 'LEGACY_MAPPING_FAMILY_MISMATCH'
    );
    assert.throws(
        () => catalog.register(directRecord({ mode: 'contextual', contextKeys: [] })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_FIELD'
    );

    catalog.register(directRecord());
    assert.throws(
        () => catalog.register(directRecord()),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_LEGACY_MAPPING'
    );
    assert.equal(catalog.size, 1);
});

test('M1D seeded Evolve mappings expose explicit lifecycle and contextual semantics', async () => {
    const [{ createEvolveLegacyMappingCatalog }, { inspectLegacyMappings }] = await Promise.all([
        evolvePromise,
        inspectorPromise,
    ]);
    const snapshot = inspectLegacyMappings(createEvolveLegacyMappingCatalog());

    assert.equal(snapshot.size, 2);
    const food = snapshot.mappings.find(mapping => mapping.id === 'evolve.resource.food_state');
    const primitive = snapshot.mappings.find(mapping => mapping.id === 'evolve.technology.primitive_progression');

    assert.equal(food.mode, 'direct');
    assert.equal(food.removeBy, 'M6B');
    assert.deepEqual(food.canonicalIds, ['evolve:resource/food']);

    assert.equal(primitive.mode, 'contextual');
    assert.equal(primitive.removeBy, 'M6E');
    assert.equal(primitive.legacyPath, 'global.tech.primitive');
    assert.deepEqual(primitive.canonicalIds, [
        'evolve:technology/bone_tools',
        'evolve:technology/club',
        'evolve:technology/sundial',
        'evolve:technology/wooden_tools',
    ]);
    assert.ok(primitive.contextKeys.length > 0);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.mappings));
});
