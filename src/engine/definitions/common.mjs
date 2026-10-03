import { EngineContractError, describeContractValue } from '../identity.mjs';

const TOKEN_PATTERN = /^[a-z][a-z0-9_-]*$/;
const LOCALIZATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function inspectPlainObject(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_DEFINITION', `${path} must be a plain object, got ${describeContractValue(value)}.`, { path, value });
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
        fail('INVALID_DEFINITION', `${path} could not be safely inspected.`, { path });
    }

    if (array || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_DEFINITION', `${path} must be a plain object.`, { path, value });
    }

    const fields = new Map();
    for (const key of keys){
        if (typeof key !== 'string'){
            fail('INVALID_DEFINITION', `${path} must not contain symbol-keyed fields.`, { path });
        }

        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail('INVALID_DEFINITION', `${path}.${key} could not be safely inspected.`, { path: `${path}.${key}` });
        }

        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_DEFINITION', `${path}.${key} must be an enumerable data field.`, { path: `${path}.${key}` });
        }
        fields.set(key, descriptor.value);
    }
    return fields;
}

export function readClosedDefinitionObject(value, options){
    const { path, allowed, required = allowed } = options;
    const fields = inspectPlainObject(value, path);
    const allowedSet = new Set(allowed);

    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail('UNKNOWN_DEFINITION_FIELD', `Unknown definition field ${path}.${key}.`, { path: `${path}.${key}`, field: key });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail('INVALID_DEFINITION_FIELD', `Missing required definition field ${path}.${key}.`, { path: `${path}.${key}`, field: key });
        }
    }
    return fields;
}

export function assertDefinitionSchemaVersion(schemaVersion, expected, family){
    if (schemaVersion !== expected){
        fail(
            'UNSUPPORTED_DEFINITION_SCHEMA_VERSION',
            `Unsupported ${family} definition schema version ${describeContractValue(schemaVersion)}; expected ${expected}.`,
            { family, schemaVersion, expectedSchemaVersion: expected }
        );
    }
    return schemaVersion;
}

export function assertDefinitionString(value, path){
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value){
        fail('INVALID_DEFINITION_FIELD', `${path} must be a non-empty exact string, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

export function assertLocalizationKey(value, path){
    assertDefinitionString(value, path);
    if (!LOCALIZATION_KEY_PATTERN.test(value)){
        fail('INVALID_DEFINITION_FIELD', `${path} must be a logical localization key, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

export function assertDefinitionToken(value, path){
    assertDefinitionString(value, path);
    if (!TOKEN_PATTERN.test(value)){
        fail('INVALID_DEFINITION_FIELD', `${path} must be a lowercase definition token, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

export function assertDefinitionBoolean(value, path){
    if (typeof value !== 'boolean'){
        fail('INVALID_DEFINITION_FIELD', `${path} must be a boolean, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

export function freezeDefinitionRecord(record){
    return Object.freeze({ ...record });
}
