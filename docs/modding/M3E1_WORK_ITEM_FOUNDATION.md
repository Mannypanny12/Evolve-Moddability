# M3E1 Prepared Commands and Queued Work Items

## Purpose

M3E1 introduces the inert work-item foundation for the later queue slices without rewriting or cutting over the legacy build/research queues.

The slice has two production responsibilities:

1. widen the M3A1 command bus with a non-executing `prepare()` path that owns the single command-validation pipeline;
2. introduce one closed queued-work representation containing only durable command intent and authoritative queue progress.

M3E1 deliberately does **not** implement queue list operations, merge policy, queue capacity, readiness selection, scheduling, production/time estimates, persistence, payment caching, or vanilla queue cutover.

## CommandBus.prepare

The command-bus public surface is ratcheted from:

```text
dispatch
has
ids
```

to:

```text
prepare
dispatch
has
ids
```

`prepare(rawCommand)` performs the same preparation stages dispatch uses:

```text
closed command envelope
  -> canonical command ID
  -> registration lookup
  -> payload detachment/canonicalization
  -> command-specific validation
  -> validator-output canonicalization/freeze
  -> prepared command
```

It returns exactly:

```text
{
  id,
  payload
}
```

The result and its payload tree are detached and frozen.

`prepare()` never calls the registered `execute` handler.

`dispatch()` reuses the same internal preparation path and then performs handler execution and result normalization. There is therefore still one payload-validation path, not a queue-specific copy of command validators.

## Payload-validator boundary

`validatePayload()` is a structural and canonicalizing command-data boundary, not a gameplay-readiness hook.

A validator may validate and normalize only from the supplied payload. It must not derive its accepted payload from current GameState, current resources, conditions, affordability, queue readiness, clocks, RNG, payment state, or other mutable runtime context.

In particular, validators must not turn:

```text
current world state
  -> permanently stored queued intent
```

State-dependent availability, requirements, affordability, payment and queue readiness remain separate concerns and are re-evaluated at the appropriate execution/readiness boundary. This rule is essential because queued commands are prepared when enqueued and prepared again when eventually dispatched.

The current command package architecture already prevents command modules from importing GameState/state infrastructure directly. Future first-party command-registration locations must preserve the same law rather than bypassing it through captured mutable state.

## Reentrancy

Preparation participates in the existing module-wide command-operation lock.

A validator or handler cannot use another command bus instance to recursively call either `dispatch()` or `prepare()`. Nested attempts continue to use the established `COMMAND_DISPATCH_REENTRANCY` contract code, with cause-phase diagnostics identifying whether the nested operation attempted `prepare` or `dispatch`.

The lock is cleared in `finally` after both preparation and dispatch failures.

## QueuedWorkItem contract

M3E1 adds `src/engine/queue/work-item.mjs`.

A queued work item is exactly:

```text
{
  command: {
    id: 'evolve:command/...',
    payload: { ... }
  },
  remaining: 1,
  unitsPerSlot: 1
}
```

The object, command envelope, and command payload tree are frozen inert data.

`remaining` and `unitsPerSlot` are positive safe integers.

They are the explicit successors to the meaningful legacy queue fields:

```text
q  -> remaining
qs -> unitsPerSlot
```

Later queue-slot accounting can therefore use:

```text
ceil(remaining / unitsPerSlot)
```

without preserving the legacy names.

## Construction path

`createQueuedWorkItem(rawWorkItem, prepareCommand)` accepts the public `CommandBus.prepare` capability as a runtime dependency.

Construction is:

```text
raw work item
  -> closed work-item shape
  -> positive progress values
  -> CommandBus.prepare(raw command)
  -> verify prepared-command contract
  -> frozen QueuedWorkItem
```

The prepare capability is invoked but never stored in the item.

This keeps `src/engine/queue/**` independent of `commands/common.mjs` and avoids duplicating command-specific validation in the queue package.

`CommandBus.prepare()` remains the authority that canonicalizes and command-specifically validates payloads. The queue-side verification is deliberately defensive only: it rejects a broken replacement capability that returns mutable, non-inert, non-canonical, cyclic/shared, negative-zero, incorrectly ordered, or non-command prepared data. It does not introduce a second command-specific validator pipeline.

## What is intentionally absent

The WorkItem shape is closed. It does not contain legacy lookup, UI/cache, readiness, payment, callback, or scheduling state.

In particular, the following concepts are not WorkItem fields:

```text
id
action
type
label
cna
time
t_max
bres
req
qa
callback
handler
paymentPlan
quote
affordable
requirementsMet
```

The command's canonical `id` exists only inside `workItem.command`.

There is no legacy action lookup path such as:

```text
{
  action: 'evolution',
  type: 'sexual_reproduction'
}
```

Queued intent is represented only as a canonical command:

```text
{
  id: 'evolve:command/evolution/sexual_reproduction',
  payload: {}
}
```

Generic command payload vocabulary is not globally blacklisted. Instead, real production command validators must use closed semantic payload schemas and must never accept a disguised legacy `action/type` lookup descriptor as their command contract.

## Payments and conditions

M3E1 stores neither `PaymentQuote` nor `PaymentPlan`.

Those values are contextual and can become stale while work waits. A future execution attempt must derive current conditions, current quote, current affordability, and a fresh payment plan at execution time.

The same rule applies to readiness facts such as `affordable`, `requirementsMet`, legacy `cna`, or research `req`.

Durable queued intent is stored. Current executability is derived later.

## Queue policy boundary

M3E1 does not read or translate:

```text
qKey
q_merge
qAny
qAny_res
```

Those remain application preferences and are not GameState or WorkItem fields.

M3E2 will introduce explicit merge/list policy.
M3E3 will introduce scheduler-independent readiness and selection semantics.

## Scheduler and persistence boundary

M3E1 has no clock, tick processing, production prediction, `timeCheck()`, RNG, offline progression, save ownership, or queue-instance ID grammar.

WorkItems are deliberately plain deterministic serializable data, but M7 remains responsible for persistence format and restoration ownership.

M5 remains responsible for scheduler cadence and offline progression.

## Architecture boundary

`src/engine/queue/**` may import only:

- `src/engine/identity.mjs`;
- `src/engine/contracts/inert-data.mjs`;
- sibling queue modules.

It does not import command internals, GameState/state infrastructure, cost/payment modules, effect modules, legacy source modules, or external packages.

The M3E1 fitness gate rejects direct references to legacy queue-policy identifiers, scheduling/payment helpers, mutation authority and plan types. Separately, it rejects legacy progress, lookup, UI/cache and cached-readiness concepts when they are exposed as queue data fields. Ordinary local variable names are not globally reserved. This protects future M3E2/M3E3 queue modules without making unrelated implementation vocabulary illegal.

Canonical `command.id` and the identity parser's `parsed.type` remain legitimate internal uses; the queue layer still may not reconstruct legacy top-level action lookup records.

The cumulative engine architecture gate continues to reject browser/DOM/UI globals, storage, wall-clock access, direct RNG, CommonJS `require`, and imports escaping `src/engine/**`.

## Production impact

M3E1 does not cut over the legacy build queue or research queue.

It does not change:

- `src/actions.js`;
- legacy queue records;
- queue execution timing;
- queue capacity;
- research prerequisite behavior;
- payment timing;
- saves;
- UI;
- gameplay output.

M3E1 only establishes the architecture later slices can use.

## Review hardening

The post-implementation review hardened M3E1 before M3E2 begins:

- queue-package architecture guards reject legacy `q/qs/queue_size`, action lookup, UI/cache and cached-readiness concepts as queue data fields while allowing harmless local vocabulary;
- the command payload-validator contract is explicitly structural/context-independent, preventing enqueue-time world state from being baked into durable queued intent;
- defensive prepared-command verification now pins canonical numeric/object ordering in addition to frozen inert shape, cycles/shared identity and command identity;
- hostile raw WorkItem coverage pins accessors, hidden fields, symbols and null-prototype inert input;
- broken-preparer coverage pins mutable descendants, negative zero, unsorted object keys, shared/cyclic identity and hostile accessors;
- the work-item module export surface is pinned to the single construction capability;
- the prepare/dispatch reentrancy matrix is exercised across bus instances, including validation and execution phases;
- the central roadmap records completed M3D and the M3E1-E4 slice structure.

No queue list behavior, readiness selection, scheduler behavior, persistence or vanilla cutover is introduced by this hardening pass.

## Definition of done

M3E1 is complete when:

1. the command bus exposes only `prepare`, `dispatch`, `has`, and `ids`;
2. `prepare()` performs the same envelope/ID/payload/command-specific validation used by dispatch;
3. `prepare()` returns detached deeply frozen `{ id, payload }` data and never executes a handler;
4. `dispatch()` reuses the shared preparation path rather than maintaining a second validator pipeline;
5. payload validators are structural/context-independent and do not bake current gameplay state into queued intent;
6. preparation obeys the module-wide no-nested-command rule and always releases the lock;
7. `QueuedWorkItem` is closed to `{ command, remaining, unitsPerSlot }`;
8. `remaining` and `unitsPerSlot` are positive safe integers;
9. WorkItem construction uses `CommandBus.prepare` so malformed command-specific payloads cannot enter queued work through the production path;
10. queued work contains no callback, handler, legacy action lookup, UI/cache, readiness, PaymentQuote, PaymentPlan, EffectPlan, scheduler, persistence, or mutation-authority state;
11. work items are detached/frozen inert data and reject non-canonical replacement-preparer output;
12. the queue package has a dedicated architecture fitness gate protecting future queue modules from legacy/cache/readiness data-field regressions and forbidden cross-layer authority;
13. M3A1's public-surface tests/docs are ratcheted forward rather than weakened;
14. all cumulative tests, architecture checks, build checks, and browser smoke checks remain green;
15. no vanilla gameplay path is cut over.
