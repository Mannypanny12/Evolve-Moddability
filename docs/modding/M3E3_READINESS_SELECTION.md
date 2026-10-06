# M3E3 Readiness and Selection

## Purpose

M3E3 adds scheduler-independent transient readiness evaluation and queue selection above the M3E1 WorkItem and M3E2 WorkQueue foundations.

The slice deliberately does not execute commands, mutate WorkItems, decrement remaining work, predict future production, calculate completion times, read application queue preferences, persist queue state, or introduce scheduler/offline-processing authority.

The target separation is:

```text
WorkItem   = durable intent and quantity
WorkQueue  = durable ordering and slot semantics
Readiness  = transient current-state observation
Selection  = transient current decision
Scheduler  = later M5 authority
```

## Legacy behavior being preserved semantically

The legacy build and research loops do more than choose array index zero.

When queue-any behavior is disabled, entries that are not valid blocking candidates can be skipped, but the first legitimate item that is waiting for current resources/prerequisites blocks later work. When queue-any behavior is enabled, the scan instead continues until the first item that is executable now.

M3E3 preserves that selection distinction without preserving legacy `timeCheck`, production prediction, cached queue metadata, action-object lookup, or application preference reads.

The application layer may later translate legacy-style settings into the explicit engine policies defined below. Generic queue code never reads those settings itself.

## Production surface

M3E3 adds one queue sibling module:

```text
src/engine/queue/work-selection.mjs
```

It exports exactly:

```js
createWorkQueueSelector(evaluateReadiness)
```

The returned frozen facade exposes:

```text
evaluate(workItem)
select(workQueue, policy)
```

The captured evaluator is a narrow runtime capability. It receives one validated frozen WorkItem and returns a transient raw readiness result. M3E3 does not import a command bus, condition evaluator, payment assessor, GameState service, legacy adapter, scheduler, or UI/runtime subsystem.

## Readiness result contract

A normalized readiness result is exactly:

```js
{
    status: 'ready' | 'waiting' | 'bypass',
    reasons: [ ... ]
}
```

### `ready`

The next execution attempt may be selected now.

A `ready` result requires an empty reason list.

### `waiting`

The WorkItem is legitimate queued work but cannot execute now. Under ordered selection it blocks later work. Under first-ready selection it is skipped for this selection pass.

A `waiting` result requires at least one machine-readable reason.

### `bypass`

The WorkItem is not currently selectable and does not block later entries during this selection pass. M3E3 does not remove it from the queue.

A `bypass` result requires at least one machine-readable reason.

`bypass` is intentionally not named `remove`, `invalid`, or `expired`: selection and queue reconciliation are separate responsibilities.

## Reason contract

Reasons are exactly:

```js
{
    code: 'stable.lowercase.reason',
    details: null | { ... inert data ... }
}
```

Reason codes use the established lowercase stable-code grammar. Details are detached, canonicalized inert data. Arrays may appear inside detail objects, but the top-level `details` value is either `null` or an inert plain object.

Readiness results, reason arrays, reason records, detail records, nested arrays/objects, selection traces and selection results are frozen.

Localized text is excluded.

## Selection policies

M3E3 supports exactly two explicit policies:

```text
ordered
first-ready
```

### `ordered`

The selector scans from the front:

```text
bypass -> continue
ready   -> select and stop
waiting -> select nothing and stop
```

This preserves head-of-line blocking without reproducing legacy future-production prediction.

Example:

```text
bypass, waiting, ready
        ^
        blocks this pass
```

### `first-ready`

The selector scans from the front:

```text
ready               -> select and stop
waiting or bypass   -> continue
```

Example:

```text
waiting, bypass, ready
                 ^
                 selected
```

The engine never reads application preference names. Those preferences may later be translated to one of these policies at the application boundary.

## Selection result

A successful selection returns:

```js
{
    status: 'selected',
    policy: 'ordered',
    selectedIndex: 2,
    evaluations: [
        { index: 0, readiness: { ... } },
        { index: 1, readiness: { ... } },
        { index: 2, readiness: { ... } },
    ],
}
```

A pass with no selection returns:

```js
{
    status: 'none',
    policy: 'ordered',
    selectedIndex: null,
    evaluations: [ ...scanned entries only... ],
}
```

Evaluation stops as soon as policy semantics determine the answer. Entries after an ordered-mode waiting blocker or after the first selected ready item are not evaluated.

The trace is diagnostic transient data only. It is not written back into the WorkQueue.

## Unit of readiness

Readiness applies to the **next execution attempt** represented by a WorkItem.

It does not mean that all `remaining` work can finish, and it does not create a batching rule based on `unitsPerSlot`.

Execution batching, successful-work decrement and scheduler cadence remain outside M3E3.

## WorkQueue immutability

M3E3 never mutates or reconstructs the queue.

`select()` validates the supplied M3E2 WorkQueue through the existing pure queue contract and returns only transient selection data.

`evaluate()` validates the supplied M3E1 WorkItem through the queue-internal WorkItem contract.

No readiness field is added to WorkItem or WorkQueue.

In particular M3E3 does not introduce durable fields resembling legacy/cache concepts such as current affordability, requirement flags, time estimates, bottlenecks, selected state, handlers or callbacks.

## Synchronous evaluator capability

The evaluator must be a function and is captured at selector construction.

Invocation is context-free and synchronous in effect. Promise/thenable results fail closed. Accessor-based `then` properties are rejected without invoking their getter.

Evaluator exceptions are wrapped as deterministic `EngineContractError` data. Hostile thrown objects/messages are not retained. A selector reentrancy failure remains a direct selector contract error rather than being hidden behind evaluator wrapping.

Nested `evaluate()` / `select()` operations on the same selector are prohibited and the lock recovers through `finally` after failures.

## M3B and M3D boundaries

M3E3 does not compose condition or payment services itself.

M3B owns structured predicate evaluation. M3D separately owns current affordability and queue-payment feasibility, and explicitly does not decide general queue eligibility.

A future command-specific readiness composer may use those capabilities to determine whether a WorkItem is `ready`, `waiting`, or `bypass`, but that composition remains outside the generic selector.

This allows build, research and future command families to share one selection engine without embedding their domain rules in the queue package.

## Deliberate omissions

M3E3 does not implement:

- command dispatch or execution;
- successful-work decrement;
- multi-attempt/batch execution;
- scheduler cadence or timers;
- pause state;
- offline processing;
- future resource-production prediction;
- completion-time estimation;
- legacy `timeCheck`/ARPA prediction behavior;
- direct condition evaluation;
- direct affordability/payment assessment;
- payment/effect-plan storage;
- research stale-entry removal;
- ARPA partial-progress behavior;
- TP-ship or hell-mech special execution;
- queue persistence;
- vanilla queue cutover;
- DNA queueability.

Those remain with later M3E4/M3F/M4/M5/M7 migration work as already bounded by the roadmap.

## Architecture enforcement

`tests/architecture/m3e3-work-selection-fitness.cjs` pins the production dependency closure for `work-selection.mjs` to:

```text
identity error contract
inert-data inspection helpers
queue-internal WorkItem contract
pure M3E2 WorkQueue validation
```

It rejects dependency or identifier drift toward command execution, conditions, payment, GameState, mutation authority, legacy queue settings, prediction helpers, scheduling/timers, persistence, offline processing or cached readiness metadata.

The gate is cumulative in `npm run test:architecture`.

## Test evidence

M3E3 tests pin:

- exact module export surface;
- readiness normalization and deep freeze;
- canonical/detached reason details;
- ordered bypass/waiting/ready semantics;
- first-ready semantics;
- scan short-circuit behavior;
- empty/all-unready queue results;
- no WorkQueue mutation;
- malformed status/reason rejection;
- accessor/symbol hostile-data rejection;
- Promise/thenable rejection without accessor invocation;
- sanitized evaluator failures;
- context-free evaluator invocation;
- reentrancy rejection and lock recovery;
- WorkItem, WorkQueue and selection-policy validation;
- zero command execution during readiness/selection.

## Definition of done

M3E3 is implementation-complete when:

1. one reviewed `createWorkQueueSelector()` production entry exists;
2. readiness has exactly `ready`, `waiting` and `bypass` transient states;
3. readiness reasons are deterministic, inert, machine-readable and frozen;
4. `ordered` and `first-ready` have explicit deterministic short-circuit semantics;
5. selection returns a frozen trace of only evaluated entries;
6. no readiness/cache field is added to WorkItem or WorkQueue;
7. no queue mutation occurs during readiness evaluation or selection;
8. the evaluator capability is synchronous, context-free and fail-closed;
9. thenables/accessor-based thenables and hostile evaluator failures are hardened;
10. selector reentrancy is rejected and lock recovery is proven;
11. M3B/M3D remain external ingredients rather than queue dependencies;
12. no scheduler, prediction, execution, persistence, offline or vanilla-cutover authority is added;
13. a cumulative M3E3 architecture gate is wired into `npm run test:architecture`;
14. the repository test/build/browser safety net remains green.

Formal roadmap closure remains a separate review-and-hardening checkpoint after implementation CI.
