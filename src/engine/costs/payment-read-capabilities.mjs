import { EngineContractError, parseContentId } from '../identity.mjs';
import { inspectPlainInertObject } from '../contracts/inert-data.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isEngineContractError(value){
    try {
        return value instanceof EngineContractError;
    }
    catch {
        return false;
    }
}

function readOwnDataField(value, field){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(value, field);
    }
    catch {
        return undefined;
    }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
}

function readClosedObject(value, path, allowed, required = allowed){
    const fields = inspectPlainInertObject(value, {
        path,
        code: 'INVALID_PAYMENT_READ_CAPABILITIES',
        maxFields: allowed.length,
    });
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} contains unsupported field ${JSON.stringify(key)}.`, {
                path: `${path}.${key}`,
                field: key,
            });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} is missing required field ${JSON.stringify(key)}.`, {
                path: `${path}.${key}`,
                field: key,
            });
        }
    }
    return fields;
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} must be a function.`, { path, valueType: typeof value });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} could not be inspected.`, { path });
    }
    const declaredAsync = /^\s*async\b/.test(source);
    const declaredGenerator = /^\s*(?:async\s+)?function\s*\*/.test(source) || /^\s*\*/.test(source);
    const declaredClass = /^\s*class\b/.test(source);
    if (declaredAsync || declaredGenerator || declaredClass){
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value with an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertResourceId(resourceId, path){
    let parsed;
    try {
        parsed = parseContentId(resourceId);
    }
    catch {
        fail('INVALID_PAYMENT_READ_SUBJECT_ID', `${path} must be a canonical resource content ID.`, {
            path,
            expectedType: 'resource',
            valueType: typeof resourceId,
        });
    }
    if (parsed.type !== 'resource'){
        fail('INVALID_PAYMENT_READ_SUBJECT_ID', `${path} must identify content type resource.`, {
            path,
            expectedType: 'resource',
            actualType: parsed.type,
        });
    }
    return parsed.canonical;
}

function invoke(read, operation, resourceId){
    const canonicalId = assertResourceId(resourceId, `paymentReadCapabilities.resource.${operation}.resourceId`);
    let value;
    try {
        value = Reflect.apply(read, undefined, [canonicalId]);
    }
    catch (error){
        const causeCodeValue = isEngineContractError(error)
            ? readOwnDataField(error, 'code')
            : undefined;
        const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0
            ? causeCodeValue
            : null;
        fail('PAYMENT_READ_FAILURE', `Payment resource.${operation} read failed.`, {
            readFamily: 'resource',
            readOperation: operation,
            resourceId: canonicalId,
            readerCauseCode: causeCode,
        });
    }
    if (isPromiseLike(value, `paymentReadCapabilities.resource.${operation}.result`)){
        fail('INVALID_PAYMENT_READ_RESULT', `Payment resource.${operation} read must be synchronous.`, {
            readFamily: 'resource',
            readOperation: operation,
            resourceId: canonicalId,
        });
    }
    return { canonicalId, value };
}

function readAmount(read, resourceId){
    const { canonicalId, value } = invoke(read, 'amount', resourceId);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_PAYMENT_READ_RESULT', 'Payment resource.amount read must return a finite number.', {
            readFamily: 'resource',
            readOperation: 'amount',
            resourceId: canonicalId,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function readAvailable(read, resourceId){
    const { canonicalId, value } = invoke(read, 'available', resourceId);
    if (typeof value !== 'boolean'){
        fail('INVALID_PAYMENT_READ_RESULT', 'Payment resource.available read must return a boolean.', {
            readFamily: 'resource',
            readOperation: 'available',
            resourceId: canonicalId,
            valueType: typeof value,
        });
    }
    return value;
}

function readCapacity(read, resourceId){
    const { canonicalId, value } = invoke(read, 'capacity', resourceId);
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0){
        fail('INVALID_PAYMENT_READ_RESULT', 'Payment resource.capacity read must return null or a non-negative finite number.', {
            readFamily: 'resource',
            readOperation: 'capacity',
            resourceId: canonicalId,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

export function createPaymentReadCapabilities(rawCapabilities){
    const root = readClosedObject(rawCapabilities, 'paymentReadCapabilities', ['resource']);
    const resourceFields = readClosedObject(
        root.get('resource'),
        'paymentReadCapabilities.resource',
        ['amount', 'available', 'capacity']
    );
    const amount = assertSynchronousFunction(resourceFields.get('amount'), 'paymentReadCapabilities.resource.amount');
    const available = assertSynchronousFunction(resourceFields.get('available'), 'paymentReadCapabilities.resource.available');
    const capacity = assertSynchronousFunction(resourceFields.get('capacity'), 'paymentReadCapabilities.resource.capacity');

    return Object.freeze({
        resource: Object.freeze({
            amount: resourceId => readAmount(amount, resourceId),
            available: resourceId => readAvailable(available, resourceId),
            capacity: resourceId => readCapacity(capacity, resourceId),
        }),
    });
}
