import { EngineContractError, parseContentId } from '../../engine/identity.mjs';
import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';
import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';

const MISSING = Symbol('missing-legacy-prestige-payment-state');
const SUPPORTED_PRESTIGE_MAPPING_IDS = Object.freeze([
    'evolve.prestige.plasmid_state',
    'evolve.prestige.anti_plasmid_state',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainOptionsContainer(value){
    const path = 'evolveLegacyPrestigePaymentAdapterOptions';
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG', `${path} must be a plain data object.`, {
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
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG', `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG', `${path} must be a plain data object.`, {
            path,
            containerType: isArray ? 'array' : 'object',
        });
    }
}

function readOptions(rawOptions){
    assertPlainOptionsContainer(rawOptions);
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolveLegacyPrestigePaymentAdapterOptions',
        code: 'INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'readLegacyRoot'){
            fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG', 'Unsupported legacy prestige payment adapter option.', {
                path: `evolveLegacyPrestigePaymentAdapterOptions.${key}`,
                field: key,
            });
        }
    }
    if (!fields.has('readLegacyRoot')){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ADAPTER_CONFIG', 'readLegacyRoot is required.', {
            path: 'evolveLegacyPrestigePaymentAdapterOptions.readLegacyRoot',
        });
    }
    return fields;
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} must be a function.`, {
            path,
            valueType: typeof value,
        });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail(
            'INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER',
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
            fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', `${path} must be a plain object.`, { path });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataField(record, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', `${path}.${field} could not be inspected.`, {
            path: `${path}.${field}`,
        });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', `${path}.${field} must be a data field.`, {
            path: `${path}.${field}`,
        });
    }
    return descriptor.value;
}

function readLegacyPath(root, legacyPath){
    let current = assertPlainRecord(root, 'legacyPrestigePaymentRoot');
    const segments = legacyPath.split('.').slice(1);
    let display = 'legacyPrestigePaymentRoot';
    for (let index = 0; index < segments.length; index++){
        const segment = segments[index];
        const value = readDataField(current, segment, display);
        if (value === MISSING) return MISSING;
        if (index === segments.length - 1) return value;
        display += `.${segment}`;
        current = assertPlainRecord(value, display);
    }
    return current;
}

function mappingIndex(){
    const catalog = createEvolveLegacyMappingCatalog();
    const index = new Map();
    for (const mappingId of SUPPORTED_PRESTIGE_MAPPING_IDS){
        const mapping = catalog.getRequired(mappingId);
        for (const canonicalId of mapping.canonicalIds){
            if (index.has(canonicalId)){
                fail('DUPLICATE_LEGACY_PRESTIGE_PAYMENT_SUBJECT', 'Legacy prestige payment subject is mapped more than once.', {
                    prestigeId: canonicalId,
                });
            }
            index.set(canonicalId, mapping);
        }
    }
    return index;
}

function canonicalPrestigeId(value){
    if (typeof value !== 'string'){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_SUBJECT_ID', 'Legacy prestige payment subject must be a canonical prestige content ID.', {
            expectedType: 'prestige',
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_SUBJECT_ID', 'Legacy prestige payment subject must be a canonical prestige content ID.', {
            expectedType: 'prestige',
            valueType: 'string',
        });
    }
    if (parsed.type !== 'prestige'){
        fail('INVALID_LEGACY_PRESTIGE_PAYMENT_SUBJECT_ID', 'Legacy prestige payment subject must identify content type prestige.', {
            expectedType: 'prestige',
            actualType: parsed.type,
        });
    }
    return parsed.canonical;
}

function createRootReader(readLegacyRoot){
    return function currentRoot(){
        let root;
        try {
            root = Reflect.apply(readLegacyRoot, undefined, []);
        }
        catch {
            fail('LEGACY_PRESTIGE_PAYMENT_ROOT_READ_FAILURE', 'Legacy prestige payment root provider threw while reading current state.');
        }
        if (isPromiseLike(root, 'evolveLegacyPrestigePaymentAdapter.readLegacyRoot.result')){
            fail('INVALID_LEGACY_PRESTIGE_PAYMENT_ROOT_PROVIDER', 'Legacy prestige payment root provider must be synchronous.');
        }
        return assertPlainRecord(root, 'legacyPrestigePaymentRoot');
    };
}

export function createEvolvePrestigePaymentReadProvider(rawOptions){
    const options = readOptions(rawOptions);
    const readLegacyRoot = assertSynchronousFunction(
        options.get('readLegacyRoot'),
        'evolveLegacyPrestigePaymentAdapterOptions.readLegacyRoot'
    );
    const currentRoot = createRootReader(readLegacyRoot);
    const index = mappingIndex();

    return Object.freeze({
        prestige: Object.freeze({
            amount(rawPrestigeId){
                const prestigeId = canonicalPrestigeId(rawPrestigeId);
                const mapping = index.get(prestigeId);
                if (!mapping){
                    fail('UNSUPPORTED_LEGACY_PRESTIGE_PAYMENT_SUBJECT', 'Legacy prestige payment compatibility does not support this prestige identity.', {
                        prestigeId,
                    });
                }
                const record = readLegacyPath(currentRoot(), mapping.legacyPath);
                if (record === MISSING){
                    fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', 'Resolved legacy prestige payment source is missing.', {
                        prestigeId,
                        path: mapping.legacyPath,
                    });
                }
                const prestigeRecord = assertPlainRecord(record, `legacy prestige payment ${prestigeId}`);
                const count = readDataField(prestigeRecord, 'count', `legacy prestige payment ${prestigeId}`);
                if (count === MISSING || typeof count !== 'number' || !Number.isFinite(count)){
                    fail('INVALID_LEGACY_PRESTIGE_PAYMENT_STATE', 'Legacy prestige payment count must be a finite number.', {
                        prestigeId,
                        path: `${mapping.legacyPath}.count`,
                        valueType: count === MISSING ? 'missing' : typeof count,
                    });
                }
                return Object.is(count, -0) ? 0 : count;
            },
        }),
    });
}
