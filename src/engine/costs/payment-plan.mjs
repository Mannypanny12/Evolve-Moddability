import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';

function specialSourceFor(source){
    if (source.kind === 'resource'){
        return Object.freeze({
            kind: 'resource',
            resourceId: source.resourceId,
        });
    }
    return Object.freeze({
        kind: 'pool',
        poolId: source.poolId,
    });
}

function operationFor(line){
    if (line.kind === 'prestige'){
        return Object.freeze({
            kind: 'payment.prestige.debit',
            prestigeId: line.prestigeId,
            amount: line.amount,
        });
    }
    if (line.kind === 'special'){
        return Object.freeze({
            kind: 'payment.special.settle',
            paymentId: line.paymentId,
            source: specialSourceFor(line.source),
            amount: line.amount,
        });
    }
    return Object.freeze({
        kind: 'payment.resource.debit',
        resourceId: line.resourceId,
        amount: line.amount,
    });
}

export function createPaymentPlan(paymentQuote){
    const quote = normalizePaymentQuoteInput(paymentQuote);
    const operations = quote.lines.map(operationFor);

    return Object.freeze({
        operations: Object.freeze(operations),
    });
}
