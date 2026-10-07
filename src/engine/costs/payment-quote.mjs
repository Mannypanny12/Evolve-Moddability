import {
    normalizePaymentQuoteLine,
    readPaymentQuoteLines,
} from './common.mjs';

export function createPaymentQuote(resolvedLines){
    const lines = readPaymentQuoteLines(resolvedLines)
        .map((line, index) => normalizePaymentQuoteLine(line, index));

    return Object.freeze({
        lines: Object.freeze(lines),
    });
}
