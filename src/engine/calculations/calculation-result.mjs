import { EngineContractError } from '../identity.mjs';
import {
    assertCalculationId,
    canonicalizeCalculationInputs,
    readClosedCalculationObject,
    readDenseCalculationArray,
} from './common.mjs';
import {
    assertModifierId,
    assertModifierOperation,
    assertModifierOrder,
} from './modifier-contract.mjs';

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
        allowed: ['trace', 'inputs', 'baseValue', 'modifierSteps'],
        required: [],
        code: 'INVALID_CALCULATION_RESULT_OPTIONS',
    });
    const trace = fields.has('trace') ? fields.get('trace') : false;
    if (typeof trace !== 'boolean'){
        fail('INVALID_CALCULATION_RESULT_OPTIONS', 'calculationResultOptions.trace must be a boolean when provided.', {
            path: 'calculationResultOptions.trace',
            valueType: typeof trace,
        });
    }
    if (trace && !fields.has('inputs')){
        fail('INVALID_CALCULATION_RESULT_OPTIONS', 'calculationResultOptions.inputs is required when trace is enabled.', {
            path: 'calculationResultOptions.inputs',
        });
    }
    if (trace && fields.has('modifierSteps') && !fields.has('baseValue')){
        fail('INVALID_CALCULATION_RESULT_OPTIONS', 'calculationResultOptions.baseValue is required when modifierSteps are provided.', {
            path: 'calculationResultOptions.baseValue',
        });
    }
    if (!trace && (fields.has('baseValue') || fields.has('modifierSteps'))){
        fail('INVALID_CALCULATION_RESULT_OPTIONS', 'Trace-only calculation result fields require trace: true.', {
            path: 'calculationResultOptions',
        });
    }
    return Object.freeze({
        trace,
        inputs: fields.has('inputs') ? fields.get('inputs') : undefined,
        baseValue: fields.has('baseValue') ? fields.get('baseValue') : undefined,
        modifierSteps: fields.has('modifierSteps') ? fields.get('modifierSteps') : undefined,
    });
}

function traceOperation(before, operation, operand){
    let rawAfter;
    switch (operation){
        case 'add': rawAfter = before + operand; break;
        case 'multiply': rawAfter = before * operand; break;
        case 'override': rawAfter = operand; break;
        case 'cap': rawAfter = Math.min(before, operand); break;
        case 'floor': rawAfter = Math.max(before, operand); break;
        default: return NaN;
    }
    return Object.is(rawAfter, -0) ? 0 : rawAfter;
}

function normalizeModifierTraceStep(rawStep, index, expectedBefore){
    const path = `calculationTrace.steps[${index + 1}]`;
    const fields = readClosedCalculationObject(rawStep, {
        path,
        allowed: ['kind', 'modifierId', 'operation', 'order', 'applied', 'operand', 'before', 'after'],
        code: 'INVALID_CALCULATION_TRACE',
    });
    if (fields.get('kind') !== 'modifier'){
        fail('INVALID_CALCULATION_TRACE', `${path}.kind must be "modifier".`, { path: `${path}.kind` });
    }
    const modifierId = assertModifierId(fields.get('modifierId'), `${path}.modifierId`);
    const operation = assertModifierOperation(fields.get('operation'), `${path}.operation`);
    const order = assertModifierOrder(fields.get('order'), `${path}.order`);
    const applied = fields.get('applied');
    if (typeof applied !== 'boolean'){
        fail('INVALID_CALCULATION_TRACE', `${path}.applied must be a boolean.`, { path: `${path}.applied` });
    }
    const before = normalizeCalculationValue(fields.get('before'), `${path}.before`);
    const after = normalizeCalculationValue(fields.get('after'), `${path}.after`);
    if (before !== expectedBefore){
        fail('INVALID_CALCULATION_TRACE', `${path}.before does not continue the previous trace step.`, {
            path: `${path}.before`,
            expected: expectedBefore,
            actual: before,
        });
    }

    let operand = null;
    if (applied){
        operand = normalizeCalculationValue(fields.get('operand'), `${path}.operand`);
        const expectedAfter = traceOperation(before, operation, operand);
        if (!Number.isFinite(expectedAfter) || after !== expectedAfter){
            fail('INVALID_CALCULATION_TRACE', `${path}.after does not match its modifier operation.`, {
                path: `${path}.after`,
                before,
                operation,
                operand,
                expected: Number.isFinite(expectedAfter) ? expectedAfter : undefined,
                actual: after,
            });
        }
    }
    else {
        if (fields.get('operand') !== null){
            fail('INVALID_CALCULATION_TRACE', `${path}.operand must be null for a skipped modifier.`, {
                path: `${path}.operand`,
            });
        }
        if (after !== before){
            fail('INVALID_CALCULATION_TRACE', `${path}.after must equal before for a skipped modifier.`, {
                path: `${path}.after`,
                before,
                after,
            });
        }
    }

    return Object.freeze({
        kind: 'modifier',
        modifierId,
        operation,
        order,
        applied,
        operand,
        before,
        after,
    });
}

function modifierTraceComesAfter(previous, current){
    return current.order > previous.order
        || (current.order === previous.order && current.modifierId > previous.modifierId);
}

function createTrace(inputs, finalValue, baseValue, rawModifierSteps){
    const traceInputs = canonicalizeCalculationInputs(inputs, 'calculationTrace.inputs');
    const normalizedBaseValue = normalizeCalculationValue(
        baseValue === undefined ? finalValue : baseValue,
        'calculationTrace.baseValue'
    );
    const rawSteps = rawModifierSteps === undefined
        ? []
        : readDenseCalculationArray(rawModifierSteps, 'calculationResultOptions.modifierSteps', 'INVALID_CALCULATION_TRACE');
    const steps = [Object.freeze({ kind: 'base', before: null, after: normalizedBaseValue })];
    const seenModifierIds = new Set();
    let previousModifier = null;
    let expectedBefore = normalizedBaseValue;
    for (let index = 0; index < rawSteps.length; index++){
        const step = normalizeModifierTraceStep(rawSteps[index], index, expectedBefore);
        if (seenModifierIds.has(step.modifierId)){
            fail('INVALID_CALCULATION_TRACE', `Modifier trace contains duplicate modifier ${JSON.stringify(step.modifierId)}.`, {
                path: `calculationTrace.steps[${index + 1}].modifierId`,
                modifierId: step.modifierId,
            });
        }
        if (previousModifier && !modifierTraceComesAfter(previousModifier, step)){
            fail('INVALID_CALCULATION_TRACE', 'Modifier trace does not follow deterministic (order, modifierId) ordering.', {
                path: `calculationTrace.steps[${index + 1}]`,
                previousModifierId: previousModifier.modifierId,
                previousOrder: previousModifier.order,
                modifierId: step.modifierId,
                order: step.order,
            });
        }
        seenModifierIds.add(step.modifierId);
        previousModifier = step;
        steps.push(step);
        expectedBefore = step.after;
    }
    if (expectedBefore !== finalValue){
        fail('INVALID_CALCULATION_TRACE', 'Final trace value must equal calculationResult.value.', {
            expected: finalValue,
            actual: expectedBefore,
        });
    }
    return Object.freeze({ inputs: traceInputs, steps: Object.freeze(steps) });
}

export function createCalculationResult(calculationId, rawValue, options = {}){
    const canonicalCalculationId = assertCalculationId(calculationId, 'calculationResult.calculationId');
    const normalizedOptions = normalizeCalculationResultOptions(options);
    const value = normalizeCalculationValue(rawValue);
    const trace = normalizedOptions.trace
        ? createTrace(normalizedOptions.inputs, value, normalizedOptions.baseValue, normalizedOptions.modifierSteps)
        : null;
    return Object.freeze({ calculationId: canonicalCalculationId, value, trace });
}
