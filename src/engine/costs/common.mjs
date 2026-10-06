import { EngineContractError, parseContentId } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_PAYMENT_QUOTE_LINES = 4096;

const RESOURCE_LINE_FIELDS = Object.freeze(['kind', 'resourceId', 'amount']);
const PRESTIGE_LINE_FIELDS = Object.freeze(['kind', 'prestigeId', 'amount']);
const SPECIAL_LINE_FIELDS = Object.freeze(['kind', 'paymentId', 'source', 'amount']);
const SPECIAL_POOL_SOURCE_FIELDS = Object.freeze(['kind', 'poolId']);
const PAYMENT_QUOTE_LINE_KIND_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

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

function assertNormalArrayContainer(value, path, code){
    let isArray;
    try {
        isArray = Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (!isArray){
        fail(code, `${path} must be an array.`, { path, valueType: typeof value });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (prototype !== Array.prototype){
        fail(code, `${path} must be a normal Array.`, { path, containerType: 'array' });
    }
}

function assertPlainRecordContainer(value, path, code){
    if (value === null || typeof value !== 'object'){
        fail(code, `${path} must be a plain data object.`, {
            path,
            valueType: value === null ? 'null' : typeof value,
        });
    }

    let isArray;
    try {
        isArray = Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (isArray){
        fail(code, `${path} must be a plain data object.`, { path, containerType: 'array' });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (prototype !== Object.prototype && prototype !== null){
        fail(code, `${path} must be a plain data object.`, { path, containerType: 'object' });
    }
}

function readQuoteLineFields(value, path){
    assertPlainRecordContainer(value, path, 'INVALID_PAYMENT_QUOTE_LINE');
    return inspectPlainInertObject(value, {
        path,
        code: 'INVALID_PAYMENT_QUOTE_LINE',
        maxFields: 4,
    });
}

function readSpecialSourceFields(value, path){
    assertPlainRecordContainer(value, path, 'INVALID_PAYMENT_QUOTE_SPECIAL_SOURCE');
    return inspectPlainInertObject(value, {
        path,
        code: 'INVALID_PAYMENT_QUOTE_SPECIAL_SOURCE',
        maxFields: 2,
    });
}

function readLineKind(fields, path){
    if (!fields.has('kind')){
        fail('INVALID_PAYMENT_QUOTE_LINE', `${path} is missing required field "kind".`, {
            path: inertDataPath(path, 'kind'),
            field: 'kind',
        });
    }
    const value = fields.get('kind');
    if (typeof value !== 'string' || !PAYMENT_QUOTE_LINE_KIND_PATTERN.test(value)){
        fail(
            'INVALID_PAYMENT_QUOTE_LINE_KIND',
            `${path}.kind must be a stable lowercase payment quote line kind.`,
            {
                path: `${path}.kind`,
                valueType: typeof value,
                value: typeof value === 'string' ? value : undefined,
            }
        );
    }
    if (value !== 'resource' && value !== 'prestige' && value !== 'special'){
        fail(
            'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND',
            `${path}.kind is not a supported payment quote line kind.`,
            { path: `${path}.kind`, kind: value }
        );
    }
    return value;
}

function assertClosedFields(fields, path, expected, code = 'INVALID_PAYMENT_QUOTE_LINE'){
    const expectedSet = new Set(expected);
    for (const key of fields.keys()){
        if (!expectedSet.has(key)){
            fail(
                code,
                `${path} contains unsupported field ${JSON.stringify(key)}.`,
                { path: inertDataPath(path, key), field: key }
            );
        }
    }
    for (const key of expected){
        if (!fields.has(key)){
            fail(
                code,
                `${path} is missing required field ${JSON.stringify(key)}.`,
                { path: inertDataPath(path, key), field: key }
            );
        }
    }
}

function assertTypedId(value, path, expectedType, code){
    if (typeof value !== 'string'){
        fail(code, `${path} must be a canonical ${expectedType} content ID string.`, {
            path,
            expectedType,
            valueType: typeof value,
        });
    }

    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (!isEngineContractError(error)) throw error;
        fail(code, `${path} must be a canonical ${expectedType} content ID.`, {
            path,
            expectedType,
            value,
        });
    }
    if (parsed.type !== expectedType){
        fail(code, `${path} must identify content type ${expectedType}.`, {
            path,
            expectedType,
            actualType: parsed.type,
            value,
        });
    }
    return parsed.canonical;
}

function assertAmount(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0){
        fail(
            'INVALID_PAYMENT_QUOTE_AMOUNT',
            `${path} must be a positive finite number.`,
            {
                path,
                valueType: typeof value,
                value: typeof value === 'number' ? value : undefined,
            }
        );
    }
    return value;
}

function normalizeSpecialSource(value, path){
    const fields = readSpecialSourceFields(value, path);
    if (!fields.has('kind')){
        fail('INVALID_PAYMENT_QUOTE_SPECIAL_SOURCE', `${path} is missing required field "kind".`, {
            path: inertDataPath(path, 'kind'),
            field: 'kind',
        });
    }
    const kind = fields.get('kind');
    if (kind !== 'pool'){
        fail('UNSUPPORTED_PAYMENT_QUOTE_SPECIAL_SOURCE_KIND', `${path}.kind is not a supported special payment source kind.`, {
            path: `${path}.kind`,
            kind,
        });
    }
    assertClosedFields(fields, path, SPECIAL_POOL_SOURCE_FIELDS, 'INVALID_PAYMENT_QUOTE_SPECIAL_SOURCE');
    const poolId = assertTypedId(
        fields.get('poolId'),
        `${path}.poolId`,
        'payment-pool',
        'INVALID_PAYMENT_QUOTE_POOL_ID'
    );
    return Object.freeze({ kind, poolId });
}

export function readPaymentQuoteLines(value, path = 'paymentQuote.lines'){
    assertNormalArrayContainer(value, path, 'INVALID_PAYMENT_QUOTE');
    return inspectDenseInertArray(value, {
        path,
        code: 'INVALID_PAYMENT_QUOTE',
        maxLength: MAX_PAYMENT_QUOTE_LINES,
    });
}

export function normalizePaymentQuoteLine(value, index){
    const path = `paymentQuote.lines[${index}]`;
    const fields = readQuoteLineFields(value, path);
    const kind = readLineKind(fields, path);

    if (kind === 'resource'){
        assertClosedFields(fields, path, RESOURCE_LINE_FIELDS);
        const resourceId = assertTypedId(
            fields.get('resourceId'),
            `${path}.resourceId`,
            'resource',
            'INVALID_PAYMENT_QUOTE_RESOURCE_ID'
        );
        const amount = assertAmount(fields.get('amount'), `${path}.amount`);
        return Object.freeze({ kind, resourceId, amount });
    }

    if (kind === 'prestige'){
        assertClosedFields(fields, path, PRESTIGE_LINE_FIELDS);
        const prestigeId = assertTypedId(
            fields.get('prestigeId'),
            `${path}.prestigeId`,
            'prestige',
            'INVALID_PAYMENT_QUOTE_PRESTIGE_ID'
        );
        const amount = assertAmount(fields.get('amount'), `${path}.amount`);
        return Object.freeze({ kind, prestigeId, amount });
    }

    assertClosedFields(fields, path, SPECIAL_LINE_FIELDS);
    const paymentId = assertTypedId(
        fields.get('paymentId'),
        `${path}.paymentId`,
        'payment',
        'INVALID_PAYMENT_QUOTE_PAYMENT_ID'
    );
    const source = normalizeSpecialSource(fields.get('source'), `${path}.source`);
    const amount = assertAmount(fields.get('amount'), `${path}.amount`);
    return Object.freeze({ kind, paymentId, source, amount });
}
