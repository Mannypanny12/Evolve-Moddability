import { EngineContractError, parseContentId } from '../../engine/identity.mjs';
import { inspectDenseInertArray, inspectPlainInertObject } from '../../engine/contracts/inert-data.mjs';
import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';

const MAX_RESOURCE_CHANGES = 256;
const SUPPORTED_RESOURCE_MAPPING_IDS = Object.freeze([
    'evolve.resource.rna_state',
    'evolve.resource.dna_state',
]);
const CHANGE_FIELDS = Object.freeze(['kind', 'resourceId', 'amount']);
const MISSING = Symbol('missing-resource-commit-state');

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainOptionsContainer(value){
    const path = 'evolveResourceCommitAdapterOptions';
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} must be a plain data object.`, {
            path,
            valueType: value === null ? 'null' : typeof value,
        });
    }
    let array;
    let prototype;
    try {
        array = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} could not be safely inspected.`, { path });
    }
    if (array || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} must be a plain data object.`, { path });
    }
}

function readOptions(rawOptions){
    assertPlainOptionsContainer(rawOptions);
    const fields = inspectPlainInertObject(rawOptions, {
        path: 'evolveResourceCommitAdapterOptions',
        code: 'INVALID_LEGACY_RESOURCE_COMMIT_CONFIG',
        maxFields: 1,
    });
    if (fields.size !== 1 || !fields.has('readLegacyRoot')){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', 'readLegacyRoot is the only supported adapter option.', {
            path: 'evolveResourceCommitAdapterOptions',
        });
    }
    return fields.get('readLegacyRoot');
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} must be a function.`, {
            path,
            valueType: typeof value,
        });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CONFIG', `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_LEGACY_RESOURCE_COMMIT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_LEGACY_RESOURCE_COMMIT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_LEGACY_RESOURCE_COMMIT_ROOT_PROVIDER', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_LEGACY_RESOURCE_COMMIT_ROOT_PROVIDER', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path} must be a plain object.`, { path });
    }
    let array;
    let prototype;
    try {
        array = Array.isArray(value);
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path} could not be safely inspected.`, { path });
    }
    if (array || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataDescriptor(record, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path}.${field} could not be safely inspected.`, {
            path: `${path}.${field}`,
        });
    }
    if (!descriptor) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path}.${field} must be a data field.`, {
            path: `${path}.${field}`,
        });
    }
    return descriptor;
}

function readLegacyPath(root, legacyPath){
    let current = assertPlainRecord(root, 'legacyResourceCommitRoot');
    const segments = legacyPath.split('.').slice(1);
    let display = 'legacyResourceCommitRoot';
    for (let index = 0; index < segments.length; index++){
        const segment = segments[index];
        const descriptor = readDataDescriptor(current, segment, display);
        if (descriptor === MISSING) return MISSING;
        if (index === segments.length - 1) return descriptor.value;
        display += `.${segment}`;
        current = assertPlainRecord(descriptor.value, display);
    }
    return current;
}

function mappingIndex(){
    const catalog = createEvolveLegacyMappingCatalog();
    const index = new Map();
    for (const mappingId of SUPPORTED_RESOURCE_MAPPING_IDS){
        const mapping = catalog.getRequired(mappingId);
        for (const canonicalId of mapping.canonicalIds){
            index.set(canonicalId, mapping);
        }
    }
    return index;
}

function assertResourceId(value, path){
    if (typeof value !== 'string'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path} must be a canonical resource content ID string.`, {
            path,
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path} must be a canonical resource content ID.`, {
            path,
            value,
        });
    }
    if (parsed.type !== 'resource'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path} must identify content type resource.`, {
            path,
            expectedType: 'resource',
            actualType: parsed.type,
        });
    }
    return parsed.canonical;
}

function normalizeChange(rawChange, index){
    const path = `legacyResourceCommit.changes[${index}]`;
    const fields = inspectPlainInertObject(rawChange, {
        path,
        code: 'INVALID_LEGACY_RESOURCE_COMMIT_CHANGE',
        maxFields: CHANGE_FIELDS.length,
    });
    if (fields.size !== CHANGE_FIELDS.length || CHANGE_FIELDS.some(field => !fields.has(field))){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path} must contain exactly kind, resourceId and amount.`, { path });
    }
    const kind = fields.get('kind');
    if (kind !== 'resource.debit' && kind !== 'resource.credit'){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path}.kind must be resource.debit or resource.credit.`, {
            path: `${path}.kind`,
            kind,
        });
    }
    const amount = fields.get('amount');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_CHANGE', `${path}.amount must be a positive finite number.`, {
            path: `${path}.amount`,
            valueType: typeof amount,
        });
    }
    return Object.freeze({
        kind,
        resourceId: assertResourceId(fields.get('resourceId'), `${path}.resourceId`),
        amount,
    });
}

function currentRoot(readLegacyRoot){
    let root;
    try {
        root = Reflect.apply(readLegacyRoot, undefined, []);
    }
    catch {
        fail('LEGACY_RESOURCE_COMMIT_ROOT_READ_FAILURE', 'Legacy resource commit root provider threw while reading current state.');
    }
    if (isPromiseLike(root, 'evolveResourceCommitAdapter.readLegacyRoot.result')){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_ROOT_PROVIDER', 'Legacy resource commit root provider must be synchronous.');
    }
    return assertPlainRecord(root, 'legacyResourceCommitRoot');
}

function finiteAmount(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path} must be a non-negative finite number.`, {
            path,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function capacityValue(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value) || (value < 0 && value !== -1)){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', `${path} must be -1 or a non-negative finite number.`, {
            path,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function resolveResource(root, index, resourceId){
    const mapping = index.get(resourceId);
    if (!mapping){
        fail('UNSUPPORTED_LEGACY_RESOURCE_COMMIT_SUBJECT', 'Legacy resource commit compatibility does not support this resource.', {
            resourceId,
        });
    }
    const recordValue = readLegacyPath(root, mapping.legacyPath);
    if (recordValue === MISSING){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', 'Mapped legacy resource record is missing.', {
            resourceId,
            statePath: mapping.legacyPath,
        });
    }
    const record = assertPlainRecord(recordValue, `legacy resource ${resourceId}`);
    const amountDescriptor = readDataDescriptor(record, 'amount', `legacy resource ${resourceId}`);
    const maxDescriptor = readDataDescriptor(record, 'max', `legacy resource ${resourceId}`);
    if (amountDescriptor === MISSING || maxDescriptor === MISSING){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', 'Mapped legacy resource requires amount and max data fields.', {
            resourceId,
            statePath: mapping.legacyPath,
        });
    }
    if (amountDescriptor.writable !== true){
        fail('INVALID_LEGACY_RESOURCE_COMMIT_STATE', 'Mapped legacy resource amount must be writable before commit.', {
            resourceId,
            statePath: `${mapping.legacyPath}.amount`,
        });
    }
    return {
        record,
        resourceId,
        original: finiteAmount(amountDescriptor.value, `${mapping.legacyPath}.amount`),
        projected: finiteAmount(amountDescriptor.value, `${mapping.legacyPath}.amount`),
        capacity: capacityValue(maxDescriptor.value, `${mapping.legacyPath}.max`),
    };
}

function rejection(code, details){
    return Object.freeze({
        status: 'rejected',
        reason: Object.freeze({
            code,
            details: Object.freeze(details),
        }),
    });
}

function committed(){
    return Object.freeze({ status: 'committed', reason: null });
}

function clampToCapacity(resource, amount){
    return resource.capacity === -1
        ? amount
        : Math.min(resource.capacity, amount);
}

function preflight(root, index, changes){
    const resolved = new Map();
    const order = [];
    for (const change of changes){
        let resource = resolved.get(change.resourceId);
        if (!resource){
            resource = resolveResource(root, index, change.resourceId);
            resolved.set(change.resourceId, resource);
            order.push(resource);
        }
        if (change.kind === 'resource.debit'){
            if (resource.projected < change.amount){
                return {
                    result: rejection('insufficient_resource', {
                        resourceId: change.resourceId,
                        required: change.amount,
                        available: resource.projected,
                    }),
                    order,
                };
            }
            resource.projected = clampToCapacity(resource, resource.projected - change.amount);
        }
        else {
            if (resource.capacity !== -1 && resource.projected >= resource.capacity){
                return {
                    result: rejection('resource_at_capacity', {
                        resourceId: change.resourceId,
                        amount: resource.projected,
                        capacity: resource.capacity,
                    }),
                    order,
                };
            }
            const next = resource.projected + change.amount;
            if (!Number.isFinite(next)){
                fail('LEGACY_RESOURCE_COMMIT_NUMERIC_OVERFLOW', 'Resource commit arithmetic overflowed.', {
                    resourceId: change.resourceId,
                });
            }
            resource.projected = clampToCapacity(resource, next);
        }
    }
    return { result: null, order };
}

function rollback(attempted){
    let rollbackFailed = false;
    for (let index = attempted.length - 1; index >= 0; index--){
        const resource = attempted[index];
        try {
            if (!Reflect.set(resource.record, 'amount', resource.original)) rollbackFailed = true;
        }
        catch {
            rollbackFailed = true;
        }
    }
    if (rollbackFailed){
        fail('LEGACY_RESOURCE_COMMIT_ROLLBACK_FAILURE', 'Resource commit failed and rollback could not restore all resource amounts.');
    }
}

function applyProjected(order){
    const attempted = [];
    try {
        for (const resource of order){
            if (Object.is(resource.original, resource.projected)) continue;
            attempted.push(resource);
            if (!Reflect.set(resource.record, 'amount', resource.projected)){
                throw new Error('resource amount write rejected');
            }
        }
    }
    catch {
        rollback(attempted);
        fail('LEGACY_RESOURCE_COMMIT_WRITE_FAILURE', 'Resource commit could not apply all resource amount changes atomically.');
    }
}

export function createEvolveLegacyResourceCommitCapability(rawOptions){
    const readLegacyRoot = assertSynchronousFunction(
        readOptions(rawOptions),
        'evolveResourceCommitAdapterOptions.readLegacyRoot'
    );
    const index = mappingIndex();

    function commitResourceChanges(rawChanges){
        const input = inspectDenseInertArray(rawChanges, {
            path: 'legacyResourceCommit.changes',
            code: 'INVALID_LEGACY_RESOURCE_COMMIT_CHANGESET',
            maxLength: MAX_RESOURCE_CHANGES,
        });
        const changes = input.map(normalizeChange);
        const root = currentRoot(readLegacyRoot);
        const prepared = preflight(root, index, changes);
        if (prepared.result) return prepared.result;
        applyProjected(prepared.order);
        return committed();
    }

    return Object.freeze({ commitResourceChanges });
}
