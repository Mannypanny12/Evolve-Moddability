# M3E Whole-Milestone Review and Hardening

## Scope

This review re-audits M3E1 through M3E4 as one subsystem after the queue work-item milestone was formally closed.

The review covers:

- `CommandBus.prepare()` as the queued-command preparation boundary;
- the queued WorkItem contract and defensive prepared-command verification;
- immutable WorkQueue construction, merge, slot, removal, reorder and capacity-trim semantics;
- transient readiness evaluation and `ordered` / `first-ready` selection;
- cross-slice composition from command preparation through selection;
- legacy build/research queue evidence;
- the cumulative M3E architecture gates and deferred-ownership boundaries.

This is a combined review-and-hardening pass. Justified findings were fixed immediately. The pass does not begin M3F and does not cut vanilla build/research queues over to the engine.

## Review result

The core M3E architecture is sound. No redesign of WorkItem, WorkQueue, readiness states or selection policies was justified.

Three cross-slice hardening gaps were found and fixed.

## Finding 1: prepared-command verification accepted a representation `CommandBus.prepare()` cannot produce

M3E1 deliberately verifies the output of the injected prepare capability before storing it as durable queued intent.

Before this review, that defensive verifier accepted frozen null-prototype plain objects. They are inert, but the actual command canonicalizer always emits ordinary canonical objects using `Object.prototype`.

That meant a broken replacement preparer could return a representation that was structurally inert but was not actually canonical command-bus output.

Hardening now requires canonical ordinary-object prototypes for:

- the prepared command envelope;
- the top-level prepared payload;
- every nested prepared-payload object.

Arrays retain the normal `Array.prototype` requirement already enforced by the inert-data contract.

This does **not** remove the useful raw-input flexibility of `createQueuedWorkItem()`. A raw WorkItem may still use a null-prototype input object; the public construction path normalizes it through the reviewed output representation.

## Finding 2: WorkQueue could accept a hand-forged WorkItem that bypassed the reviewed construction path

M3E1's intended production path is:

```text
raw command intent
  -> CommandBus.prepare()
  -> defensive prepared-command verification
  -> createQueuedWorkItem()
  -> WorkItem
```

Before this review, M3E2 only checked the frozen structural shape of WorkItems supplied to `createWorkQueue()` and the other queue operations.

A caller could therefore manually freeze an object shaped like:

```js
{
    command: { id, payload },
    remaining,
    unitsPerSlot,
}
```

and pass it directly to WorkQueue, even though that particular record had never crossed the reviewed WorkItem construction boundary. A command-specific payload that would have been rejected by the intended preparation path could therefore masquerade as already-prepared durable queue data.

Hardening adds an internal, non-serialized construction proof using a module-private `WeakSet` in the queue-internal WorkItem contract.

Only WorkItems produced by the reviewed queue-internal record constructor are accepted by WorkQueue and readiness selection. The proof:

- adds no field to WorkItem;
- does not change the exact `{ command, remaining, unitsPerSlot }` serialized representation;
- is not observable as gameplay data;
- is automatically retained by WorkQueue's internal merge and capacity-trim rebuilds;
- rejects hand-built or shallow-copied frozen lookalikes.

### Persistence consequence

Serialized or structured-cloned WorkItems intentionally lose this in-memory construction proof.

That is desirable at the current architecture boundary: M7 persistence must restore queued data through a reviewed rehydration/preparation path rather than treating arbitrary loaded bytes as already-trusted runtime WorkItems.

M3E still does not define that persistence format or restoration workflow.

### Trusted prepare capability boundary

`createQueuedWorkItem(rawWorkItem, prepareCommand)` still treats the supplied prepare function as an explicit trusted capability. The queue package does not import command-bus internals merely to authenticate the function object.

The new construction proof prevents callers from bypassing `createQueuedWorkItem()` altogether. It is not a cryptographic or nominal authentication mechanism for a deliberately substituted prepare capability.

Production cutover code must continue to supply the real `CommandBus.prepare` capability.

## Finding 3: selector reentrancy was only guarded per selector instance

M3E3 already prohibited an evaluator from recursively invoking the same selector.

However, an evaluator could create or capture a second selector and recursively call that selector instead. This bypassed the intended non-nested readiness/selection execution rule.

The command bus and condition evaluator already use module-wide operation locks for the same reason: changing instances must not bypass a reentrancy boundary.

Hardening therefore moves M3E3 readiness/selection locking to module scope.

Nested `evaluate()` / `select()` operations are now rejected across **all** selector instances with the existing `WORK_SELECTION_REENTRANCY` contract error. The lock still releases in `finally`, and regression coverage proves a separate selector works normally after the failed nested attempt.

## WorkQueue semantics re-audited

The review rechecked the M3E2 arithmetic and legacy mapping rather than assuming the slice-level tests were sufficient.

No change was justified to:

```text
slot usage              = ceil(remaining / unitsPerSlot)
manual slot removal     = slot chunks of unitsPerSlot
merge identity          = command ID + canonical payload + unitsPerSlot
capacity check          = after merge
capacity shrink         = prefix preserving with whole-slot boundary quantity
```

The apparent difference between manual slot removal and capacity trimming is intentional and matches the characterized legacy responsibilities: manual removal subtracts a `qs` chunk, while capacity reconciliation retains the number of whole queue slots that still fit.

Safe-integer guards on remaining quantity and aggregate slot usage also remain correct.

## Readiness/selection semantics re-audited

No change was justified to the three transient states:

```text
ready
waiting
bypass
```

or the two explicit selection policies:

```text
ordered
first-ready
```

`bypass` remains a scan decision, not a deletion signal. Stale-entry reconciliation remains separate from selection.

Readiness remains transient and is never cached on WorkItems or WorkQueues.

## Architecture boundary re-audited

The existing closure remains correct:

- the production queue package still contains exactly four reviewed files;
- no production module outside the queue package consumes M3E before reviewed cutover;
- the queue package remains first-party-neutral and contains no `evolve:` command knowledge;
- WorkQueue remains free of scheduler, readiness, payment, execution, persistence and offline authority;
- work selection remains free of command dispatch, payment, GameState mutation and legacy queue helpers;
- admission policy, command-family reconciliation, execution progress, scheduler cadence and persistence remain deferred to their owning milestones.

No additional production queue module was added by this review.

## Regression coverage added

`tests/engine/m3e-review-hardening.test.cjs` now proves:

- null-prototype prepared command envelopes are rejected;
- null-prototype top-level and nested prepared payload objects are rejected;
- hand-forged frozen WorkItems cannot enter WorkQueue;
- shallow copies of valid WorkItems are not silently treated as trusted runtime WorkItems;
- constructor-created WorkItems remain valid;
- merge- and trim-rebuilt WorkItems retain internal construction provenance;
- nested readiness operations across separate selector instances fail closed;
- the module-wide selector lock recovers after failure.

Existing M3E tests continue to prove raw null-prototype WorkItem input is accepted and normalized by `createQueuedWorkItem()`.

## Verification

The production hardening commit `fa8990dbfbf0262a062468a3fd01603dabd1541f` passed the complete repository safety net in GitHub Actions run `37519937107`:

- full test suite;
- cumulative architecture fitness gate;
- game/wiki build;
- generated-output cleanliness check;
- browser-startup exception negative control;
- real-browser smoke test.

## Closure

M3E remains complete after the whole-milestone review.

The final responsibility boundary is still:

```text
M3E1  prepare validated durable command intent + construct WorkItem
M3E2  transform verified WorkItems with pure immutable queue/list semantics
M3E3  derive transient readiness and selection decisions without nesting
M3E4  preserve legacy evidence and whole-package architecture closure
M3F   first real vanilla command cutover
M5    scheduler/cadence/offline authority
M7    persistence/rehydration authority
```

The review found no reason to pull M3F, M5 or M7 responsibilities backward into M3E.
