'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const importModule = relative => import(pathToFileURL(path.join(root, relative)).href);

const identityPromise = importModule('src/engine/identity.mjs');
const registryPromise = importModule('src/engine/registry.mjs');
const inspectorPromise = importModule('src/engine/inspection/registry-inspector.mjs');
const mappingPromise = importModule('src/legacy/bridge/mapping-catalog.mjs');

function baseEntry(overrides = {}){
    return {
        id: 'evolve:resource/test',
        owner: { packageId: 'evolve', source: 'm1-closure-test' },
        schemaVersion: 1,
        tags: ['test'],
        aliases: ['Test'],
        definition: { sample: true },
        ...overrides,
    };
}

function baseMapping(overrides = {}){
    return {
        id: 'evolve.resource.test_state',
        domain: 'resources',
        family: 'resource',
        mode: 'direct',
        legacyPath: 'global.resource.Test',
        canonicalIds: ['evolve:resource/test'],
        contextKeys: [],
        owner: { packageId: 'evolve', source: 'm1-closure-test' },
        introducedIn: 'M1D',
        removeBy: 'M6B',
        stateSemantics: 'Test legacy state mapping.',
        sourceLocations: ['src/resources.js'],
        ...overrides,
    };
}

async function expectCode(action, code){
    const { EngineContractError } = await identityPromise;
    assert.throws(action, error => error instanceof EngineContractError && error.code === code);
}

test('M1 closure keeps identity formatting and error diagnostics inert around accessors', async () => {
    const { EngineContractError, formatContentId } = await identityPromise;

    let componentGetterCalls = 0;
    const options = { type: 'resource', localId: 'food' };
    Object.defineProperty(options, 'namespace', {
        enumerable: true,
        get(){
            componentGetterCalls++;
            return 'evolve';
        },
    });
    assert.throws(
        () => formatContentId(options),
        error => error instanceof EngineContractError && error.code === 'INVALID_CONTENT_ID'
    );
    assert.equal(componentGetterCalls, 0);

    let detailGetterCalls = 0;
    const details = {};
    Object.defineProperty(details, 'danger', {
        enumerable: true,
        get(){
            detailGetterCalls++;
            throw new Error('must not execute');
        },
    });
    const error = new EngineContractError('TEST', 'test', details);
    assert.equal(detailGetterCalls, 0);
    assert.equal(error.details.danger, '<accessor>');
    assert.ok(Object.isFrozen(error.details));
});

test('M1 closure registry metadata validation does not execute record or array accessors', async () => {
    const [{ Registry }, { EngineContractError }] = await Promise.all([registryPromise, identityPromise]);

    let optionGetterCalls = 0;
    const options = {};
    Object.defineProperty(options, 'type', {
        enumerable: true,
        get(){
            optionGetterCalls++;
            return 'resource';
        },
    });
    assert.throws(
        () => new Registry(options),
        error => error instanceof EngineContractError && error.code === 'INVALID_REGISTRY_OPTIONS'
    );
    assert.equal(optionGetterCalls, 0);

    const registry = new Registry({ type: 'resource' });
    let definitionGetterCalls = 0;
    const record = baseEntry();
    Object.defineProperty(record, 'definition', {
        enumerable: true,
        configurable: true,
        get(){
            definitionGetterCalls++;
            return { sample: true };
        },
    });
    assert.throws(
        () => registry.register(record),
        error => error instanceof EngineContractError && error.code === 'INVALID_REGISTRY_ENTRY'
    );
    assert.equal(definitionGetterCalls, 0);
    assert.equal(registry.size, 0);

    let tagGetterCalls = 0;
    const tags = [];
    Object.defineProperty(tags, '0', {
        enumerable: true,
        configurable: true,
        get(){
            tagGetterCalls++;
            return 'test';
        },
    });
    tags.length = 1;
    assert.throws(
        () => registry.register(baseEntry({ tags })),
        error => error instanceof EngineContractError && error.code === 'INVALID_TAG'
    );
    assert.equal(tagGetterCalls, 0);
    assert.equal(registry.size, 0);
});

test('M1 closure inspector stays fail-safe for hostile functions, errors, and registry arrays', async () => {
    const [{ inspectContractError, inspectRegistries }, { Registry }] = await Promise.all([
        inspectorPromise,
        registryPromise,
    ]);

    const hostileFunction = new Proxy(function target(){}, {
        getOwnPropertyDescriptor(target, property){
            if (property === 'name') throw new Error('name descriptor blocked');
            return Reflect.getOwnPropertyDescriptor(target, property);
        },
    });
    const ordinary = new Error('ordinary');
    ordinary.details = { hostileFunction };
    assert.doesNotThrow(() => inspectContractError(ordinary));

    const hostileError = new Proxy(new Error('hidden'), {
        get(){ throw new Error('property getter blocked'); },
    });
    const inspected = inspectContractError(hostileError);
    assert.equal(inspected.contractError, false);
    assert.equal(inspected.name, 'Error');
    assert.equal(inspected.message, 'hidden');

    const registry = new Registry({ type: 'resource' });
    let arrayGetterCalls = 0;
    const registries = [];
    Object.defineProperty(registries, '0', {
        enumerable: true,
        configurable: true,
        get(){
            arrayGetterCalls++;
            return registry;
        },
    });
    registries.length = 1;
    await expectCode(() => inspectRegistries(registries), 'INVALID_INSPECTION_TARGET');
    assert.equal(arrayGetterCalls, 0);
});

test('M1 closure legacy mappings enforce temporary lifecycle and direct/contextual semantics', async () => {
    const [{ LegacyMappingCatalog }, { EngineContractError }] = await Promise.all([mappingPromise, identityPromise]);

    const catalog = new LegacyMappingCatalog();
    assert.throws(
        () => catalog.register(baseMapping({ contextKeys: ['global.race.evil'] })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_FIELD'
    );
    assert.throws(
        () => catalog.register(baseMapping({ introducedIn: 'M6B', removeBy: 'M1D' })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_LIFECYCLE'
    );
    assert.throws(
        () => catalog.register(baseMapping({ removeBy: 'M10A' })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_LIFECYCLE'
    );
    assert.throws(
        () => catalog.register(baseMapping({
            mode: 'contextual',
            contextKeys: ['race.evil'],
        })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_FIELD'
    );
    assert.equal(catalog.size, 0);

    const first = catalog.register(baseMapping());
    assert.equal(first.removeBy, 'M6B');
    assert.throws(
        () => catalog.register(baseMapping({
            id: 'evolve.resource.same_path',
            canonicalIds: ['evolve:resource/other'],
        })),
        error => error instanceof EngineContractError && error.code === 'DUPLICATE_LEGACY_MAPPING_PATH'
    );
    assert.equal(catalog.size, 1);
    assert.throws(
        () => catalog.get({ toString(){ throw new Error('must not stringify'); } }),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_ID'
    );
});

test('M1 closure legacy mapping arrays reject accessor-backed values without executing them', async () => {
    const [{ LegacyMappingCatalog }, { EngineContractError }] = await Promise.all([mappingPromise, identityPromise]);
    const catalog = new LegacyMappingCatalog();
    let getterCalls = 0;
    const ids = [];
    Object.defineProperty(ids, '0', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 'evolve:resource/test';
        },
    });
    ids.length = 1;

    assert.throws(
        () => catalog.register(baseMapping({ canonicalIds: ids })),
        error => error instanceof EngineContractError && error.code === 'INVALID_LEGACY_MAPPING_FIELD'
    );
    assert.equal(getterCalls, 0);
    assert.equal(catalog.size, 0);
});
