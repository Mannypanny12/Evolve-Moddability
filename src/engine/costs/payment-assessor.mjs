import { EngineContractError } from '../identity.mjs';
import { normalizePaymentQuoteInput } from './payment-quote-input.mjs';
import { createPaymentReadCapabilities } from './payment-read-capabilities.mjs';
import {
    paymentAssessmentFailed,
    paymentAssessmentSatisfied,
} from './payment-assessment-result.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function accumulateRequirement(cumulative, line, lineIndex){
    const previousAmount = cumulative.get(line.resourceId) || 0;
    const requiredAmount = previousAmount + line.amount;
    if (!Number.isFinite(requiredAmount)){
        fail('PAYMENT_REQUIREMENT_OVERFLOW', 'Cumulative payment requirement exceeds finite numeric range.', {
            resourceId: line.resourceId,
            lineIndex,
            previousAmount,
            lineAmount: line.amount,
        });
    }
    cumulative.set(line.resourceId, requiredAmount);
    return requiredAmount;
}

function currentAssessment(quote, reads){
    const cumulative = new Map();
    const facts = new Map();
    const amountFailed = new Set();
    const capacityFailed = new Set();
    const reasons = [];

    function factsFor(resourceId){
        if (!facts.has(resourceId)){
            facts.set(resourceId, Object.freeze({
                amount: reads.resource.amount(resourceId),
                capacity: reads.resource.capacity(resourceId),
            }));
        }
        return facts.get(resourceId);
    }

    quote.lines.forEach((line, lineIndex) => {
        const requiredAmount = accumulateRequirement(cumulative, line, lineIndex);
        const resourceFacts = factsFor(line.resourceId);

        if (!amountFailed.has(line.resourceId) && requiredAmount > resourceFacts.amount){
            amountFailed.add(line.resourceId);
            reasons.push({
                code: 'payment.current.resource.amount_insufficient',
                details: {
                    lineIndex,
                    resourceId: line.resourceId,
                    requiredAmount,
                    currentAmount: resourceFacts.amount,
                },
            });
        }

        if (
            resourceFacts.capacity !== null &&
            !capacityFailed.has(line.resourceId) &&
            requiredAmount > resourceFacts.capacity
        ){
            capacityFailed.add(line.resourceId);
            reasons.push({
                code: 'payment.current.resource.capacity_insufficient',
                details: {
                    lineIndex,
                    resourceId: line.resourceId,
                    requiredAmount,
                    capacity: resourceFacts.capacity,
                },
            });
        }
    });

    return reasons.length === 0
        ? paymentAssessmentSatisfied('current-affordability')
        : paymentAssessmentFailed('current-affordability', reasons);
}

function queueAssessment(quote, reads){
    const cumulative = new Map();
    const facts = new Map();
    const unavailableFailed = new Set();
    const capacityFailed = new Set();
    const reasons = [];

    function factsFor(resourceId){
        if (!facts.has(resourceId)){
            facts.set(resourceId, Object.freeze({
                available: reads.resource.available(resourceId),
                capacity: reads.resource.capacity(resourceId),
            }));
        }
        return facts.get(resourceId);
    }

    quote.lines.forEach((line, lineIndex) => {
        const requiredAmount = accumulateRequirement(cumulative, line, lineIndex);
        const resourceFacts = factsFor(line.resourceId);

        if (!resourceFacts.available && !unavailableFailed.has(line.resourceId)){
            unavailableFailed.add(line.resourceId);
            reasons.push({
                code: 'payment.queue.resource.unavailable',
                details: {
                    lineIndex,
                    resourceId: line.resourceId,
                },
            });
        }

        if (
            resourceFacts.capacity !== null &&
            !capacityFailed.has(line.resourceId) &&
            requiredAmount > resourceFacts.capacity
        ){
            capacityFailed.add(line.resourceId);
            reasons.push({
                code: 'payment.queue.resource.capacity_insufficient',
                details: {
                    lineIndex,
                    resourceId: line.resourceId,
                    requiredAmount,
                    capacity: resourceFacts.capacity,
                },
            });
        }
    });

    return reasons.length === 0
        ? paymentAssessmentSatisfied('queue-payment-feasibility')
        : paymentAssessmentFailed('queue-payment-feasibility', reasons);
}

export function createPaymentAssessor(rawReadCapabilities){
    const reads = createPaymentReadCapabilities(rawReadCapabilities);
    let assessmentActive = false;

    function run(rawQuote, assess){
        if (assessmentActive){
            fail('PAYMENT_ASSESSMENT_REENTRANCY', 'Payment assessment may not be nested.');
        }
        assessmentActive = true;
        try {
            const quote = normalizePaymentQuoteInput(rawQuote);
            if (quote.lines.length === 0){
                return assess === currentAssessment
                    ? paymentAssessmentSatisfied('current-affordability')
                    : paymentAssessmentSatisfied('queue-payment-feasibility');
            }
            return assess(quote, reads);
        }
        finally {
            assessmentActive = false;
        }
    }

    return Object.freeze({
        assessCurrentAffordability: quote => run(quote, currentAssessment),
        assessQueuePaymentFeasibility: quote => run(quote, queueAssessment),
    });
}
