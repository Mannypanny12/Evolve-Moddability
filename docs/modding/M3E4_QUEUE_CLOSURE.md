# M3E4 Queue Evidence, Hardening and Closure

## Purpose

M3E4 closes the M3E queue-work-item milestone without introducing another production queue abstraction or cutting vanilla build/research queues over to the new engine.

M3E now consists of four bounded responsibilities:

```text
M3E1  prepared command + durable WorkItem
M3E2  immutable WorkQueue/list + slot semantics
M3E3  transient readiness + selection
M3E4  legacy evidence + cross-slice proof + architecture closure
```

The closure decision is deliberate: remaining legacy behavior is either command-family-specific admission/reconciliation policy or scheduler/execution behavior. Neither belongs in the generic queue package before a real migrated consumer requires it.

## Production surface at closure

`src/engine/queue/**` is closed to exactly four reviewed production modules:

```text
work-item-contract.mjs
work-item.mjs
work-queue.mjs
work-selection.mjs
```

M3E4 adds no production `.mjs` module and changes no existing queue production code.

The durable/transient boundary remains:

```text
PreparedCommand = validated inert command intent
WorkItem        = PreparedCommand + remaining + unitsPerSlot
WorkQueue       = immutable ordering + merge/slot/capacity list semantics
Readiness       = transient current-state observation
Selection       = transient ordered/first-ready decision
```

Execution, successful-work consumption, queue reconciliation, cadence, pause/offline behavior and persistence remain outside this generic package.

## Cross-slice proof

M3E4 adds an engine integration test that composes the complete inert pipeline:

```text
CommandBus.prepare()
  -> createQueuedWorkItem()
  -> create/enqueue WorkQueue
  -> createWorkQueueSelector().select()
```

The test proves that validation/preparation, queue construction and selection do not execute the registered command handler.

This pins a central M3E law:

> Constructing or enqueueing a WorkItem is structural representation, not semantic authorization or command execution.

A command-specific admission layer may later decide whether a command is queueable and how much work may be admitted. The generic WorkQueue only transforms work that has already crossed that policy boundary.

## Legacy build admission evidence

Legacy build admission combines several different concerns:

```text
immediate attempt/fallback decision
command-specific queue_complete() quantity
already queued matching quantity
queue slot capacity
queue_size grouping
application merge preference
```

M3E4 pins representative evidence:

- `evolution.dna.queue_complete()` returns `0`, so DNA is deliberately nonqueueable in vanilla;
- `evolution.sexual_reproduction.queue_complete()` can return `1`, providing a representative one-unit queueable action;
- the star-dock seeder uses `queue_size: 10`, proving grouped units-per-slot are real vanilla semantics;
- legacy build admission subtracts already queued matching `q` from the current `queue_complete()` allowance;
- slot capacity and command-specific admitted quantity are checked separately.

M3E does not reproduce `queue_complete()` as a generic engine callback. That helper encodes first-party contextual policy and remains migration debt until a real command family is cut over.

## Legacy research admission evidence

Research uses a different admission model:

```text
no_queue() gate
research queue enabled
record-capacity check
duplicate-command prevention
```

M3E4 pins all four behaviors as legacy evidence.

No generic `QueueAdmissionEngine` is introduced. Research duplicate prevention and technology-specific queueability belong with technology/progression migration rather than the inert list layer.

## Readiness and ordering evidence

Legacy build `qAny` and research `qAny_res` continue to provide source-backed evidence for M3E3's two selection policies:

```text
ordered      <- ordinary head-of-line semantics
first-ready  <- qAny / qAny_res scan semantics
```

Research additionally distinguishes currently met prerequisites from queued prerequisite prediction (`ok` versus `precog`). M3E4 records that as migration evidence without moving technology graph knowledge into `work-selection.mjs`.

The M3E3 statuses remain sufficient:

```text
ready    next execution may be selected now
waiting  legitimate queued work that blocks ordered selection
bypass   does not block this selection scan
```

`bypass` does not mean delete the WorkItem.

## Successful execution progress

Legacy build execution treats any action result other than literal `false` as success and consumes one unit of `q` after a successful execution. Research uses a truthy success test and removes the complete research queue entry after success.

M3E4 pins those differences as evidence but does not add `completeWorkItem()` or execution-progress authority to M3E2.

The owner is later execution/scheduler integration:

```text
command execution result
  -> scheduler/queue reconciliation
  -> immutable WorkQueue progress update
```

The pure WorkQueue may be used by that future owner, but it does not decide whether execution succeeded.

## Reconciliation remains separate from selection

Legacy research performs post-scan reconciliation that is distinct from readiness:

- capacity shrink truncates the research queue suffix;
- queued technologies can be removed when current technology plus valid queued grants can no longer satisfy their prerequisite chain.

Generic M3E3 selection does not delete `bypass` entries and does not understand technology grants.

This reconciliation belongs with the later deterministic queue/simulation system and technology migration, primarily M5D and M6E.

M3E2 already provides the generic list/capacity primitives needed where applicable; command-family reconciliation policy remains outside the generic package.

## Capacity ownership

Legacy `calcQueueMax()` and `calcRQueueMax()` derive different capacities from gameplay progression.

M3E2 therefore correctly receives an explicit numeric capacity and never derives it from achievements, technologies, governments, race state, settings or other gameplay state.

That boundary is closed in M3E4.

## Special legacy queue branches

The build queue contains several special execution models that are explicitly not generalized into M3E:

### ARPA

ARPA uses `arpaTimeCheck()` and can apply partial project progress during queue scanning. This remains calculation/scheduling plus ARPA migration debt for M4/M5/M6G.

### Truepath ships

Legacy queue processing synthesizes temporary cost/action data for `tp-ship` and delegates completion to `buildTPShipQueue()`. This remains M6L migration debt.

### Hell mechs

Legacy processing similarly synthesizes mech cost/action data and delegates to `buildMechQueue()`. This remains M6K migration debt.

### Nested action lookup

Legacy queue execution scans nested `space`, `interstellar`, `galaxy`, `portal`, `tauceti` and `eden` action groups to reconstruct executable objects from stored action/type data.

M3E1 removes the need for that architecture entirely by storing canonical prepared command intent.

## Application-preference ownership

Legacy application preferences map to explicit future caller inputs rather than durable queue state:

```text
q_merge   -> M3E2 never / adjacent / matching
qAny      -> M3E3 ordered / first-ready
qAny_res  -> M3E3 ordered / first-ready
qKey      -> application command/admission routing
pause     -> scheduler/application-control input
```

Legacy transient/cache fields remain excluded from WorkItems and WorkQueues:

```text
cna
time
t_max
bres
req
qa
affordable
requirementsMet
quote
paymentPlan
effectPlan
```

## Whole-M3E architecture closure

M3E4 adds a cumulative closure gate with three new laws.

### Exact queue-package file set

The production queue package is pinned to the four reviewed modules, including non-source files. A new helper, JSON configuration file or other side channel therefore requires an intentional architecture review rather than silently appearing beside the closed package.

### First-party neutrality

Generic queue production modules may not embed `evolve:` content IDs or acquire legacy admission/reconciliation/special-case helpers such as:

```text
queue_complete
no_queue
checkTechRequirements
gainTech
buildArpa
buildTPShipQueue
buildMechQueue
arpaTimeCheck
calcQueueMax
calcRQueueMax
```

They also remain free of GameState, payment/effect-plan, storage, timer and offline authority.

### No production consumer before reviewed cutover

At M3E closure, no production module outside `src/engine/queue/**` may import an M3E queue module.

This is stronger than merely saying vanilla `actions.js`/`main.js` have not been edited: it prevents another engine module from becoming an indirect production consumer before a reviewed cutover deliberately changes the law.

Tests and documentation may import the queue package. Production cutover must explicitly amend this guard in the milestone that owns the first real queue consumer.

## Review hardening

The post-implementation review found no M3E1-M3E3 runtime defect.

It did identify two closure-gate improvements, both fixed before closure:

1. the initial no-cutover check covered only non-engine/vanilla production files; hardening now rejects queue imports from every production module outside the queue package;
2. the initial package-set check considered source files only; hardening now pins all files, preventing configuration/data side doors.

The review also avoided reintroducing broad bans on harmless local names such as `execute` or `dispatch`. Existing module-specific dependency/surface guards remain the correct protection for execution authority, while M3E4 focuses on ownership boundaries with high-specificity legacy/state/persistence identifiers.

## Deliberate deferrals

M3E closes without implementing:

- a generic queue-admission engine;
- command-specific `queue_complete()` equivalents;
- research duplicate/prerequisite policy;
- stale-entry reconciliation;
- command execution;
- successful-execution decrement/removal;
- ARPA partial progress;
- Truepath ship or hell-mech execution;
- time/future-production prediction;
- scheduler ticks/cadence;
- pause/offline processing;
- WorkQueue persistence/restoration;
- vanilla queue cutover.

Primary later owners are:

```text
M3F/M6  real command/content cutover and command-specific admission rules
M4      calculation/modifier and prediction primitives
M5D     queue reconciliation/execution system ownership
M5F     offline progression
M6E     technology prerequisite/grant migration
M6G     ARPA/infrastructure queue migration
M6K     Hell/mech migration
M6L     Tau Ceti/Truepath migration
M7      WorkItem/WorkQueue persistence
```

## Verification

Both the initial M3E4 implementation and the review-hardened boundary passed the complete repository CI safety net:

- full test suite;
- cumulative architecture fitness gate;
- game/wiki build;
- generated-output cleanliness check;
- browser-startup exception negative control;
- real-browser smoke test.

A final CI run is required on the documentation/closure head before M3E is declared closed.

## M3E exit contract

M3E is complete when all of the following remain true:

1. queued intent is canonical prepared command data rather than legacy action objects;
2. WorkItems contain only command intent and authoritative quantity/slot data;
3. WorkQueue owns immutable list, merge, slot, removal, reorder and explicit capacity operations only;
4. readiness/selection is transient and scheduler-independent;
5. generic queue code contains no command-family queueability, technology, ARPA, ship, mech or capacity-calculation policy;
6. constructing/enqueueing/selecting work never executes command handlers;
7. application preferences cross the future boundary explicitly;
8. execution progress and reconciliation remain owned by later execution/simulation systems;
9. the queue package is first-party-neutral and closed to its reviewed four-file production surface;
10. no production consumer exists outside the queue package before reviewed cutover;
11. remaining legacy queue semantics and special branches are executable characterization evidence;
12. vanilla build/research gameplay remains untouched by M3E;
13. cumulative tests, architecture gates, build checks and browser smoke remain green.

With those conditions satisfied, M3E is closed and M3F becomes the next M3 slice.
