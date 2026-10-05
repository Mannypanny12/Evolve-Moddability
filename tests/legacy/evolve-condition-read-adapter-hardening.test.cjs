'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-condition-read-adapter.mjs')).href);

function stateFixture(){
    return {
        tech: { primitive: 2, transport: 0 },
        race: {
            gravity_well: 1,
            soul_eater: 0,
            evil: 0,
            flier: 0,
            warlord: 0,
        },
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

async function providerFor(stateRef){
    const { createEvolveLegacyConditionReadProvider } = await adapterPromise;
    return createEvolveLegacyConditionReadProvider({ readLegacyRoot: () => stateRef.current });
}

test('M3B review hardening keeps compatibility subjects explicitly bounded even when the mapping catalog grows', async () => {
    const ref = { current: stateFixture() };
    const provider = await providerFor(ref);

    assert.throws(
        () => provider.resource.amount('evolve:resource/food'),
        error => error &&
            error.code === 'UNSUPPORTED_LEGACY_CONDITION_SUBJECT' &&
            error.details?.family === 'resource' &&
            error.details?.subjectId === 'evolve:resource/food'
    );

    assert.equal(provider.resource.amount('evolve:resource/dna'), 4);
    assert.equal(provider.resource.amount('evolve:resource/rna'), 8);
});

test('M3B review hardening accepts legacy numeric presence ranks but rejects malformed present markers', async () => {
    const ref = { current: stateFixture() };
    const provider = await providerFor(ref);

    ref.current.race.warlord = 0.5;
    assert.equal(provider.trait.has('evolve:trait/warlord'), true);
    ref.current.race.warlord = 0;
    assert.equal(provider.trait.has('evolve:trait/warlord'), false);

    ref.current.resource.DNA.display = 1;
    assert.equal(provider.resource.available('evolve:resource/dna'), true);
    ref.current.resource.DNA.display = 0;
    assert.equal(provider.resource.available('evolve:resource/dna'), false);

    for (const badMarker of ['true', {}, [], undefined, Number.NaN, -1]){
        ref.current.race.warlord = badMarker;
        assert.throws(
            () => provider.trait.has('evolve:trait/warlord'),
            error => error && error.code === 'INVALID_LEGACY_CONDITION_STATE',
            `trait marker ${String(badMarker)}`
        );
    }

    ref.current = stateFixture();
    ref.current.resource.DNA.display = {};
    assert.throws(
        () => provider.resource.available('evolve:resource/dna'),
        error => error && error.code === 'INVALID_LEGACY_CONDITION_STATE'
    );
});

test('M3B review hardening validates primitive-context presence markers instead of applying arbitrary truthiness', async () => {
    const ref = { current: stateFixture() };
    const provider = await providerFor(ref);

    ref.current.race.soul_eater = {};
    assert.throws(
        () => provider.technology.has('evolve:technology/bone_tools'),
        error => error &&
            error.code === 'INVALID_LEGACY_CONDITION_STATE' &&
            error.details?.path === 'global.race.soul_eater'
    );

    ref.current = stateFixture();
    ref.current.race.evil = undefined;
    assert.throws(
        () => provider.technology.has('evolve:technology/wooden_tools'),
        error => error &&
            error.code === 'INVALID_LEGACY_CONDITION_STATE' &&
            error.details?.path === 'global.race.evil'
    );
});

test('M3B review hardening proves compatibility reads do not mutate the supplied legacy state', async () => {
    const state = stateFixture();
    const ref = { current: state };
    const provider = await providerFor(ref);
    const before = JSON.stringify(state);

    provider.technology.has('evolve:technology/club');
    provider.technology.has('evolve:technology/bone_tools');
    provider.technology.has('evolve:technology/wooden_tools');
    provider.technology.has('evolve:technology/sundial');
    provider.resource.amount('evolve:resource/dna');
    provider.resource.available('evolve:resource/dna');
    provider.resource.capacity('evolve:resource/dna');
    provider.structure.count('evolve:structure/city/compost');
    provider.structure.activeCount('evolve:structure/city/compost');
    provider.trait.has('evolve:trait/gravity_well');
    provider.trait.has('evolve:trait/flier');
    provider.trait.has('evolve:trait/warlord');

    assert.equal(JSON.stringify(state), before);
});
