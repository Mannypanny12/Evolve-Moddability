import { EngineContractError } from '../identity.mjs';
import { inertDataPath, inspectPlainInertObject } from '../contracts/inert-data.mjs';
import { createQueuedWorkItemRecord } from './work-item-contract.mjs';

const WORK_ITEM_FIELDS = Object.freeze(['command', 'remaining', 'unitsPerSlot']);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function readClosedObject(value, { path, allowed, code }){
    const fields = inspectPlainInertObject(value, { path, code });
    const allowedSet = new Set(allowed);
    for (const key of fields.keys()){
        if (!allowedSet.has(key)){
            fail(code, `${path} contains unsupported field ${JSON.stringify(key)}.`, {
                path: inertDataPath(path, key),
                field: key,
            });
        }
    }
    for (const key of allowed){
        if (!fields.has(key)){
            fail(code, `${path} is missing required field ${JSON.stringify(key)}.`, {
                path: inertDataPath(path, key),
                field: key,
            });
        }
    }
    return fields;
}

function assertPositiveSafeInteger(value, path){
    if (!Number.isSafeInteger(value) || value <= 0){
        fail(
            'INVALID_QUEUED_WORK_ITEM',
            `${path} must be a positive safe integer.`,
            { path, value }
        );
    }
    return value;
}

function assertPrepareCapability(value){
    if (typeof value !== 'function'){
        fail(
            'INVALID_WORK_ITEM_PREPARER',
            'createQueuedWorkItem requires the CommandBus.prepare capability.',
            { valueType: typeof value }
        );
    }
    return value;
}

export function createQueuedWorkItem(rawWorkItem, prepareCommand){
    const fields = readClosedObject(rawWorkItem, {
        path: 'workItem',
        allowed: WORK_ITEM_FIELDS,
        code: 'INVALID_QUEUED_WORK_ITEM',
    });
    const remaining = assertPositiveSafeInteger(fields.get('remaining'), 'workItem.remaining');
    const unitsPerSlot = assertPositiveSafeInteger(fields.get('unitsPerSlot'), 'workItem.unitsPerSlot');
    const prepare = assertPrepareCapability(prepareCommand);

    const command = Reflect.apply(prepare, undefined, [fields.get('command')]);
    return createQueuedWorkItemRecord(command, remaining, unitsPerSlot);
}
