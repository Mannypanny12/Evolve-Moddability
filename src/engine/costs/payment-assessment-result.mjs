import { EngineContractError } from '../identity.mjs';

const ASSESSMENT_KINDS = Object.freeze([
    'current-affordability',
    'queue-payment-feasibility',
]);
const ASSESSMENT_KIND_SET = new Set(ASSESSMENT_KINDS);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function canonicalReason(reason){
    const details = reason.details === null
        ? null
        : Object.freeze({ ...reason.details });
    return Object.freeze({ code: reason.code, details });
}

export function paymentAssessmentSatisfied(assessment){
    if (!ASSESSMENT_KIND_SET.has(assessment)){
        fail('INVALID_PAYMENT_ASSESSMENT_KIND', 'Unknown payment assessment kind.', { assessment });
    }
    return Object.freeze({
        assessment,
        status: 'satisfied',
        reasons: Object.freeze([]),
    });
}

export function paymentAssessmentFailed(assessment, reasons){
    if (!ASSESSMENT_KIND_SET.has(assessment)){
        fail('INVALID_PAYMENT_ASSESSMENT_KIND', 'Unknown payment assessment kind.', { assessment });
    }
    if (!Array.isArray(reasons) || reasons.length === 0){
        fail('INVALID_PAYMENT_ASSESSMENT_RESULT', 'Failed payment assessments require at least one reason.', {
            assessment,
        });
    }
    return Object.freeze({
        assessment,
        status: 'failed',
        reasons: Object.freeze(reasons.map(canonicalReason)),
    });
}
