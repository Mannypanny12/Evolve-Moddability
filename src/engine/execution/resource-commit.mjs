import { EngineContractError, parseContentId } from '../identity.mjs';
import { inspectDenseInertArray, inspectPlainInertObject } from '../contracts/inert-data.mjs';

const MAX_RESOURCE_COMMIT_OPERATIONS = 256;
const PAYMENT_OPERATION_FIELDS = Object.freeze(['kind', 'resourceId', 'amount']);
const EFFECT_OPERATION_FIELDS = Object.freeze(['kind', 'resourceId', 'amount']);
const COMMIT_RESULT_FIELDS = Object.freeze(['status', 'reason']);
const COMMIT_REASON_FIELDS = Object.freeze(['code', 'details']);

let resourceCommitActive = false;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function requireFields(fields, required, path, code){
    if (fields.size !== required.length){
        fail(code, `${path} must contain exactly ${required.length} fields.`, {
            path,
            fieldCount: fields.size,
            requiredFields: required,
        });
    }
    for (const field of required){
        if (!fields.has(field)){
            fail(code, `${path}.${field} is required.`, { path: `${path}.${field}`, field });
        }
    }
    for (const field of fields.keys()){
        if (!required.includes(field)){
            fail(code, `${path}.${field} is not supported.`, { path: `${path}.${field}`, field });
        }
    }
}

function assertResourceId(value, path, code){
    if (typeof value !== 'string'){
        fail(code, `${path} must be a canonical resource content ID string.`, {
            path,
            expectedType: 'resource',
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail(code, `${path} must be a canonical resource content ID.`, {
            path,
            expectedType: 'resource',
            value,
        });
    }
    if (parsed.type !== 'resource'){
        fail(code, `${path} must identify content type resource.`, {
            path,
            expectedType: 'resource',
            actualType: parsed.type,
            value,
        });
    }
    return parsed.canonical;
}

function assertPositiveFiniteAmount(value, path, code){
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0){
        fail(code, `${path} must be a positive finite number.`, {
            path,
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function inspectPlan(rawPlan, path, code){
    const fields = inspectPlainInertObject(rawPlan, { path, code, maxFields: 1 });
    requireFields(fields, ['operations'], path, code);
    return inspectDenseInertArray(fields.get('operations'), {
        path: `${path}.operations`,
        code,
        maxLength: MAX_RESOURCE_COMMIT_OPERATIONS,
    });
}

function normalizePaymentOperation(rawOperation, index){
    const path = `resourceCommit.paymentPlan.operations[${index}]`;
    const fields = inspectPlainInertObject(rawOperation, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_PAYMENT_OPERATION',
        maxFields: PAYMENT_OPERATION_FIELDS.length,
    });
    if (!fields.has('kind') || typeof fields.get('kind') !== 'string'){
        fail('INVALID_RESOURCE_COMMIT_PAYMENT_OPERATION', `${path}.kind must be a string.`, {
            path: `${path}.kind`,
        });
    }
    const kind = fields.get('kind');
    if (kind !== 'payment.resource.debit'){
        fail('UNSUPPORTED_RESOURCE_COMMIT_PAYMENT_OPERATION', `${path}.kind is not supported by the resource commit boundary.`, {
            path: `${path}.kind`,
            kind,
        });
    }
    requireFields(fields, PAYMENT_OPERATION_FIELDS, path, 'INVALID_RESOURCE_COMMIT_PAYMENT_OPERATION');
    return Object.freeze({
        kind: 'resource.debit',
        resourceId: assertResourceId(
            fields.get('resourceId'),
            `${path}.resourceId`,
            'INVALID_RESOURCE_COMMIT_PAYMENT_OPERATION'
        ),
        amount: assertPositiveFiniteAmount(
            fields.get('amount'),
            `${path}.amount`,
            'INVALID_RESOURCE_COMMIT_PAYMENT_OPERATION'
        ),
    });
}

function normalizeEffectOperation(rawOperation, index){
    const path = `resourceCommit.effectPlan.operations[${index}]`;
    const fields = inspectPlainInertObject(rawOperation, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_EFFECT_OPERATION',
        maxFields: EFFECT_OPERATION_FIELDS.length,
    });
    if (!fields.has('kind') || typeof fields.get('kind') !== 'string'){
        fail('INVALID_RESOURCE_COMMIT_EFFECT_OPERATION', `${path}.kind must be a string.`, {
            path: `${path}.kind`,
        });
    }
    const kind = fields.get('kind');
    if (kind !== 'resource.grant' && kind !== 'resource.consume'){
        fail('UNSUPPORTED_RESOURCE_COMMIT_EFFECT_OPERATION', `${path}.kind is not supported by the resource commit boundary.`, {
            path: `${path}.kind`,
            kind,
        });
    }
    requireFields(fields, EFFECT_OPERATION_FIELDS, path, 'INVALID_RESOURCE_COMMIT_EFFECT_OPERATION');
    return Object.freeze({
        kind: kind === 'resource.grant' ? 'resource.credit' : 'resource.debit',
        resourceId: assertResourceId(
            fields.get('resourceId'),
            `${path}.resourceId`,
            'INVALID_RESOURCE_COMMIT_EFFECT_OPERATION'
        ),
        amount: assertPositiveFiniteAmount(
            fields.get('amount'),
            `${path}.amount`,
            'INVALID_RESOURCE_COMMIT_EFFECT_OPERATION'
        ),
    });
}

function isPromiseLike(value, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    let cursor = value;
    const seen = new WeakSet();
    while (cursor !== null){
        if ((typeof cursor !== 'object' && typeof cursor !== 'function') || seen.has(cursor)){
            fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
        seen.add(cursor);
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(cursor, 'then');
        }
        catch {
            fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
        if (descriptor){
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
                fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path} may not expose an accessor-based then property.`, { path });
            }
            return typeof descriptor.value === 'function';
        }
        try {
            cursor = Object.getPrototypeOf(cursor);
        }
        catch {
            fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path} thenable state could not be safely inspected.`, { path });
        }
    }
    return false;
}

function assertSynchronousFunction(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_RESOURCE_COMMIT_CONFIG', `${path} must be a function.`, { path, valueType: typeof value });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_RESOURCE_COMMIT_CONFIG', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail('INVALID_RESOURCE_COMMIT_CONFIG', `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

function canonicalReasonDetails(value, path){
    if (value === null) return null;
    const fields = inspectPlainInertObject(value, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT',
        maxFields: 8,
    });
    const output = {};
    for (const [key, entry] of fields){
        if (
            entry !== null &&
            typeof entry !== 'string' &&
            typeof entry !== 'boolean' &&
            (typeof entry !== 'number' || !Number.isFinite(entry))
        ){
            fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path}.${key} must be a primitive inert diagnostic value.`, {
                path: `${path}.${key}`,
                valueType: typeof entry,
            });
        }
        output[key] = Object.is(entry, -0) ? 0 : entry;
    }
    return Object.freeze(output);
}

function normalizeCommitReason(value){
    const path = 'resourceCommit.capabilityResult.reason';
    const fields = inspectPlainInertObject(value, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT',
        maxFields: COMMIT_REASON_FIELDS.length,
    });
    requireFields(fields, COMMIT_REASON_FIELDS, path, 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT');
    const code = fields.get('code');
    if (typeof code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(code)){
        fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path}.code must be a stable lowercase machine code.`, {
            path: `${path}.code`,
        });
    }
    return Object.freeze({
        code,
        details: canonicalReasonDetails(fields.get('details'), `${path}.details`),
    });
}

function normalizeCommitResult(rawResult){
    const path = 'resourceCommit.capabilityResult';
    if (isPromiseLike(rawResult, path)){
        fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', 'Resource commit capability must not return a Promise or thenable.', { path });
    }
    const fields = inspectPlainInertObject(rawResult, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT',
        maxFields: COMMIT_RESULT_FIELDS.length,
    });
    requireFields(fields, COMMIT_RESULT_FIELDS, path, 'INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT');
    const status = fields.get('status');
    if (status === 'committed'){
        if (fields.get('reason') !== null){
            fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', 'Committed resource result must use reason: null.', {
                path: `${path}.reason`,
            });
        }
        return Object.freeze({ status: 'committed', reason: null });
    }
    if (status === 'rejected'){
        return Object.freeze({ status: 'rejected', reason: normalizeCommitReason(fields.get('reason')) });
    }
    fail('INVALID_RESOURCE_COMMIT_CAPABILITY_RESULT', `${path}.status must be committed or rejected.`, {
        path: `${path}.status`,
        status,
    });
}

function normalizeOptions(rawOptions){
    const path = 'resourceCommitOptions';
    const fields = inspectPlainInertObject(rawOptions, {
        path,
        code: 'INVALID_RESOURCE_COMMIT_CONFIG',
        maxFields: 1,
    });
    requireFields(fields, ['commitResourceChanges'], path, 'INVALID_RESOURCE_COMMIT_CONFIG');
    return assertSynchronousFunction(fields.get('commitResourceChanges'), `${path}.commitResourceChanges`);
}

function createChanges(paymentPlan, effectPlan){
    const paymentOperations = inspectPlan(
        paymentPlan,
        'resourceCommit.paymentPlan',
        'INVALID_RESOURCE_COMMIT_PAYMENT_PLAN'
    );
    const effectOperations = inspectPlan(
        effectPlan,
        'resourceCommit.effectPlan',
        'INVALID_RESOURCE_COMMIT_EFFECT_PLAN'
    );
    const total = paymentOperations.length + effectOperations.length;
    if (total > MAX_RESOURCE_COMMIT_OPERATIONS){
        fail('RESOURCE_COMMIT_OPERATION_LIMIT', 'Combined payment/effect operations exceed the resource commit limit.', {
            operationCount: total,
            maxOperations: MAX_RESOURCE_COMMIT_OPERATIONS,
        });
    }
    const changes = [];
    for (let index = 0; index < paymentOperations.length; index++){
        changes.push(normalizePaymentOperation(paymentOperations[index], index));
    }
    for (let index = 0; index < effectOperations.length; index++){
        changes.push(normalizeEffectOperation(effectOperations[index], index));
    }
    return Object.freeze(changes);
}

export function createResourceCommitExecutor(rawOptions){
    const commitResourceChanges = normalizeOptions(rawOptions);

    function commit(paymentPlan, effectPlan){
        if (resourceCommitActive){
            fail('RESOURCE_COMMIT_REENTRANCY', 'Resource commit execution may not be nested.');
        }
        resourceCommitActive = true;
        try {
            const changes = createChanges(paymentPlan, effectPlan);
            let rawResult;
            try {
                rawResult = Reflect.apply(commitResourceChanges, undefined, [changes]);
            }
            catch (error){
                if (error instanceof EngineContractError) throw error;
                fail('RESOURCE_COMMIT_CAPABILITY_FAILURE', 'Resource commit capability threw unexpectedly.');
            }
            return normalizeCommitResult(rawResult);
        }
        finally {
            resourceCommitActive = false;
        }
    }

    return Object.freeze({ commit });
}
