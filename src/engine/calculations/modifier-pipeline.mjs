import { EngineContractError } from '../identity.mjs';
import {
    assertCalculationId,
    assertSynchronousCalculationFunction,
    isCalculationPromiseLike,
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

function readOwnDataField(value, field){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, field); }
    catch { return undefined; }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
}

function copyDiagnosticDetails(details, reserved){
    const output = {};
    if (details === null || typeof details !== 'object') return output;
    let keys;
    try { keys = Reflect.ownKeys(details); }
    catch { return { causeDetails: '<uninspectable>' }; }
    for (const key of keys){
        if (typeof key !== 'string' || reserved.has(key)) continue;
        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(details, key); }
        catch { return { causeDetails: '<uninspectable>' }; }
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

function enrichModifierError(error, modifier, modifierPhase){
    if (error instanceof EngineContractError){
        const causeCodeValue = readOwnDataField(error, 'code');
        const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0 ? causeCodeValue : null;
        const messageValue = readOwnDataField(error, 'message');
        const message = typeof messageValue === 'string' && messageValue.length > 0
            ? messageValue
            : 'Modifier contract failed.';
        const causeDetails = readOwnDataField(error, 'details');
        const details = copyDiagnosticDetails(
            causeDetails,
            new Set(['calculationId', 'modifierId', 'modifierPhase', 'causeCode'])
        );
        details.calculationId = modifier.calculationId;
        details.modifierId = modifier.id;
        details.modifierPhase = modifierPhase;
        details.causeCode = causeCode;
        return new EngineContractError(
            causeCode || 'MODIFIER_CONTRACT_FAILURE',
            `${message} [${modifier.id} @ ${modifierPhase}]`,
            details
        );
    }

    const code = modifierPhase === 'applies'
        ? 'MODIFIER_APPLIES_FAILURE'
        : modifierPhase === 'operand'
            ? 'MODIFIER_OPERAND_FAILURE'
            : 'MODIFIER_APPLICATION_FAILURE';
    return new EngineContractError(
        code,
        `Modifier ${modifierPhase} phase threw unexpectedly. [${modifier.id}]`,
        {
            calculationId: modifier.calculationId,
            modifierId: modifier.id,
            modifierPhase,
        }
    );
}

function normalizeModifierNumber(value, path, code, modifier){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail(code, `${path} must be a finite number.`, {
            calculationId: modifier.calculationId,
            modifierId: modifier.id,
            modifierPhase: path.includes('operand') ? 'operand' : 'apply',
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function applyOperation(before, operation, operand, modifier){
    let rawAfter;
    switch (operation){
        case 'add': rawAfter = before + operand; break;
        case 'multiply': rawAfter = before * operand; break;
        case 'override': rawAfter = operand; break;
        case 'cap': rawAfter = Math.min(before, operand); break;
        case 'floor': rawAfter = Math.max(before, operand); break;
        default:
            fail('INVALID_MODIFIER_OPERATION', `Unsupported modifier operation ${JSON.stringify(operation)}.`, {
                calculationId: modifier.calculationId,
                modifierId: modifier.id,
                operation,
            });
    }
    return normalizeModifierNumber(rawAfter, 'modifier.result', 'INVALID_MODIFIER_RESULT', modifier);
}

function normalizeRegistration(rawRegistration, index, calculations){
    const path = `calculationEngine.modifiers[${index}]`;
    const fields = readClosedCalculationObject(rawRegistration, {
        path,
        allowed: ['id', 'calculationId', 'order', 'operation', 'applies', 'operand'],
        required: ['id', 'calculationId', 'order', 'operation', 'operand'],
        code: 'INVALID_MODIFIER_REGISTRATION',
    });
    const id = assertModifierId(fields.get('id'), `${path}.id`);
    const calculationId = assertCalculationId(fields.get('calculationId'), `${path}.calculationId`);
    const target = calculations.get(calculationId);
    if (!target){
        fail('UNKNOWN_MODIFIER_CALCULATION_ID', `Modifier ${JSON.stringify(id)} targets unknown calculation ${JSON.stringify(calculationId)}.`, {
            modifierId: id,
            calculationId,
        });
    }
    const operation = assertModifierOperation(fields.get('operation'), `${path}.operation`);
    if (operation === 'override' && target.allowOverride !== true){
        fail('MODIFIER_OVERRIDE_NOT_ALLOWED', `Calculation ${JSON.stringify(calculationId)} does not allow override modifiers.`, {
            modifierId: id,
            calculationId,
        });
    }
    return Object.freeze({
        id,
        calculationId,
        order: assertModifierOrder(fields.get('order'), `${path}.order`),
        operation,
        applies: fields.has('applies')
            ? assertSynchronousCalculationFunction(fields.get('applies'), `${path}.applies`, 'INVALID_MODIFIER_REGISTRATION')
            : null,
        operand: assertSynchronousCalculationFunction(fields.get('operand'), `${path}.operand`, 'INVALID_MODIFIER_REGISTRATION'),
    });
}

function compareModifiers(a, b){
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createModifierPipeline(rawModifiers, calculations){
    const modifierValues = readDenseCalculationArray(
        rawModifiers,
        'calculationEngine.modifiers',
        'INVALID_CALCULATION_ENGINE_CONFIG'
    );
    const byId = new Map();
    const byCalculation = new Map();

    for (let index = 0; index < modifierValues.length; index++){
        const modifier = normalizeRegistration(modifierValues[index], index, calculations);
        if (byId.has(modifier.id)){
            fail('DUPLICATE_MODIFIER_ID', `Duplicate modifier registration ${JSON.stringify(modifier.id)}.`, {
                modifierId: modifier.id,
            });
        }
        byId.set(modifier.id, modifier);
        const list = byCalculation.get(modifier.calculationId) || [];
        list.push(modifier);
        byCalculation.set(modifier.calculationId, list);
    }

    for (const [calculationId, list] of byCalculation){
        byCalculation.set(calculationId, Object.freeze([...list].sort(compareModifiers)));
    }

    function apply(calculationId, inputs, rawBaseValue, trace = false){
        const modifiers = byCalculation.get(calculationId) || [];
        let value = normalizeModifierNumber(rawBaseValue, 'modifier.baseValue', 'INVALID_MODIFIER_RESULT', {
            id: '<base>',
            calculationId,
        });
        const steps = trace ? [] : null;

        for (const modifier of modifiers){
            const before = value;
            let applied = true;
            if (modifier.applies){
                let rawApplied;
                try {
                    rawApplied = Reflect.apply(modifier.applies, undefined, [inputs]);
                }
                catch (error){
                    throw enrichModifierError(error, modifier, 'applies');
                }
                if (isCalculationPromiseLike(rawApplied, 'modifier.applies', 'INVALID_MODIFIER_APPLIES_RESULT')){
                    fail('INVALID_MODIFIER_APPLIES_RESULT', 'Modifier applies callbacks must not return a Promise or thenable.', {
                        calculationId,
                        modifierId: modifier.id,
                        modifierPhase: 'applies',
                    });
                }
                if (typeof rawApplied !== 'boolean'){
                    fail('INVALID_MODIFIER_APPLIES_RESULT', 'Modifier applies callbacks must return exactly true or false.', {
                        calculationId,
                        modifierId: modifier.id,
                        modifierPhase: 'applies',
                        valueType: typeof rawApplied,
                    });
                }
                applied = rawApplied;
            }

            if (!applied){
                if (trace){
                    steps.push(Object.freeze({
                        kind: 'modifier',
                        modifierId: modifier.id,
                        operation: modifier.operation,
                        order: modifier.order,
                        applied: false,
                        operand: null,
                        before,
                        after: before,
                    }));
                }
                continue;
            }

            let rawOperand;
            try {
                rawOperand = Reflect.apply(modifier.operand, undefined, [inputs]);
            }
            catch (error){
                throw enrichModifierError(error, modifier, 'operand');
            }
            if (isCalculationPromiseLike(rawOperand, 'modifier.operand', 'INVALID_MODIFIER_OPERAND')){
                fail('INVALID_MODIFIER_OPERAND', 'Modifier operand callbacks must not return a Promise or thenable.', {
                    calculationId,
                    modifierId: modifier.id,
                    modifierPhase: 'operand',
                });
            }
            const operand = normalizeModifierNumber(rawOperand, 'modifier.operand', 'INVALID_MODIFIER_OPERAND', modifier);
            value = applyOperation(before, modifier.operation, operand, modifier);

            if (trace){
                steps.push(Object.freeze({
                    kind: 'modifier',
                    modifierId: modifier.id,
                    operation: modifier.operation,
                    order: modifier.order,
                    applied: true,
                    operand,
                    before,
                    after: value,
                }));
            }
        }

        return Object.freeze({
            value,
            steps: trace ? Object.freeze(steps) : null,
        });
    }

    return Object.freeze({ apply });
}
