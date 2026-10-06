import { EngineContractError, parseContentId } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

const WORK_ITEM_FIELDS = Object.freeze(['command', 'remaining', 'unitsPerSlot']);
const PREPARED_COMMAND_FIELDS = Object.freeze(['id', 'payload']);
const MAX_WORK_ITEM_DATA_NESTING_DEPTH = 128;

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

function assertPreparedCommandId(value, path){
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch {
        fail('INVALID_PREPARED_COMMAND', `${path} must be a canonical command content ID.`, {
            path,
            value,
        });
    }
    if (parsed.type !== 'command'){
        fail('INVALID_PREPARED_COMMAND', `${path} must use content type "command".`, {
            path,
            value: parsed.canonical,
        });
    }
    return parsed.canonical;
}

function assertFrozen(value, path){
    let frozen;
    try {
        frozen = Object.isFrozen(value);
    }
    catch {
        fail('INVALID_PREPARED_COMMAND', `${path} could not be safely inspected.`, { path });
    }
    if (!frozen){
        fail('INVALID_PREPARED_COMMAND', `${path} must be frozen before it can become queued work.`, {
            path,
        });
    }
}

function assertFrozenInertData(value, path, context, depth){
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_PREPARED_COMMAND', `${path} must be a finite number.`, { path, value });
        }
        return;
    }
    if (typeof value !== 'object'){
        fail('INVALID_PREPARED_COMMAND', `${path} contains non-inert data.`, {
            path,
            valueType: typeof value,
        });
    }
    if (depth > MAX_WORK_ITEM_DATA_NESTING_DEPTH){
        fail('INVALID_PREPARED_COMMAND', `${path} exceeds the prepared-command nesting limit.`, {
            path,
            maxDepth: MAX_WORK_ITEM_DATA_NESTING_DEPTH,
        });
    }
    if (context.active.has(value)){
        fail('INVALID_PREPARED_COMMAND', `${path} contains a cyclic reference.`, { path });
    }
    if (context.seen.has(value)){
        fail('INVALID_PREPARED_COMMAND', `${path} reuses a data object already present elsewhere.`, {
            path,
            firstPath: context.seen.get(value),
        });
    }
    assertFrozen(value, path);

    context.seen.set(value, path);
    context.active.add(value);
    try {
        let array;
        try {
            array = Array.isArray(value);
        }
        catch {
            fail('INVALID_PREPARED_COMMAND', `${path} could not be safely inspected.`, { path });
        }

        if (array){
            const items = inspectDenseInertArray(value, {
                path,
                code: 'INVALID_PREPARED_COMMAND',
            });
            for (let index = 0; index < items.length; index++){
                assertFrozenInertData(items[index], `${path}[${index}]`, context, depth + 1);
            }
            return;
        }

        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_PREPARED_COMMAND',
        });
        for (const [key, child] of fields){
            assertFrozenInertData(child, inertDataPath(path, key), context, depth + 1);
        }
    }
    finally {
        context.active.delete(value);
    }
}

function assertPreparedCommand(value){
    if (value === null || typeof value !== 'object'){
        fail(
            'INVALID_PREPARED_COMMAND',
            'The command preparer must return a frozen prepared command object.',
            { path: 'workItem.command', valueType: typeof value }
        );
    }
    assertFrozen(value, 'workItem.command');

    const fields = readClosedObject(value, {
        path: 'workItem.command',
        allowed: PREPARED_COMMAND_FIELDS,
        code: 'INVALID_PREPARED_COMMAND',
    });
    const id = assertPreparedCommandId(fields.get('id'), 'workItem.command.id');
    const payload = fields.get('payload');

    inspectPlainInertObject(payload, {
        path: 'workItem.command.payload',
        code: 'INVALID_PREPARED_COMMAND',
    });
    assertFrozenInertData(
        payload,
        'workItem.command.payload',
        { active: new WeakSet(), seen: new WeakMap() },
        0
    );

    return Object.freeze({ id, payload });
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

    const command = assertPreparedCommand(
        Reflect.apply(prepare, undefined, [fields.get('command')])
    );

    return Object.freeze({
        command,
        remaining,
        unitsPerSlot,
    });
}
