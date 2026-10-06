import { EngineContractError, parseContentId } from '../../engine/identity.mjs';
import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';
import { evolveSpeciesPaymentResourceId } from './evolve-species-payment-catalog.mjs';

const SUPPLY_PAYMENT_ID = 'evolve:payment/supply';
const KNOWLEDGE_PAYMENT_ID = 'evolve:payment/knowledge';
const SPECIES_PAYMENT_ID = 'evolve:payment/species';
const PURIFIER_SUPPLY_POOL_ID = 'evolve:payment-pool/purifier_supply';
const KNOWLEDGE_RESOURCE_ID = 'evolve:resource/knowledge';
const MISSING = Symbol('missing-special-payment-source-state');

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalPaymentId(value){
    if (typeof value !== 'string'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must be a canonical payment content ID.', {
            expectedType: 'payment',
            valueType: typeof value,
        });
    }
    let parsed;
    try { parsed = parseContentId(value); }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must be a canonical payment content ID.', {
            expectedType: 'payment',
            valueType: 'string',
        });
    }
    if (parsed.type !== 'payment'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must identify content type payment.', {
            expectedType: 'payment',
            actualType: parsed.type,
        });
    }
    if (![SUPPLY_PAYMENT_ID, KNOWLEDGE_PAYMENT_ID, SPECIES_PAYMENT_ID].includes(parsed.canonical)){
        fail('UNSUPPORTED_SPECIAL_PAYMENT_SOURCE_ID', 'This first-party special payment source resolver does not support the supplied identity.', {
            paymentId: parsed.canonical,
        });
    }
    return parsed.canonical;
}

function readOptions(rawOptions){
    if (rawOptions === undefined) return new Map();
    if (rawOptions === null || typeof rawOptions !== 'object'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_RESOLVER_CONFIG', 'Special payment source resolver options must be a plain data object.', {
            valueType: rawOptions === null ? 'null' : typeof rawOptions,
        });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(rawOptions);
        prototype = Object.getPrototypeOf(rawOptions);
    }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_RESOLVER_CONFIG', 'Special payment source resolver options could not be safely inspected.');
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_RESOLVER_CONFIG', 'Special payment source resolver options must be a plain data object.');
    }
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolveSpecialPaymentSourceResolverOptions',
        code: 'INVALID_SPECIAL_PAYMENT_SOURCE_RESOLVER_CONFIG',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'readLegacyRoot'){
            fail('INVALID_SPECIAL_PAYMENT_SOURCE_RESOLVER_CONFIG', 'Unsupported special payment source resolver option.', {
                field: key,
            });
        }
    }
    return fields;
}

function assertSynchronousFunction(value){
    if (typeof value !== 'function'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot must be a function.', {
            valueType: typeof value,
        });
    }
    let source;
    try { source = Function.prototype.toString.call(value); }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot could not be inspected.');
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot must be a directly callable synchronous non-generator function.');
    }
    return value;
}

function isPromiseLike(value){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot result thenable state could not be safely inspected.');
        }
        seen.add(cursor);
        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(cursor, 'then'); }
        catch {
            fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot result thenable state could not be safely inspected.');
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot result may not expose an accessor-based then property.');
            }
            return typeof descriptor.value === 'function';
        }
        try { cursor = Object.getPrototypeOf(cursor); }
        catch {
            fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot result thenable state could not be safely inspected.');
        }
    }
    return false;
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', `${path} must be a plain object.`, { path });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', `${path} could not be inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataField(record, field, path){
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(record, field); }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', `${path}.${field} could not be inspected.`, { path: `${path}.${field}` });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', `${path}.${field} must be a data field.`, { path: `${path}.${field}` });
    }
    return descriptor.value;
}

function currentSpeciesResourceId(readLegacyRoot){
    if (!readLegacyRoot){
        fail('MISSING_SPECIAL_PAYMENT_SPECIES_CONTEXT', 'Species payment source resolution requires readLegacyRoot.');
    }
    let root;
    try { root = Reflect.apply(readLegacyRoot, undefined, []); }
    catch {
        fail('SPECIAL_PAYMENT_SOURCE_CONTEXT_READ_FAILURE', 'Legacy root provider threw while resolving Species payment source.');
    }
    if (isPromiseLike(root)){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ROOT_PROVIDER', 'readLegacyRoot must return synchronously.');
    }
    root = assertPlainRecord(root, 'legacySpecialPaymentRoot');
    const raceValue = readDataField(root, 'race', 'legacySpecialPaymentRoot');
    if (raceValue === MISSING){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', 'legacySpecialPaymentRoot.race is required for Species payment resolution.');
    }
    const race = assertPlainRecord(raceValue, 'legacySpecialPaymentRoot.race');
    const species = readDataField(race, 'species', 'legacySpecialPaymentRoot.race');
    if (species === MISSING){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_STATE', 'legacySpecialPaymentRoot.race.species is required for Species payment resolution.');
    }
    return evolveSpeciesPaymentResourceId(species);
}

export function createEvolveSpecialPaymentSourceResolver(rawOptions = undefined){
    const options = readOptions(rawOptions);
    const readLegacyRoot = options.has('readLegacyRoot')
        ? assertSynchronousFunction(options.get('readLegacyRoot'))
        : null;
    const supplySource = Object.freeze({
        kind: 'pool',
        poolId: PURIFIER_SUPPLY_POOL_ID,
    });
    const knowledgeSource = Object.freeze({
        kind: 'resource',
        resourceId: KNOWLEDGE_RESOURCE_ID,
    });

    return Object.freeze({
        resolvePaymentSource(rawPaymentId){
            const paymentId = canonicalPaymentId(rawPaymentId);
            if (paymentId === SUPPLY_PAYMENT_ID) return supplySource;
            if (paymentId === KNOWLEDGE_PAYMENT_ID) return knowledgeSource;
            return Object.freeze({
                kind: 'resource',
                resourceId: currentSpeciesResourceId(readLegacyRoot),
            });
        },
    });
}
