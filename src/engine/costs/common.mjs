import { EngineContractError, parseContentId } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

export const MAX_PAYMENT_QUOTE_LINES = 4096;

const QUOTE_LINE_FIELDS = Object.freeze(['kind', 'resourceId', 'amount']);
const QUOTE_LINE_FIELD_SET = new Set(QUOTE_LINE_FIELDS);
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

function readQuoteLineFields(value, path){
    const fields = inspectPlainInertObject(value, {
        path,
        code: 'INVALID_PAYMENT_QUOTE_LINE',
        maxFields: QUOTE_LINE_FIELDS.length,
    });

    for (const key of fields.keys()){
        if (!QUOTE_LINE_FIELD_SET.has(key)){
            fail(
                'INVALID_PAYMENT_QUOTE_LINE',
                `${path} contains unsupported field ${JSON.stringify(key)}.`,
                { path: inertDataPath(path, key), field: key }
            );
        }
    }
    for (const key of QUOTE_LINE_FIELDS){
        if (!fields.has(key)){
            fail(
                'INVALID_PAYMENT_QUOTE_LINE',
                `${path} is missing required field ${JSON.stringify(key)}.`,
                { path: inertDataPath(path, key), field: key }
            );
        }
    }
    return fields;
}

function assertResourceKind(value, path){
    if (typeof value !== 'string' || !PAYMENT_QUOTE_LINE_KIND_PATTERN.test(value)){
        fail(
            'INVALID_PAYMENT_QUOTE_LINE_KIND',
            `${path} must be a stable lowercase payment quote line kind.`,
            {
                path,
                valueType: typeof value,
                value: typeof value === 'string' ? value : undefined,
            }
        );
    }
    if (value !== 'resource'){
        fail(
            'UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND',
            `${path} is not a supported payment quote line kind.`,
            { path, kind: value }
        );
    }
    return value;
}

function assertResourceId(value, path){
    if (typeof value !== 'string'){
        fail(
            'INVALID_PAYMENT_QUOTE_RESOURCE_ID',
            `${path} must be a canonical resource content ID string.`,
            { path, expectedType: 'resource', valueType: typeof value }
        );
    }

    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (!isEngineContractError(error)) throw error;
        fail(
            'INVALID_PAYMENT_QUOTE_RESOURCE_ID',
            `${path} must be a canonical resource content ID.`,
            { path, expectedType: 'resource', value }
        );
    }
    if (parsed.type !== 'resource'){
        fail(
            'INVALID_PAYMENT_QUOTE_RESOURCE_ID',
            `${path} must identify content type resource.`,
            {
                path,
                expectedType: 'resource',
                actualType: parsed.type,
                value,
            }
        );
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

export function readPaymentQuoteLines(value, path = 'paymentQuote.lines'){
    return inspectDenseInertArray(value, {
        path,
        code: 'INVALID_PAYMENT_QUOTE',
        maxLength: MAX_PAYMENT_QUOTE_LINES,
    });
}

export function normalizePaymentQuoteLine(value, index){
    const path = `paymentQuote.lines[${index}]`;
    const fields = readQuoteLineFields(value, path);
    const kind = assertResourceKind(fields.get('kind'), `${path}.kind`);
    const resourceId = assertResourceId(fields.get('resourceId'), `${path}.resourceId`);
    const amount = assertAmount(fields.get('amount'), `${path}.amount`);

    return Object.freeze({ kind, resourceId, amount });
}
