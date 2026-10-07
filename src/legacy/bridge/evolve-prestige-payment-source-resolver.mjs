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

function assertSynchronousFunction(value, path){
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail(
            'INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER',
            `${path} must be a directly callable synchronous non-generator function.`,
            { path }
        );
    }
    return value;
}

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
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
    return assertSynchronousFunction(
        readLegacyRoot,
        'evolvePrestigePaymentSourceResolverOptions.readLegacyRoot'
    );
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
    if (isPromiseLike(root, 'evolvePrestigePaymentSourceResolver.readLegacyRoot.result')){
        fail('INVALID_PRESTIGE_PAYMENT_SOURCE_ROOT_PROVIDER', 'Prestige payment source context provider must be synchronous.');
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
