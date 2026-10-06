import { EngineContractError } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';
import { assertQueuedWorkItem } from './work-item-contract.mjs';
import { getWorkQueueSlotUsage } from './work-queue.mjs';

const READINESS_STATUSES = Object.freeze(['ready', 'waiting', 'bypass']);
const SELECTION_POLICIES = Object.freeze(['ordered', 'first-ready']);
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const MAX_READINESS_DETAIL_DEPTH = 128;

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

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_WORK_READINESS_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(cursor, 'then'); }
        catch {
            fail('INVALID_WORK_READINESS_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_WORK_READINESS_RESULT', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try { cursor = Object.getPrototypeOf(cursor); }
        catch {
            fail('INVALID_WORK_READINESS_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function readClosedObject(value, { path, allowed, required = allowed, code }){
    const fields = inspectPlainInertObject(value, {
        path,
        code,
        maxFields: allowed.length,
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

function canonicalizeDetailValue(value, path, depth, seen){
    if (depth > MAX_READINESS_DETAIL_DEPTH){
        fail('INVALID_WORK_READINESS_RESULT', `${path} exceeds the readiness detail nesting limit.`, {
            path,
            maxDepth: MAX_READINESS_DETAIL_DEPTH,
        });
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_WORK_READINESS_RESULT', `${path} must be a finite number.`, { path, value });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object'){
        fail('INVALID_WORK_READINESS_RESULT', `${path} must contain inert data only.`, {
            path,
            valueType: typeof value,
        });
    }
    if (seen.has(value)){
        fail('INVALID_WORK_READINESS_RESULT', `${path} must not contain cycles or repeated object identity.`, { path });
    }
    seen.add(value);

    let array;
    try { array = Array.isArray(value); }
    catch {
        fail('INVALID_WORK_READINESS_RESULT', `${path} could not be safely inspected.`, { path });
    }
    if (array){
        const values = inspectDenseInertArray(value, {
            path,
            code: 'INVALID_WORK_READINESS_RESULT',
        });
        return Object.freeze(values.map((entry, index) =>
            canonicalizeDetailValue(entry, `${path}[${index}]`, depth + 1, seen)
        ));
    }

    const fields = inspectPlainInertObject(value, {
        path,
        code: 'INVALID_WORK_READINESS_RESULT',
    });
    const output = {};
    for (const key of [...fields.keys()].sort()){
        const child = canonicalizeDetailValue(
            fields.get(key),
            inertDataPath(path, key),
            depth + 1,
            seen
        );
        Object.defineProperty(output, key, {
            value: child,
            enumerable: true,
            writable: false,
            configurable: false,
        });
    }
    return Object.freeze(output);
}

function diagnosticValue(value){
    const valueType = value === null ? 'null' : typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        return { valueType, value };
    }
    return { valueType };
}

function normalizeReason(rawReason, index, seen){
    const path = `readiness.reasons[${index}]`;
    const fields = readClosedObject(rawReason, {
        path,
        allowed: ['code', 'details'],
        code: 'INVALID_WORK_READINESS_RESULT',
    });
    if (seen.has(rawReason)){
        fail('INVALID_WORK_READINESS_RESULT', `${path} must not repeat object identity within one readiness result.`, { path });
    }
    seen.add(rawReason);
    const code = fields.get('code');
    if (typeof code !== 'string' || !REASON_CODE_PATTERN.test(code)){
        fail('INVALID_WORK_READINESS_RESULT', `${path}.code must be a stable lowercase reason code.`, {
            path: `${path}.code`,
            ...diagnosticValue(code),
        });
    }
    const rawDetails = fields.get('details');
    let details = null;
    if (rawDetails !== null){
        if (rawDetails === undefined || typeof rawDetails !== 'object'){
            fail('INVALID_WORK_READINESS_RESULT', `${path}.details must be null or a plain inert data object.`, {
                path: `${path}.details`,
                valueType: typeof rawDetails,
            });
        }
        details = canonicalizeDetailValue(rawDetails, `${path}.details`, 0, seen);
        if (Array.isArray(details)){
            fail('INVALID_WORK_READINESS_RESULT', `${path}.details must be null or a plain inert data object.`, {
                path: `${path}.details`,
            });
        }
    }
    return Object.freeze({ code, details });
}

function normalizeReadinessResult(rawResult){
    if (isPromiseLike(rawResult, 'readiness')){
        fail('INVALID_WORK_READINESS_RESULT', 'Readiness evaluation must be synchronous.', { path: 'readiness' });
    }
    const fields = readClosedObject(rawResult, {
        path: 'readiness',
        allowed: ['status', 'reasons'],
        code: 'INVALID_WORK_READINESS_RESULT',
    });
    const status = fields.get('status');
    if (!READINESS_STATUSES.includes(status)){
        fail('INVALID_WORK_READINESS_RESULT', `readiness.status must be one of: ${READINESS_STATUSES.join(', ')}.`, {
            path: 'readiness.status',
            ...diagnosticValue(status),
        });
    }
    const rawReasons = inspectDenseInertArray(fields.get('reasons'), {
        path: 'readiness.reasons',
        code: 'INVALID_WORK_READINESS_RESULT',
    });
    const seen = new WeakSet();
    const reasons = Object.freeze(rawReasons.map((reason, index) => normalizeReason(reason, index, seen)));
    if (status === 'ready' && reasons.length !== 0){
        fail('INVALID_WORK_READINESS_RESULT', 'Ready readiness results may not contain reasons.', {
            path: 'readiness.reasons',
            status,
        });
    }
    if (status !== 'ready' && reasons.length === 0){
        fail('INVALID_WORK_READINESS_RESULT', `${status} readiness results require at least one reason.`, {
            path: 'readiness.reasons',
            status,
        });
    }
    return Object.freeze({ status, reasons });
}

function assertSelectionPolicy(value){
    if (!SELECTION_POLICIES.includes(value)){
        fail('INVALID_WORK_SELECTION_POLICY', `policy must be one of: ${SELECTION_POLICIES.join(', ')}.`, {
            path: 'policy',
            ...diagnosticValue(value),
        });
    }
    return value;
}

function selectionResult(status, policy, selectedIndex, evaluations){
    return Object.freeze({
        status,
        policy,
        selectedIndex,
        evaluations: Object.freeze(evaluations.slice()),
    });
}

export function createWorkQueueSelector(evaluateReadiness){
    if (typeof evaluateReadiness !== 'function'){
        fail('INVALID_WORK_READINESS_EVALUATOR', 'evaluateReadiness must be a function.', {
            path: 'evaluateReadiness',
            valueType: typeof evaluateReadiness,
        });
    }

    let operationActive = false;

    function evaluateOne(item, path){
        assertQueuedWorkItem(item, path);
        let rawResult;
        try {
            rawResult = Reflect.apply(evaluateReadiness, undefined, [item]);
        }
        catch (error){
            const contractFailure = isEngineContractError(error);
            const causeCodeValue = contractFailure ? readOwnDataField(error, 'code') : undefined;
            const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0 ? causeCodeValue : null;
            if (contractFailure && causeCode === 'WORK_SELECTION_REENTRANCY') throw error;
            fail('WORK_READINESS_EVALUATION_FAILURE', 'Work readiness evaluation failed.', {
                commandId: item.command.id,
                evaluatorCauseCode: causeCode,
            });
        }
        return normalizeReadinessResult(rawResult);
    }

    function run(operation){
        if (operationActive){
            fail('WORK_SELECTION_REENTRANCY', 'Work readiness evaluation and selection may not be nested.');
        }
        operationActive = true;
        try { return operation(); }
        finally { operationActive = false; }
    }

    const selector = {
        evaluate(item){
            return run(() => evaluateOne(item, 'item'));
        },
        select(queue, rawPolicy){
            return run(() => {
                getWorkQueueSlotUsage(queue);
                const policy = assertSelectionPolicy(rawPolicy);
                const evaluations = [];
                for (let index = 0; index < queue.length; index++){
                    const readiness = evaluateOne(queue[index], `queue[${index}]`);
                    evaluations.push(Object.freeze({ index, readiness }));
                    if (readiness.status === 'ready'){
                        return selectionResult('selected', policy, index, evaluations);
                    }
                    if (policy === 'ordered' && readiness.status === 'waiting'){
                        return selectionResult('none', policy, null, evaluations);
                    }
                }
                return selectionResult('none', policy, null, evaluations);
            });
        },
    };

    return Object.freeze(selector);
}
