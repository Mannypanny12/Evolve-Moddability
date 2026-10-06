import { EngineContractError, parseContentId } from '../../engine/identity.mjs';
import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';

const PLASMID_ID = 'evolve:prestige/plasmid';
const ANTI_PLASMID_ID = 'evolve:prestige/anti_plasmid';
const SUPPORTED_IDS = new Set([PLASMID_ID, ANTI_PLASMID_ID]);
const MISSING = Symbol('missing-prestige-source-context');

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainRecord(value, path, code){
    if (value === null || typeof value !== 'object'){
        fail(code, `${path} must be a plain object.`, {
            path,
            valueType: value === null ? 'null' : typeof value,
        });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail(code, `${path} must be a plain object.`, {
            path,
            containerType: isArray ? 'array' : 'object',
        });
    }
    return value;
}

function readDataField(record, field, path, code){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail(code, `${path}.${field} could not be inspected.`, { path: `${path}.${field}` });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail(code, `${path}.${field} must be a data field.`, { path: `${path}.${field}` });
    }
    return descriptor.value;
}

function readOptions(rawOptions){
    assertPlainRecord(rawOptions, 'evolvePrestigePaymentSourceResolverOptions', 'INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG');
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolvePrestigePaymentSourceResolverOptions',
        code: 'INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'readLegacyRoot'){
            fail('INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG', 'Unsupported prestige payment source resolver option.', {
                path: `evolvePrestigePaymentSourceResolverOptions.${key}`,
                field: key,
            });
        }
    }
    if (!fields.has('readLegacyRoot')){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG', 'readLegacyRoot is required.', {
            path: 'evolvePrestigePaymentSourceResolverOptions.readLegacyRoot',
        });
    }
    const readLegacyRoot = fields.get('readLegacyRoot');
    if (typeof readLegacyRoot !== 'function'){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_RESOLVER_CONFIG', 'readLegacyRoot must be a function.', {
            path: 'evolvePrestigePaymentSourceResolverOptions.readLegacyRoot',
            valueType: typeof readLegacyRoot,
        });
    }
    return readLegacyRoot;
}

function canonicalPrestigeId(value){
    if (typeof value !== 'string'){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ID', 'Prestige payment source identity must be a canonical prestige content ID.', {
            expectedType: 'prestige',
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ID', 'Prestige payment source identity must be a canonical prestige content ID.', {
            expectedType: 'prestige',
            valueType: 'string',
        });
    }
    if (parsed.type !== 'prestige'){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ID', 'Prestige payment source identity must identify content type prestige.', {
            expectedType: 'prestige',
            actualType: parsed.type,
        });
    }
    if (!SUPPORTED_IDS.has(parsed.canonical)){
        fail('UNSUPPORTED_PRESTIGE_PAYMENT_SOURCE_ID', 'This first-party prestige payment source resolver does not support the supplied identity.', {
            prestigeId: parsed.canonical,
        });
    }
    return parsed.canonical;
}

function readUniverse(readLegacyRoot){
    let root;
    try {
        root = Reflect.apply(readLegacyRoot, undefined, []);
    }
    catch {
        fail('PRESTIGE_PAYMENT_SOURCE_CONTEXT_READ_FAILURE', 'Prestige payment source context provider threw while reading current state.');
    }
    assertPlainRecord(root, 'legacyPrestigePaymentSourceRoot', 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT');
    const race = readDataField(root, 'race', 'legacyPrestigePaymentSourceRoot', 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT');
    if (race === MISSING){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT', 'Legacy prestige payment source context is missing race state.', {
            path: 'legacyPrestigePaymentSourceRoot.race',
        });
    }
    assertPlainRecord(race, 'legacyPrestigePaymentSourceRoot.race', 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT');
    const universe = readDataField(race, 'universe', 'legacyPrestigePaymentSourceRoot.race', 'INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT');
    if (universe === MISSING || typeof universe !== 'string' || universe.length === 0){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_CONTEXT', 'Legacy prestige payment source universe must be a non-empty string.', {
            path: 'legacyPrestigePaymentSourceRoot.race.universe',
            valueType: universe === MISSING ? 'missing' : typeof universe,
        });
    }
    return universe;
}

export function createEvolvePrestigePaymentSourceResolver(rawOptions){
    const readLegacyRoot = readOptions(rawOptions);

    return Object.freeze({
        resolvePrestigeId(rawPrestigeId){
            const prestigeId = canonicalPrestigeId(rawPrestigeId);
            if (prestigeId === ANTI_PLASMID_ID) return ANTI_PLASMID_ID;
            return readUniverse(readLegacyRoot) === 'antimatter'
                ? ANTI_PLASMID_ID
                : PLASMID_ID;
        },
    });
}
