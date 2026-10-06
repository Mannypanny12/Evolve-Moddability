import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';

function operationFor(line){
    if (line.kind === 'prestige'){
        return Object.freeze({
            kind: 'payment.prestige.debit',
            prestigeId: line.prestigeId,
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
