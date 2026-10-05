import { EngineContractError } from '../identity.mjs';
import {
    MAX_CONDITION_NESTING_DEPTH,
    assertConditionKind,
    assertSynchronousConditionFunction,
    canonicalizeConditionParams,
    isConditionPromiseLike,
    readClosedConditionObject,
    readDenseConditionArray,
} from './common.mjs';
import {
    conditionFailed,
    conditionSatisfied,
    normalizeConditionOutcome,
} from './result.mjs';

const COMPOUND_KINDS = Object.freeze(['all', 'any', 'not']);
const COMPOUND_KIND_SET = new Set(COMPOUND_KINDS);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function validateRegistration(rawRegistration, index){
    const path = `conditionEvaluator.registrations[${index}]`;
    const fields = readClosedConditionObject(rawRegistration, {
        path,
        allowed: ['kind', 'validateParams', 'evaluate'],
        code: 'INVALID_CONDITION_REGISTRATION',
    });
    const kind = assertConditionKind(fields.get('kind'), `${path}.kind`);
    if (COMPOUND_KIND_SET.has(kind)){
        fail('RESERVED_CONDITION_KIND', `Condition kind ${JSON.stringify(kind)} is reserved by the condition kernel.`, { path: `${path}.kind`, kind });
    }
    return Object.freeze({
        kind,
        validateParams: assertSynchronousConditionFunction(fields.get('validateParams'), `${path}.validateParams`),
        evaluate: assertSynchronousConditionFunction(fields.get('evaluate'), `${path}.evaluate`),
    });
}

function enrichConditionError(error, kind, path, phase){
    if (error instanceof EngineContractError){
        return new EngineContractError(
            error.code || 'CONDITION_CONTRACT_FAILURE',
            `${error.message || 'Condition contract failed.'} [${kind || '<unresolved>'} @ ${phase}]`,
            {
                ...(error.details || {}),
                conditionKind: kind,
                conditionPath: path,
                conditionPhase: phase,
            }
        );
    }
    return new EngineContractError(
        phase === 'validate' ? 'CONDITION_PARAM_VALIDATOR_FAILURE' : 'CONDITION_EVALUATOR_FAILURE',
        `Condition ${phase} phase threw unexpectedly. [${kind || '<unresolved>'}]`,
        { conditionKind: kind, conditionPath: path, conditionPhase: phase }
    );
}

function assertCompoundDepth(depth, path){
    if (depth > MAX_CONDITION_NESTING_DEPTH){
        fail('INVALID_CONDITION', `${path} exceeds the condition nesting limit.`, { path, maxDepth: MAX_CONDITION_NESTING_DEPTH });
    }
}

export function createConditionEvaluator(rawOptions){
    const options = readClosedConditionObject(rawOptions, {
        path: 'conditionEvaluatorOptions',
        allowed: ['registrations'],
        code: 'INVALID_CONDITION_EVALUATOR_CONFIG',
    });
    const rawRegistrations = readDenseConditionArray(
        options.get('registrations'),
        'conditionEvaluatorOptions.registrations',
        'INVALID_CONDITION_EVALUATOR_CONFIG'
    );

    const registrations = new Map();
    for (let index = 0; index < rawRegistrations.length; index++){
        const registration = validateRegistration(rawRegistrations[index], index);
        if (registrations.has(registration.kind)){
            fail('DUPLICATE_CONDITION_KIND', `Duplicate condition registration ${JSON.stringify(registration.kind)}.`, { kind: registration.kind });
        }
        registrations.set(registration.kind, registration);
    }

    function kinds(){
        return Object.freeze([...COMPOUND_KINDS, ...registrations.keys()].sort());
    }

    function has(kind){
        const canonicalKind = assertConditionKind(kind, 'conditionEvaluator.has.kind');
        return COMPOUND_KIND_SET.has(canonicalKind) || registrations.has(canonicalKind);
    }

    function normalizeCondition(rawCondition, path = 'condition', depth = 0){
        assertCompoundDepth(depth, path);
        const base = readClosedConditionObject(rawCondition, {
            path,
            allowed: ['kind', 'params', 'conditions', 'condition'],
            required: ['kind'],
            code: 'INVALID_CONDITION',
        });
        const kind = assertConditionKind(base.get('kind'), `${path}.kind`);

        if (kind === 'all' || kind === 'any'){
            const fields = readClosedConditionObject(rawCondition, {
                path,
                allowed: ['kind', 'conditions'],
                code: 'INVALID_CONDITION',
            });
            const children = readDenseConditionArray(fields.get('conditions'), `${path}.conditions`, 'INVALID_CONDITION');
            if (children.length === 0){
                fail('INVALID_CONDITION', `${path}.conditions must contain at least one condition.`, { path: `${path}.conditions`, kind });
            }
            return Object.freeze({
                kind,
                conditions: Object.freeze(children.map((child, index) => normalizeCondition(child, `${path}.conditions[${index}]`, depth + 1))),
            });
        }

        if (kind === 'not'){
            const fields = readClosedConditionObject(rawCondition, {
                path,
                allowed: ['kind', 'condition'],
                code: 'INVALID_CONDITION',
            });
            return Object.freeze({
                kind,
                condition: normalizeCondition(fields.get('condition'), `${path}.condition`, depth + 1),
            });
        }

        const registration = registrations.get(kind);
        if (!registration){
            fail('UNKNOWN_CONDITION_KIND', `Unknown condition kind ${JSON.stringify(kind)}.`, { path: `${path}.kind`, kind });
        }
        const fields = readClosedConditionObject(rawCondition, {
            path,
            allowed: ['kind', 'params'],
            code: 'INVALID_CONDITION',
        });
        const detachedParams = canonicalizeConditionParams(fields.get('params'), `${path}.params`);

        let validatedParams;
        try {
            validatedParams = Reflect.apply(registration.validateParams, undefined, [detachedParams]);
        }
        catch (error){
            throw enrichConditionError(error, kind, path, 'validate');
        }
        if (isConditionPromiseLike(validatedParams, `${path}.validateParams`, 'INVALID_CONDITION_PARAMS')){
            fail('INVALID_CONDITION_PARAMS', 'Condition parameter validators must not return a Promise or thenable.', { conditionKind: kind, conditionPath: path, conditionPhase: 'validate' });
        }

        return Object.freeze({
            kind,
            params: canonicalizeConditionParams(validatedParams, `${path}.validatedParams`),
        });
    }

    function evaluateNormalized(condition, path){
        if (condition.kind === 'all'){
            const reasons = [];
            for (let index = 0; index < condition.conditions.length; index++){
                const result = evaluateNormalized(condition.conditions[index], `${path}.conditions[${index}]`);
                if (result.status === 'failed') reasons.push(...result.reasons);
            }
            return reasons.length === 0 ? conditionSatisfied() : conditionFailed(reasons);
        }

        if (condition.kind === 'any'){
            const alternatives = [];
            for (let index = 0; index < condition.conditions.length; index++){
                const result = evaluateNormalized(condition.conditions[index], `${path}.conditions[${index}]`);
                if (result.status === 'satisfied') return conditionSatisfied();
                alternatives.push({ index, reasons: result.reasons });
            }
            return conditionFailed([
                {
                    code: 'condition.any.failed',
                    details: { alternatives },
                },
            ]);
        }

        if (condition.kind === 'not'){
            const result = evaluateNormalized(condition.condition, `${path}.condition`);
            return result.status === 'failed'
                ? conditionSatisfied()
                : conditionFailed([
                    {
                        code: 'condition.not.failed',
                        details: { conditionKind: condition.condition.kind },
                    },
                ]);
        }

        const registration = registrations.get(condition.kind);
        let rawOutcome;
        try {
            rawOutcome = Reflect.apply(registration.evaluate, undefined, [condition.params]);
        }
        catch (error){
            throw enrichConditionError(error, condition.kind, path, 'evaluate');
        }
        if (isConditionPromiseLike(rawOutcome, `${path}.evaluate`, 'INVALID_CONDITION_RESULT')){
            fail('INVALID_CONDITION_RESULT', 'Condition evaluators must not return a Promise or thenable.', { conditionKind: condition.kind, conditionPath: path, conditionPhase: 'evaluate' });
        }
        try {
            return normalizeConditionOutcome(rawOutcome, `${path}.outcome`);
        }
        catch (error){
            throw enrichConditionError(error, condition.kind, path, 'result');
        }
    }

    function evaluate(rawCondition){
        const condition = normalizeCondition(rawCondition);
        return evaluateNormalized(condition, 'condition');
    }

    return Object.freeze({ evaluate, has, kinds });
}
