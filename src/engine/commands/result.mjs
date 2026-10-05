import { EngineContractError } from '../identity.mjs';
import {
    canonicalizeCommandData,
    canonicalizeCommandPayload,
    readClosedCommandObject,
    readDenseCommandArray,
} from './common.mjs';

const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function normalizeReason(rawReason, index){
    const path = `commandOutcome.reasons[${index}]`;
    const fields = readClosedCommandObject(rawReason, {
        path,
        allowed: ['code', 'details'],
        code: 'INVALID_COMMAND_RESULT',
    });
    const code = fields.get('code');
    if (typeof code !== 'string' || !REASON_CODE_PATTERN.test(code)){
        fail('INVALID_COMMAND_RESULT', `${path}.code must be a stable lowercase reason code.`, { path: `${path}.code`, value: code });
    }
    const rawDetails = fields.get('details');
    const details = rawDetails === null
        ? null
        : canonicalizeCommandPayload(rawDetails, `${path}.details`);
    return Object.freeze({ code, details });
}

function normalizeReasons(rawReasons){
    const values = readDenseCommandArray(rawReasons, 'commandOutcome.reasons', 'INVALID_COMMAND_RESULT');
    if (values.length === 0){
        fail('INVALID_COMMAND_RESULT', 'Rejected command results must contain at least one reason.', { path: 'commandOutcome.reasons' });
    }
    return Object.freeze(values.map((reason, index) => normalizeReason(reason, index)));
}

export function commandSucceeded(data = null){
    const canonicalData = data === null ? null : canonicalizeCommandData(data, 'commandOutcome.data');
    return Object.freeze({ status: 'succeeded', data: canonicalData });
}

export function commandRejected(reasons){
    return Object.freeze({ status: 'rejected', reasons: normalizeReasons(reasons) });
}

export function normalizeCommandOutcome(commandId, rawOutcome){
    const base = readClosedCommandObject(rawOutcome, {
        path: 'commandOutcome',
        allowed: ['status', 'data', 'reasons'],
        required: ['status'],
        code: 'INVALID_COMMAND_RESULT',
    });
    const status = base.get('status');
    if (status === 'succeeded'){
        if (!base.has('data') || base.has('reasons')){
            fail('INVALID_COMMAND_RESULT', 'Succeeded command outcomes require data and may not contain reasons.', { commandId, status });
        }
        const data = base.get('data') === null
            ? null
            : canonicalizeCommandData(base.get('data'), 'commandOutcome.data');
        return Object.freeze({
            commandId,
            status,
            data,
            reasons: Object.freeze([]),
        });
    }
    if (status === 'rejected'){
        if (!base.has('reasons') || base.has('data')){
            fail('INVALID_COMMAND_RESULT', 'Rejected command outcomes require reasons and may not contain data.', { commandId, status });
        }
        return Object.freeze({
            commandId,
            status,
            data: null,
            reasons: normalizeReasons(base.get('reasons')),
        });
    }
    fail('INVALID_COMMAND_RESULT', 'Command outcome status must be "succeeded" or "rejected".', { commandId, status });
}
