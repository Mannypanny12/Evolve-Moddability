import { EngineContractError } from '../identity.mjs';
import {
    readClosedCalculationObject,
    readDenseCalculationArray,
} from './common.mjs';

export const RESOURCE_CAPACITY_MODES = Object.freeze(['bounded', 'unbounded']);
export const RESOURCE_DELTA_KINDS = Object.freeze(['credit', 'debit']);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function assertResourceMagnitude(value, path = 'resourceMagnitude', code = 'INVALID_RESOURCE_MAGNITUDE'){
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0){
        fail(code, `${path} must be a non-negative finite number.`, {
            path,
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

export function normalizeResourceCapacity(rawCapacity, path = 'resourceCapacity'){
    const fields = readClosedCalculationObject(rawCapacity, {
        path,
        allowed: ['mode', 'value'],
        required: ['mode'],
        code: 'INVALID_RESOURCE_CAPACITY',
    });
    const mode = fields.get('mode');
    if (!RESOURCE_CAPACITY_MODES.includes(mode)){
        fail('INVALID_RESOURCE_CAPACITY', `${path}.mode must be "bounded" or "unbounded".`, {
            path: `${path}.mode`,
            mode,
        });
    }

    if (mode === 'bounded'){
        if (!fields.has('value')){
            fail('INVALID_RESOURCE_CAPACITY', `${path}.value is required for bounded capacity.`, {
                path: `${path}.value`,
            });
        }
        return Object.freeze({
            mode,
            value: assertResourceMagnitude(fields.get('value'), `${path}.value`, 'INVALID_RESOURCE_CAPACITY'),
        });
    }

    if (fields.has('value')){
        fail('INVALID_RESOURCE_CAPACITY', `${path}.value is not allowed for unbounded capacity.`, {
            path: `${path}.value`,
        });
    }
    return Object.freeze({ mode });
}

export function normalizeResourceDeltaOperations(rawOperations, path = 'resourceDelta.operations'){
    const operations = readDenseCalculationArray(rawOperations, path, 'INVALID_RESOURCE_DELTA');
    const seenOperationObjects = new WeakSet();
    return Object.freeze(operations.map((rawOperation, index) => {
        const operationPath = `${path}[${index}]`;
        if ((typeof rawOperation === 'object' && rawOperation !== null) || typeof rawOperation === 'function'){
            if (seenOperationObjects.has(rawOperation)){
                fail('INVALID_RESOURCE_DELTA', `${operationPath} must not reuse an earlier operation object identity.`, {
                    path: operationPath,
                    index,
                });
            }
            seenOperationObjects.add(rawOperation);
        }
        const fields = readClosedCalculationObject(rawOperation, {
            path: operationPath,
            allowed: ['kind', 'amount'],
            required: ['kind', 'amount'],
            code: 'INVALID_RESOURCE_DELTA',
        });
        const kind = fields.get('kind');
        if (!RESOURCE_DELTA_KINDS.includes(kind)){
            fail('INVALID_RESOURCE_DELTA', `${operationPath}.kind must be "credit" or "debit".`, {
                path: `${operationPath}.kind`,
                kind,
            });
        }
        const amount = assertResourceMagnitude(
            fields.get('amount'),
            `${operationPath}.amount`,
            'INVALID_RESOURCE_DELTA'
        );
        return Object.freeze({ kind, amount });
    }));
}
