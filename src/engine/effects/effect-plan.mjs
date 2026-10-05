import {
    assertEffectOperationKind,
    readDenseEffectArray,
    readEffectObjectFields,
    requireEffectField,
} from './common.mjs';
import { normalizeCoreEffectOperation } from './core-operations.mjs';

export function createEffectPlan(operations){
    const input = readDenseEffectArray(
        operations,
        'effectPlan.operations',
        'INVALID_EFFECT_PLAN'
    );

    const output = [];
    for (let index = 0; index < input.length; index++){
        const path = `effectPlan.operations[${index}]`;
        const fields = readEffectObjectFields(
            input[index],
            path,
            'INVALID_EFFECT_OPERATION'
        );
        const kind = assertEffectOperationKind(
            requireEffectField(fields, 'kind', path, 'INVALID_EFFECT_OPERATION'),
            `${path}.kind`
        );
        output.push(normalizeCoreEffectOperation(fields, kind, path));
    }

    return Object.freeze({
        operations: Object.freeze(output),
    });
}
