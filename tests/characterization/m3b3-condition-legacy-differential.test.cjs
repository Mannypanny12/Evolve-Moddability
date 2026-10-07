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
const mappingsPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);

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

test('Wheel differential proves contextual primitive technology plus positive trait composition', async () => {
    const cases = [
        { primitive: 1, gravity: 1, soulEater: 0, expected: false },
        { primitive: 2, gravity: 0, soulEater: 0, expected: false },
        { primitive: 2, gravity: 1, soulEater: 0, expected: true },
        { primitive: 2, gravity: 1, soulEater: 1, expected: true },
    ];

    for (const scenario of cases){
        install(state => {
            state.tech.primitive = scenario.primitive;
            state.tech.transport = 0;
            state.race.gravity_well = scenario.gravity;
            state.race.soul_eater = scenario.soulEater;
            state.race.evil = 0;
        });
        const evaluator = await evaluatorForCurrentLegacyState();
        const modern = evaluator.evaluate(wheelCondition).status === 'satisfied';
        const legacyResult = legacy.technologyRequirements('wheel') === 'ok'
            && legacy.technologyQualifies('wheel');

        assert.equal(modern, scenario.expected);
        assert.equal(legacyResult, scenario.expected);
    }
});

test('Arcology negative trait qualification matches trait.absent semantics', async () => {
    for (const warlord of [0, 1]){
        install(state => {
            state.race.warlord = warlord;
        });
        const evaluator = await evaluatorForCurrentLegacyState();
        const modern = evaluator.evaluate({
            kind: 'trait.absent',
            params: { traitId: 'evolve:trait/warlord' },
        }).status === 'satisfied';

        assert.equal(modern, legacy.technologyQualifies('arcology'));
    }
});

test('DNA resource predicates agree with legacy resource gates while final-menu context remains separate', async () => {
    for (const scenario of [
        { display: true, amount: 4, max: 10, finalMenu: false, resourceExpected: true, legacyExpected: true },
        { display: false, amount: 4, max: 10, finalMenu: false, resourceExpected: false, legacyExpected: false },
        { display: true, amount: 10, max: 10, finalMenu: false, resourceExpected: false, legacyExpected: false },
        { display: true, amount: 4, max: 10, finalMenu: true, resourceExpected: true, legacyExpected: false },
    ]){
        install(state => {
            state.resource.DNA = {
                ...(state.resource.DNA || {}),
                amount: scenario.amount,
                max: scenario.max,
                delta: 0,
                display: scenario.display,
            };
            state.race.evoFinalMenu = scenario.finalMenu;
        });
        const evaluator = await evaluatorForCurrentLegacyState();
        const modern = evaluator.evaluate({
            kind: 'all',
            conditions: [
                { kind: 'resource.available', params: { resourceId: 'evolve:resource/dna' } },
                { kind: 'resource.below_capacity', params: { resourceId: 'evolve:resource/dna' } },
            ],
        }).status === 'satisfied';

        assert.equal(modern, scenario.resourceExpected);
        assert.equal(legacy.actionCondition('evolution', 'dna'), scenario.legacyExpected);
    }
});

test('Compost Structs pseudo-cost differentials prove total and active structure requirements', async () => {
    const requirement = { Structs: { city: { compost: { count: 2, on: 1 } } } };
    const condition = {
        kind: 'all',
        conditions: [
            {
                kind: 'structure.count.at_least',
                params: { structureId: 'evolve:structure/city/compost', count: 2 },
            },
            {
                kind: 'structure.active_count.at_least',
                params: { structureId: 'evolve:structure/city/compost', count: 1 },
            },
        ],
    };

    for (const scenario of [
        { count: 2, on: 1, expected: true },
        { count: 1, on: 1, expected: false },
        { count: 3, on: 0, expected: false },
    ]){
        install(state => {
            state.city.compost = { count: scenario.count, on: scenario.on };
        });
        const evaluator = await evaluatorForCurrentLegacyState();
        const modern = evaluator.evaluate(condition).status === 'satisfied';

        assert.equal(modern, scenario.expected);
        assert.equal(legacy.canAfford(requirement), scenario.expected);
    }
});

test('flier cement bypass remains legacy evidence rather than hidden compatibility-reader behavior', () => {
    install(state => {
        state.tech.housing = 1;
        state.tech.mining = 3;
        state.tech.cement = 0;
        state.race.flier = 1;
    });
    assert.equal(legacy.technologyRequirements('cottage'), 'ok');

    install(state => {
        state.tech.housing = 1;
        state.tech.mining = 3;
        state.tech.cement = 0;
        state.race.flier = 0;
    });
    assert.equal(legacy.technologyRequirements('cottage'), false);
});

test('M3B3 representative mappings have explicit migration removal milestones', async () => {
    const { createEvolveLegacyMappingCatalog } = await mappingsPromise;
    const catalog = createEvolveLegacyMappingCatalog();
    const expectations = {
        'evolve.resource.dna_state': 'M6B',
        'evolve.resource.rna_state': 'M6B',
        'evolve.trait.gravity_well_state': 'M6D',
        'evolve.trait.flier_state': 'M6D',
        'evolve.trait.warlord_state': 'M6D',
        'evolve.structure.city_compost_state': 'M6F',
    };

    for (const [mappingId, removeBy] of Object.entries(expectations)){
        const mapping = catalog.getRequired(mappingId);
        assert.equal(mapping.introducedIn, 'M3B3');
        assert.equal(mapping.removeBy, removeBy);
    }
});
