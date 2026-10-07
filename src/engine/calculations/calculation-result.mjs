import { EngineContractError } from '../identity.mjs';
import {
    assertCalculationId,
    canonicalizeCalculationInputs,
    readClosedCalculationObject,
} from './common.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function normalizeCalculationValue(value, path = 'calculationResult.value'){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_CALCULATION_RESULT', `${path} must be a finite number.`, {
            path,
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function normalizeCalculationResultOptions(rawOptions){
    const fields = readClosedCalculationObject(rawOptions, {
        path: 'calculationResultOptions',
        allowed: ['trace', 'inputs'],
        required: [],
        code: 'INVALID_CALCULATION_RESULT_OPTIONS',
    });
    const trace = fields.has('trace') ? fields.get('trace') : false;
    if (typeof trace !== 'boolean'){
        fail(
            'INVALID_CALCULATION_RESULT_OPTIONS',
            'calculationResultOptions.trace must be a boolean when provided.',
            { path: 'calculationResultOptions.trace', valueType: typeof trace }
        );
    }
    if (trace && !fields.has('inputs')){
        fail(
            'INVALID_CALCULATION_RESULT_OPTIONS',
            'calculationResultOptions.inputs is required when trace is enabled.',
            { path: 'calculationResultOptions.inputs' }
        );
    }
    return Object.freeze({
        trace,
        inputs: fields.has('inputs') ? fields.get('inputs') : undefined,
    });
}

function createBaseTrace(inputs, value){
    const traceInputs = canonicalizeCalculationInputs(inputs, 'calculationTrace.inputs');
    const step = Object.freeze({
        kind: 'base',
        before: null,
        after: value,
    });
    return Object.freeze({
        inputs: traceInputs,
        steps: Object.freeze([step]),
    });
}

export function createCalculationResult(calculationId, rawValue, options = {}){
    const canonicalCalculationId = assertCalculationId(
        calculationId,
        'calculationResult.calculationId'
    );
    const normalizedOptions = normalizeCalculationResultOptions(options);
    const value = normalizeCalculationValue(rawValue);
    const trace = normalizedOptions.trace
        ? createBaseTrace(normalizedOptions.inputs, value)
        : null;
    return Object.freeze({ calculationId: canonicalCalculationId, value, trace });
}
