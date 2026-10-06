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

function lineSubject(line){
    if (line.kind === 'resource'){
        return { family: 'resource', id: line.resourceId, detailKey: 'resourceId' };
    }
    if (line.kind === 'prestige'){
        return { family: 'prestige', id: line.prestigeId, detailKey: 'prestigeId' };
    }
    return { family: 'pool', id: line.source.poolId, detailKey: 'poolId' };
}

function accumulateRequirement(cumulative, line, lineIndex){
    const subject = lineSubject(line);
    const key = `${subject.family}:${subject.id}`;
    const previousAmount = cumulative.get(key) || 0;
    const requiredAmount = previousAmount + line.amount;
    if (!Number.isFinite(requiredAmount)){
        fail('PAYMENT_REQUIREMENT_OVERFLOW', 'Cumulative payment requirement exceeds finite numeric range.', {
            paymentFamily: subject.family,
            [subject.detailKey]: subject.id,
            lineIndex,
            previousAmount,
            lineAmount: line.amount,
        });
    }
    cumulative.set(key, requiredAmount);
    return { subject, key, requiredAmount };
}

function requirePrestigeReads(reads){
    if (!reads.prestige){
        fail('MISSING_PAYMENT_READ_FAMILY', 'Prestige payment assessment requires a prestige read capability.', {
            readFamily: 'prestige',
        });
    }
    return reads.prestige;
}

function requirePoolReads(reads){
    if (!reads.pool){
        fail('MISSING_PAYMENT_READ_FAMILY', 'Pool-backed special payment assessment requires a pool read capability.', {
            readFamily: 'pool',
        });
    }
    return reads.pool;
}

function currentAssessment(quote, reads){
    const cumulative = new Map();
    const resourceFacts = new Map();
    const prestigeFacts = new Map();
    const poolFacts = new Map();
    const amountFailed = new Set();
    const capacityFailed = new Set();
    const missingPoolFailed = new Set();
    const reasons = [];

    function resourceFactsFor(resourceId){
        if (!resourceFacts.has(resourceId)){
            resourceFacts.set(resourceId, Object.freeze({
                amount: reads.resource.amount(resourceId),
                capacity: reads.resource.capacity(resourceId),
            }));
        }
        return resourceFacts.get(resourceId);
    }

    function prestigeAmountFor(prestigeId){
        if (!prestigeFacts.has(prestigeId)){
            prestigeFacts.set(prestigeId, requirePrestigeReads(reads).amount(prestigeId));
        }
        return prestigeFacts.get(prestigeId);
    }

    function poolFactsFor(poolId){
        if (!poolFacts.has(poolId)){
            const pool = requirePoolReads(reads);
            const present = pool.present(poolId);
            poolFacts.set(poolId, Object.freeze({
                present,
                amount: present ? pool.amount(poolId) : null,
            }));
        }
        return poolFacts.get(poolId);
    }

    quote.lines.forEach((line, lineIndex) => {
        const { subject, key, requiredAmount } = accumulateRequirement(cumulative, line, lineIndex);

        if (subject.family === 'prestige'){
            const currentAmount = prestigeAmountFor(subject.id);
            if (!amountFailed.has(key) && requiredAmount > currentAmount){
                amountFailed.add(key);
                reasons.push({
                    code: 'payment.current.prestige.holdings_insufficient',
                    details: {
                        lineIndex,
                        prestigeId: subject.id,
                        requiredAmount,
                        currentAmount,
                    },
                });
            }
            return;
        }

        if (subject.family === 'pool'){
            const facts = poolFactsFor(subject.id);
            if (!facts.present){
                if (!missingPoolFailed.has(key)){
                    missingPoolFailed.add(key);
                    reasons.push({
                        code: 'payment.current.pool.missing',
                        details: { lineIndex, poolId: subject.id },
                    });
                }
                return;
            }
            if (!amountFailed.has(key) && requiredAmount > facts.amount){
                amountFailed.add(key);
                reasons.push({
                    code: 'payment.current.pool.amount_insufficient',
                    details: {
                        lineIndex,
                        poolId: subject.id,
                        requiredAmount,
                        currentAmount: facts.amount,
                    },
                });
            }
            return;
        }

        const facts = resourceFactsFor(subject.id);
        if (!amountFailed.has(key) && requiredAmount > facts.amount){
            amountFailed.add(key);
            reasons.push({
                code: 'payment.current.resource.amount_insufficient',
                details: {
                    lineIndex,
                    resourceId: subject.id,
                    requiredAmount,
                    currentAmount: facts.amount,
                },
            });
        }
        if (facts.capacity !== null && !capacityFailed.has(key) && requiredAmount > facts.capacity){
            capacityFailed.add(key);
            reasons.push({
                code: 'payment.current.resource.capacity_insufficient',
                details: {
                    lineIndex,
                    resourceId: subject.id,
                    requiredAmount,
                    capacity: facts.capacity,
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
    const resourceFacts = new Map();
    const prestigeFacts = new Map();
    const poolFacts = new Map();
    const unavailableFailed = new Set();
    const capacityFailed = new Set();
    const prestigeFailed = new Set();
    const missingPoolFailed = new Set();
    const reasons = [];

    function resourceFactsFor(resourceId){
        if (!resourceFacts.has(resourceId)){
            resourceFacts.set(resourceId, Object.freeze({
                available: reads.resource.available(resourceId),
                capacity: reads.resource.capacity(resourceId),
            }));
        }
        return resourceFacts.get(resourceId);
    }

    function prestigeAmountFor(prestigeId){
        if (!prestigeFacts.has(prestigeId)){
            prestigeFacts.set(prestigeId, requirePrestigeReads(reads).amount(prestigeId));
        }
        return prestigeFacts.get(prestigeId);
    }

    function poolFactsFor(poolId){
        if (!poolFacts.has(poolId)){
            const pool = requirePoolReads(reads);
            const present = pool.present(poolId);
            poolFacts.set(poolId, Object.freeze({
                present,
                capacity: present ? pool.capacity(poolId) : null,
            }));
        }
        return poolFacts.get(poolId);
    }

    quote.lines.forEach((line, lineIndex) => {
        const { subject, key, requiredAmount } = accumulateRequirement(cumulative, line, lineIndex);

        if (subject.family === 'prestige'){
            const currentAmount = prestigeAmountFor(subject.id);
            if (!prestigeFailed.has(key) && requiredAmount > currentAmount){
                prestigeFailed.add(key);
                reasons.push({
                    code: 'payment.queue.prestige.holdings_insufficient',
                    details: {
                        lineIndex,
                        prestigeId: subject.id,
                        requiredAmount,
                        currentAmount,
                    },
                });
            }
            return;
        }

        if (subject.family === 'pool'){
            const facts = poolFactsFor(subject.id);
            if (!facts.present){
                if (!missingPoolFailed.has(key)){
                    missingPoolFailed.add(key);
                    reasons.push({
                        code: 'payment.queue.pool.missing',
                        details: { lineIndex, poolId: subject.id },
                    });
                }
                return;
            }
            if (!capacityFailed.has(key) && requiredAmount > facts.capacity){
                capacityFailed.add(key);
                reasons.push({
                    code: 'payment.queue.pool.capacity_insufficient',
                    details: {
                        lineIndex,
                        poolId: subject.id,
                        requiredAmount,
                        capacity: facts.capacity,
                    },
                });
            }
            return;
        }

        const facts = resourceFactsFor(subject.id);
        if (!facts.available && !unavailableFailed.has(key)){
            unavailableFailed.add(key);
            reasons.push({
                code: 'payment.queue.resource.unavailable',
                details: { lineIndex, resourceId: subject.id },
            });
        }
        if (facts.capacity !== null && !capacityFailed.has(key) && requiredAmount > facts.capacity){
            capacityFailed.add(key);
            reasons.push({
                code: 'payment.queue.resource.capacity_insufficient',
                details: {
                    lineIndex,
                    resourceId: subject.id,
                    requiredAmount,
                    capacity: facts.capacity,
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
