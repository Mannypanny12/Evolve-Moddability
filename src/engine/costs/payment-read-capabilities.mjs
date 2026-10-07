import { EngineContractError, parseContentId } from '../identity.mjs';
import { inspectPlainInertObject } from '../contracts/inert-data.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isEngineContractError(value){
    try { return value instanceof EngineContractError; }
    catch { return false; }
}

function readOwnDataField(value, field){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, field); }
    catch { return undefined; }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
}

function assertPlainRecordContainer(value, path){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} must be a plain data object.`, {
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
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} could not be safely inspected.`, { path });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} must be a plain data object.`, {
            path,
            containerType: isArray ? 'array' : 'object',
        });
    }
}

function readClosedObject(value, path, allowed, required = allowed){
    assertPlainRecordContainer(value, path);
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

function assertReadFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_PAYMENT_READ_CAPABILITIES', `${path} must be a function.`, { path, valueType: typeof value });
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
        try { descriptor = Object.getOwnPropertyDescriptor(cursor, 'then'); }
        catch {
            fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value with an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try { cursor = Object.getPrototypeOf(cursor); }
        catch {
            fail('INVALID_PAYMENT_READ_RESULT', `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertTypedId(value, path, expectedType){
    let parsed;
    try { parsed = parseContentId(value); }
    catch {
        fail('INVALID_PAYMENT_READ_SUBJECT_ID', `${path} must be a canonical ${expectedType} content ID.`, {
            path,
            expectedType,
            valueType: typeof value,
        });
    }
    if (parsed.type !== expectedType){
        fail('INVALID_PAYMENT_READ_SUBJECT_ID', `${path} must identify content type ${expectedType}.`, {
            path,
            expectedType,
            actualType: parsed.type,
        });
    }
    return parsed.canonical;
}

function subjectDetail(subjectType, canonicalId){
    if (subjectType === 'resource') return { resourceId: canonicalId };
    if (subjectType === 'prestige') return { prestigeId: canonicalId };
    return { poolId: canonicalId };
}

function invoke(read, family, operation, subjectId, subjectType){
    const canonicalId = assertTypedId(subjectId, `paymentReadCapabilities.${family}.${operation}.${subjectType}Id`, subjectType);
    let value;
    try { value = Reflect.apply(read, undefined, [canonicalId]); }
    catch (error){
        const causeCodeValue = isEngineContractError(error) ? readOwnDataField(error, 'code') : undefined;
        const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0 ? causeCodeValue : null;
        fail('PAYMENT_READ_FAILURE', `Payment ${family}.${operation} read failed.`, {
            readFamily: family,
            readOperation: operation,
            ...subjectDetail(subjectType, canonicalId),
            readerCauseCode: causeCode,
        });
    }
    if (isPromiseLike(value, `paymentReadCapabilities.${family}.${operation}.result`)){
        fail('INVALID_PAYMENT_READ_RESULT', `Payment ${family}.${operation} read must be synchronous.`, {
            readFamily: family,
            readOperation: operation,
            ...subjectDetail(subjectType, canonicalId),
        });
    }
    return { canonicalId, value };
}

function readFiniteAmount(read, family, subjectId, subjectType){
    const { canonicalId, value } = invoke(read, family, 'amount', subjectId, subjectType);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_PAYMENT_READ_RESULT', `Payment ${family}.amount read must return a finite number.`, {
            readFamily: family,
            readOperation: 'amount',
            ...subjectDetail(subjectType, canonicalId),
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function readAvailable(read, resourceId){
    const { canonicalId, value } = invoke(read, 'resource', 'available', resourceId, 'resource');
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

function readResourceCapacity(read, resourceId){
    const { canonicalId, value } = invoke(read, 'resource', 'capacity', resourceId, 'resource');
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

function readPoolPresent(read, poolId){
    const { canonicalId, value } = invoke(read, 'pool', 'present', poolId, 'payment-pool');
    if (typeof value !== 'boolean'){
        fail('INVALID_PAYMENT_READ_RESULT', 'Payment pool.present read must return a boolean.', {
            readFamily: 'pool',
            readOperation: 'present',
            poolId: canonicalId,
            valueType: typeof value,
        });
    }
    return value;
}

function readPoolCapacity(read, poolId){
    const { canonicalId, value } = invoke(read, 'pool', 'capacity', poolId, 'payment-pool');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0){
        fail('INVALID_PAYMENT_READ_RESULT', 'Payment pool.capacity read must return a non-negative finite number.', {
            readFamily: 'pool',
            readOperation: 'capacity',
            poolId: canonicalId,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

export function createPaymentReadCapabilities(rawCapabilities){
    const root = readClosedObject(rawCapabilities, 'paymentReadCapabilities', ['resource', 'prestige', 'pool'], ['resource']);
    const resourceFields = readClosedObject(
        root.get('resource'),
        'paymentReadCapabilities.resource',
        ['amount', 'available', 'capacity']
    );
    const resourceAmount = assertReadFunction(resourceFields.get('amount'), 'paymentReadCapabilities.resource.amount');
    const resourceAvailable = assertReadFunction(resourceFields.get('available'), 'paymentReadCapabilities.resource.available');
    const resourceCapacity = assertReadFunction(resourceFields.get('capacity'), 'paymentReadCapabilities.resource.capacity');

    const output = {
        resource: Object.freeze({
            amount: resourceId => readFiniteAmount(resourceAmount, 'resource', resourceId, 'resource'),
            available: resourceId => readAvailable(resourceAvailable, resourceId),
            capacity: resourceId => readResourceCapacity(resourceCapacity, resourceId),
        }),
    };

    if (root.has('prestige')){
        const prestigeFields = readClosedObject(
            root.get('prestige'),
            'paymentReadCapabilities.prestige',
            ['amount']
        );
        const prestigeAmount = assertReadFunction(prestigeFields.get('amount'), 'paymentReadCapabilities.prestige.amount');
        output.prestige = Object.freeze({
            amount: prestigeId => readFiniteAmount(prestigeAmount, 'prestige', prestigeId, 'prestige'),
        });
    }

    if (root.has('pool')){
        const poolFields = readClosedObject(
            root.get('pool'),
            'paymentReadCapabilities.pool',
            ['present', 'amount', 'capacity']
        );
        const poolPresent = assertReadFunction(poolFields.get('present'), 'paymentReadCapabilities.pool.present');
        const poolAmount = assertReadFunction(poolFields.get('amount'), 'paymentReadCapabilities.pool.amount');
        const poolCapacity = assertReadFunction(poolFields.get('capacity'), 'paymentReadCapabilities.pool.capacity');
        output.pool = Object.freeze({
            present: poolId => readPoolPresent(poolPresent, poolId),
            amount: poolId => readFiniteAmount(poolAmount, 'pool', poolId, 'payment-pool'),
            capacity: poolId => readPoolCapacity(poolCapacity, poolId),
        });
    }

    return Object.freeze(output);
}
