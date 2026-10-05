import { EngineContractError, describeContractValue } from '../identity.mjs';

export const MAX_CONDITION_DATA_NESTING_DEPTH = 128;
export const MAX_CONDITION_NESTING_DEPTH = 128;

const CONDITION_KIND_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SIMPLE_DATA_PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function dataPath(parent, key){
    const segment = String(key);
    if (parent === '<root>'){
        return SIMPLE_DATA_PATH_SEGMENT.test(segment) ? segment : `[${JSON.stringify(segment)}]`;
    }
    return SIMPLE_DATA_PATH_SEGMENT.test(segment)
        ? `${parent}.${segment}`
        : `${parent}[${JSON.stringify(segment)}]`;
}

function inspectPlainObject(value, path, code){
    if (value === null || typeof value !== 'object'){
        fail(code, `${path} must be a plain data object.`, { path, value });
    }

    let array;
    let prototype;
    let keys;
    try {
        array = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }

    if (array || (prototype !== Object.prototype && prototype !== null)){
        fail(code, `${path} must be a plain data object.`, { path, value });
    }

    const fields = new Map();
    for (const key of keys){
        if (typeof key !== 'string'){
            fail(code, `${path} must not contain symbol-keyed fields.`, { path });
        }

        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail(code, `${dataPath(path, key)} could not be safely inspected.`, { path: dataPath(path, key) });
        }

        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail(code, `${dataPath(path, key)} must be an enumerable data field.`, { path: dataPath(path, key) });
        }
        fields.set(key, descriptor.value);
    }
    return fields;
}

function inspectArray(value, path, code){
    let prototype;
    let keys;
    let lengthDescriptor;
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
        lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }

    if (prototype !== Array.prototype){
        fail(code, `${path} must be a normal Array.`, { path, value });
    }
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')){
        fail(code, `${path}.length could not be safely inspected.`, { path: `${path}.length` });
    }

    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0){
        fail(code, `${path}.length must be a non-negative safe integer.`, { path: `${path}.length`, value: length });
    }

    const allowedKeys = new Set(['length']);
    const values = new Array(length);
    for (let index = 0; index < length; index++){
        const key = String(index);
        allowedKeys.add(key);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail(code, `${path}[${index}] could not be safely inspected.`, { path: `${path}[${index}]` });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail(code, `${path} must be a dense data array; invalid item at index ${index}.`, { path: `${path}[${index}]`, index });
        }
        values[index] = descriptor.value;
    }

    for (const key of keys){
        if (typeof key !== 'string'){
            fail(code, `${path} must not contain symbol-keyed fields.`, { path });
        }
        if (!allowedKeys.has(key)){
            fail(code, `${path} must not contain extra array field ${JSON.stringify(key)}.`, { path: dataPath(path, key), field: key });
        }
    }
    return values;
}

function canonicalizeInternal(value, path, context, depth){
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
    if (depth > MAX_CONDITION_DATA_NESTING_DEPTH){
        fail('INVALID_CONDITION_DATA', `${path} exceeds the condition-data nesting limit.`, { path, maxDepth: MAX_CONDITION_DATA_NESTING_DEPTH });
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
            const values = inspectArray(value, path, 'INVALID_CONDITION_DATA');
            return Object.freeze(values.map((item, index) => canonicalizeInternal(item, `${path}[${index}]`, context, depth + 1)));
        }

        const fields = inspectPlainObject(value, path, 'INVALID_CONDITION_DATA');
        const output = {};
        for (const key of [...fields.keys()].sort()){
            Object.defineProperty(output, key, {
                value: canonicalizeInternal(fields.get(key), dataPath(path, key), context, depth + 1),
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

export function canonicalizeConditionData(value, path = 'conditionData'){
    return canonicalizeInternal(value, path, { active: new WeakSet(), seen: new WeakMap() }, 0);
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
    const fields = inspectPlainObject(value, path, code);
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail(code, `${path} contains unsupported field ${JSON.stringify(key)}.`, { path: dataPath(path, key), field: key });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail(code, `${path} is missing required field ${JSON.stringify(key)}.`, { path: dataPath(path, key), field: key });
        }
    }
    return fields;
}

export function readDenseConditionArray(value, path, code = 'INVALID_CONDITION_CONTRACT'){
    if (!Array.isArray(value)){
        fail(code, `${path} must be an array.`, { path });
    }
    return inspectArray(value, path, code);
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
    if (/^\s*async\b/.test(source)){
        fail(code, `${path} must be synchronous.`, { path });
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
