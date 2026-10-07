import { EngineContractError, parseContentId } from '../identity.mjs';
import { readClosedConditionObject } from './common.mjs';
import { conditionFailed, conditionSatisfied } from './result.mjs';
import { createConditionReadCapabilities } from './read-capabilities.mjs';

export const CORE_REQUIREMENT_KINDS = Object.freeze([
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

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isEngineContractError(value){
    try {
        return value instanceof EngineContractError;
    }
    catch {
        return false;
    }
}

function assertTypedContentId(value, expectedType, path){
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (!isEngineContractError(error)) throw error;
        fail(
            'INVALID_CONDITION_SUBJECT_ID',
            `${path} must be a canonical ${expectedType} content ID.`,
            { path, expectedType, value }
        );
    }
    if (parsed.type !== expectedType){
        fail(
            'INVALID_CONDITION_SUBJECT_ID',
            `${path} must identify content type ${expectedType}.`,
            { path, expectedType, actualType: parsed.type, value }
        );
    }
    return parsed.canonical;
}

function validateIdParams(params, field, type){
    const fields = readClosedConditionObject(params, {
        path: 'condition.params',
        allowed: [field],
        code: 'INVALID_CONDITION_PARAMS',
    });
    return { [field]: assertTypedContentId(fields.get(field), type, `condition.params.${field}`) };
}

function validateThresholdParams(params, field, type, thresholdField, thresholdKind){
    const fields = readClosedConditionObject(params, {
        path: 'condition.params',
        allowed: [field, thresholdField],
        code: 'INVALID_CONDITION_PARAMS',
    });
    const subjectId = assertTypedContentId(fields.get(field), type, `condition.params.${field}`);
    const threshold = fields.get(thresholdField);
    if (thresholdKind === 'count'){
        if (!Number.isSafeInteger(threshold) || threshold < 0){
            fail(
                'INVALID_CONDITION_PARAMS',
                `condition.params.${thresholdField} must be a non-negative safe integer.`,
                { path: `condition.params.${thresholdField}`, value: threshold }
            );
        }
    }
    else if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0){
        fail(
            'INVALID_CONDITION_PARAMS',
            `condition.params.${thresholdField} must be a non-negative finite number.`,
            { path: `condition.params.${thresholdField}`, value: threshold }
        );
    }
    return { [field]: subjectId, [thresholdField]: Object.is(threshold, -0) ? 0 : threshold };
}

function satisfiedOrFailure(met, code, details){
    return met
        ? conditionSatisfied()
        : conditionFailed([{ code, details }]);
}

export function createCoreRequirementRegistrations(rawReadCapabilities){
    const reads = createConditionReadCapabilities(rawReadCapabilities);

    return Object.freeze([
        Object.freeze({
            kind: 'technology.acquired',
            validateParams(params){
                return validateIdParams(params, 'technologyId', 'technology');
            },
            evaluate(params){
                return satisfiedOrFailure(
                    reads.technology.has(params.technologyId),
                    'condition.technology.not_acquired',
                    { technologyId: params.technologyId }
                );
            },
        }),
        Object.freeze({
            kind: 'technology.not_acquired',
            validateParams(params){
                return validateIdParams(params, 'technologyId', 'technology');
            },
            evaluate(params){
                return satisfiedOrFailure(
                    !reads.technology.has(params.technologyId),
                    'condition.technology.forbidden_acquired',
                    { technologyId: params.technologyId }
                );
            },
        }),
        Object.freeze({
            kind: 'resource.available',
            validateParams(params){
                return validateIdParams(params, 'resourceId', 'resource');
            },
            evaluate(params){
                return satisfiedOrFailure(
                    reads.resource.available(params.resourceId),
                    'condition.resource.unavailable',
                    { resourceId: params.resourceId }
                );
            },
        }),
        Object.freeze({
            kind: 'resource.amount.at_least',
            validateParams(params){
                return validateThresholdParams(params, 'resourceId', 'resource', 'amount', 'amount');
            },
            evaluate(params){
                const actualAmount = reads.resource.amount(params.resourceId);
                return satisfiedOrFailure(
                    actualAmount >= params.amount,
                    'condition.resource.amount_insufficient',
                    {
                        resourceId: params.resourceId,
                        requiredAmount: params.amount,
                        actualAmount,
                    }
                );
            },
        }),
        Object.freeze({
            kind: 'resource.below_capacity',
            validateParams(params){
                return validateIdParams(params, 'resourceId', 'resource');
            },
            evaluate(params){
                const capacity = reads.resource.capacity(params.resourceId);
                if (capacity === null) return conditionSatisfied();
                const actualAmount = reads.resource.amount(params.resourceId);
                return satisfiedOrFailure(
                    actualAmount < capacity,
                    'condition.resource.at_capacity',
                    { resourceId: params.resourceId, actualAmount, capacity }
                );
            },
        }),
        Object.freeze({
            kind: 'structure.count.at_least',
            validateParams(params){
                return validateThresholdParams(params, 'structureId', 'structure', 'count', 'count');
            },
            evaluate(params){
                const actualCount = reads.structure.count(params.structureId);
                return satisfiedOrFailure(
                    actualCount >= params.count,
                    'condition.structure.count_insufficient',
                    {
                        structureId: params.structureId,
                        requiredCount: params.count,
                        actualCount,
                    }
                );
            },
        }),
        Object.freeze({
            kind: 'structure.active_count.at_least',
            validateParams(params){
                return validateThresholdParams(params, 'structureId', 'structure', 'count', 'count');
            },
            evaluate(params){
                const actualCount = reads.structure.activeCount(params.structureId);
                return satisfiedOrFailure(
                    actualCount >= params.count,
                    'condition.structure.active_count_insufficient',
                    {
                        structureId: params.structureId,
                        requiredCount: params.count,
                        actualCount,
                    }
                );
            },
        }),
        Object.freeze({
            kind: 'trait.present',
            validateParams(params){
                return validateIdParams(params, 'traitId', 'trait');
            },
            evaluate(params){
                return satisfiedOrFailure(
                    reads.trait.has(params.traitId),
                    'condition.trait.missing',
                    { traitId: params.traitId }
                );
            },
        }),
        Object.freeze({
            kind: 'trait.absent',
            validateParams(params){
                return validateIdParams(params, 'traitId', 'trait');
            },
            evaluate(params){
                return satisfiedOrFailure(
                    !reads.trait.has(params.traitId),
                    'condition.trait.forbidden_present',
                    { traitId: params.traitId }
                );
            },
        }),
    ]);
}
