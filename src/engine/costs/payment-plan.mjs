import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';

export function createPaymentPlan(paymentQuote){
    const quote = normalizePaymentQuoteInput(paymentQuote);
    const operations = quote.lines.map(line => Object.freeze({
        kind: 'payment.resource.debit',
        resourceId: line.resourceId,
        amount: line.amount,
    }));

    return Object.freeze({
        operations: Object.freeze(operations),
    });
}
