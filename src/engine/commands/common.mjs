import { EngineContractError, parseContentId, describeContractValue } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_COMMAND_DATA_NESTING_DEPTH = 128;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
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
            const values = inspectDenseInertArray(value, {
                path,
                code: 'INVALID_COMMAND_DATA',
            });
            return Object.freeze(values.map((item, index) => canonicalizeInternal(item, `${path}[${index}]`, context, depth + 1)));
        }

        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_COMMAND_DATA',
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
    const fields = inspectPlainInertObject(value, { path, code });
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

export function readDenseCommandArray(value, path, code = 'INVALID_COMMAND_CONTRACT'){
    return inspectDenseInertArray(value, { path, code });
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
