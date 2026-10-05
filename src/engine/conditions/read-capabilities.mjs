import { EngineContractError, parseContentId } from '../identity.mjs';
import {
    assertSynchronousConditionFunction,
    isConditionPromiseLike,
    readClosedConditionObject,
} from './common.mjs';

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

function readContractErrorCode(error){
    if (!isEngineContractError(error)) return null;
    const code = readOwnDataField(error, 'code');
    return typeof code === 'string' && code.length > 0 ? code : null;
}

function readGroup(rootFields, groupName, allowed){
    return readClosedConditionObject(rootFields.get(groupName), {
        path: `conditionReadCapabilities.${groupName}`,
        allowed,
        code: 'INVALID_CONDITION_READ_CAPABILITIES',
    });
}

function captureRead(groupFields, groupName, operation){
    return assertSynchronousConditionFunction(
        groupFields.get(operation),
        `conditionReadCapabilities.${groupName}.${operation}`,
        'INVALID_CONDITION_READ_CAPABILITIES'
    );
}

function assertReadSubjectId(subjectId, expectedType, family, operation){
    let parsed;
    try {
        parsed = parseContentId(subjectId);
    }
    catch (error){
        if (!isEngineContractError(error)) throw error;
        fail(
            'INVALID_CONDITION_READ_SUBJECT_ID',
            `Condition ${family}.${operation} subject must be a canonical ${expectedType} content ID.`,
            { readFamily: family, readOperation: operation, expectedType, subjectId }
        );
    }
    if (parsed.type !== expectedType){
        fail(
            'INVALID_CONDITION_READ_SUBJECT_ID',
            `Condition ${family}.${operation} subject must identify content type ${expectedType}.`,
            {
                readFamily: family,
                readOperation: operation,
                expectedType,
                actualType: parsed.type,
                subjectId,
            }
        );
    }
    return parsed.canonical;
}

function invokeRead(read, family, operation, subjectId, expectedType){
    const canonicalSubjectId = assertReadSubjectId(subjectId, expectedType, family, operation);
    let value;
    try {
        value = Reflect.apply(read, undefined, [canonicalSubjectId]);
    }
    catch (error){
        fail(
            'CONDITION_READ_FAILURE',
            `Condition ${family}.${operation} read failed.`,
            {
                readFamily: family,
                readOperation: operation,
                subjectId: canonicalSubjectId,
                readerCauseCode: readContractErrorCode(error),
            }
        );
    }

    if (isConditionPromiseLike(
        value,
        `conditionReadCapabilities.${family}.${operation}.result`,
        'INVALID_CONDITION_READ_RESULT'
    )){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must be synchronous.`,
            { readFamily: family, readOperation: operation, subjectId: canonicalSubjectId }
        );
    }
    return value;
}

function readBoolean(read, family, operation, subjectId, expectedType){
    const value = invokeRead(read, family, operation, subjectId, expectedType);
    if (typeof value !== 'boolean'){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must return a boolean.`,
            { readFamily: family, readOperation: operation, subjectId, valueType: typeof value }
        );
    }
    return value;
}

function readFiniteNumber(read, family, operation, subjectId, expectedType){
    const value = invokeRead(read, family, operation, subjectId, expectedType);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must return a finite number.`,
            { readFamily: family, readOperation: operation, subjectId, valueType: typeof value }
        );
    }
    return Object.is(value, -0) ? 0 : value;
}

function readCount(read, family, operation, subjectId, expectedType){
    const value = invokeRead(read, family, operation, subjectId, expectedType);
    if (!Number.isSafeInteger(value) || value < 0){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must return a non-negative safe integer.`,
            { readFamily: family, readOperation: operation, subjectId, value }
        );
    }
    return value;
}

function readCapacity(read, subjectId){
    const value = invokeRead(read, 'resource', 'capacity', subjectId, 'resource');
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            'Condition resource.capacity read must return null or a non-negative finite number.',
            { readFamily: 'resource', readOperation: 'capacity', subjectId, valueType: typeof value }
        );
    }
    return Object.is(value, -0) ? 0 : value;
}

export function createConditionReadCapabilities(rawCapabilities){
    const rootFields = readClosedConditionObject(rawCapabilities, {
        path: 'conditionReadCapabilities',
        allowed: ['technology', 'resource', 'structure', 'trait'],
        code: 'INVALID_CONDITION_READ_CAPABILITIES',
    });

    const technologyFields = readGroup(rootFields, 'technology', ['has']);
    const resourceFields = readGroup(rootFields, 'resource', ['amount', 'available', 'capacity']);
    const structureFields = readGroup(rootFields, 'structure', ['count', 'activeCount']);
    const traitFields = readGroup(rootFields, 'trait', ['has']);

    const technologyHas = captureRead(technologyFields, 'technology', 'has');
    const resourceAmount = captureRead(resourceFields, 'resource', 'amount');
    const resourceAvailable = captureRead(resourceFields, 'resource', 'available');
    const resourceCapacity = captureRead(resourceFields, 'resource', 'capacity');
    const structureCount = captureRead(structureFields, 'structure', 'count');
    const structureActiveCount = captureRead(structureFields, 'structure', 'activeCount');
    const traitHas = captureRead(traitFields, 'trait', 'has');

    const technology = Object.freeze({
        has: technologyId => readBoolean(technologyHas, 'technology', 'has', technologyId, 'technology'),
    });
    const resource = Object.freeze({
        amount: resourceId => readFiniteNumber(resourceAmount, 'resource', 'amount', resourceId, 'resource'),
        available: resourceId => readBoolean(resourceAvailable, 'resource', 'available', resourceId, 'resource'),
        capacity: resourceId => readCapacity(resourceCapacity, resourceId),
    });
    const structure = Object.freeze({
        count: structureId => readCount(structureCount, 'structure', 'count', structureId, 'structure'),
        activeCount: structureId => readCount(structureActiveCount, 'structure', 'activeCount', structureId, 'structure'),
    });
    const trait = Object.freeze({
        has: traitId => readBoolean(traitHas, 'trait', 'has', traitId, 'trait'),
    });

    return Object.freeze({ technology, resource, structure, trait });
}
