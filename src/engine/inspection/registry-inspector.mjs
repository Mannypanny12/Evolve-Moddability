import { EngineContractError } from '../identity.mjs';
import { Registry } from '../registry.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function freezeArray(values){
    return Object.freeze(values);
}

function safePrimitive(value){
    switch (typeof value){
        case 'undefined': return '<undefined>';
        case 'bigint': return `${value}n`;
        case 'symbol': return String(value);
        case 'function': return `[function ${value.name || 'anonymous'}]`;
        default: return value;
    }
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
        if (value instanceof Error){
            return Object.freeze({
                name: typeof value.name === 'string' ? value.name : 'Error',
                message: typeof value.message === 'string' ? value.message : '<unreadable>',
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
                Object.defineProperty(copy, key, {
                    value: '<uninspectable>',
                    enumerable: true,
                });
                continue;
            }
            const snap = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                ? snapshotValue(descriptor.value, ancestors)
                : '<accessor>';
            Object.defineProperty(copy, key, {
                value: snap,
                enumerable: true,
            });
        }

        for (let index = 0; index < symbolKeys.length; index++){
            const key = symbolKeys[index];
            let label;
            try {
                label = `[$symbol:${String(key.description ?? index)}]`;
            }
            catch {
                label = `[$symbol:${index}]`;
            }
            let descriptor;
            try {
                descriptor = Object.getOwnPropertyDescriptor(value, key);
            }
            catch {
                descriptor = undefined;
            }
            Object.defineProperty(copy, label, {
                value: descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
                    ? snapshotValue(descriptor.value, ancestors)
                    : '<accessor-or-uninspectable>',
                enumerable: true,
            });
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

export function inspectRegistries(registries){
    if (!Array.isArray(registries)){
        fail('INVALID_INSPECTION_TARGET', 'Registry inspector collection must be an array.', { target: snapshotValue(registries) });
    }

    const snapshots = Array.from(registries, registry => inspectRegistry(registry));
    snapshots.sort((a, b) => a.family.localeCompare(b.family));
    return freezeArray(snapshots);
}

export function inspectContractError(error){
    if (!(error instanceof EngineContractError)){
        return Object.freeze({
            contractError: false,
            name: error && typeof error.name === 'string' ? error.name : typeof error,
            message: error && typeof error.message === 'string' ? error.message : '<non-contract error>',
            details: snapshotValue(error),
        });
    }

    return Object.freeze({
        contractError: true,
        name: error.name,
        code: error.code,
        message: error.message,
        details: snapshotValue(error.details),
    });
}
