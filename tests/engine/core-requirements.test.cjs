'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const evaluatorPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/condition-evaluator.mjs')).href);
const requirementsPromise = import(pathToFileURL(path.join(root, 'src/engine/conditions/core-requirements.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [evaluator, requirements, identity] = await Promise.all([
        evaluatorPromise,
        requirementsPromise,
        identityPromise,
    ]);
    return { ...evaluator, ...requirements, ...identity };
}

function stateReads(state = {}){
    return {
        technology: {
            has: id => Boolean(state.technologies && state.technologies.has(id)),
        },
        resource: {
            amount: id => state.resourceAmounts && state.resourceAmounts.has(id)
                ? state.resourceAmounts.get(id)
                : 0,
            available: id => Boolean(state.resources && state.resources.has(id)),
            capacity: id => state.resourceCapacities && state.resourceCapacities.has(id)
                ? state.resourceCapacities.get(id)
                : 0,
        },
        structure: {
            count: id => state.structureCounts && state.structureCounts.has(id)
                ? state.structureCounts.get(id)
                : 0,
            activeCount: id => state.activeStructureCounts && state.activeStructureCounts.has(id)
                ? state.activeStructureCounts.get(id)
                : 0,
        },
        trait: {
            has: id => Boolean(state.traits && state.traits.has(id)),
        },
    };
}

async function evaluatorFor(state){
    const { createConditionEvaluator, createCoreRequirementRegistrations } = await modules();
    return createConditionEvaluator({ registrations: createCoreRequirementRegistrations(stateReads(state)) });
}

test('M3B2 exposes exactly the intended fixed core requirement kinds', async () => {
    const { CORE_REQUIREMENT_KINDS } = await modules();
    const evaluator = await evaluatorFor({});

    assert.deepEqual(CORE_REQUIREMENT_KINDS, [
        'resource.amount.at_least',
        'resource.available',
        'resource.below_capacity',
        'structure.active_count.at_least',
        'structure.count.at_least',
        'technology.acquired',
        'technology.not_acquired',
        'trait.absent',
        'trait.present',
    ]);
    assert.deepEqual(
        evaluator.kinds().filter(kind => !['all', 'any', 'not'].includes(kind)),
        CORE_REQUIREMENT_KINDS
    );
});

test('M3B2 technology acquired and not-acquired conditions use canonical technology IDs', async () => {
    const tech = 'evolve:technology/bone_tools';
    const evaluator = await evaluatorFor({ technologies: new Set([tech]) });

    assert.equal(evaluator.evaluate({
        kind: 'technology.acquired',
        params: { technologyId: tech },
    }).status, 'satisfied');

    assert.deepEqual(evaluator.evaluate({
        kind: 'technology.not_acquired',
        params: { technologyId: tech },
    }), {
        status: 'failed',
        reasons: [{
            code: 'condition.technology.forbidden_acquired',
            details: { technologyId: tech },
        }],
    });

    const missing = 'evolve:technology/not_yet_present';
    assert.deepEqual(evaluator.evaluate({
        kind: 'technology.acquired',
        params: { technologyId: missing },
    }).reasons[0], {
        code: 'condition.technology.not_acquired',
        details: { technologyId: missing },
    });
});

test('M3B2 resource predicates keep availability, threshold, and current capacity distinct', async () => {
    const food = 'evolve:resource/food';
    const unlimited = 'evolve:resource/knowledge';
    const evaluator = await evaluatorFor({
        resources: new Set([food, unlimited]),
        resourceAmounts: new Map([[food, 72], [unlimited, 999999]]),
        resourceCapacities: new Map([[food, 100], [unlimited, null]]),
    });

    assert.equal(evaluator.evaluate({ kind: 'resource.available', params: { resourceId: food } }).status, 'satisfied');
    assert.deepEqual(evaluator.evaluate({
        kind: 'resource.amount.at_least',
        params: { resourceId: food, amount: 100 },
    }).reasons[0], {
        code: 'condition.resource.amount_insufficient',
        details: { resourceId: food, requiredAmount: 100, actualAmount: 72 },
    });
    assert.equal(evaluator.evaluate({ kind: 'resource.below_capacity', params: { resourceId: food } }).status, 'satisfied');
    assert.equal(evaluator.evaluate({ kind: 'resource.below_capacity', params: { resourceId: unlimited } }).status, 'satisfied');

    const fullEvaluator = await evaluatorFor({
        resources: new Set([food]),
        resourceAmounts: new Map([[food, 100]]),
        resourceCapacities: new Map([[food, 100]]),
    });
    assert.deepEqual(fullEvaluator.evaluate({
        kind: 'resource.below_capacity',
        params: { resourceId: food },
    }).reasons[0], {
        code: 'condition.resource.at_capacity',
        details: { resourceId: food, actualAmount: 100, capacity: 100 },
    });

    const overCapacityEvaluator = await evaluatorFor({
        resources: new Set([food]),
        resourceAmounts: new Map([[food, 125]]),
        resourceCapacities: new Map([[food, 100]]),
    });
    assert.deepEqual(overCapacityEvaluator.evaluate({
        kind: 'resource.below_capacity',
        params: { resourceId: food },
    }).reasons[0], {
        code: 'condition.resource.at_capacity',
        details: { resourceId: food, actualAmount: 125, capacity: 100 },
    });
});

test('M3B2 amount and availability remain independent even for a missing resource at a zero threshold', async () => {
    const missing = 'evolve:resource/not_present';
    const evaluator = await evaluatorFor({});

    assert.equal(evaluator.evaluate({
        kind: 'resource.amount.at_least',
        params: { resourceId: missing, amount: 0 },
    }).status, 'satisfied');
    assert.deepEqual(evaluator.evaluate({
        kind: 'resource.available',
        params: { resourceId: missing },
    }).reasons[0], {
        code: 'condition.resource.unavailable',
        details: { resourceId: missing },
    });
});

test('M3B2 structure count and active-count requirements are independent predicates', async () => {
    const farm = 'evolve:structure/city/farm';
    const evaluator = await evaluatorFor({
        structureCounts: new Map([[farm, 5]]),
        activeStructureCounts: new Map([[farm, 2]]),
    });

    assert.equal(evaluator.evaluate({
        kind: 'structure.count.at_least',
        params: { structureId: farm, count: 5 },
    }).status, 'satisfied');
    assert.deepEqual(evaluator.evaluate({
        kind: 'structure.active_count.at_least',
        params: { structureId: farm, count: 3 },
    }).reasons[0], {
        code: 'condition.structure.active_count_insufficient',
        details: { structureId: farm, requiredCount: 3, actualCount: 2 },
    });
});

test('M3B2 trait present and absent conditions give subject-specific reasons', async () => {
    const flier = 'evolve:trait/flier';
    const evaluator = await evaluatorFor({ traits: new Set([flier]) });

    assert.equal(evaluator.evaluate({ kind: 'trait.present', params: { traitId: flier } }).status, 'satisfied');
    assert.deepEqual(evaluator.evaluate({ kind: 'trait.absent', params: { traitId: flier } }).reasons[0], {
        code: 'condition.trait.forbidden_present',
        details: { traitId: flier },
    });

    const missing = 'evolve:trait/cataclysm';
    assert.deepEqual(evaluator.evaluate({ kind: 'trait.present', params: { traitId: missing } }).reasons[0], {
        code: 'condition.trait.missing',
        details: { traitId: missing },
    });
});

test('M3B2 primitive parameter validation rejects malformed IDs, wrong types, extra fields, and invalid thresholds', async () => {
    const { EngineContractError } = await modules();
    const evaluator = await evaluatorFor({});

    for (const condition of [
        { kind: 'technology.acquired', params: { technologyId: 'primitive' } },
        { kind: 'technology.acquired', params: { technologyId: 'evolve:resource/food' } },
        { kind: 'trait.present', params: { traitId: 'evolve:trait/flier', extra: true } },
        { kind: 'resource.amount.at_least', params: { resourceId: 'evolve:resource/food', amount: -1 } },
        { kind: 'structure.count.at_least', params: { structureId: 'evolve:structure/city/farm', count: 1.5 } },
    ]){
        assert.throws(
            () => evaluator.evaluate(condition),
            error => error instanceof EngineContractError && [
                'INVALID_CONDITION_SUBJECT_ID',
                'INVALID_CONDITION_PARAMS',
            ].includes(error.code)
        );
    }
});

test('M3B2 core primitives compose declaratively through all/any/not without hidden bypass logic', async () => {
    const cement = 'evolve:technology/cement';
    const flier = 'evolve:trait/flier';
    const food = 'evolve:resource/food';
    const evaluator = await evaluatorFor({
        traits: new Set([flier]),
        resources: new Set([food]),
        resourceAmounts: new Map([[food, 20]]),
        resourceCapacities: new Map([[food, 100]]),
    });

    const result = evaluator.evaluate({
        kind: 'all',
        conditions: [
            {
                kind: 'any',
                conditions: [
                    { kind: 'technology.acquired', params: { technologyId: cement } },
                    { kind: 'trait.present', params: { traitId: flier } },
                ],
            },
            { kind: 'resource.amount.at_least', params: { resourceId: food, amount: 10 } },
            {
                kind: 'not',
                condition: { kind: 'trait.present', params: { traitId: 'evolve:trait/cataclysm' } },
            },
        ],
    });

    assert.deepEqual(result, { status: 'satisfied', reasons: [] });
});

test('M3B2 invalid semantic read results remain contract failures with condition context', async () => {
    const { createConditionEvaluator, createCoreRequirementRegistrations, EngineContractError } = await modules();
    const reads = stateReads({});
    reads.resource.amount = () => Number.NaN;
    const evaluator = createConditionEvaluator({ registrations: createCoreRequirementRegistrations(reads) });

    assert.throws(
        () => evaluator.evaluate({
            kind: 'resource.amount.at_least',
            params: { resourceId: 'evolve:resource/food', amount: 1 },
        }),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'INVALID_CONDITION_READ_RESULT');
            assert.equal(error.details.conditionKind, 'resource.amount.at_least');
            assert.equal(error.details.conditionPhase, 'evaluate');
            return true;
        }
    );
});

test('M3B2 reader failures preserve provider cause codes alongside condition context', async () => {
    const { createConditionEvaluator, createCoreRequirementRegistrations, EngineContractError } = await modules();
    const reads = stateReads({});
    reads.technology.has = () => {
        throw new EngineContractError('TECH_STATE_CORRUPT', 'Technology state is corrupt.');
    };
    const evaluator = createConditionEvaluator({ registrations: createCoreRequirementRegistrations(reads) });

    assert.throws(
        () => evaluator.evaluate({
            kind: 'technology.acquired',
            params: { technologyId: 'evolve:technology/bone_tools' },
        }),
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, 'CONDITION_READ_FAILURE');
            assert.equal(error.details.readerCauseCode, 'TECH_STATE_CORRUPT');
            assert.equal(error.details.conditionKind, 'technology.acquired');
            assert.equal(error.details.conditionPhase, 'evaluate');
            return true;
        }
    );
});
