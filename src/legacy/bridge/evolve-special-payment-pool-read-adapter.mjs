import { EngineContractError, parseContentId } from '../../engine/identity.mjs';
import { inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';
import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';

const MISSING = Symbol('missing-legacy-special-payment-pool-state');
const SUPPORTED_POOL_MAPPING_IDS = Object.freeze([
    'evolve.payment_pool.purifier_supply_state',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainOptionsContainer(value){
    const path = 'evolveSpecialPaymentPoolAdapterOptions';
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG', `${path} must be a plain data object.`, {
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
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG', `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG', `${path} must be a plain data object.`, {
            path,
            containerType: isArray ? 'array' : 'object',
        });
    }
}

function readOptions(rawOptions){
    assertPlainOptionsContainer(rawOptions);
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolveSpecialPaymentPoolAdapterOptions',
        code: 'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'readLegacyRoot'){
            fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG', 'Unsupported legacy special payment pool adapter option.', {
                path: `evolveSpecialPaymentPoolAdapterOptions.${key}`,
                field: key,
            });
        }
    }
    if (!fields.has('readLegacyRoot')){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ADAPTER_CONFIG', 'readLegacyRoot is required.', {
            path: 'evolveSpecialPaymentPoolAdapterOptions.readLegacyRoot',
        });
    }
    return fields;
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} must be a function.`, {
            path,
            valueType: typeof value,
        });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail(
            'INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER',
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
            fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path} must be a plain object.`, { path });
    }
    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataField(record, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path}.${field} could not be inspected.`, {
            path: `${path}.${field}`,
        });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path}.${field} must be a data field.`, {
            path: `${path}.${field}`,
        });
    }
    return descriptor.value;
}

function readLegacyPath(root, legacyPath){
    let current = assertPlainRecord(root, 'legacySpecialPaymentPoolRoot');
    const segments = legacyPath.split('.').slice(1);
    let display = 'legacySpecialPaymentPoolRoot';
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
    for (const mappingId of SUPPORTED_POOL_MAPPING_IDS){
        const mapping = catalog.getRequired(mappingId);
        for (const canonicalId of mapping.canonicalIds){
            if (index.has(canonicalId)){
                fail('DUPLICATE_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT', 'Legacy special payment pool subject is mapped more than once.', {
                    poolId: canonicalId,
                });
            }
            index.set(canonicalId, mapping);
        }
    }
    return index;
}

function canonicalPoolId(value){
    if (typeof value !== 'string'){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT_ID', 'Legacy special payment pool subject must be a canonical payment-pool content ID.', {
            expectedType: 'payment-pool',
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT_ID', 'Legacy special payment pool subject must be a canonical payment-pool content ID.', {
            expectedType: 'payment-pool',
            valueType: 'string',
        });
    }
    if (parsed.type !== 'payment-pool'){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT_ID', 'Legacy special payment pool subject must identify content type payment-pool.', {
            expectedType: 'payment-pool',
            actualType: parsed.type,
        });
    }
    return parsed.canonical;
}

function requireMapping(index, rawPoolId){
    const poolId = canonicalPoolId(rawPoolId);
    const mapping = index.get(poolId);
    if (!mapping){
        fail('UNSUPPORTED_LEGACY_SPECIAL_PAYMENT_POOL_SUBJECT', 'Legacy special payment pool compatibility does not support this pool.', {
            poolId,
        });
    }
    return { mapping, poolId };
}

function createRootReader(readLegacyRoot){
    return function currentRoot(){
        let root;
        try {
            root = Reflect.apply(readLegacyRoot, undefined, []);
        }
        catch {
            fail('LEGACY_SPECIAL_PAYMENT_POOL_ROOT_READ_FAILURE', 'Legacy special payment pool root provider threw while reading current state.');
        }
        if (isPromiseLike(root, 'evolveSpecialPaymentPoolAdapter.readLegacyRoot.result')){
            fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_ROOT_PROVIDER', 'Legacy special payment pool root provider must be synchronous.');
        }
        return assertPlainRecord(root, 'legacySpecialPaymentPoolRoot');
    };
}

function finiteNumber(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', `${path} must be a finite number.`, {
            path,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

export function createEvolveSpecialPaymentPoolReadProvider(rawOptions){
    const options = readOptions(rawOptions);
    const readLegacyRoot = assertSynchronousFunction(
        options.get('readLegacyRoot'),
        'evolveSpecialPaymentPoolAdapterOptions.readLegacyRoot'
    );
    const currentRoot = createRootReader(readLegacyRoot);
    const index = mappingIndex();

    function poolRecord(rawPoolId){
        const { mapping, poolId } = requireMapping(index, rawPoolId);
        const value = readLegacyPath(currentRoot(), mapping.legacyPath);
        if (value === MISSING) return { mapping, poolId, record: MISSING };
        return {
            mapping,
            poolId,
            record: assertPlainRecord(value, `legacy special payment pool ${poolId}`),
        };
    }

    return Object.freeze({
        pool: Object.freeze({
            present(rawPoolId){
                return poolRecord(rawPoolId).record !== MISSING;
            },
            amount(rawPoolId){
                const { mapping, poolId, record } = poolRecord(rawPoolId);
                if (record === MISSING){
                    fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', 'Resolved legacy special payment pool is missing.', {
                        poolId,
                        path: mapping.legacyPath,
                    });
                }
                const value = readDataField(record, 'supply', `legacy special payment pool ${poolId}`);
                if (value === MISSING){
                    fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', 'Legacy special payment pool amount is required.', {
                        poolId,
                        path: `${mapping.legacyPath}.supply`,
                    });
                }
                return finiteNumber(value, `${mapping.legacyPath}.supply`);
            },
            capacity(rawPoolId){
                const { mapping, poolId, record } = poolRecord(rawPoolId);
                if (record === MISSING){
                    fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', 'Resolved legacy special payment pool is missing.', {
                        poolId,
                        path: mapping.legacyPath,
                    });
                }
                const value = readDataField(record, 'sup_max', `legacy special payment pool ${poolId}`);
                if (value === MISSING){
                    fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', 'Legacy special payment pool capacity is required.', {
                        poolId,
                        path: `${mapping.legacyPath}.sup_max`,
                    });
                }
                const capacity = finiteNumber(value, `${mapping.legacyPath}.sup_max`);
                if (capacity < 0){
                    fail('INVALID_LEGACY_SPECIAL_PAYMENT_POOL_STATE', 'Legacy special payment pool capacity must be non-negative.', {
                        poolId,
                        path: `${mapping.legacyPath}.sup_max`,
                        value: capacity,
                    });
                }
                return capacity;
            },
        }),
    });
}
