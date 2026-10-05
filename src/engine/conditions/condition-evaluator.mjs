import { EngineContractError } from '../identity.mjs';
import {
    MAX_CONDITION_DEFINITION_DATA_NESTING_DEPTH,
    MAX_CONDITION_NESTING_DEPTH,
    assertConditionKind,
    assertSynchronousConditionFunction,
    canonicalizeConditionData,
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
export const MAX_COMPOUND_CONDITION_COUNT = 1024;
let evaluationActive = false;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isEngineContractError(value){
    try {
        return value instanceof EngineContractError;
    }
    catch {
        return false;
    }
}

function readOwnDataField(value, field){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(value, field);
    }
    catch {
        return undefined;
    }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
}

function readDiagnosticDetail(details, field){
    return readOwnDataField(details, field);
}

function copyDiagnosticDetails(details, reserved){
    const output = {};
    if (details === null || typeof details !== 'object') return output;

    let keys;
    try {
        keys = Reflect.ownKeys(details);
    }
    catch {
        return { causeDetails: '<uninspectable>' };
    }

    for (const key of keys){
        if (typeof key !== 'string' || reserved.has(key)) continue;
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(details, key);
        }
        catch {
            return { causeDetails: '<uninspectable>' };
        }
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
        Object.defineProperty(output, key, {
            value: descriptor.value,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return output;
}

function genericFailureCode(phase){
    if (phase === 'validate') return 'CONDITION_PARAM_VALIDATOR_FAILURE';
    if (phase === 'result') return 'CONDITION_RESULT_NORMALIZATION_FAILURE';
    return 'CONDITION_EVALUATOR_FAILURE';
}

function enrichConditionError(error, kind, path, phase){
    if (isEngineContractError(error)){
        const causeCodeValue = readOwnDataField(error, 'code');
        const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0
            ? causeCodeValue
            : null;
        const messageValue = readOwnDataField(error, 'message');
        const message = typeof messageValue === 'string' && messageValue.length > 0
            ? messageValue
            : 'Condition contract failed.';
        const causeDetails = readOwnDataField(error, 'details');
        const details = copyDiagnosticDetails(
            causeDetails,
            new Set([
                'conditionKind',
                'conditionPath',
                'conditionPhase',
                'causeCode',
                'causeConditionKind',
                'causeConditionPath',
                'causeConditionPhase',
            ])
        );
        const causeKind = readDiagnosticDetail(causeDetails, 'conditionKind');
        const causePath = readDiagnosticDetail(causeDetails, 'conditionPath');
        const causePhase = readDiagnosticDetail(causeDetails, 'conditionPhase');
        if (causeKind !== undefined && causeKind !== kind) details.causeConditionKind = causeKind;
        if (causePath !== undefined && causePath !== path) details.causeConditionPath = causePath;
        if (causePhase !== undefined && causePhase !== phase) details.causeConditionPhase = causePhase;
        details.conditionKind = kind;
        details.conditionPath = path;
        details.conditionPhase = phase;
        details.causeCode = causeCode;

        return new EngineContractError(
            causeCode || 'CONDITION_CONTRACT_FAILURE',
            `${message} [${kind || '<unresolved>'} @ ${phase}]`,
            details
        );
    }

    return new EngineContractError(
        genericFailureCode(phase),
        `Condition ${phase} phase threw unexpectedly. [${kind || '<unresolved>'}]`,
        { conditionKind: kind, conditionPath: path, conditionPhase: phase }
    );
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
            const children = readDenseConditionArray(
                fields.get('conditions'),
                `${path}.conditions`,
                'INVALID_CONDITION',
                MAX_COMPOUND_CONDITION_COUNT
            );
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
            if (isConditionPromiseLike(validatedParams, `${path}.validateParams`, 'INVALID_CONDITION_PARAMS')){
                fail('INVALID_CONDITION_PARAMS', 'Condition parameter validators must not return a Promise or thenable.', {
                    conditionKind: kind,
                    conditionPath: path,
                    conditionPhase: 'validate',
                });
            }
            validatedParams = canonicalizeConditionParams(validatedParams, `${path}.validatedParams`);
        }
        catch (error){
            throw enrichConditionError(error, kind, path, 'validate');
        }

        return Object.freeze({ kind, params: validatedParams });
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
            if (isConditionPromiseLike(rawOutcome, `${path}.evaluate`, 'INVALID_CONDITION_RESULT')){
                fail('INVALID_CONDITION_RESULT', 'Condition evaluators must not return a Promise or thenable.', {
                    conditionKind: condition.kind,
                    conditionPath: path,
                    conditionPhase: 'evaluate',
                });
            }
        }
        catch (error){
            throw enrichConditionError(error, condition.kind, path, 'evaluate');
        }

        try {
            return normalizeConditionOutcome(rawOutcome, `${path}.outcome`);
        }
        catch (error){
            throw enrichConditionError(error, condition.kind, path, 'result');
        }
    }

    function evaluate(rawCondition){
        if (evaluationActive){
            fail('CONDITION_EVALUATION_REENTRANCY', 'Condition evaluation may not be nested.', {
                conditionPhase: 'evaluate-entry',
            });
        }

        evaluationActive = true;
        try {
            const detachedCondition = canonicalizeConditionData(
                rawCondition,
                'condition',
                MAX_CONDITION_DEFINITION_DATA_NESTING_DEPTH
            );
            const condition = normalizeCondition(detachedCondition);
            return evaluateNormalized(condition, 'condition');
        }
        finally {
            evaluationActive = false;
        }
    }

    return Object.freeze({ evaluate, has, kinds });
}
