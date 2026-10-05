import { EngineContractError } from '../identity.mjs';
import {
    canonicalizeConditionParams,
    readClosedConditionObject,
    readDenseConditionArray,
} from './common.mjs';

const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function normalizeReason(rawReason, index, basePath = 'conditionOutcome.reasons'){
    const path = `${basePath}[${index}]`;
    const fields = readClosedConditionObject(rawReason, {
        path,
        allowed: ['code', 'details'],
        code: 'INVALID_CONDITION_RESULT',
    });
    const code = fields.get('code');
    if (typeof code !== 'string' || !REASON_CODE_PATTERN.test(code)){
        fail('INVALID_CONDITION_RESULT', `${path}.code must be a stable lowercase reason code.`, { path: `${path}.code`, value: code });
    }
    const rawDetails = fields.get('details');
    const details = rawDetails === null
        ? null
        : canonicalizeConditionParams(rawDetails, `${path}.details`);
    return Object.freeze({ code, details });
}

function normalizeReasons(rawReasons, basePath = 'conditionOutcome.reasons', allowEmpty = false){
    const values = readDenseConditionArray(rawReasons, basePath, 'INVALID_CONDITION_RESULT');
    if (!allowEmpty && values.length === 0){
        fail('INVALID_CONDITION_RESULT', 'Failed condition results must contain at least one reason.', { path: basePath });
    }
    return Object.freeze(values.map((reason, index) => normalizeReason(reason, index, basePath)));
}

export function conditionSatisfied(){
    return Object.freeze({ status: 'satisfied', reasons: Object.freeze([]) });
}

export function conditionFailed(reasons){
    return Object.freeze({ status: 'failed', reasons: normalizeReasons(reasons) });
}

export function normalizeConditionOutcome(rawOutcome, path = 'conditionOutcome'){
    const fields = readClosedConditionObject(rawOutcome, {
        path,
        allowed: ['status', 'reasons'],
        code: 'INVALID_CONDITION_RESULT',
    });
    const status = fields.get('status');
    if (status === 'satisfied'){
        const reasons = normalizeReasons(fields.get('reasons'), `${path}.reasons`, true);
        if (reasons.length !== 0){
            fail('INVALID_CONDITION_RESULT', 'Satisfied condition results may not contain failure reasons.', { path: `${path}.reasons` });
        }
        return Object.freeze({ status, reasons });
    }
    if (status === 'failed'){
        return Object.freeze({
            status,
            reasons: normalizeReasons(fields.get('reasons'), `${path}.reasons`),
        });
    }
    fail('INVALID_CONDITION_RESULT', 'Condition outcome status must be "satisfied" or "failed".', { path: `${path}.status`, status });
}
