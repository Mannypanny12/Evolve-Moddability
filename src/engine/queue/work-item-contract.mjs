import { EngineContractError, parseContentId } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';

const WORK_ITEM_FIELDS = Object.freeze(['command', 'remaining', 'unitsPerSlot']);
const PREPARED_COMMAND_FIELDS = Object.freeze(['id', 'payload']);
const MAX_PREPARED_COMMAND_VALIDATION_DEPTH = 128;
const CONSTRUCTED_WORK_ITEMS = new WeakSet();

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

function assertFrozen(value, path, code){
    let frozen;
    try {
        frozen = Object.isFrozen(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (!frozen){
        fail(code, `${path} must be frozen.`, { path });
    }
}

function assertCanonicalPlainObject(value, path, code){
    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
    if (prototype !== Object.prototype){
        fail(code, `${path} must already use the canonical plain-object prototype.`, {
            path,
        });
    }
}

function assertCanonicalObjectKeyOrder(fields, path){
    const keys = [...fields.keys()];
    const canonicalProbe = {};
    for (const key of [...keys].sort()){
        Object.defineProperty(canonicalProbe, key, {
            value: null,
            enumerable: true,
            writable: false,
            configurable: false,
        });
    }
    const expected = Reflect.ownKeys(canonicalProbe);
    for (let index = 0; index < keys.length; index++){
        if (keys[index] !== expected[index]){
            fail(
                'INVALID_PREPARED_COMMAND',
                `${path} must already use canonical object-key order.`,
                { path, key: keys[index], expectedKey: expected[index] }
            );
        }
    }
}

function assertFrozenInertData(value, path, context, depth){
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            fail('INVALID_PREPARED_COMMAND', `${path} must be a finite number.`, { path, value });
        }
        if (Object.is(value, -0)){
            fail('INVALID_PREPARED_COMMAND', `${path} must already be canonical and may not contain negative zero.`, {
                path,
            });
        }
        return;
    }
    if (typeof value !== 'object'){
        fail('INVALID_PREPARED_COMMAND', `${path} contains non-inert data.`, {
            path,
            valueType: typeof value,
        });
    }
    if (depth > MAX_PREPARED_COMMAND_VALIDATION_DEPTH){
        fail('INVALID_PREPARED_COMMAND', `${path} exceeds the prepared-command validation nesting limit.`, {
            path,
            maxDepth: MAX_PREPARED_COMMAND_VALIDATION_DEPTH,
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
    assertFrozen(value, path, 'INVALID_PREPARED_COMMAND');

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

        assertCanonicalPlainObject(value, path, 'INVALID_PREPARED_COMMAND');
        const fields = inspectPlainInertObject(value, {
            path,
            code: 'INVALID_PREPARED_COMMAND',
        });
        assertCanonicalObjectKeyOrder(fields, path);
        for (const [key, child] of fields){
            assertFrozenInertData(child, inertDataPath(path, key), context, depth + 1);
        }
    }
    finally {
        context.active.delete(value);
    }
}

function assertPreparedCommand(value, path){
    if (value === null || typeof value !== 'object'){
        fail(
            'INVALID_PREPARED_COMMAND',
            'Queued work requires a frozen prepared command object.',
            { path, valueType: typeof value }
        );
    }
    assertCanonicalPlainObject(value, path, 'INVALID_PREPARED_COMMAND');
    assertFrozen(value, path, 'INVALID_PREPARED_COMMAND');

    const fields = readClosedObject(value, {
        path,
        allowed: PREPARED_COMMAND_FIELDS,
        code: 'INVALID_PREPARED_COMMAND',
    });
    const id = assertPreparedCommandId(fields.get('id'), `${path}.id`);
    const payload = fields.get('payload');

    inspectPlainInertObject(payload, {
        path: `${path}.payload`,
        code: 'INVALID_PREPARED_COMMAND',
    });
    assertFrozenInertData(
        payload,
        `${path}.payload`,
        { active: new WeakSet(), seen: new WeakMap() },
        0
    );

    return Object.freeze({ id, payload });
}

export function createQueuedWorkItemRecord(preparedCommand, remaining, unitsPerSlot){
    const command = assertPreparedCommand(preparedCommand, 'workItem.command');
    const checkedRemaining = assertPositiveSafeInteger(remaining, 'workItem.remaining');
    const checkedUnitsPerSlot = assertPositiveSafeInteger(unitsPerSlot, 'workItem.unitsPerSlot');

    const record = Object.freeze({
        command,
        remaining: checkedRemaining,
        unitsPerSlot: checkedUnitsPerSlot,
    });
    CONSTRUCTED_WORK_ITEMS.add(record);
    return record;
}

export function assertQueuedWorkItem(value, path = 'workItem'){
    if (value === null || typeof value !== 'object'){
        fail('INVALID_QUEUED_WORK_ITEM', `${path} must be a frozen queued WorkItem object.`, {
            path,
            valueType: typeof value,
        });
    }
    assertCanonicalPlainObject(value, path, 'INVALID_QUEUED_WORK_ITEM');
    assertFrozen(value, path, 'INVALID_QUEUED_WORK_ITEM');
    const fields = readClosedObject(value, {
        path,
        allowed: WORK_ITEM_FIELDS,
        code: 'INVALID_QUEUED_WORK_ITEM',
    });
    if (!CONSTRUCTED_WORK_ITEMS.has(value)){
        fail(
            'INVALID_QUEUED_WORK_ITEM',
            `${path} must originate from the reviewed queued-work construction path.`,
            { path, reason: 'unverified-construction' }
        );
    }

    assertPreparedCommand(fields.get('command'), `${path}.command`);
    assertPositiveSafeInteger(fields.get('remaining'), `${path}.remaining`);
    assertPositiveSafeInteger(fields.get('unitsPerSlot'), `${path}.unitsPerSlot`);
    return value;
}
