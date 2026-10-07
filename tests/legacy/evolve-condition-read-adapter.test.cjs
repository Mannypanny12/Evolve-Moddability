'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-condition-read-adapter.mjs')).href);
const corePromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/core-requirements.mjs')).href);
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);

function stateFixture(){
    return {
        tech: { primitive: 2, transport: 0 },
        race: { gravity_well: 1, soul_eater: 0, evil: 0, flier: 0, warlord: 0 },
        resource: {
            Food: { amount: 12, max: 100, display: true },
            DNA: { amount: 4, max: 10, display: true },
            RNA: { amount: 8, max: 20, display: false },
        },
        city: {
            compost: { count: 3, on: 2 },
        },
    };
}

async function build(stateRef){
    const [{ createEvolveLegacyConditionReadProvider }, { createCoreRequirementRegistrations }, { createConditionEvaluator }] = await Promise.all([
        adapterPromise,
        corePromise,
        evaluatorPromise,
    ]);
    const provider = createEvolveLegacyConditionReadProvider({ readLegacyRoot: () => stateRef.current });
    const evaluator = createConditionEvaluator({
        registrations: createCoreRequirementRegistrations(provider),
    });
    return { provider, evaluator };
}

test('legacy condition provider exposes only the closed M3B2 semantic read shape', async () => {
    const ref = { current: stateFixture() };
    const { provider } = await build(ref);

    assert.deepEqual(Object.keys(provider).sort(), ['resource', 'structure', 'technology', 'trait']);
    assert.deepEqual(Object.keys(provider.technology), ['has']);
    assert.deepEqual(Object.keys(provider.resource).sort(), ['amount', 'available', 'capacity']);
    assert.deepEqual(Object.keys(provider.structure).sort(), ['activeCount', 'count']);
    assert.deepEqual(Object.keys(provider.trait), ['has']);
    assert.equal(Object.isFrozen(provider), true);
    assert.equal(Object.isFrozen(provider.resource), true);
});

test('primitive progression resolves canonical technologies without exposing the legacy progression key', async () => {
    const ref = { current: stateFixture() };
    const { provider } = await build(ref);

    assert.equal(provider.technology.has('evolve:technology/club'), true);
    assert.equal(provider.technology.has('evolve:technology/bone_tools'), true);
    assert.equal(provider.technology.has('evolve:technology/wooden_tools'), false);
    assert.equal(provider.technology.has('evolve:technology/sundial'), false);

    ref.current.race.soul_eater = 1;
    assert.equal(provider.technology.has('evolve:technology/bone_tools'), false);
    assert.equal(provider.technology.has('evolve:technology/wooden_tools'), true);

    ref.current.tech.primitive = 3;
    assert.equal(provider.technology.has('evolve:technology/sundial'), true);
});

test('resource, trait and representative structure mappings preserve semantic distinctions', async () => {
    const ref = { current: stateFixture() };
    const { provider } = await build(ref);

    assert.equal(provider.resource.amount('evolve:resource/dna'), 4);
    assert.equal(provider.resource.available('evolve:resource/dna'), true);
    assert.equal(provider.resource.capacity('evolve:resource/dna'), 10);
    assert.equal(provider.resource.available('evolve:resource/rna'), false);
    assert.equal(provider.trait.has('evolve:trait/gravity_well'), true);
    assert.equal(provider.trait.has('evolve:trait/warlord'), false);
    assert.equal(provider.structure.count('evolve:structure/city/compost'), 3);
    assert.equal(provider.structure.activeCount('evolve:structure/city/compost'), 2);
});

test('provider follows replacement legacy roots instead of retaining stale state', async () => {
    const first = stateFixture();
    const ref = { current: first };
    const { provider } = await build(ref);

    assert.equal(provider.resource.amount('evolve:resource/dna'), 4);
    const second = stateFixture();
    second.resource.DNA.amount = 9;
    second.race.gravity_well = 0;
    ref.current = second;

    assert.equal(provider.resource.amount('evolve:resource/dna'), 9);
    assert.equal(provider.trait.has('evolve:trait/gravity_well'), false);
});

test('unsupported canonical subjects fail loudly instead of masquerading as absent state', async () => {
    const ref = { current: stateFixture() };
    const { provider, evaluator } = await build(ref);

    assert.throws(
        () => provider.technology.has('evolve:technology/wheel'),
        error => error && error.code === 'UNSUPPORTED_LEGACY_CONDITION_SUBJECT'
    );

    assert.throws(
        () => evaluator.evaluate({
            kind: 'technology.acquired',
            params: { technologyId: 'evolve:technology/wheel' },
        }),
        error => error
            && error.code === 'CONDITION_READ_FAILURE'
            && error.details
            && error.details.readerCauseCode === 'UNSUPPORTED_LEGACY_CONDITION_SUBJECT'
            && error.details.conditionKind === 'technology.acquired'
    );
});

test('missing mapped subjects become ordinary absent or zero semantic state', async () => {
    const state = stateFixture();
    delete state.resource.DNA;
    delete state.city.compost;
    delete state.race.warlord;
    const ref = { current: state };
    const { provider } = await build(ref);

    assert.equal(provider.resource.amount('evolve:resource/dna'), 0);
    assert.equal(provider.resource.available('evolve:resource/dna'), false);
    assert.equal(provider.resource.capacity('evolve:resource/dna'), 0);
    assert.equal(provider.structure.count('evolve:structure/city/compost'), 0);
    assert.equal(provider.structure.activeCount('evolve:structure/city/compost'), 0);
    assert.equal(provider.trait.has('evolve:trait/warlord'), false);
});

test('malformed present state and accessors fail as compatibility contract errors', async () => {
    const invalid = stateFixture();
    invalid.resource.DNA.amount = Number.NaN;
    const ref = { current: invalid };
    const { provider } = await build(ref);

    assert.throws(
        () => provider.resource.amount('evolve:resource/dna'),
        error => error && error.code === 'INVALID_LEGACY_CONDITION_STATE'
    );

    const accessorState = stateFixture();
    Object.defineProperty(accessorState.resource.DNA, 'amount', {
        enumerable: true,
        get(){ throw new Error('must not execute'); },
    });
    ref.current = accessorState;
    assert.throws(
        () => provider.resource.amount('evolve:resource/dna'),
        error => error && error.code === 'INVALID_LEGACY_CONDITION_STATE'
    );
});

test('root provider must remain synchronous and plain-data inspectable', async () => {
    const { createEvolveLegacyConditionReadProvider } = await adapterPromise;

    assert.throws(
        () => createEvolveLegacyConditionReadProvider({ readLegacyRoot: async () => stateFixture() }),
        error => error && error.code === 'INVALID_LEGACY_CONDITION_ROOT_PROVIDER'
    );

    const provider = createEvolveLegacyConditionReadProvider({ readLegacyRoot: () => Promise.resolve(stateFixture()) });
    assert.throws(
        () => provider.resource.amount('evolve:resource/dna'),
        error => error && error.code === 'INVALID_LEGACY_CONDITION_ROOT_PROVIDER'
    );
});
