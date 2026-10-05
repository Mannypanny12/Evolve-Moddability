import { EngineContractError, parseContentId } from '../identity.mjs';
import { assertClosedEffectFields } from './common.mjs';

export const CORE_EFFECT_OPERATION_KINDS = Object.freeze([
    'resource.consume',
    'resource.grant',
]);

const RESOURCE_OPERATION_FIELDS = Object.freeze([
    'kind',
    'resourceId',
    'amount',
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

function assertResourceId(value, path){
    if (typeof value !== 'string'){
        fail(
            'INVALID_EFFECT_RESOURCE_ID',
            `${path} must be a canonical resource content ID string.`,
            { path, expectedType: 'resource', valueType: typeof value }
        );
    }

    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (!isEngineContractError(error)) throw error;
        fail(
            'INVALID_EFFECT_RESOURCE_ID',
            `${path} must be a canonical resource content ID.`,
            { path, expectedType: 'resource', value }
        );
    }

    if (parsed.type !== 'resource'){
        fail(
            'INVALID_EFFECT_RESOURCE_ID',
            `${path} must identify content type resource.`,
            {
                path,
                expectedType: 'resource',
                actualType: parsed.type,
                value,
            }
        );
    }
    return parsed.canonical;
}

function assertPositiveFiniteAmount(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0){
        fail(
            'INVALID_EFFECT_AMOUNT',
            `${path} must be a positive finite number.`,
            {
                path,
                valueType: typeof value,
                value: typeof value === 'number' ? value : undefined,
            }
        );
    }
    return value;
}

function normalizeResourceOperation(fields, kind, path){
    assertClosedEffectFields(fields, {
        path,
        allowed: RESOURCE_OPERATION_FIELDS,
        required: RESOURCE_OPERATION_FIELDS,
        code: 'INVALID_EFFECT_OPERATION',
    });

    return Object.freeze({
        kind,
        resourceId: assertResourceId(fields.get('resourceId'), `${path}.resourceId`),
        amount: assertPositiveFiniteAmount(fields.get('amount'), `${path}.amount`),
    });
}

export function normalizeCoreEffectOperation(fields, kind, path){
    switch (kind){
        case 'resource.consume':
        case 'resource.grant':
            return normalizeResourceOperation(fields, kind, path);
        default:
            fail(
                'UNSUPPORTED_EFFECT_OPERATION_KIND',
                `${path}.kind is not a supported core effect operation kind.`,
                { path: `${path}.kind`, kind }
            );
    }
}
