import { EngineContractError, parseContentId } from '../../engine/identity.mjs';

const SUPPLY_PAYMENT_ID = 'evolve:payment/supply';
const PURIFIER_SUPPLY_POOL_ID = 'evolve:payment-pool/purifier_supply';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalPaymentId(value){
    if (typeof value !== 'string'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must be a canonical payment content ID.', {
            expectedType: 'payment',
            valueType: typeof value,
        });
    }
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must be a canonical payment content ID.', {
            expectedType: 'payment',
            valueType: 'string',
        });
    }
    if (parsed.type !== 'payment'){
        fail('INVALID_SPECIAL_PAYMENT_SOURCE_ID', 'Special payment source identity must identify content type payment.', {
            expectedType: 'payment',
            actualType: parsed.type,
        });
    }
    if (parsed.canonical !== SUPPLY_PAYMENT_ID){
        fail('UNSUPPORTED_SPECIAL_PAYMENT_SOURCE_ID', 'This first-party special payment source resolver does not support the supplied identity.', {
            paymentId: parsed.canonical,
        });
    }
    return parsed.canonical;
}

export function createEvolveSpecialPaymentSourceResolver(){
    const supplySource = Object.freeze({
        kind: 'pool',
        poolId: PURIFIER_SUPPLY_POOL_ID,
    });

    return Object.freeze({
        resolvePaymentSource(rawPaymentId){
            canonicalPaymentId(rawPaymentId);
            return supplySource;
        },
    });
}
