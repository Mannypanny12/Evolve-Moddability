import { EngineContractError } from '../identity.mjs';
import {
    inertDataPath,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';
import { createPaymentQuote } from './payment-quote.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPaymentQuoteContainer(value){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_PAYMENT_QUOTE', 'paymentQuote must be a plain data object.', {
            path: 'paymentQuote',
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
        fail('INVALID_PAYMENT_QUOTE', 'paymentQuote could not be safely inspected.', { path: 'paymentQuote' });
    }
    if (isArray || (prototype !== Object.prototype && prototype !== null)){
        fail('INVALID_PAYMENT_QUOTE', 'paymentQuote must be a plain data object.', {
            path: 'paymentQuote',
            containerType: isArray ? 'array' : 'object',
        });
    }
}

export function normalizePaymentQuoteInput(rawQuote){
    assertPaymentQuoteContainer(rawQuote);
    const fields = inspectPlainInertObject(rawQuote, {
        path: 'paymentQuote',
        code: 'INVALID_PAYMENT_QUOTE',
        maxFields: 1,
    });
    for (const key of fields.keys()){
        if (key !== 'lines'){
            const path = inertDataPath('paymentQuote', key);
            fail('INVALID_PAYMENT_QUOTE', `paymentQuote contains unsupported field ${JSON.stringify(key)}.`, {
                path,
                field: key,
            });
        }
    }
    if (!fields.has('lines')){
        fail('INVALID_PAYMENT_QUOTE', 'paymentQuote is missing required field "lines".', {
            path: 'paymentQuote.lines',
            field: 'lines',
        });
    }
    return createPaymentQuote(fields.get('lines'));
}
