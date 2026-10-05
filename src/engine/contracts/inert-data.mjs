import { EngineContractError } from '../identity.mjs';

const SIMPLE_DATA_PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertLimit(value, name){
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 0){
        fail('INVALID_INERT_DATA_CONFIG', `${name} must be a non-negative safe integer or null.`, {
            path: name,
            value,
        });
    }
    return value;
}

export function inertDataPath(parent, key){
    const segment = String(key);
    if (parent === '<root>'){
        return SIMPLE_DATA_PATH_SEGMENT.test(segment) ? segment : `[${JSON.stringify(segment)}]`;
    }
    return SIMPLE_DATA_PATH_SEGMENT.test(segment)
        ? `${parent}.${segment}`
        : `${parent}[${JSON.stringify(segment)}]`;
}

export function inspectPlainInertObject(value, options){
    const { path, code, maxFields = null } = options;
    const fieldLimit = assertLimit(maxFields, 'maxFields');

    if (value === null || typeof value !== 'object'){
        fail(code, `${path} must be a plain data object.`, { path, value });
    }

    let array;
    try {
        array = Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (array){
        fail(code, `${path} must be a plain data object.`, { path, value });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (prototype !== Object.prototype && prototype !== null){
        fail(code, `${path} must be a plain data object.`, { path, value });
    }

    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (fieldLimit !== null && keys.length > fieldLimit){
        fail(code, `${path} contains too many fields.`, {
            path,
            fieldCount: keys.length,
            maxFields: fieldLimit,
        });
    }

    const fields = new Map();
    for (const key of keys){
        if (typeof key !== 'string'){
            fail(code, `${path} must not contain symbol-keyed fields.`, { path });
        }
        const childPath = inertDataPath(path, key);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail(code, `${childPath} could not be safely inspected.`, { path: childPath });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail(code, `${childPath} must be an enumerable data field.`, { path: childPath });
        }
        fields.set(key, descriptor.value);
    }
    return fields;
}

export function inspectDenseInertArray(value, options){
    const { path, code, maxLength = null } = options;
    const lengthLimit = assertLimit(maxLength, 'maxLength');

    let array;
    try {
        array = Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (!array){
        fail(code, `${path} must be an array.`, { path });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (prototype !== Array.prototype){
        fail(code, `${path} must be a normal Array.`, { path, value });
    }

    let keys;
    let lengthDescriptor;
    try {
        keys = Reflect.ownKeys(value);
        lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')){
        fail(code, `${path}.length could not be safely inspected.`, { path: `${path}.length` });
    }

    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0){
        fail(code, `${path}.length must be a non-negative safe integer.`, {
            path: `${path}.length`,
            value: length,
        });
    }
    if (lengthLimit !== null && length > lengthLimit){
        fail(code, `${path} exceeds the collection length limit.`, {
            path,
            length,
            maxLength: lengthLimit,
        });
    }

    const allowedKeys = new Set(['length']);
    const values = new Array(length);
    for (let index = 0; index < length; index++){
        const key = String(index);
        const childPath = `${path}[${index}]`;
        allowedKeys.add(key);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail(code, `${childPath} could not be safely inspected.`, { path: childPath });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail(code, `${path} must be a dense data array; invalid item at index ${index}.`, {
                path: childPath,
                index,
            });
        }
        values[index] = descriptor.value;
    }

    for (const key of keys){
        if (typeof key !== 'string'){
            fail(code, `${path} must not contain symbol-keyed fields.`, { path });
        }
        if (!allowedKeys.has(key)){
            const childPath = inertDataPath(path, key);
            fail(code, `${path} must not contain extra array field ${JSON.stringify(key)}.`, {
                path: childPath,
                field: key,
            });
        }
    }
    return values;
}
