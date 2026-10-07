'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const root = path.resolve(__dirname, '../..');
const adapterPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-condition-read-adapter.mjs')).href);
const corePromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/core-requirements.mjs')).href);
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);

async function evaluatorForCurrentLegacyState(){
    const [{ createEvolveLegacyConditionReadProvider }, { createCoreRequirementRegistrations }, { createConditionEvaluator }] = await Promise.all([
        adapterPromise,
        corePromise,
        evaluatorPromise,
    ]);
    const provider = createEvolveLegacyConditionReadProvider({
        readLegacyRoot: () => legacy.legacyState(),
    });
    return createConditionEvaluator({
        registrations: createCoreRequirementRegistrations(provider),
    });
}

function install(mutator){
    const state = legacy.pristineLegacyState();
    mutator(state);
    legacy.installLegacyState(state);
    return state;
}

const wheelCondition = Object.freeze({
    kind: 'all',
    conditions: Object.freeze([
        Object.freeze({
            kind: 'any',
            conditions: Object.freeze([
                Object.freeze({
                    kind: 'technology.acquired',
                    params: Object.freeze({ technologyId: 'evolve:technology/bone_tools' }),
                }),
                Object.freeze({
                    kind: 'technology.acquired',
                    params: Object.freeze({ technologyId: 'evolve:technology/wooden_tools' }),
                }),
            ]),
        }),
        Object.freeze({
            kind: 'trait.present',
            params: Object.freeze({ traitId: 'evolve:trait/gravity_well' }),
        }),
    ]),
});

test('M3B review hardening covers the Soul Eater plus Evil primitive level-2 branch', async () => {
    install(state => {
        state.tech.primitive = 2;
        state.tech.transport = 0;
        state.race.gravity_well = 1;
        state.race.soul_eater = 1;
        state.race.evil = 1;
    });

    const evaluator = await evaluatorForCurrentLegacyState();
    assert.equal(evaluator.evaluate({
        kind: 'technology.acquired',
        params: { technologyId: 'evolve:technology/bone_tools' },
    }).status, 'satisfied');
    assert.equal(evaluator.evaluate({
        kind: 'technology.acquired',
        params: { technologyId: 'evolve:technology/wooden_tools' },
    }).status, 'failed');

    const modern = evaluator.evaluate(wheelCondition).status === 'satisfied';
    const legacyResult = legacy.technologyRequirements('wheel') === 'ok'
        && legacy.technologyQualifies('wheel');
    assert.equal(modern, true);
    assert.equal(legacyResult, true);
});

test('M3B review hardening covers missing and over-capacity DNA resource gates', async () => {
    install(state => {
        delete state.resource.DNA;
        state.race.evoFinalMenu = false;
    });
    let evaluator = await evaluatorForCurrentLegacyState();
    let modern = evaluator.evaluate({
        kind: 'all',
        conditions: [
            { kind: 'resource.available', params: { resourceId: 'evolve:resource/dna' } },
            { kind: 'resource.below_capacity', params: { resourceId: 'evolve:resource/dna' } },
        ],
    }).status === 'satisfied';
    assert.equal(modern, false);
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);

    install(state => {
        state.resource.DNA = {
            ...(state.resource.DNA || {}),
            amount: 11,
            max: 10,
            delta: 0,
            display: true,
        };
        state.race.evoFinalMenu = false;
    });
    evaluator = await evaluatorForCurrentLegacyState();
    modern = evaluator.evaluate({
        kind: 'all',
        conditions: [
            { kind: 'resource.available', params: { resourceId: 'evolve:resource/dna' } },
            { kind: 'resource.below_capacity', params: { resourceId: 'evolve:resource/dna' } },
        ],
    }).status === 'satisfied';
    assert.equal(modern, false);
    assert.equal(legacy.actionCondition('evolution', 'dna'), false);
});
