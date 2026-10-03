'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const inspectorPromise = import(pathToFileURL(path.join(root, 'src/engine/inspection/registry-inspector.mjs')).href);
const resourcePromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/resource.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function registerResource(registry, id, alias, source){
    return registry.register({
        id,
        owner: { packageId: 'evolve', source },
        schemaVersion: 1,
        tags: ['sample'],
        aliases: [alias],
        definition: {
            presentation: { nameKey: `resource_${alias}_name`, colorRole: 'info' },
            properties: { tradable: true, stackable: true },
        },
    });
}

test('M1D registry inspector exposes deterministic family, ownership, aliases and definitions', async () => {
    const [{ inspectRegistry, inspectRegistries }, { createResourceRegistry }] = await Promise.all([
        inspectorPromise,
        resourcePromise,
    ]);
    const registry = createResourceRegistry();
    registerResource(registry, 'evolve:resource/stone', 'Stone', 'test-stone');
    registerResource(registry, 'evolve:resource/food', 'Food', 'test-food');

    const snapshot = inspectRegistry(registry);
    assert.equal(snapshot.family, 'resource');
    assert.equal(snapshot.size, 2);
    assert.deepEqual(snapshot.ids, ['evolve:resource/food', 'evolve:resource/stone']);
    assert.deepEqual(snapshot.aliases, [
        { alias: 'Food', id: 'evolve:resource/food' },
        { alias: 'Stone', id: 'evolve:resource/stone' },
    ]);
    assert.equal(snapshot.entries[0].owner.packageId, 'evolve');
    assert.equal(snapshot.entries[0].owner.source, 'test-food');
    assert.equal(snapshot.entries[0].definition.presentation.nameKey, 'resource_Food_name');
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.entries));
    assert.ok(Object.isFrozen(snapshot.entries[0].definition));

    const collection = inspectRegistries([registry]);
    assert.equal(collection[0].family, 'resource');
    assert.ok(Object.isFrozen(collection));
});

test('M1D registry inspector snapshots opaque bare-registry definitions without invoking accessors', async () => {
    const [{ inspectRegistry }, { Registry }] = await Promise.all([
        inspectorPromise,
        import(pathToFileURL(path.join(root, 'src/engine/registry.mjs')).href),
    ]);
    const registry = new Registry({ type: 'resource' });
    let getterCalls = 0;
    const definition = {};
    Object.defineProperty(definition, 'danger', {
        enumerable: true,
        get(){
            getterCalls++;
            throw new Error('must not execute');
        },
    });
    registry.register({
        id: 'evolve:resource/opaque',
        owner: { packageId: 'evolve', source: 'opaque-test' },
        schemaVersion: 1,
        aliases: ['Opaque'],
        definition,
    });

    const snapshot = inspectRegistry(registry);
    assert.equal(getterCalls, 0);
    assert.equal(snapshot.entries[0].definition.danger, '<accessor>');
});

test('M1D contract error inspector renders structured diagnostics safely', async () => {
    const [{ inspectContractError }, { EngineContractError }] = await Promise.all([
        inspectorPromise,
        identityPromise,
    ]);
    const circular = { label: 'root' };
    circular.self = circular;
    const error = new EngineContractError('TEST_FAILURE', 'diagnostic failure', { circular, count: 2n });
    const snapshot = inspectContractError(error);

    assert.equal(snapshot.contractError, true);
    assert.equal(snapshot.code, 'TEST_FAILURE');
    assert.equal(snapshot.details.count, '2n');
    assert.equal(snapshot.details.circular.self, '<circular>');
    assert.ok(Object.isFrozen(snapshot.details));

    const ordinary = inspectContractError(new Error('ordinary'));
    assert.equal(ordinary.contractError, false);
    assert.equal(ordinary.message, 'ordinary');
});

test('M1D registry inspector rejects non-registry targets with a contract error', async () => {
    const [{ inspectRegistry }, { EngineContractError }] = await Promise.all([
        inspectorPromise,
        identityPromise,
    ]);
    assert.throws(
        () => inspectRegistry({}),
        error => error instanceof EngineContractError && error.code === 'INVALID_INSPECTION_TARGET'
    );
});
