import { EngineContractError } from '../identity.mjs';
import { Registry } from '../registry.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function freezeArray(values){
    return Object.freeze(values);
}

function readPropertyWithoutAccessors(value, key, fallback){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return fallback;

    const seen = new Set();
    let current = value;
    while (current !== null && !seen.has(current)){
        seen.add(current);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(current, key);
        }
        catch {
            return fallback;
        }
        if (descriptor){
            return Object.prototype.hasOwnProperty.call(descriptor, 'value')
                ? descriptor.value
                : fallback;
        }
        try {
            current = Object.getPrototypeOf(current);
        }
        catch {
            return fallback;
        }
    }
    return fallback;
}

function safePrimitive(value){
    switch (typeof value){
        case 'undefined': return '<undefined>';
        case 'bigint': return `${value}n`;
        case 'symbol': return String(value);
        case 'function': {
            const name = readPropertyWithoutAccessors(value, 'name', 'anonymous');
            return `[function ${typeof name === 'string' && name.length > 0 ? name : 'anonymous'}]`;
        }
        default: return value;
    }
}

function isErrorObject(value){
    if (value === null || typeof value !== 'object') return false;
    const seen = new Set();
    let current = value;
    while (current !== null && !seen.has(current)){
        if (current === Error.prototype) return true;
        seen.add(current);
        try {
            current = Object.getPrototypeOf(current);
        }
        catch {
            return false;
        }
    }
    return false;
}

function defineSnapshotField(target, key, value){
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: false,
        configurable: false,
    });
}

function uniqueSymbolLabel(copy, key, index){
    let base;
    try {
        base = `[$symbol:${String(key.description ?? index)}]`;
    }
    catch {
        base = `[$symbol:${index}]`;
    }
    let label = base;
    let suffix = 1;
    while (Object.prototype.hasOwnProperty.call(copy, label)){
        label = `${base}#${suffix++}`;
    }
    return label;
}

function snapshotValue(value, ancestors = new Set()){
    if (value === null || typeof value !== 'object'){
        return safePrimitive(value);
    }

    if (ancestors.has(value)) return '<circular>';

    let prototype;
    let keys;
    let isArray;
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
        isArray = Array.isArray(value);
    }
    catch {
        return '<uninspectable>';
    }

    if (!isArray && prototype !== Object.prototype && prototype !== null){
        if (isErrorObject(value)){
            const name = readPropertyWithoutAccessors(value, 'name', 'Error');
            const message = readPropertyWithoutAccessors(value, 'message', '<unreadable>');
            return Object.freeze({
                name: typeof name === 'string' ? name : 'Error',
                message: typeof message === 'string' ? message : '<unreadable>',
            });
        }
        return '<non-plain-object>';
    }

    ancestors.add(value);
    try {
        if (isArray){
            let length;
            try {
                const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
                length = descriptor && descriptor.value;
            }
            catch {
                return '<uninspectable-array>';
            }
            if (!Number.isSafeInteger(length) || length < 0) return '<invalid-array>';

            const copy = new Array(length);
            for (let index = 0; index < length; index++){
                let descriptor;
                try {
                    descriptor = Object.getOwnPropertyDescriptor(value, String(index));
                }
                catch {
                    copy[index] = '<uninspectable>';
                    continue;
                }
                copy[index] = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                    ? snapshotValue(descriptor.value, ancestors)
                    : '<missing-or-accessor>';
            }
            return freezeArray(copy);
        }

        const copy = {};
        const stringKeys = keys.filter(key => typeof key === 'string').sort();
        const symbolKeys = keys.filter(key => typeof key === 'symbol');

        for (const key of stringKeys){
            let descriptor;
            try {
                descriptor = Object.getOwnPropertyDescriptor(value, key);
            }
            catch {
                defineSnapshotField(copy, key, '<uninspectable>');
                continue;
            }
            const snap = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                ? snapshotValue(descriptor.value, ancestors)
                : '<accessor>';
            defineSnapshotField(copy, key, snap);
        }

        for (let index = 0; index < symbolKeys.length; index++){
            const key = symbolKeys[index];
            const label = uniqueSymbolLabel(copy, key, index);
            let descriptor;
            try {
                descriptor = Object.getOwnPropertyDescriptor(value, key);
            }
            catch {
                descriptor = undefined;
            }
            defineSnapshotField(
                copy,
                label,
                descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                    ? snapshotValue(descriptor.value, ancestors)
                    : '<accessor-or-uninspectable>'
            );
        }

        return Object.freeze(copy);
    }
    finally {
        ancestors.delete(value);
    }
}

function inspectEntry(family, entry){
    return Object.freeze({
        family,
        id: entry.id,
        owner: snapshotValue(entry.owner),
        schemaVersion: entry.schemaVersion,
        tags: freezeArray([...entry.tags]),
        aliases: freezeArray([...entry.aliases]),
        definition: snapshotValue(entry.definition),
    });
}

export function inspectRegistry(registry){
    if (!(registry instanceof Registry)){
        fail('INVALID_INSPECTION_TARGET', 'Registry inspector requires a Registry instance.', { target: snapshotValue(registry) });
    }

    const family = registry.type;
    const entries = registry.entries().map(entry => inspectEntry(family, entry));
    const aliases = [];
    for (const entry of entries){
        for (const alias of entry.aliases){
            aliases.push(Object.freeze({ alias, id: entry.id }));
        }
    }
    aliases.sort((a, b) => a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : a.id.localeCompare(b.id));

    return Object.freeze({
        family,
        size: entries.length,
        ids: freezeArray(entries.map(entry => entry.id)),
        entries: freezeArray(entries),
        aliases: freezeArray(aliases),
    });
}

function inspectRegistryArray(registries){
    let isArray;
    let lengthDescriptor;
    try {
        isArray = Array.isArray(registries);
        if (isArray){
            lengthDescriptor = Object.getOwnPropertyDescriptor(registries, 'length');
        }
    }
    catch {
        isArray = false;
    }
    if (!isArray || !lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0){
        fail('INVALID_INSPECTION_TARGET', 'Registry inspector collection must be an array.', { target: snapshotValue(registries) });
    }

    const snapshots = new Array(lengthDescriptor.value);
    for (let index = 0; index < lengthDescriptor.value; index++){
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(registries, String(index));
        }
        catch {
            fail('INVALID_INSPECTION_TARGET', `Registry inspector collection item ${index} could not be inspected.`, { index });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_INSPECTION_TARGET', 'Registry inspector collection must be dense and contain data items.', { index });
        }
        snapshots[index] = inspectRegistry(descriptor.value);
    }
    return snapshots;
}

export function inspectRegistries(registries){
    const snapshots = inspectRegistryArray(registries);
    snapshots.sort((a, b) => a.family.localeCompare(b.family));
    return freezeArray(snapshots);
}

export function inspectContractError(error){
    let contractError = false;
    try {
        contractError = error instanceof EngineContractError;
    }
    catch {
        contractError = false;
    }

    if (!contractError){
        const name = readPropertyWithoutAccessors(error, 'name', typeof error);
        const message = readPropertyWithoutAccessors(error, 'message', '<non-contract error>');
        return Object.freeze({
            contractError: false,
            name: typeof name === 'string' ? name : typeof error,
            message: typeof message === 'string' ? message : '<non-contract error>',
            details: snapshotValue(error),
        });
    }

    const name = readPropertyWithoutAccessors(error, 'name', 'EngineContractError');
    const code = readPropertyWithoutAccessors(error, 'code', '<unreadable>');
    const message = readPropertyWithoutAccessors(error, 'message', '<unreadable>');
    const details = readPropertyWithoutAccessors(error, 'details', undefined);
    return Object.freeze({
        contractError: true,
        name: typeof name === 'string' ? name : 'EngineContractError',
        code: typeof code === 'string' ? code : '<unreadable>',
        message: typeof message === 'string' ? message : '<unreadable>',
        details: snapshotValue(details),
    });
}
