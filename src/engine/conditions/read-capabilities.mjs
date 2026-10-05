import { EngineContractError } from '../identity.mjs';
import {
    assertSynchronousConditionFunction,
    isConditionPromiseLike,
    readClosedConditionObject,
} from './common.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
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

function invokeRead(read, family, operation, subjectId){
    let value;
    try {
        value = Reflect.apply(read, undefined, [subjectId]);
    }
    catch {
        fail(
            'CONDITION_READ_FAILURE',
            `Condition ${family}.${operation} read failed.`,
            { readFamily: family, readOperation: operation, subjectId }
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
            { readFamily: family, readOperation: operation, subjectId }
        );
    }
    return value;
}

function readBoolean(read, family, operation, subjectId){
    const value = invokeRead(read, family, operation, subjectId);
    if (typeof value !== 'boolean'){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must return a boolean.`,
            { readFamily: family, readOperation: operation, subjectId, valueType: typeof value }
        );
    }
    return value;
}

function readFiniteNumber(read, family, operation, subjectId){
    const value = invokeRead(read, family, operation, subjectId);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail(
            'INVALID_CONDITION_READ_RESULT',
            `Condition ${family}.${operation} read must return a finite number.`,
            { readFamily: family, readOperation: operation, subjectId, valueType: typeof value }
        );
    }
    return Object.is(value, -0) ? 0 : value;
}

function readCount(read, family, operation, subjectId){
    const value = invokeRead(read, family, operation, subjectId);
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
    const value = invokeRead(read, 'resource', 'capacity', subjectId);
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
        has: technologyId => readBoolean(technologyHas, 'technology', 'has', technologyId),
    });
    const resource = Object.freeze({
        amount: resourceId => readFiniteNumber(resourceAmount, 'resource', 'amount', resourceId),
        available: resourceId => readBoolean(resourceAvailable, 'resource', 'available', resourceId),
        capacity: resourceId => readCapacity(resourceCapacity, resourceId),
    });
    const structure = Object.freeze({
        count: structureId => readCount(structureCount, 'structure', 'count', structureId),
        activeCount: structureId => readCount(structureActiveCount, 'structure', 'activeCount', structureId),
    });
    const trait = Object.freeze({
        has: traitId => readBoolean(traitHas, 'trait', 'has', traitId),
    });

    return Object.freeze({ technology, resource, structure, trait });
}
