import {
    normalizePaymentQuoteLine,
    readPaymentQuoteLines,
} from './common.mjs';

export function createPaymentQuote(rawLines){
    const lines = readPaymentQuoteLines(rawLines)
        .map((line, index) => normalizePaymentQuoteLine(line, index));

    return Object.freeze({
        lines: Object.freeze(lines),
    });
}
