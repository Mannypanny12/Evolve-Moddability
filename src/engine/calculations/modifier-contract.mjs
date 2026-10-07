import { EngineContractError, parseContentId } from '../identity.mjs';

export const MODIFIER_OPERATIONS = Object.freeze(['add', 'multiply', 'override', 'cap', 'floor']);
const MODIFIER_OPERATION_SET = new Set(MODIFIER_OPERATIONS);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function assertModifierId(value, path = 'modifier.id'){
    let parsed;
    try { parsed = parseContentId(value); }
    catch (error){
        if (error instanceof EngineContractError){
            fail('INVALID_MODIFIER_ID', `${path} must be a canonical modifier content ID.`, { path, value });
        }
        throw error;
    }
    if (parsed.type !== 'modifier'){
        fail('INVALID_MODIFIER_ID', `${path} must use content type "modifier".`, {
            path,
            id: parsed.canonical,
            contentType: parsed.type,
        });
    }
    return parsed.canonical;
}

export function assertModifierOperation(value, path = 'modifier.operation'){
    if (typeof value !== 'string' || !MODIFIER_OPERATION_SET.has(value)){
        fail('INVALID_MODIFIER_OPERATION', `${path} must be one of ${MODIFIER_OPERATIONS.join(', ')}.`, {
            path,
            operation: value,
        });
    }
    return value;
}

export function assertModifierOrder(value, path = 'modifier.order'){
    if (!Number.isSafeInteger(value)){
        fail('INVALID_MODIFIER_ORDER', `${path} must be a safe integer.`, { path, order: value });
    }
    return value;
}
