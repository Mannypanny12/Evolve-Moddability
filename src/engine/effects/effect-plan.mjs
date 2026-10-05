import { EngineContractError } from '../identity.mjs';
import {
    assertEffectOperationKind,
    readClosedEffectObject,
    readDenseEffectArray,
} from './common.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function createEffectPlan(operations){
    const input = readDenseEffectArray(
        operations,
        'effectPlan.operations',
        'INVALID_EFFECT_PLAN'
    );

    const output = [];
    for (let index = 0; index < input.length; index++){
        const path = `effectPlan.operations[${index}]`;
        const fields = readClosedEffectObject(input[index], {
            path,
            allowed: ['kind'],
            required: ['kind'],
            code: 'INVALID_EFFECT_OPERATION',
        });
        const kind = assertEffectOperationKind(fields.get('kind'), `${path}.kind`);
        fail(
            'UNSUPPORTED_EFFECT_OPERATION_KIND',
            `${path}.kind is not supported by the M3C1 effect-plan foundation.`,
            { path: `${path}.kind`, kind }
        );
    }

    return Object.freeze({
        operations: Object.freeze(output),
    });
}
