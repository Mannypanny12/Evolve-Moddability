import { EngineContractError, describeContractValue, parseContentId } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_CALCULATION_DATA_NESTING_DEPTH = 128;
export const MAX_CALCULATION_COLLECTION_LENGTH = 4096;
export const MAX_CALCULATION_OBJECT_FIELDS = 4096;
export const MAX_CALCULATION_THENABLE_PROTOTYPE_DEPTH = 128;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalizeInternal(value, path, context, depth){
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_CALCULATION_DATA', `${path} must be a finite number, got ${describeContractValue(value)}.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object'){
        fail('INVALID_CALCULATION_DATA', `${path} contains unsupported calculation-data type ${typeof value}.`, {
            path,
            valueType: typeof value,
        });
    }
    if (depth > MAX_CALCULATION_DATA_NESTING_DEPTH){
        fail('INVALID_CALCULATION_DATA', `${path} exceeds the calculation-data nesting limit.`, {
            path,
            maxDepth: MAX_CALCULATION_DATA_NESTING_DEPTH,
        });
    }
    if (context.active.has(value)){
        fail('INVALID_CALCULATION_DATA', `${path} contains a cyclic reference.`, {
            path,
            firstPath: context.seen.get(value),
        });
    }
    if (context.seen.has(value)){
        fail('INVALID_CALCULATION_DATA', `${path} reuses a data object already present elsewhere.`, {
            path,
            firstPath: context.seen.get(value),
        });
    }

    context.seen.set(value, path);
    context.active.add(value);
    try {
        let array;
        try { array = Array.isArray(value); }
        catch {
            fail('INVALID_CALCULATION_DATA', `${path} could not be safely inspected.`, { path });
        }

        if (array){
            const values = inspectDenseInertArray(value, {
                path,
                code: 'INVALID_CALCULATION_DATA',
                maxLength: MAX_CALCULATION_COLLECTION_LENGTH,
            });
            return Object.freeze(values.map((entry, index) =>
                canonicalizeInternal(entry, `${path}[${index}]`, context, depth + 1)
            ));
        }

        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_CALCULATION_DATA',
            maxFields: MAX_CALCULATION_OBJECT_FIELDS,
        });
        const output = {};
        for (const key of [...fields.keys()].sort()){
            Object.defineProperty(output, key, {
                value: canonicalizeInternal(fields.get(key), inertDataPath(path, key), context, depth + 1),
                enumerable: true,
                writable: false,
                configurable: false,
            });
        }
        return Object.freeze(output);
    }
    finally {
        context.active.delete(value);
    }
}

export function canonicalizeCalculationData(value, path = 'calculationData'){
    return canonicalizeInternal(value, path, { active: new WeakSet(), seen: new WeakMap() }, 0);
}

export function canonicalizeCalculationInputs(value, path = 'calculation.inputs'){
    const output = canonicalizeCalculationData(value, path);
    if (output === null || typeof output !== 'object' || Array.isArray(output)){
        fail('INVALID_CALCULATION_INPUTS', `${path} must be a plain data object.`, { path });
    }
    return output;
}

export function readClosedCalculationObject(value, options){
    const { path, allowed, required = allowed, code = 'INVALID_CALCULATION_CONTRACT' } = options;
    const fields = inspectPlainInertObject(value, {
        path,
        code,
        maxFields: MAX_CALCULATION_OBJECT_FIELDS,
    });
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail(code, `${path} contains unsupported field ${JSON.stringify(key)}.`, {
                path: inertDataPath(path, key),
                field: key,
            });
        }
    }
    for (const key of required){
        if (!fields.has(key)){
            fail(code, `${path} is missing required field ${JSON.stringify(key)}.`, {
                path: inertDataPath(path, key),
                field: key,
            });
        }
    }
    return fields;
}

export function readDenseCalculationArray(value, path, code = 'INVALID_CALCULATION_CONTRACT'){
    return inspectDenseInertArray(value, {
        path,
        code,
        maxLength: MAX_CALCULATION_COLLECTION_LENGTH,
    });
}

export function assertCalculationId(value, path = 'calculation.id'){
    let parsed;
    try { parsed = parseContentId(value); }
    catch (error){
        if (error instanceof EngineContractError){
            fail('INVALID_CALCULATION_ID', `${path} must be a canonical calculation content ID.`, { path, value });
        }
        throw error;
    }
    if (parsed.type !== 'calculation'){
        fail('INVALID_CALCULATION_ID', `${path} must use content type "calculation".`, {
            path,
            id: parsed.canonical,
            contentType: parsed.type,
        });
    }
    return parsed.canonical;
}

export function assertSynchronousCalculationFunction(value, path, code = 'INVALID_CALCULATION_REGISTRATION'){
    if (typeof value !== 'function'){
        fail(code, `${path} must be a function.`, { path, valueType: typeof value });
    }
    let source;
    try { source = Function.prototype.toString.call(value); }
    catch {
        fail(code, `${path} could not be inspected.`, { path });
    }
    const declaredAsync = /^\s*async\b/.test(source);
    const declaredGenerator = /^\s*(?:async\s+)?function\s*\*/.test(source) || /^\s*\*/.test(source);
    const declaredClass = /^\s*class\b/.test(source);
    if (declaredAsync || declaredGenerator || declaredClass){
        fail(code, `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

export function isCalculationPromiseLike(value, path, code){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;

    let cursor = value;
    let prototypeDepth = 0;
    const seen = new WeakSet();
    while (cursor !== null){
        if (prototypeDepth > MAX_CALCULATION_THENABLE_PROTOTYPE_DEPTH){
            fail(code, `${path} returned a value whose thenable prototype chain exceeds the inspection limit.`, {
                path,
                maxPrototypeDepth: MAX_CALCULATION_THENABLE_PROTOTYPE_DEPTH,
            });
        }
        prototypeDepth += 1;

        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);

        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(cursor, 'then'); }
        catch {
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail(code, `${path} returned a value with an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }

        try { cursor = Object.getPrototypeOf(cursor); }
        catch {
            fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}
