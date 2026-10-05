import { EngineContractError, describeContractValue } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_CONDITION_DATA_NESTING_DEPTH = 128;
export const MAX_CONDITION_NESTING_DEPTH = 128;
export const MAX_CONDITION_DEFINITION_DATA_NESTING_DEPTH =
    (MAX_CONDITION_NESTING_DEPTH * 2) + MAX_CONDITION_DATA_NESTING_DEPTH + 4;
export const MAX_CONDITION_COLLECTION_LENGTH = 4096;
export const MAX_CONDITION_OBJECT_FIELDS = 4096;

const CONDITION_KIND_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalizeInternal(value, path, context, depth, maxDepth){
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_CONDITION_DATA', `${path} must be a finite number, got ${describeContractValue(value)}.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object'){
        fail('INVALID_CONDITION_DATA', `${path} contains unsupported condition-data type ${typeof value}.`, { path, valueType: typeof value });
    }
    if (depth > maxDepth){
        fail('INVALID_CONDITION_DATA', `${path} exceeds the condition-data nesting limit.`, { path, maxDepth });
    }
    if (context.active.has(value)){
        fail('INVALID_CONDITION_DATA', `${path} contains a cyclic reference.`, { path, firstPath: context.seen.get(value) });
    }
    if (context.seen.has(value)){
        fail('INVALID_CONDITION_DATA', `${path} reuses a data object already present elsewhere.`, { path, firstPath: context.seen.get(value) });
    }

    context.seen.set(value, path);
    context.active.add(value);
    try {
        let isArray;
        try {
            isArray = Array.isArray(value);
        }
        catch {
            fail('INVALID_CONDITION_DATA', `${path} could not be safely inspected.`, { path });
        }

        if (isArray){
            const values = inspectDenseInertArray(value, {
                path,
                code: 'INVALID_CONDITION_DATA',
                maxLength: MAX_CONDITION_COLLECTION_LENGTH,
            });
            return Object.freeze(values.map((item, index) => canonicalizeInternal(
                item,
                `${path}[${index}]`,
                context,
                depth + 1,
                maxDepth
            )));
        }

        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_CONDITION_DATA',
            maxFields: MAX_CONDITION_OBJECT_FIELDS,
        });
        const output = {};
        for (const key of [...fields.keys()].sort()){
            Object.defineProperty(output, key, {
                value: canonicalizeInternal(fields.get(key), inertDataPath(path, key), context, depth + 1, maxDepth),
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

export function canonicalizeConditionData(
    value,
    path = 'conditionData',
    maxDepth = MAX_CONDITION_DATA_NESTING_DEPTH
){
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0){
        fail('INVALID_CONDITION_DATA_CONFIG', 'Condition-data maxDepth must be a non-negative safe integer.', {
            path: 'maxDepth',
            maxDepth,
        });
    }
    return canonicalizeInternal(value, path, { active: new WeakSet(), seen: new WeakMap() }, 0, maxDepth);
}

export function canonicalizeConditionParams(value, path = 'condition.params'){
    const output = canonicalizeConditionData(value, path);
    if (output === null || typeof output !== 'object' || Array.isArray(output)){
        fail('INVALID_CONDITION_PARAMS', `${path} must be a plain data object.`, { path });
    }
    return output;
}

export function readClosedConditionObject(value, options){
    const { path, allowed, required = allowed, code = 'INVALID_CONDITION_CONTRACT' } = options;
    const fields = inspectPlainInertObject(value, {
        path,
        code,
        maxFields: MAX_CONDITION_OBJECT_FIELDS,
    });
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail(code, `${path} contains unsupported field ${JSON.stringify(key)}.`, { path: inertDataPath(path, key), field: key });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail(code, `${path} is missing required field ${JSON.stringify(key)}.`, { path: inertDataPath(path, key), field: key });
        }
    }
    return fields;
}

export function readDenseConditionArray(
    value,
    path,
    code = 'INVALID_CONDITION_CONTRACT',
    maxLength = MAX_CONDITION_COLLECTION_LENGTH
){
    return inspectDenseInertArray(value, { path, code, maxLength });
}

export function assertConditionKind(value, path = 'condition.kind'){
    if (typeof value !== 'string' || !CONDITION_KIND_PATTERN.test(value)){
        fail('INVALID_CONDITION_KIND', `${path} must be a stable lowercase condition kind.`, { path, value });
    }
    return value;
}

export function assertSynchronousConditionFunction(value, path, code = 'INVALID_CONDITION_REGISTRATION'){
    if (typeof value !== 'function'){
        fail(code, `${path} must be a function.`, { path, valueType: typeof value });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail(code, `${path} could not be inspected.`, { path });
    }
    const declaredAsync = /^\s*async\b/.test(source);
    const declaredGenerator = /^\s*(?:async\s+)?function\s*\*/.test(source) || /^\s*\*/.test(source);
    const declaredClass = /^\s*class\b/.test(source);
    if (declaredAsync || declaredGenerator || declaredClass){
        fail(code, `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

export function isConditionPromiseLike(value, path, code){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;

    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);

        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail(code, `${path} returned a value with an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }

        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}
