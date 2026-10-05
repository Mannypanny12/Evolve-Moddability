import { EngineContractError, parseContentId, describeContractValue } from '../identity.mjs';

export const MAX_COMMAND_DATA_NESTING_DEPTH = 128;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function dataPath(parent, key){
    return parent === '<root>' ? String(key) : `${parent}.${String(key)}`;
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
            fail('INVALID_COMMAND_DATA', `${path} must be a finite number, got ${describeContractValue(value)}.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object'){
        fail('INVALID_COMMAND_DATA', `${path} contains unsupported command-data type ${typeof value}.`, { path, valueType: typeof value });
    }
    if (depth > MAX_COMMAND_DATA_NESTING_DEPTH){
        fail('INVALID_COMMAND_DATA', `${path} exceeds the command-data nesting limit.`, { path, maxDepth: MAX_COMMAND_DATA_NESTING_DEPTH });
    }
    if (context.active.has(value)){
        fail('INVALID_COMMAND_DATA', `${path} contains a cyclic reference.`, { path, firstPath: context.seen.get(value) });
    }
    if (context.seen.has(value)){
        fail('INVALID_COMMAND_DATA', `${path} reuses a data object already present elsewhere.`, { path, firstPath: context.seen.get(value) });
    }

    context.seen.set(value, path);
    context.active.add(value);
    try {
        let isArray;
        try {
            isArray = Array.isArray(value);
        }
        catch {
            fail('INVALID_COMMAND_DATA', `${path} could not be safely inspected.`, { path });
        }
        if (isArray){
            const values = inspectArray(value, path, 'INVALID_COMMAND_DATA');
            return Object.freeze(values.map((item, index) => canonicalizeInternal(item, `${path}[${index}]`, context, depth + 1)));
        }

        const fields = inspectPlainObject(value, path, 'INVALID_COMMAND_DATA');
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

export function canonicalizeCommandData(value, path = 'commandData'){
    return canonicalizeInternal(value, path, { active: new WeakSet(), seen: new WeakMap() }, 0);
}

export function canonicalizeCommandPayload(value, path = 'command.payload'){
    const output = canonicalizeCommandData(value, path);
    if (output === null || typeof output !== 'object' || Array.isArray(output)){
        fail('INVALID_COMMAND_PAYLOAD', `${path} must be a plain data object.`, { path });
    }
    return output;
}

export function readClosedCommandObject(value, options){
    const { path, allowed, required = allowed, code = 'INVALID_COMMAND_CONTRACT' } = options;
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

export function readDenseCommandArray(value, path, code = 'INVALID_COMMAND_CONTRACT'){
    if (!Array.isArray(value)){
        fail(code, `${path} must be an array.`, { path });
    }
    return inspectArray(value, path, code);
}

export function assertCommandId(value, path = 'command.id'){
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail('INVALID_COMMAND_ID', `${path} must be a canonical command content ID.`, { path, value });
        }
        throw error;
    }
    if (parsed.type !== 'command'){
        fail('INVALID_COMMAND_ID', `${path} must use content type "command".`, { path, id: parsed.canonical, contentType: parsed.type });
    }
    return parsed.canonical;
}

export function assertSynchronousFunction(value, path, code = 'INVALID_COMMAND_REGISTRATION'){
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

export function isPromiseLike(value, path, code){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    try {
        return typeof value.then === 'function';
    }
    catch {
        fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
    }
}
