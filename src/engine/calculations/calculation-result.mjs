import { EngineContractError } from '../identity.mjs';
import { assertCalculationId, canonicalizeCalculationInputs } from './common.mjs';

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
    const value = normalizeCalculationValue(rawValue);
    const trace = options.trace === true
        ? createBaseTrace(options.inputs, value)
        : null;
    return Object.freeze({ calculationId: canonicalCalculationId, value, trace });
}
