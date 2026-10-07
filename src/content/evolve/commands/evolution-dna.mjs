import { EngineContractError } from '../../../engine/identity.mjs';
import {
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../../../engine/contracts/inert-data.mjs';
import { normalizeConditionOutcome } from '../../../engine/conditions/result.mjs';
import { commandRejected, commandSucceeded } from '../../../engine/commands/result.mjs';
import { createPaymentQuote } from '../../../engine/costs/payment-quote.mjs';
import { createPaymentPlan } from '../../../engine/costs/payment-plan.mjs';
import { createEffectPlan } from '../../../engine/effects/effect-plan.mjs';

const COMMAND_ID = 'evolve:command/evolution/dna';
const RNA_RESOURCE_ID = 'evolve:resource/rna';
const DNA_RESOURCE_ID = 'evolve:resource/dna';
const RNA_PRICE = 2;
const DNA_GRANT = 1;
const OPTION_FIELDS = Object.freeze([
    'evaluateCondition',
    'assessCurrentAffordability',
    'commitResourcePlans',
]);

const DNA_EXECUTION_CONDITION = Object.freeze({
    kind: 'resource.below_capacity',
    params: Object.freeze({ resourceId: DNA_RESOURCE_ID }),
});

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function requireExactFields(fields, required, path, code){
    if (fields.size !== required.length){
        fail(code, `${path} must contain exactly ${required.length} fields.`, {
            path,
            fieldCount: fields.size,
        });
    }
    for (const field of required){
        if (!fields.has(field)){
            fail(code, `${path}.${field} is required.`, { path: `${path}.${field}`, field });
        }
    }
    for (const field of fields.keys()){
        if (!required.includes(field)){
            fail(code, `${path}.${field} is not supported.`, { path: `${path}.${field}`, field });
        }
    }
}

function assertSynchronousCapability(value, path){
    if (typeof value !== 'function'){
        fail('INVALID_DNA_COMMAND_CONFIG', `${path} must be a synchronous function.`, {
            path,
            valueType: typeof value,
        });
    }
    let source;
    try {
        source = Function.prototype.toString.call(value);
    }
    catch {
        fail('INVALID_DNA_COMMAND_CONFIG', `${path} could not be inspected.`, { path });
    }
    if (
        /^\s*async\b/.test(source) ||
        /^\s*(?:async\s+)?function\s*\*/.test(source) ||
        /^\s*\*/.test(source) ||
        /^\s*class\b/.test(source)
    ){
        fail('INVALID_DNA_COMMAND_CONFIG', `${path} must be a directly callable synchronous non-generator function.`, { path });
    }
    return value;
}

function readCapabilities(rawOptions){
    const path = 'evolutionDnaCommandOptions';
    const fields = inspectPlainInertObject(rawOptions, {
        path,
        code: 'INVALID_DNA_COMMAND_CONFIG',
        maxFields: OPTION_FIELDS.length,
    });
    requireExactFields(fields, OPTION_FIELDS, path, 'INVALID_DNA_COMMAND_CONFIG');
    return Object.freeze({
        evaluateCondition: assertSynchronousCapability(fields.get('evaluateCondition'), `${path}.evaluateCondition`),
        assessCurrentAffordability: assertSynchronousCapability(fields.get('assessCurrentAffordability'), `${path}.assessCurrentAffordability`),
        commitResourcePlans: assertSynchronousCapability(fields.get('commitResourcePlans'), `${path}.commitResourcePlans`),
    });
}

function validatePayload(payload){
    const fields = inspectPlainInertObject(payload, {
        path: 'evolutionDnaCommand.payload',
        code: 'INVALID_DNA_COMMAND_PAYLOAD',
        maxFields: 0,
    });
    if (fields.size !== 0){
        fail('INVALID_DNA_COMMAND_PAYLOAD', 'DNA command payload must be empty.', {
            path: 'evolutionDnaCommand.payload',
            fieldCount: fields.size,
        });
    }
    return Object.freeze({});
}

function normalizeCurrentAffordability(rawAssessment){
    const path = 'evolutionDnaCommand.currentAffordability';
    const fields = inspectPlainInertObject(rawAssessment, {
        path,
        code: 'INVALID_DNA_PAYMENT_ASSESSMENT',
        maxFields: 3,
    });
    requireExactFields(
        fields,
        ['assessment', 'status', 'reasons'],
        path,
        'INVALID_DNA_PAYMENT_ASSESSMENT'
    );
    if (fields.get('assessment') !== 'current-affordability'){
        fail('INVALID_DNA_PAYMENT_ASSESSMENT', 'DNA command requires a current-affordability assessment.', {
            path: `${path}.assessment`,
            assessment: fields.get('assessment'),
        });
    }
    const reasons = inspectDenseInertArray(fields.get('reasons'), {
        path: `${path}.reasons`,
        code: 'INVALID_DNA_PAYMENT_ASSESSMENT',
        maxLength: 64,
    });
    const status = fields.get('status');
    if (status === 'satisfied'){
        if (reasons.length !== 0){
            fail('INVALID_DNA_PAYMENT_ASSESSMENT', 'Satisfied affordability assessment may not contain reasons.', {
                path: `${path}.reasons`,
                reasonCount: reasons.length,
            });
        }
        return Object.freeze({ status, reasons: Object.freeze([]) });
    }
    if (status === 'failed'){
        if (reasons.length === 0){
            fail('INVALID_DNA_PAYMENT_ASSESSMENT', 'Failed affordability assessment requires at least one reason.', {
                path: `${path}.reasons`,
            });
        }
        return Object.freeze({ status, reasons: Object.freeze(reasons) });
    }
    fail('INVALID_DNA_PAYMENT_ASSESSMENT', 'Affordability status must be satisfied or failed.', {
        path: `${path}.status`,
        status,
    });
}

function normalizeCommitOutcome(rawOutcome){
    const path = 'evolutionDnaCommand.resourceCommit';
    const fields = inspectPlainInertObject(rawOutcome, {
        path,
        code: 'INVALID_DNA_RESOURCE_COMMIT_RESULT',
        maxFields: 2,
    });
    requireExactFields(fields, ['status', 'reason'], path, 'INVALID_DNA_RESOURCE_COMMIT_RESULT');
    const status = fields.get('status');
    if (status === 'committed'){
        if (fields.get('reason') !== null){
            fail('INVALID_DNA_RESOURCE_COMMIT_RESULT', 'Committed DNA resource result must use reason: null.', {
                path: `${path}.reason`,
            });
        }
        return Object.freeze({ status, reason: null });
    }
    if (status === 'rejected'){
        const reason = fields.get('reason');
        if (reason === null || typeof reason !== 'object'){
            fail('INVALID_DNA_RESOURCE_COMMIT_RESULT', 'Rejected DNA resource result requires a structured reason.', {
                path: `${path}.reason`,
            });
        }
        return Object.freeze({ status, reason });
    }
    fail('INVALID_DNA_RESOURCE_COMMIT_RESULT', 'DNA resource commit status must be committed or rejected.', {
        path: `${path}.status`,
        status,
    });
}

export function createEvolutionDnaCommandRegistration(rawOptions){
    const capabilities = readCapabilities(rawOptions);

    function execute(){
        const condition = normalizeConditionOutcome(
            Reflect.apply(capabilities.evaluateCondition, undefined, [DNA_EXECUTION_CONDITION]),
            'evolutionDnaCommand.conditionOutcome'
        );
        if (condition.status === 'failed'){
            return commandRejected(condition.reasons);
        }

        const quote = createPaymentQuote([{
            kind: 'resource',
            resourceId: RNA_RESOURCE_ID,
            amount: RNA_PRICE,
        }]);
        const affordability = normalizeCurrentAffordability(
            Reflect.apply(capabilities.assessCurrentAffordability, undefined, [quote])
        );
        if (affordability.status === 'failed'){
            return commandRejected(affordability.reasons);
        }

        const paymentPlan = createPaymentPlan(quote);
        const effectPlan = createEffectPlan([{
            kind: 'resource.grant',
            resourceId: DNA_RESOURCE_ID,
            amount: DNA_GRANT,
        }]);
        const committed = normalizeCommitOutcome(
            Reflect.apply(capabilities.commitResourcePlans, undefined, [paymentPlan, effectPlan])
        );
        if (committed.status === 'rejected'){
            return commandRejected([committed.reason]);
        }
        return commandSucceeded(null);
    }

    return Object.freeze({
        id: COMMAND_ID,
        validatePayload,
        execute,
    });
}
