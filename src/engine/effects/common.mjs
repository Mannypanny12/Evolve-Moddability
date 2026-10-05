import { EngineContractError, describeContractValue } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_EFFECT_DATA_NESTING_DEPTH = 128;
export const MAX_EFFECT_COLLECTION_LENGTH = 4096;
export const MAX_EFFECT_OBJECT_FIELDS = 4096;
export const MAX_EFFECT_DATA_NODE_COUNT = 16384;

const EFFECT_OPERATION_KIND_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalizeInternal(value, path, context, depth){
    context.nodeCount++;
    if (context.nodeCount > MAX_EFFECT_DATA_NODE_COUNT){
        fail('INVALID_EFFECT_DATA', `${path} exceeds the total effect-data node limit.`, {
            path,
            nodeCount: context.nodeCount,
            maxNodes: MAX_EFFECT_DATA_NODE_COUNT,
        });
    }

    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_EFFECT_DATA', `${path} must be a finite number, got ${describeContractValue(value)}.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object'){
        fail('INVALID_EFFECT_DATA', `${path} contains unsupported effect-data type ${typeof value}.`, {
            path,
            valueType: typeof value,
        });
    }
    if (depth > MAX_EFFECT_DATA_NESTING_DEPTH){
        fail('INVALID_EFFECT_DATA', `${path} exceeds the effect-data nesting limit.`, {
            path,
            maxDepth: MAX_EFFECT_DATA_NESTING_DEPTH,
        });
    }
    if (context.active.has(value)){
        fail('INVALID_EFFECT_DATA', `${path} contains a cyclic reference.`, {
            path,
            firstPath: context.seen.get(value),
        });
    }
    if (context.seen.has(value)){
        fail('INVALID_EFFECT_DATA', `${path} reuses a data object already present elsewhere.`, {
            path,
            firstPath: context.seen.get(value),
        });
    }

    context.seen.set(value, path);
    context.active.add(value);
    try {
        let isArray;
        try {
            isArray = Array.isArray(value);
        }
        catch {
            fail('INVALID_EFFECT_DATA', `${path} could not be safely inspected.`, { path });
        }

        if (isArray){
            const values = inspectDenseInertArray(value, {
                path,
                code: 'INVALID_EFFECT_DATA',
                maxLength: MAX_EFFECT_COLLECTION_LENGTH,
            });
            return Object.freeze(values.map((item, index) => canonicalizeInternal(
                item,
                `${path}[${index}]`,
                context,
                depth + 1
            )));
        }

        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_EFFECT_DATA',
            maxFields: MAX_EFFECT_OBJECT_FIELDS,
        });
        const output = {};
        for (const key of [...fields.keys()].sort()){
            Object.defineProperty(output, key, {
                value: canonicalizeInternal(fields.get(key), inertDataPath(path, key), context, depth + 1),
                enumerable: true,
                writable: false,
                configurable: false,
            });
        }
        return Object.freeze(output);
    }
    finally {
        context.active.delete(value);
    }
}

export function canonicalizeEffectData(value, path = 'effectData'){
    return canonicalizeInternal(value, path, {
        active: new WeakSet(),
        seen: new WeakMap(),
        nodeCount: 0,
    }, 0);
}

export function readEffectObjectFields(
    value,
    path,
    code = 'INVALID_EFFECT_CONTRACT',
    maxFields = MAX_EFFECT_OBJECT_FIELDS
){
    return inspectPlainInertObject(value, {
        path,
        code,
        maxFields,
    });
}

export function requireEffectField(
    fields,
    field,
    path,
    code = 'INVALID_EFFECT_CONTRACT'
){
    if (!fields.has(field)){
        fail(code, `${path} is missing required field ${JSON.stringify(field)}.`, {
            path: inertDataPath(path, field),
            field,
        });
    }
    return fields.get(field);
}

export function assertClosedEffectFields(fields, options){
    const { path, allowed, required = allowed, code = 'INVALID_EFFECT_CONTRACT' } = options;
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail(code, `${path} contains unsupported field ${JSON.stringify(key)}.`, {
                path: inertDataPath(path, key),
                field: key,
            });
        }
    }
    for (const key of required){
        requireEffectField(fields, key, path, code);
    }
    return fields;
}

export function readClosedEffectObject(value, options){
    const { path, code = 'INVALID_EFFECT_CONTRACT' } = options;
    const fields = readEffectObjectFields(value, path, code);
    return assertClosedEffectFields(fields, options);
}

export function readDenseEffectArray(
    value,
    path,
    code = 'INVALID_EFFECT_CONTRACT',
    maxLength = MAX_EFFECT_COLLECTION_LENGTH
){
    return inspectDenseInertArray(value, { path, code, maxLength });
}

export function assertEffectOperationKind(value, path = 'effect.kind'){
    if (typeof value !== 'string' || !EFFECT_OPERATION_KIND_PATTERN.test(value)){
        fail('INVALID_EFFECT_OPERATION_KIND', `${path} must be a stable lowercase effect operation kind.`, {
            path,
            value,
        });
    }
    return value;
}
