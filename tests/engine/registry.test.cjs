'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const registryPromise = import(pathToFileURL(path.resolve(__dirname, '../../src/engine/registry.mjs')).href);
const identityPromise = import(pathToFileURL(path.resolve(__dirname, '../../src/engine/identity.mjs')).href);

async function modules(){
    const [registry, identity] = await Promise.all([registryPromise, identityPromise]);
    return { ...registry, ...identity };
}

function resourceRecord(id, aliases = [], extra = {}){
    return {
        id,
        owner: { packageId: 'evolve', source: 'vanilla' },
        schemaVersion: 1,
        tags: ['basic'],
        aliases,
        definition: { marker: id },
        ...extra,
    };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(fn, error => error instanceof EngineContractError && error.code === code);
}

test('M1A registry is typed and retains immutable identity metadata', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    const definition = { stackable: true };
    const entry = resources.register(resourceRecord('evolve:resource/food', ['Food'], { definition }));

    assert.equal(resources.type, 'resource');
    assert.equal(resources.size, 1);
    assert.equal(resources.get('evolve:resource/food'), entry);
    assert.equal(entry.definition, definition);
    assert.deepEqual(entry.owner, { packageId: 'evolve', source: 'vanilla' });
    assert.deepEqual(entry.tags, ['basic']);
    assert.deepEqual(entry.aliases, ['Food']);
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.owner), true);
    assert.equal(Object.isFrozen(entry.tags), true);
    assert.equal(Object.isFrozen(entry.aliases), true);

    assert.throws(() => { entry.id = 'evolve:resource/stone'; }, TypeError);
    assert.throws(() => { entry.owner.packageId = 'example'; }, TypeError);
    assert.throws(() => { entry.tags.push('changed'); }, TypeError);
    assert.throws(() => { entry.aliases.push('Changed'); }, TypeError);

    definition.stackable = false;
    assert.equal(entry.definition.stackable, false, 'M1A deliberately leaves definition lifecycle to M1B');
});

test('M1A typed registry rejects IDs from another definition family', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    await expectCode(
        () => resources.register(resourceRecord('evolve:technology/agriculture')),
        'REGISTRY_TYPE_MISMATCH'
    );
    await expectCode(() => resources.get('evolve:technology/agriculture'), 'REGISTRY_TYPE_MISMATCH');
});

test('M1A registry forbids duplicate canonical IDs and silent replacement', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    const first = resources.register(resourceRecord('evolve:resource/food'));

    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', [], { definition: { marker: 'replacement' } })),
        'DUPLICATE_CONTENT_ID'
    );
    assert.equal(resources.size, 1);
    assert.equal(resources.get('evolve:resource/food'), first);
    assert.equal(typeof resources.replace, 'undefined');
    assert.equal(typeof resources.delete, 'undefined');
    assert.equal(typeof resources.clear, 'undefined');
});

test('M1A validates owner, schema version, tags, and required definition presence', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });

    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', [], { owner: { packageId: 'Evolve', source: 'vanilla' } })),
        'INVALID_OWNER'
    );
    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', [], { owner: { packageId: 'evolve', source: ' vanilla ' } })),
        'INVALID_OWNER'
    );
    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', [], { schemaVersion: 0 })),
        'INVALID_SCHEMA_VERSION'
    );
    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', [], { tags: ['basic', 'basic'] })),
        'INVALID_TAG'
    );

    const missingDefinition = resourceRecord('evolve:resource/food');
    delete missingDefinition.definition;
    await expectCode(() => resources.register(missingDefinition), 'INVALID_REGISTRY_ENTRY');
});

test('M1A legacy aliases resolve explicitly and are never normal lookup identities', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    resources.register(resourceRecord('evolve:resource/food', ['Food', 'legacy_food']));

    assert.equal(resources.resolveAlias('Food'), 'evolve:resource/food');
    assert.equal(resources.resolveAlias('legacy_food'), 'evolve:resource/food');
    assert.equal(resources.resolveAlias('Unknown'), undefined);
    assert.equal(resources.hasAlias('Food'), true);
    assert.equal(resources.hasAlias('Unknown'), false);
    await expectCode(() => resources.get('Food'), 'INVALID_CONTENT_ID');
    await expectCode(() => resources.resolveAlias('evolve:resource/food'), 'INVALID_LEGACY_ALIAS');
});

test('M1A alias collisions fail atomically and aliases are scoped to one registry', async () => {
    const { Registry } = await modules();
    const first = new Registry({ type: 'resource' });
    first.register(resourceRecord('evolve:resource/food', ['Food']));

    await expectCode(
        () => first.register(resourceRecord('example:resource/rations', ['Food', 'Rations'], {
            owner: { packageId: 'example', source: 'test' },
        })),
        'DUPLICATE_LEGACY_ALIAS'
    );
    assert.equal(first.has('example:resource/rations'), false);
    assert.equal(first.resolveAlias('Rations'), undefined);

    const second = new Registry({ type: 'resource' });
    second.register(resourceRecord('example:resource/rations', ['Food'], {
        owner: { packageId: 'example', source: 'test' },
    }));
    assert.equal(second.resolveAlias('Food'), 'example:resource/rations');
});

test('M1A rejects duplicate aliases inside one registration and canonical IDs as aliases', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', ['Food', 'Food'])),
        'DUPLICATE_LEGACY_ALIAS'
    );
    await expectCode(
        () => resources.register(resourceRecord('evolve:resource/food', ['evolve:resource/legacy_food'])),
        'INVALID_LEGACY_ALIAS'
    );
    assert.equal(resources.size, 0);
});

test('M1A distinguishes a valid unknown ID from malformed input and offers strict getRequired()', async () => {
    const { Registry } = await modules();
    const resources = new Registry({ type: 'resource' });
    assert.equal(resources.get('evolve:resource/unknown'), undefined);
    assert.equal(resources.has('evolve:resource/unknown'), false);
    await expectCode(() => resources.getRequired('evolve:resource/unknown'), 'UNKNOWN_CONTENT_ID');
    await expectCode(() => resources.get('not-an-id'), 'INVALID_CONTENT_ID');
});

test('M1A registry iteration is canonical-ID sorted regardless of registration order', async () => {
    const { Registry } = await modules();
    const first = new Registry({ type: 'resource' });
    const second = new Registry({ type: 'resource' });
    const records = [
        resourceRecord('evolve:resource/stone', ['Stone']),
        resourceRecord('example:resource/mana', ['Mana'], { owner: { packageId: 'example', source: 'test' } }),
        resourceRecord('evolve:resource/food', ['Food']),
    ];

    for (const record of records) first.register(record);
    for (const record of [...records].reverse()) second.register(record);

    const expected = [
        'evolve:resource/food',
        'evolve:resource/stone',
        'example:resource/mana',
    ];
    assert.deepEqual(first.ids(), expected);
    assert.deepEqual(second.ids(), expected);
    assert.deepEqual(first.entries().map(entry => entry.id), expected);
    assert.deepEqual([...first].map(entry => entry.id), expected);
});
