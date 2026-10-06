# M3E2 Pure WorkQueue/list operations

## Purpose

M3E2 adds the pure immutable list layer above the M3E1 queued WorkItem contract.

The slice deliberately does **not** schedule, execute, price, persist, time, or mutate gameplay. Its only job is to represent and transform an ordered queue of inert WorkItems while preserving explicit slot-capacity and merge semantics.

The target boundary is:

```text
M3E1 prepared command + WorkItem
  -> M3E2 immutable WorkQueue/list operations
  -> M3E3 readiness and selection
```

## WorkQueue representation

A WorkQueue is a frozen dense array of valid frozen M3E1 WorkItems:

```js
[
    { command, remaining, unitsPerSlot },
    { command, remaining, unitsPerSlot },
]
```

It is not a stateful object. Capacity, merge preference, pause state, readiness, timing, persistence metadata and scheduler state are not stored on the queue.

`createWorkQueue(items)` validates every WorkItem, rejects sparse/exotic/malformed arrays, detaches the caller-owned array, checks aggregate slot arithmetic, and freezes the resulting queue.

## Public production surface

`src/engine/queue/work-queue.mjs` exports exactly:

```text
createWorkQueue(items)
getWorkQueueSlotUsage(queue)
enqueueWorkItem(queue, item, { mergePolicy, capacity })
normalizeWorkQueue(queue, mergePolicy)
removeWorkItem(queue, index)
removeWorkItemSlots(queue, index, slots = 1)
moveWorkItem(queue, fromIndex, toIndex)
trimWorkQueueToCapacity(queue, capacity)
```

Every successful queue transformation returns a frozen queue and never mutates the input queue or WorkItems.

## Shared internal WorkItem contract

M3E2 extracts the structural WorkItem assertion/rebuild logic into:

```text
src/engine/queue/work-item-contract.mjs
```

This is an internal sibling module, not a new public WorkItem API.

`work-item.mjs` still exposes only:

```text
createQueuedWorkItem
```

The extraction prevents `work-queue.mjs` from duplicating the M3E1 closed WorkItem/prepared-command contract when merged or trimmed WorkItems must be rebuilt.

## Slot accounting

Legacy build-queue capacity is slot-based rather than array-length based:

```text
legacy slots = ceil(q / qs)
M3E2 slots   = ceil(remaining / unitsPerSlot)
```

M3E2 therefore defines queue slot usage as the safe-integer sum of that value for every WorkItem.

Example:

```text
remaining = 7
unitsPerSlot = 3
slot usage = 3
```

Aggregate slot overflow fails closed with `WORK_QUEUE_SLOT_USAGE_OVERFLOW`.

Capacity is always supplied explicitly as a non-negative safe integer. M3E2 does not calculate gameplay capacity from achievements, government, technology, or legacy queue state.

## Merge policies

M3E2 uses engine-facing policy names rather than legacy setting names:

```text
never
adjacent
matching
```

They correspond conceptually to the existing application preferences:

```text
merge_never  -> never
merge_nearby -> adjacent
merge_all    -> matching
```

The queue engine never reads `global.settings.q_merge`; the application layer must translate the preference into an explicit operation input.

### Merge identity

Two WorkItems are merge-compatible only when all of the following match:

```text
command.id
canonical command.payload
unitsPerSlot
```

`remaining` is intentionally excluded because it is the quantity being combined.

Different payloads or different `unitsPerSlot` values never merge even when command IDs match.

### `never`

The incoming WorkItem is appended as a distinct record.

### `adjacent`

Only the current tail may absorb the incoming WorkItem. Existing separated matches remain separate.

### `matching`

The first compatible WorkItem already present in the queue absorbs the incoming quantity. Its original position is preserved.

Merged `remaining` arithmetic must remain a positive safe integer. Overflow fails closed with `WORK_QUEUE_REMAINING_OVERFLOW`.

## Explicit normalization

`normalizeWorkQueue(queue, mergePolicy)` applies merge policy to an already-existing queue.

This is deliberately separate from reorder/remove operations. M3E2 does not hide policy-triggered structural changes inside unrelated list operations.

For example:

```text
A B A
```

under `matching` becomes:

```text
AA B
```

while `adjacent` leaves it unchanged.

## Enqueue and capacity

`enqueueWorkItem` validates the existing queue, incoming WorkItem, merge policy and explicit capacity, applies the merge policy, then measures the **resulting** slot usage.

This means a full queue may still accept a compatible merge when the merged quantity does not consume another slot.

Successful result:

```js
{
    status: 'enqueued',
    queue,
    index,
    merged,
    slotUsage,
}
```

Ordinary capacity refusal is an expected gameplay outcome rather than an engine contract error:

```js
{
    status: 'rejected',
    code: 'queue.capacity.exceeded',
    queue,
    capacity,
    requiredSlots,
}
```

The rejected result retains the original immutable queue.

## Removal

M3E2 exposes two separate removal meanings.

### Whole WorkItem removal

```text
removeWorkItem(queue, index)
```

removes the complete record.

### Slot-chunk removal

```text
removeWorkItemSlots(queue, index, slots)
```

removes `slots * unitsPerSlot` units, or removes the complete WorkItem when that many slots cover all remaining work.

This preserves the characterized legacy UI behavior where removing one build-queue slot subtracts `qs` rather than one successful execution.

Successful execution progress is intentionally **not** implemented here. Legacy queue execution decrements `q` one execution at a time; that belongs to later execution/scheduler integration rather than pure list editing.

## Reordering

`moveWorkItem(queue, fromIndex, toIndex)` performs one immutable remove/insert move.

It does not:

- merge newly adjacent items;
- recalculate readiness;
- execute commands;
- apply application settings.

The caller may explicitly normalize afterward if desired.

## Capacity shrinkage

`trimWorkQueueToCapacity(queue, capacity)` mirrors the useful list-level part of legacy capacity shrink behavior:

- preserve the queue prefix;
- keep complete WorkItems while slots remain;
- shorten the boundary WorkItem to the largest whole-slot quantity that fits;
- remove the suffix after capacity is exhausted.

Capacity zero therefore produces an empty queue.

This operation is pure and does not calculate why capacity changed.

## Build and research queues

M3E2 keeps one generic WorkQueue representation.

Build work may use `unitsPerSlot > 1`; vanilla has real `queue_size` examples such as `10`.

Research work naturally uses `remaining = 1` and `unitsPerSlot = 1`, which makes slot usage equivalent to record count.

Research duplicate prevention, `queue_complete()` limits, command queueability and prerequisite/readiness policy do not belong in WorkQueue. Those are contextual eligibility concerns for later M3E work.

## M3D boundary

M3D queue-payment feasibility remains a separate payment-side question.

M3E2 does not import or store:

```text
PaymentQuote
PaymentPlan
PaymentAssessor
EffectPlan
conditions
GameState
```

No affordability, payment, mutation, or future-production prediction occurs during list operations.

## Architecture enforcement

The cumulative M3E1 queue-package gate still applies to all `src/engine/queue/**` production modules and prevents legacy action/UI/cache/payment/state authority from entering the package.

M3E2 additionally adds a focused WorkQueue fitness gate that prevents the list module itself from acquiring scheduler, execution, readiness, payment, persistence, offline or timing authority.

The WorkQueue module export surface is pinned by tests so later slices cannot silently turn it into a scheduler facade.

## Legacy evidence informing M3E2

The implementation is source-backed by the existing queue behavior:

- build slot usage is `Math.ceil(q / qs)`;
- manual build-queue removal subtracts one `qs` chunk;
- `merge_never`, `merge_nearby` and `merge_all` are user-selectable application preferences;
- adjacent merge combines neighboring equal action IDs;
- merge-all consolidates equal IDs into the first accumulated matching record;
- drag/drop is an array reorder;
- capacity shrink keeps a prefix and may shorten the boundary record;
- research capacity is effectively record-based because research entries are single-unit records and duplicate technologies are blocked by legacy enqueue policy;
- vanilla contains `queue_size > 1`, so `unitsPerSlot` is authoritative quantity data rather than theoretical metadata.

M3E2 preserves the useful data/list semantics without preserving action-object lookup, UI metadata, hidden application settings, or scheduler behavior.

## Deliberate non-goals

M3E2 does not implement:

- command readiness or general queue eligibility;
- `qAny` / `qAny_res` selection policy;
- `timeCheck()` or production prediction;
- affordability/payment evaluation;
- command dispatch/execution;
- successful-execution decrement;
- queue pause state;
- scheduler ticks or offline completion;
- persistence/serialization;
- runtime queue IDs;
- labels or presentation metadata;
- legacy action/type lookup;
- GameState mutation;
- DNA queueability;
- vanilla queue cutover.

## Definition of done

M3E2 is complete when:

1. WorkQueue is a frozen dense array of valid M3E1 WorkItems;
2. queue construction detaches caller-owned arrays;
3. slot usage is exactly `ceil(remaining / unitsPerSlot)` per WorkItem;
4. aggregate slot arithmetic fails closed on safe-integer overflow;
5. merge policies are exactly `never`, `adjacent`, and `matching`;
6. merge identity includes command ID, canonical payload and `unitsPerSlot`;
7. merged quantity overflow fails closed;
8. enqueue receives capacity and merge policy explicitly;
9. enqueue checks post-merge slot usage;
10. capacity refusal is a frozen structured rejection rather than an exception;
11. explicit normalization can consolidate an existing queue;
12. whole-record removal and slot-chunk removal are distinct operations;
13. reordering changes order only;
14. capacity trimming preserves the prefix and safely trims the boundary WorkItem;
15. build and research use the same generic queue representation;
16. WorkQueue imports no command execution, payment, effect, condition, state, legacy or application authority;
17. scheduler/readiness/timing/persistence concerns remain deferred;
18. public module surfaces are pinned;
19. hostile inputs, invalid policies/capacities/indices and numeric overflows are tested;
20. cumulative architecture tests and the complete repository CI remain green.
