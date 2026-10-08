import { EngineContractError } from '../identity.mjs';
import {
    assertCalculationId,
    assertSynchronousCalculationFunction,
    canonicalizeCalculationInputs,
    isCalculationPromiseLike,
    readClosedCalculationObject,
    readDenseCalculationArray,
} from './common.mjs';
import { normalizeCalculationContext } from './calculation-context.mjs';
import { createCalculationResult, normalizeCalculationValue } from './calculation-result.mjs';
import { createModifierPipeline } from './modifier-pipeline.mjs';

let calculationOperationActive = false;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function readOwnDataField(value, field){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, field); }
    catch { return undefined; }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
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

function enrichCalculationError(error, calculationId, phase){
    if (error instanceof EngineContractError){
        const causeCodeValue = readOwnDataField(error, 'code');
        const causeCode = typeof causeCodeValue === 'string' && causeCodeValue.length > 0 ? causeCodeValue : null;
        const messageValue = readOwnDataField(error, 'message');
        const message = typeof messageValue === 'string' && messageValue.length > 0
            ? messageValue
            : 'Calculation contract failed.';
        const causeDetails = readOwnDataField(error, 'details');
        const details = copyDiagnosticDetails(
            causeDetails,
            new Set(['calculationId', 'phase', 'causeCode', 'causeCalculationId', 'causePhase'])
        );
        const causeCalculationId = readOwnDataField(causeDetails, 'calculationId');
        const causePhase = readOwnDataField(causeDetails, 'phase');
        if (causeCalculationId !== undefined && causeCalculationId !== calculationId){
            details.causeCalculationId = causeCalculationId;
        }
        if (causePhase !== undefined && causePhase !== phase) details.causePhase = causePhase;
        details.calculationId = calculationId;
        details.phase = phase;
        details.causeCode = causeCode;
        return new EngineContractError(
            causeCode || 'CALCULATION_CONTRACT_FAILURE',
            `${message} [${calculationId || '<unresolved>'} @ ${phase}]`,
            details
        );
    }

    const code = phase === 'validate'
        ? 'CALCULATION_INPUT_VALIDATOR_FAILURE'
        : phase === 'modify'
            ? 'CALCULATION_MODIFIER_FAILURE'
            : 'CALCULATION_EVALUATOR_FAILURE';
    return new EngineContractError(
        code,
        `Calculation ${phase} phase threw unexpectedly. [${calculationId || '<unresolved>'}]`,
        { calculationId, phase }
    );
}

function validateRegistration(rawRegistration, index){
    const path = `calculationEngine.registrations[${index}]`;
    const fields = readClosedCalculationObject(rawRegistration, {
        path,
        allowed: ['id', 'validateInputs', 'calculateBase', 'allowOverride'],
        required: ['id', 'validateInputs', 'calculateBase'],
        code: 'INVALID_CALCULATION_REGISTRATION',
    });
    const allowOverride = fields.has('allowOverride') ? fields.get('allowOverride') : false;
    if (typeof allowOverride !== 'boolean'){
        fail('INVALID_CALCULATION_REGISTRATION', `${path}.allowOverride must be a boolean when provided.`, {
            path: `${path}.allowOverride`,
            valueType: typeof allowOverride,
        });
    }
    return Object.freeze({
        id: assertCalculationId(fields.get('id'), `${path}.id`),
        validateInputs: assertSynchronousCalculationFunction(
            fields.get('validateInputs'),
            `${path}.validateInputs`
        ),
        calculateBase: assertSynchronousCalculationFunction(
            fields.get('calculateBase'),
            `${path}.calculateBase`
        ),
        allowOverride,
    });
}

export function createCalculationEngine(rawOptions){
    const options = readClosedCalculationObject(rawOptions, {
        path: 'calculationEngineOptions',
        allowed: ['registrations', 'modifiers'],
        required: ['registrations'],
        code: 'INVALID_CALCULATION_ENGINE_CONFIG',
    });
    const rawRegistrations = readDenseCalculationArray(
        options.get('registrations'),
        'calculationEngineOptions.registrations',
        'INVALID_CALCULATION_ENGINE_CONFIG'
    );
    const rawModifiers = options.has('modifiers')
        ? readDenseCalculationArray(
            options.get('modifiers'),
            'calculationEngineOptions.modifiers',
            'INVALID_CALCULATION_ENGINE_CONFIG'
        )
        : [];

    const registrations = new Map();
    for (let index = 0; index < rawRegistrations.length; index++){
        const registration = validateRegistration(rawRegistrations[index], index);
        if (registrations.has(registration.id)){
            fail('DUPLICATE_CALCULATION_ID', `Duplicate calculation registration ${JSON.stringify(registration.id)}.`, {
                calculationId: registration.id,
            });
        }
        registrations.set(registration.id, registration);
    }
    const modifierPipeline = createModifierPipeline(rawModifiers, registrations);

    function ids(){
        return Object.freeze([...registrations.keys()].sort());
    }

    function has(id){
        return registrations.has(assertCalculationId(id, 'calculationEngine.has.id'));
    }

    function run(rawContext, trace){
        if (calculationOperationActive){
            fail('CALCULATION_REENTRANCY', 'Calculation evaluation may not be nested.', {
                phase: trace ? 'explain' : 'calculate',
            });
        }
        calculationOperationActive = true;
        let calculationId = null;
        let phase = 'context';
        try {
            const context = normalizeCalculationContext(rawContext);
            calculationId = context.id;

            phase = 'resolve';
            const registration = registrations.get(calculationId);
            if (!registration){
                fail('UNKNOWN_CALCULATION_ID', `Unknown calculation ID ${JSON.stringify(calculationId)}.`, {
                    calculationId,
                });
            }

            phase = 'validate';
            let validatedInputs;
            try {
                validatedInputs = Reflect.apply(registration.validateInputs, undefined, [context.inputs]);
            }
            catch (error){
                throw enrichCalculationError(error, calculationId, phase);
            }
            if (isCalculationPromiseLike(validatedInputs, 'calculation.validateInputs', 'INVALID_CALCULATION_INPUTS')){
                fail('INVALID_CALCULATION_INPUTS', 'Calculation input validators must not return a Promise or thenable.', {
                    calculationId,
                    phase,
                });
            }
            const inputs = canonicalizeCalculationInputs(validatedInputs, 'calculation.validatedInputs');

            phase = 'calculate';
            let rawBaseValue;
            try {
                rawBaseValue = Reflect.apply(registration.calculateBase, undefined, [inputs]);
            }
            catch (error){
                throw enrichCalculationError(error, calculationId, phase);
            }
            if (isCalculationPromiseLike(rawBaseValue, 'calculation.calculateBase', 'INVALID_CALCULATION_RESULT')){
                fail('INVALID_CALCULATION_RESULT', 'Calculation base evaluators must not return a Promise or thenable.', {
                    calculationId,
                    phase,
                });
            }

            phase = 'result';
            const baseValue = normalizeCalculationValue(rawBaseValue, 'calculation.baseValue');

            phase = 'modify';
            const modified = modifierPipeline.apply(calculationId, inputs, baseValue, trace);

            phase = 'result';
            const resultOptions = trace
                ? { trace: true, inputs, baseValue, modifierSteps: modified.steps }
                : { trace: false, inputs };
            return createCalculationResult(calculationId, modified.value, resultOptions);
        }
        catch (error){
            if (error instanceof EngineContractError){
                const details = readOwnDataField(error, 'details');
                const errorPhase = readOwnDataField(details, 'phase');
                if (errorPhase === phase) throw error;
                throw enrichCalculationError(error, calculationId, phase);
            }
            throw enrichCalculationError(error, calculationId, phase);
        }
        finally {
            calculationOperationActive = false;
        }
    }

    return Object.freeze({
        calculate(rawContext){ return run(rawContext, false); },
        explain(rawContext){ return run(rawContext, true); },
        has,
        ids,
    });
}
