'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const registryPromise = import(pathToFileURL(path.join(root, 'src/engine/registry.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);
const resourcePromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/resource.mjs')).href);

async function modules(){
    const [registry, identity, resource] = await Promise.all([registryPromise, identityPromise, resourcePromise]);
    return { ...registry, ...identity, ...resource };
}

function record(id, definition, extra = {}){
    return {
        id,
        owner: { packageId: id.slice(0, id.indexOf(':')), source: 'm1b-hardening-test' },
        schemaVersion: 1,
        tags: [],
        aliases: [],
        definition,
        ...extra,
    };
}

function capture(fn){
    try {
        fn();
    }
    catch (error){
        return error;
    }
    assert.fail('Expected function to throw');
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    const error = capture(fn);
    assert.equal(error instanceof EngineContractError, true, `expected EngineContractError, got ${error && error.constructor && error.constructor.name}`);
    assert.equal(error.code, code);
    return error;
}

function foodDefinition(nameKey = 'resource_Food_name'){
    return {
        presentation: { nameKey, colorRole: 'info' },
        properties: { tradable: true, stackable: true },
    };
}

test('M1B rejects revoked proxies as structured definition failures at root and nested paths', async () => {
    const { createResourceRegistry } = await modules();

    const rootProxy = Proxy.revocable({}, {});
    rootProxy.revoke();
    await expectCode(
        () => createResourceRegistry().register(record('evolve:resource/food', rootProxy.proxy)),
        'INVALID_DEFINITION'
    );

    const nestedProxy = Proxy.revocable({}, {});
    nestedProxy.revoke();
    const nested = foodDefinition();
    nested.presentation = nestedProxy.proxy;
    await expectCode(
        () => createResourceRegistry().register(record('evolve:resource/food', nested)),
        'INVALID_DEFINITION'
    );
});

test('M1B validating registries canonicalize returned data into detached deep immutable records', async () => {
    const { Registry } = await modules();
    const source = {
        nested: { value: 1 },
        list: [{ marker: 'a' }, 2, true, null],
    };
    const registry = new Registry({
        type: 'resource',
        definitionValidator(){
            return source;
        },
    });

    const entry = registry.register(record('evolve:resource/food', { ignored: true }));
    assert.notEqual(entry.definition, source);
    assert.notEqual(entry.definition.nested, source.nested);
    assert.notEqual(entry.definition.list, source.list);
    assert.notEqual(entry.definition.list[0], source.list[0]);
    assert.equal(Object.isFrozen(entry.definition), true);
    assert.equal(Object.isFrozen(entry.definition.nested), true);
    assert.equal(Object.isFrozen(entry.definition.list), true);
    assert.equal(Object.isFrozen(entry.definition.list[0]), true);

    source.nested.value = 9;
    source.list[0].marker = 'changed';
    source.list.push('late');
    assert.deepEqual(entry.definition, {
        list: [{ marker: 'a' }, 2, true, null],
        nested: { value: 1 },
    });
});

test('M1B validator output contract rejects async, missing, cyclic, accessor, and unsupported values', async () => {
    const { Registry } = await modules();

    const cases = [
        () => undefined,
        async () => ({ value: 1 }),
        () => {
            const cyclic = {};
            cyclic.self = cyclic;
            return cyclic;
        },
        () => {
            let calls = 0;
            const value = {};
            Object.defineProperty(value, 'secret', {
                enumerable: true,
                get(){ calls++; return 1; },
            });
            Object.defineProperty(value, 'getterCalls', { value: () => calls, enumerable: false });
            return value;
        },
        () => ({ value: Infinity }),
    ];

    for (const validator of cases){
        const registry = new Registry({ type: 'resource', definitionValidator: validator });
        await expectCode(
            () => registry.register(record('evolve:resource/food', {})),
            'INVALID_CANONICAL_DEFINITION'
        );
        assert.equal(registry.size, 0);
    }
});

test('M1B wraps unexpected validator exceptions without leaking native failures', async () => {
    const { Registry } = await modules();
    const registry = new Registry({
        type: 'resource',
        definitionValidator(){
            throw new TypeError('validator exploded');
        },
    });
    const error = await expectCode(
        () => registry.register(record('evolve:resource/food', {})),
        'DEFINITION_VALIDATOR_FAILURE'
    );
    assert.equal(error.details.definitionId, 'evolve:resource/food');
    assert.equal(error.details.definitionOwnerPackageId, 'evolve');
    assert.equal(error.details.definitionSchemaVersion, 1);
    assert.equal(registry.size, 0);
});

test('M1B family validation errors carry canonical definition identity context', async () => {
    const { createResourceRegistry } = await modules();
    const error = await expectCode(
        () => createResourceRegistry().register(record(
            'evolve:resource/food',
            foodDefinition('bad localization key')
        )),
        'INVALID_DEFINITION_FIELD'
    );
    assert.equal(error.details.definitionId, 'evolve:resource/food');
    assert.equal(error.details.definitionOwnerPackageId, 'evolve');
    assert.equal(error.details.definitionSchemaVersion, 1);
    assert.equal(error.details.path, 'resource.presentation.nameKey');
});

test('M1B localization references reject malformed forms but allow legacy and one future namespace', async () => {
    const { createResourceRegistry } = await modules();
    for (const invalid of [
        'resource Food name',
        'resource_Food_name\n',
        ':missing_namespace',
        'foo:',
        'foo:bar:baz',
        'Example:resource_key',
    ]){
        await expectCode(
            () => createResourceRegistry().register(record('evolve:resource/food', foodDefinition(invalid))),
            'INVALID_DEFINITION_FIELD'
        );
    }

    const legacy = createResourceRegistry().register(record(
        'evolve:resource/food',
        foodDefinition('resource_Food_name')
    ));
    assert.equal(legacy.definition.presentation.nameKey, 'resource_Food_name');

    const namespaced = createResourceRegistry().register(record(
        'example:resource/rations',
        foodDefinition('example:resource_rations_name')
    ));
    assert.equal(namespaced.definition.presentation.nameKey, 'example:resource_rations_name');
});
