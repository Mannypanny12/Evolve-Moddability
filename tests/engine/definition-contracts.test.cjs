'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const registryPromise = import(pathToFileURL(path.join(root, 'src/engine/registry.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);
const achievementPromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/achievement.mjs')).href);
const resourcePromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/resource.mjs')).href);
const technologyPromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/technology.mjs')).href);

async function modules(){
    const [registry, identity, achievement, resource, technology] = await Promise.all([
        registryPromise,
        identityPromise,
        achievementPromise,
        resourcePromise,
        technologyPromise,
    ]);
    return { ...registry, ...identity, ...achievement, ...resource, ...technology };
}

function record(id, definition, aliases = [], extra = {}){
    return {
        id,
        owner: { packageId: id.slice(0, id.indexOf(':')), source: 'vanilla-contract-test' },
        schemaVersion: 1,
        tags: ['vanilla-sample'],
        aliases,
        definition,
        ...extra,
    };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(fn, error => error instanceof EngineContractError && error.code === code);
}

function massExtinctionDefinition(){
    return {
        presentation: {
            nameKey: 'achieve_mass_extinction_name',
            descriptionKey: 'achieve_mass_extinction_desc',
            flairKey: 'achieve_mass_extinction_flair',
        },
        classification: { category: 'species' },
    };
}

function foodDefinition(){
    return {
        presentation: { nameKey: 'resource_Food_name', colorRole: 'info' },
        properties: { tradable: true, stackable: true },
    };
}

function clubDefinition(){
    return {
        presentation: { nameKey: 'tech_club', descriptionKey: 'tech_club_desc' },
        classification: { category: 'agriculture', era: 'primitive' },
    };
}

test('M1B represents real vanilla achievement, resource, and technology metadata without runtime state', async () => {
    const { createAchievementRegistry, createResourceRegistry, createTechnologyRegistry } = await modules();
    const achievements = createAchievementRegistry();
    const resources = createResourceRegistry();
    const technologies = createTechnologyRegistry();

    const achievement = achievements.register(record(
        'evolve:achievement/mass_extinction',
        massExtinctionDefinition(),
        ['mass_extinction']
    ));
    const resource = resources.register(record('evolve:resource/food', foodDefinition(), ['Food']));
    const technology = technologies.register(record('evolve:technology/club', clubDefinition(), ['club', 'tech-club']));

    assert.equal(achievements.resolveAlias('mass_extinction'), achievement.id);
    assert.equal(resources.resolveAlias('Food'), resource.id);
    assert.equal(technologies.resolveAlias('club'), technology.id);
    assert.equal(technologies.resolveAlias('tech-club'), technology.id);
    assert.equal(technologies.resolveAlias('primitive'), undefined, 'shared progression state is not a direct legacy alias');

    assert.deepEqual(achievement.definition.classification, { category: 'species' });
    assert.deepEqual(resource.definition.properties, { tradable: true, stackable: true });
    assert.deepEqual(technology.definition.classification, { category: 'agriculture', era: 'primitive' });

    assert.equal('unlocked' in achievement.definition, false);
    assert.equal('amount' in resource.definition, false);
    assert.equal('max' in resource.definition, false);
    assert.equal('reqs' in technology.definition, false);
    assert.equal('cost' in technology.definition, false);
    assert.equal('action' in technology.definition, false);
});

test('M1B validators canonicalize definitions into detached deeply immutable records', async () => {
    const { createResourceRegistry } = await modules();
    const resources = createResourceRegistry();
    const input = foodDefinition();
    const entry = resources.register(record('evolve:resource/food', input, ['Food']));

    assert.notEqual(entry.definition, input);
    assert.notEqual(entry.definition.presentation, input.presentation);
    assert.notEqual(entry.definition.properties, input.properties);
    assert.equal(Object.isFrozen(entry.definition), true);
    assert.equal(Object.isFrozen(entry.definition.presentation), true);
    assert.equal(Object.isFrozen(entry.definition.properties), true);

    input.presentation.nameKey = 'changed_after_registration';
    input.properties.tradable = false;
    assert.equal(entry.definition.presentation.nameKey, 'resource_Food_name');
    assert.equal(entry.definition.properties.tradable, true);
    assert.throws(() => { entry.definition.presentation.nameKey = 'mutated'; }, TypeError);
});

test('M1B enforces namespace ownership for every package and reserves evolve naturally', async () => {
    const { createResourceRegistry } = await modules();
    const resources = createResourceRegistry();

    await expectCode(
        () => resources.register(record('evolve:resource/food', foodDefinition(), ['Food'], {
            owner: { packageId: 'example', source: 'test' },
        })),
        'CONTENT_NAMESPACE_OWNER_MISMATCH'
    );
    assert.equal(resources.size, 0);
    assert.equal(resources.resolveAlias('Food'), undefined);

    const custom = resources.register(record('example:resource/rations', {
        presentation: { nameKey: 'example:resource_rations_name', colorRole: 'info' },
        properties: { tradable: true, stackable: false },
    }, ['Rations'], {
        owner: { packageId: 'example', source: 'test' },
    }));
    assert.equal(custom.owner.packageId, 'example');
});

test('M1B family contracts reject unsupported schema versions before registration', async () => {
    const { createAchievementRegistry, createResourceRegistry, createTechnologyRegistry } = await modules();
    const cases = [
        [createAchievementRegistry(), 'evolve:achievement/mass_extinction', massExtinctionDefinition()],
        [createResourceRegistry(), 'evolve:resource/food', foodDefinition()],
        [createTechnologyRegistry(), 'evolve:technology/club', clubDefinition()],
    ];

    for (const [registry, id, definition] of cases){
        await expectCode(
            () => registry.register(record(id, definition, [], { schemaVersion: 2 })),
            'UNSUPPORTED_DEFINITION_SCHEMA_VERSION'
        );
        assert.equal(registry.size, 0);
    }
});

test('M1B contracts are closed and reject runtime or future-behavior fields rather than ignoring them', async () => {
    const { createAchievementRegistry, createResourceRegistry, createTechnologyRegistry } = await modules();

    const achievement = massExtinctionDefinition();
    achievement.unlocked = true;
    await expectCode(
        () => createAchievementRegistry().register(record('evolve:achievement/mass_extinction', achievement)),
        'UNKNOWN_DEFINITION_FIELD'
    );

    const resource = foodDefinition();
    resource.amount = 10;
    await expectCode(
        () => createResourceRegistry().register(record('evolve:resource/food', resource)),
        'UNKNOWN_DEFINITION_FIELD'
    );

    const technology = clubDefinition();
    technology.action = () => true;
    await expectCode(
        () => createTechnologyRegistry().register(record('evolve:technology/club', technology)),
        'UNKNOWN_DEFINITION_FIELD'
    );

    const typo = clubDefinition();
    typo.presentation.descriptonKey = 'typo';
    await expectCode(
        () => createTechnologyRegistry().register(record('evolve:technology/club', typo)),
        'UNKNOWN_DEFINITION_FIELD'
    );
});

test('M1B contracts validate field types and required metadata', async () => {
    const { createAchievementRegistry, createResourceRegistry, createTechnologyRegistry } = await modules();

    const achievement = massExtinctionDefinition();
    delete achievement.presentation.flairKey;
    await expectCode(
        () => createAchievementRegistry().register(record('evolve:achievement/mass_extinction', achievement)),
        'INVALID_DEFINITION_FIELD'
    );

    const resource = foodDefinition();
    resource.properties.stackable = 1;
    await expectCode(
        () => createResourceRegistry().register(record('evolve:resource/food', resource)),
        'INVALID_DEFINITION_FIELD'
    );

    const technology = clubDefinition();
    technology.classification.era = 'Primitive';
    await expectCode(
        () => createTechnologyRegistry().register(record('evolve:technology/club', technology)),
        'INVALID_DEFINITION_FIELD'
    );
});

test('M1B hostile definition shapes fail as structured contract errors without invoking accessors', async () => {
    const { createResourceRegistry } = await modules();
    const resources = createResourceRegistry();

    for (const invalid of [null, [], 'resource', () => ({})]){
        await expectCode(
            () => resources.register(record('evolve:resource/food', invalid)),
            'INVALID_DEFINITION'
        );
    }

    let getterCalls = 0;
    const hostile = foodDefinition();
    Object.defineProperty(hostile, 'presentation', {
        enumerable: true,
        get(){ getterCalls++; throw new Error('must not execute'); },
    });
    await expectCode(
        () => resources.register(record('evolve:resource/food', hostile)),
        'INVALID_DEFINITION'
    );
    assert.equal(getterCalls, 0);
    assert.equal(resources.size, 0);

    const symbolKeyed = foodDefinition();
    symbolKeyed[Symbol('hidden')] = true;
    await expectCode(
        () => resources.register(record('evolve:resource/food', symbolKeyed)),
        'INVALID_DEFINITION'
    );
});

test('M1B definition validation failure is atomic and cannot reserve aliases', async () => {
    const { createResourceRegistry } = await modules();
    const resources = createResourceRegistry();
    const invalid = foodDefinition();
    invalid.properties.tradable = 'yes';

    await expectCode(
        () => resources.register(record('evolve:resource/food', invalid, ['Food'])),
        'INVALID_DEFINITION_FIELD'
    );
    assert.equal(resources.size, 0);
    assert.equal(resources.resolveAlias('Food'), undefined);

    const entry = resources.register(record('evolve:resource/food', foodDefinition(), ['Food']));
    assert.equal(resources.resolveAlias('Food'), entry.id);
});

test('M1B registry definition validator option is explicit and receives frozen registration context', async () => {
    const { Registry } = await modules();
    await expectCode(() => new Registry({ type: 'resource', definitionValidator: true }), 'INVALID_DEFINITION_VALIDATOR');

    let seen;
    const resources = new Registry({
        type: 'resource',
        definitionValidator(definition, context){
            seen = context;
            return Object.freeze({ marker: definition.marker });
        },
    });
    resources.register(record('evolve:resource/food', { marker: 'food' }, ['Food']));

    assert.equal(Object.isFrozen(seen), true);
    assert.equal(Object.isFrozen(seen.owner), true);
    assert.equal(Object.isFrozen(seen.tags), true);
    assert.equal(Object.isFrozen(seen.aliases), true);
    assert.equal(seen.id, 'evolve:resource/food');
    assert.equal(seen.localId, 'food');
});
