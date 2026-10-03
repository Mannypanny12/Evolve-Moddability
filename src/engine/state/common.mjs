import { EngineContractError, describeContractValue } from '../identity.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function statePath(parent, key){
    return parent === '<root>' ? String(key) : `${parent}.${String(key)}`;
}

function inspectObject(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_STATE_VALUE', `${path} must be a plain state object, got ${describeContractValue(value)}.`, { path, value });
    }

    let prototype;
    let keys;
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
    }
    catch {
        fail('INVALID_STATE_VALUE', `${path} could not be safely inspected.`, { path });
    }

    if (prototype !== Object.prototype && prototype !== null){
        fail('INVALID_STATE_VALUE', `${path} must be a plain state object.`, { path, value });
    }

    const fields = new Map();
    for (const key of keys){
        if (typeof key !== 'string'){
            fail('INVALID_STATE_VALUE', `${path} must not contain symbol-keyed state.`, { path });
        }

        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail('INVALID_STATE_VALUE', `${statePath(path, key)} could not be safely inspected.`, { path: statePath(path, key) });
        }

        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_STATE_VALUE', `${statePath(path, key)} must be an enumerable data field.`, { path: statePath(path, key) });
        }
        fields.set(key, descriptor.value);
    }

    return fields;
}

function inspectArray(value, path){
    let prototype;
    let keys;
    let lengthDescriptor;
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
        lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    }
    catch {
        fail('INVALID_STATE_VALUE', `${path} could not be safely inspected.`, { path });
    }

    if (prototype !== Array.prototype){
        fail('INVALID_STATE_VALUE', `${path} must be a normal Array.`, { path, value });
    }
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')){
        fail('INVALID_STATE_VALUE', `${path}.length could not be safely inspected.`, { path: `${path}.length` });
    }

    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0){
        fail('INVALID_STATE_VALUE', `${path}.length must be a non-negative safe integer.`, { path: `${path}.length`, value: length });
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
            fail('INVALID_STATE_VALUE', `${path}[${index}] could not be safely inspected.`, { path: `${path}[${index}]` });
        }

        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_STATE_VALUE', `${path} must be a dense data array; invalid item at index ${index}.`, { path: `${path}[${index}]`, index });
        }
        values[index] = descriptor.value;
    }

    for (const key of keys){
        if (typeof key !== 'string'){
            fail('INVALID_STATE_VALUE', `${path} must not contain symbol-keyed state.`, { path });
        }
        if (!allowedKeys.has(key)){
            fail('INVALID_STATE_VALUE', `${path} must not contain extra array field ${JSON.stringify(key)}.`, { path: statePath(path, key), field: key });
        }
    }

    return values;
}

export function readClosedStateObject(value, options){
    const { path, allowed, required = allowed } = options;
    const fields = inspectObject(value, path);
    const allowedSet = new Set(allowed);

    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail('UNKNOWN_GAME_STATE_FIELD', `Unknown GameState field ${statePath(path, key)}.`, { path: statePath(path, key), field: key });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail('INVALID_GAME_STATE_FIELD', `Missing required GameState field ${statePath(path, key)}.`, { path: statePath(path, key), field: key });
        }
    }
    return fields;
}

export function assertGameStateSchemaVersion(value, expected){
    if (!Number.isSafeInteger(value) || value < 1){
        fail('INVALID_GAME_STATE_FIELD', `gameState.schemaVersion must be a positive safe integer, got ${describeContractValue(value)}.`, { path: 'gameState.schemaVersion', value });
    }
    if (value !== expected){
        fail(
            'UNSUPPORTED_GAME_STATE_SCHEMA_VERSION',
            `Unsupported GameState schema version ${value}; expected ${expected}.`,
            { schemaVersion: value, expectedSchemaVersion: expected }
        );
    }
    return value;
}

export function canonicalizeStateValue(value, path = '<root>', ancestors = new WeakSet()){
    if (value === null || typeof value === 'string' || typeof value === 'boolean'){
        return value;
    }

    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_STATE_VALUE', `${path} must be a finite number, got ${describeContractValue(value)}.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }

    if (typeof value !== 'object'){
        fail('INVALID_STATE_VALUE', `${path} contains unsupported state type ${typeof value}: ${describeContractValue(value)}.`, { path, value });
    }

    if (ancestors.has(value)){
        fail('INVALID_STATE_VALUE', `${path} contains a cyclic state reference.`, { path });
    }
    ancestors.add(value);

    try {
        if (Array.isArray(value)){
            const items = inspectArray(value, path);
            return items.map((item, index) => canonicalizeStateValue(item, `${path}[${index}]`, ancestors));
        }

        const fields = inspectObject(value, path);
        const output = {};
        for (const key of [...fields.keys()].sort()){
            Object.defineProperty(output, key, {
                value: canonicalizeStateValue(fields.get(key), statePath(path, key), ancestors),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        return output;
    }
    finally {
        ancestors.delete(value);
    }
}
