import {
    assertCalculationId,
    canonicalizeCalculationInputs,
    readClosedCalculationObject,
} from './common.mjs';

export function normalizeCalculationContext(rawContext){
    const fields = readClosedCalculationObject(rawContext, {
        path: 'calculation',
        allowed: ['id', 'inputs'],
        code: 'INVALID_CALCULATION_CONTEXT',
    });
    return Object.freeze({
        id: assertCalculationId(fields.get('id'), 'calculation.id'),
        inputs: canonicalizeCalculationInputs(fields.get('inputs'), 'calculation.inputs'),
    });
}
