import { EngineContractError } from '../identity.mjs';
import {
    inertDataPath,
    inspectDenseInertArray,
    inspectPlainInertObject,
} from '../contracts/inert-data.mjs';
import {
    assertQueuedWorkItem,
    createQueuedWorkItemRecord,
} from './work-item-contract.mjs';

const MERGE_POLICIES = Object.freeze(['never', 'adjacent', 'matching']);
const ENQUEUE_OPTION_FIELDS = Object.freeze(['mergePolicy', 'capacity']);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
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

function inspectWorkQueue(value, { path = 'queue', requireFrozen = true } = {}){
    const items = inspectDenseInertArray(value, {
        path,
        code: 'INVALID_WORK_QUEUE',
    });
    if (requireFrozen){
        assertFrozen(value, path, 'INVALID_WORK_QUEUE');
    }
    for (let index = 0; index < items.length; index++){
        assertQueuedWorkItem(items[index], `${path}[${index}]`);
    }
    calculateSlotUsage(items, path);
    return items;
}

function freezeQueue(items){
    return Object.freeze(items.slice());
}

function assertCapacity(value){
    if (!Number.isSafeInteger(value) || value < 0){
        fail(
            'INVALID_WORK_QUEUE_CAPACITY',
            'capacity must be a non-negative safe integer.',
            { path: 'capacity', value }
        );
    }
    return value;
}

function assertMergePolicy(value){
    if (!MERGE_POLICIES.includes(value)){
        fail(
            'INVALID_WORK_QUEUE_MERGE_POLICY',
            `mergePolicy must be one of: ${MERGE_POLICIES.join(', ')}.`,
            { path: 'mergePolicy', value }
        );
    }
    return value;
}

function assertIndex(value, length, path){
    if (!Number.isSafeInteger(value) || value < 0 || value >= length){
        fail('INVALID_WORK_QUEUE_INDEX', `${path} must identify an existing WorkItem.`, {
            path,
            value,
            length,
        });
    }
    return value;
}

function assertPositiveSlotCount(value){
    if (!Number.isSafeInteger(value) || value <= 0){
        fail(
            'INVALID_WORK_QUEUE_SLOT_COUNT',
            'slots must be a positive safe integer.',
            { path: 'slots', value }
        );
    }
    return value;
}

function slotsForItem(item){
    return Math.ceil(item.remaining / item.unitsPerSlot);
}

function calculateSlotUsage(items, path){
    let total = 0;
    for (let index = 0; index < items.length; index++){
        const slots = slotsForItem(items[index]);
        if (total > Number.MAX_SAFE_INTEGER - slots){
            fail(
                'WORK_QUEUE_SLOT_USAGE_OVERFLOW',
                `${path} slot usage exceeds the safe integer range.`,
                { path, index, previousSlots: total, itemSlots: slots }
            );
        }
        total += slots;
    }
    return total;
}

function canonicalDataEqual(left, right){
    const stack = [[left, right]];
    while (stack.length > 0){
        const [leftValue, rightValue] = stack.pop();
        if (Object.is(leftValue, rightValue)) continue;
        if (leftValue === null || rightValue === null) return false;
        if (typeof leftValue !== typeof rightValue) return false;
        if (typeof leftValue !== 'object') return false;

        let leftArray;
        let rightArray;
        try {
            leftArray = Array.isArray(leftValue);
            rightArray = Array.isArray(rightValue);
        }
        catch {
            fail('INVALID_WORK_QUEUE', 'Canonical command payloads could not be safely compared.', {
                path: 'queue.command.payload',
            });
        }
        if (leftArray !== rightArray) return false;

        if (leftArray){
            const leftItems = inspectDenseInertArray(leftValue, {
                path: 'leftPayload',
                code: 'INVALID_WORK_QUEUE',
            });
            const rightItems = inspectDenseInertArray(rightValue, {
                path: 'rightPayload',
                code: 'INVALID_WORK_QUEUE',
            });
            if (leftItems.length !== rightItems.length) return false;
            for (let index = 0; index < leftItems.length; index++){
                stack.push([leftItems[index], rightItems[index]]);
            }
            continue;
        }

        const leftFields = inspectPlainInertObject(leftValue, {
            path: 'leftPayload',
            code: 'INVALID_WORK_QUEUE',
        });
        const rightFields = inspectPlainInertObject(rightValue, {
            path: 'rightPayload',
            code: 'INVALID_WORK_QUEUE',
        });
        const leftKeys = [...leftFields.keys()];
        const rightKeys = [...rightFields.keys()];
        if (leftKeys.length !== rightKeys.length) return false;
        for (let index = 0; index < leftKeys.length; index++){
            if (leftKeys[index] !== rightKeys[index]) return false;
            stack.push([
                leftFields.get(leftKeys[index]),
                rightFields.get(rightKeys[index]),
            ]);
        }
    }
    return true;
}

function sameWorkIntent(left, right){
    return left.command.id === right.command.id &&
        left.unitsPerSlot === right.unitsPerSlot &&
        canonicalDataEqual(left.command.payload, right.command.payload);
}

function mergeItems(left, right){
    if (left.remaining > Number.MAX_SAFE_INTEGER - right.remaining){
        fail(
            'WORK_QUEUE_REMAINING_OVERFLOW',
            'Merged WorkItem remaining quantity exceeds the safe integer range.',
            {
                commandId: left.command.id,
                leftRemaining: left.remaining,
                rightRemaining: right.remaining,
            }
        );
    }
    return createQueuedWorkItemRecord(
        left.command,
        left.remaining + right.remaining,
        left.unitsPerSlot
    );
}

function mergeIntoItems(items, item, mergePolicy){
    if (mergePolicy === 'never'){
        items.push(item);
        return { index: items.length - 1, merged: false };
    }

    if (mergePolicy === 'adjacent'){
        const index = items.length - 1;
        if (index >= 0 && sameWorkIntent(items[index], item)){
            items[index] = mergeItems(items[index], item);
            return { index, merged: true };
        }
        items.push(item);
        return { index: items.length - 1, merged: false };
    }

    for (let index = 0; index < items.length; index++){
        if (sameWorkIntent(items[index], item)){
            items[index] = mergeItems(items[index], item);
            return { index, merged: true };
        }
    }
    items.push(item);
    return { index: items.length - 1, merged: false };
}

function readEnqueueOptions(options){
    const fields = readClosedObject(options, {
        path: 'options',
        allowed: ENQUEUE_OPTION_FIELDS,
        code: 'INVALID_WORK_QUEUE_ENQUEUE_OPTIONS',
    });
    return {
        mergePolicy: assertMergePolicy(fields.get('mergePolicy')),
        capacity: assertCapacity(fields.get('capacity')),
    };
}

export function createWorkQueue(items){
    const validatedItems = inspectWorkQueue(items, {
        path: 'items',
        requireFrozen: false,
    });
    return freezeQueue(validatedItems);
}

export function getWorkQueueSlotUsage(queue){
    const items = inspectWorkQueue(queue);
    return calculateSlotUsage(items, 'queue');
}

export function enqueueWorkItem(queue, item, options){
    const currentItems = inspectWorkQueue(queue);
    assertQueuedWorkItem(item, 'item');
    const { mergePolicy, capacity } = readEnqueueOptions(options);

    const candidate = currentItems.slice();
    const placement = mergeIntoItems(candidate, item, mergePolicy);
    const requiredSlots = calculateSlotUsage(candidate, 'queue');
    if (requiredSlots > capacity){
        return Object.freeze({
            status: 'rejected',
            code: 'queue.capacity.exceeded',
            queue,
            capacity,
            requiredSlots,
        });
    }

    const nextQueue = freezeQueue(candidate);
    return Object.freeze({
        status: 'enqueued',
        queue: nextQueue,
        index: placement.index,
        merged: placement.merged,
        slotUsage: requiredSlots,
    });
}

export function normalizeWorkQueue(queue, mergePolicy){
    const currentItems = inspectWorkQueue(queue);
    const policy = assertMergePolicy(mergePolicy);
    if (policy === 'never' || currentItems.length < 2) return queue;

    const normalized = [];
    let changed = false;
    for (const item of currentItems){
        const placement = mergeIntoItems(normalized, item, policy);
        changed = changed || placement.merged;
    }
    if (!changed) return queue;
    calculateSlotUsage(normalized, 'queue');
    return freezeQueue(normalized);
}

export function removeWorkItem(queue, index){
    const currentItems = inspectWorkQueue(queue);
    const checkedIndex = assertIndex(index, currentItems.length, 'index');
    const next = currentItems.slice();
    next.splice(checkedIndex, 1);
    return freezeQueue(next);
}

export function removeWorkItemSlots(queue, index, slots = 1){
    const currentItems = inspectWorkQueue(queue);
    const checkedIndex = assertIndex(index, currentItems.length, 'index');
    const checkedSlots = assertPositiveSlotCount(slots);
    const item = currentItems[checkedIndex];
    const occupiedSlots = slotsForItem(item);

    if (checkedSlots >= occupiedSlots){
        return removeWorkItem(queue, checkedIndex);
    }

    const removedUnits = checkedSlots * item.unitsPerSlot;
    const nextItem = createQueuedWorkItemRecord(
        item.command,
        item.remaining - removedUnits,
        item.unitsPerSlot
    );
    const next = currentItems.slice();
    next[checkedIndex] = nextItem;
    return freezeQueue(next);
}

export function moveWorkItem(queue, fromIndex, toIndex){
    const currentItems = inspectWorkQueue(queue);
    const from = assertIndex(fromIndex, currentItems.length, 'fromIndex');
    const to = assertIndex(toIndex, currentItems.length, 'toIndex');
    if (from === to) return queue;

    const next = currentItems.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return freezeQueue(next);
}

export function trimWorkQueueToCapacity(queue, capacity){
    const currentItems = inspectWorkQueue(queue);
    const checkedCapacity = assertCapacity(capacity);
    const currentUsage = calculateSlotUsage(currentItems, 'queue');
    if (currentUsage <= checkedCapacity) return queue;

    const trimmed = [];
    let remainingSlots = checkedCapacity;
    for (const item of currentItems){
        if (remainingSlots === 0) break;
        const itemSlots = slotsForItem(item);
        if (itemSlots <= remainingSlots){
            trimmed.push(item);
            remainingSlots -= itemSlots;
            continue;
        }

        const nextRemaining = remainingSlots * item.unitsPerSlot;
        if (!Number.isSafeInteger(nextRemaining) || nextRemaining <= 0 || nextRemaining >= item.remaining){
            fail(
                'WORK_QUEUE_TRIM_CONTRACT_FAILURE',
                'Capacity trimming produced an invalid WorkItem quantity.',
                {
                    commandId: item.command.id,
                    remainingSlots,
                    unitsPerSlot: item.unitsPerSlot,
                    previousRemaining: item.remaining,
                }
            );
        }
        trimmed.push(createQueuedWorkItemRecord(
            item.command,
            nextRemaining,
            item.unitsPerSlot
        ));
        remainingSlots = 0;
    }

    return freezeQueue(trimmed);
}
