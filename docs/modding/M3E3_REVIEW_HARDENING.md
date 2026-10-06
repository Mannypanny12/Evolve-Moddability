# M3E3 Review Hardening and Closure

## Scope

This review re-audits the M3E3 readiness/selection implementation against the M3E1 WorkItem contract, the M3E2 WorkQueue boundary, the M3B structured-condition contract, the M3D payment-assessment boundary, and the characterized legacy build/research queue scan semantics.

The review is a combined review-and-hardening pass. Justified findings were fixed before closure.

## Findings and fixes

### Prototype-safe readiness details

The initial readiness-detail canonicalizer created ordinary output objects through property assignment. An own enumerable `__proto__` input key could therefore affect the prototype of the detached output instead of remaining an inert own data field.

Hardening now creates canonical detail properties with `Object.defineProperty()`. A `__proto__` key remains an ordinary frozen own data property and cannot mutate the output prototype.

Regression coverage proves the prototype remains `Object.prototype`, the key remains own data, and its nested value is detached/frozen.

### Hostile diagnostic retention

Some malformed readiness/policy failures initially placed the rejected caller value directly into `EngineContractError.details`. That could retain caller-owned hostile objects in otherwise deterministic engine diagnostics.

Hardening now emits only a safe value type plus the value itself when it is already a primitive diagnostic value. Object/function values are not retained.

### Shared identity and cycles

Readiness detail data now rejects cycles and repeated object identity across the complete readiness result, including repeated detail objects across different reasons. This matches the established inert-data defensive philosophy used by the command/condition boundaries.

### Selector surface and reentrancy

The slice review pins the selector facade to exactly `evaluate` and `select`, proves it is frozen, and originally retained a same-selector reentrancy lock with recovery through `finally`.

The later whole-M3E review identified cross-instance selector nesting as a remaining bypass of that intent. M3E now uses a module-wide readiness/selection operation lock, so nested `evaluate()` / `select()` calls are rejected even when a different selector instance is used. See `M3E_REVIEW_HARDENING.md`.

## Semantics retained

No change was required to the M3E3 selection model:

- `ready` means the next execution attempt may be selected now;
- `waiting` blocks later work in `ordered` mode but is skipped in `first-ready` mode;
- `bypass` never blocks the current selection scan and does not imply queue removal;
- `ordered` and `first-ready` short-circuit deterministically;
- selection returns transient frozen diagnostics only;
- no readiness state is cached on WorkItems or WorkQueues.

The review found no justification to add time prediction, future production simulation, execution, payment/condition composition, pause/offline behavior, persistence, stale-entry reconciliation, or vanilla queue cutover.

## Architecture closure

`work-selection.mjs` retains a closed dependency set consisting only of:

- identity/error plumbing;
- inert-data inspection;
- the queue-internal WorkItem contract;
- pure M3E2 WorkQueue validation.

The M3E3 fitness gate rejects drift toward legacy `qAny` settings, `timeCheck`/ARPA prediction, affordability/technology helpers, command dispatch/execution, PaymentQuote/PaymentPlan/EffectPlan, GameState or mutation authority, scheduling/timers, offline processing, persistence, or cached readiness fields.

M3E1 and M3E2 production modules were not changed by the original M3E3 slice review. The later whole-M3E review hardened shared WorkItem verification and selector reentrancy without adding new queue authority.

## Verification

The original hardened implementation passed the complete repository CI safety net:

- full test suite;
- cumulative architecture fitness gate;
- game/wiki build;
- generated-output cleanliness check;
- browser-startup exception negative control;
- real-browser smoke test.

The later whole-M3E hardening is independently verified and recorded in `M3E_REVIEW_HARDENING.md`.

## Closure

M3E3 remains closed. The durable/transient boundary is:

```text
WorkItem   = durable intent and quantity
WorkQueue  = durable ordering and slot semantics
Readiness  = transient current-state observation
Selection  = transient current decision
Scheduler  = M5
```

M3E4 subsequently completed the evidence/architecture closure, and the whole-M3E review then hardened the combined subsystem. M3F remains the next milestone.
