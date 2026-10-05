import { EngineContractError } from '../../engine/identity.mjs';
import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';
import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';

const MISSING = Symbol('missing-legacy-payment-state');
const SUPPORTED_PAYMENT_MAPPING_IDS = Object.freeze([
    'evolve.resource.rna_state',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function readOptions(rawOptions){
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolveLegacyPaymentAdapterOptions',
        code: 'INVALID_LEGACY_PAYMENT_ADAPTER_CONFIG',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'readLegacyRoot'){
            fail('INVALID_LEGACY_PAYMENT_ADAPTER_CONFIG', 'Unsupported legacy payment adapter option.', {
                path: `evolveLegacyPaymentAdapterOptions.${key}`,
                field: key,
            });
        }
    }
    if (!fields.has('readLegacyRoot')){
        fail('INVALID_LEGACY_PAYMENT_ADAPTER_CONFIG', 'readLegacyRoot is required.', {
            path: 'evolveLegacyPaymentAdapterOptions.readLegacyRoot',
        });
    }
    return fields;
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} must be a function.`, { path, valueType: typeof value });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path} must be a plain object.`, { path });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path} could not be inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataField(record, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path}.${field} could not be inspected.`, { path: `${path}.${field}` });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path}.${field} must be a data field.`, { path: `${path}.${field}` });
    }
    return descriptor.value;
}

function readLegacyPath(root, legacyPath){
    let current = assertPlainRecord(root, 'legacyPaymentRoot');
    const segments = legacyPath.split('.').slice(1);
    let display = 'legacyPaymentRoot';
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
    for (const mappingId of SUPPORTED_PAYMENT_MAPPING_IDS){
        const mapping = catalog.getRequired(mappingId);
        for (const canonicalId of mapping.canonicalIds){
            if (index.has(canonicalId)){
                fail('DUPLICATE_LEGACY_PAYMENT_SUBJECT', 'Legacy payment subject is mapped more than once.', {
                    resourceId: canonicalId,
                });
            }
            index.set(canonicalId, mapping);
        }
    }
    return index;
}

function requireMapping(index, resourceId){
    const mapping = index.get(resourceId);
    if (!mapping){
        fail('UNSUPPORTED_LEGACY_PAYMENT_SUBJECT', 'Legacy payment compatibility does not support this resource.', {
            resourceId,
        });
    }
    return mapping;
}

function createRootReader(readLegacyRoot){
    return function currentRoot(){
        let root;
        try {
            root = Reflect.apply(readLegacyRoot, undefined, []);
        }
        catch {
            fail('LEGACY_PAYMENT_ROOT_READ_FAILURE', 'Legacy payment root provider threw while reading current state.');
        }
        if (isPromiseLike(root, 'evolveLegacyPaymentAdapter.readLegacyRoot.result')){
            fail('INVALID_LEGACY_PAYMENT_ROOT_PROVIDER', 'Legacy payment root provider must be synchronous.');
        }
        return assertPlainRecord(root, 'legacyPaymentRoot');
    };
}

function resourceRecord(currentRoot, mapping, resourceId){
    const value = readLegacyPath(currentRoot(), mapping.legacyPath);
    if (value === MISSING) return MISSING;
    return assertPlainRecord(value, `legacy payment resource ${resourceId}`);
}

function finiteNumber(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_LEGACY_PAYMENT_STATE', `${path} must be a finite number.`, { path, valueType: typeof value });
    }
    return Object.is(value, -0) ? 0 : value;
}

function availability(value, path){
    if (value === MISSING) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value !== 0;
    fail('INVALID_LEGACY_PAYMENT_STATE', `${path} must be a boolean or non-negative finite numeric presence marker.`, {
        path,
        valueType: typeof value,
    });
}

export function createEvolveLegacyPaymentReadProvider(rawOptions){
    const options = readOptions(rawOptions);
    const readLegacyRoot = assertSynchronousFunction(
        options.get('readLegacyRoot'),
        'evolveLegacyPaymentAdapterOptions.readLegacyRoot'
    );
    const currentRoot = createRootReader(readLegacyRoot);
    const index = mappingIndex();

    return Object.freeze({
        resource: Object.freeze({
            amount(resourceId){
                const mapping = requireMapping(index, resourceId);
                const record = resourceRecord(currentRoot, mapping, resourceId);
                if (record === MISSING) return 0;
                const value = readDataField(record, 'amount', `legacy payment resource ${resourceId}`);
                if (value === MISSING){
                    fail('INVALID_LEGACY_PAYMENT_STATE', 'Legacy payment resource amount is required.', {
                        path: `${mapping.legacyPath}.amount`,
                    });
                }
                return finiteNumber(value, `${mapping.legacyPath}.amount`);
            },
            available(resourceId){
                const mapping = requireMapping(index, resourceId);
                const record = resourceRecord(currentRoot, mapping, resourceId);
                if (record === MISSING) return false;
                return availability(
                    readDataField(record, 'display', `legacy payment resource ${resourceId}`),
                    `${mapping.legacyPath}.display`
                );
            },
            capacity(resourceId){
                const mapping = requireMapping(index, resourceId);
                const record = resourceRecord(currentRoot, mapping, resourceId);
                if (record === MISSING) return 0;
                const value = readDataField(record, 'max', `legacy payment resource ${resourceId}`);
                if (value === MISSING){
                    fail('INVALID_LEGACY_PAYMENT_STATE', 'Legacy payment resource capacity is required.', {
                        path: `${mapping.legacyPath}.max`,
                    });
                }
                const capacity = finiteNumber(value, `${mapping.legacyPath}.max`);
                if (capacity === -1) return null;
                if (capacity < 0){
                    fail('INVALID_LEGACY_PAYMENT_STATE', 'Legacy payment resource max must be -1 or non-negative.', {
                        path: `${mapping.legacyPath}.max`,
                        value: capacity,
                    });
                }
                return capacity;
            },
        }),
    });
}
