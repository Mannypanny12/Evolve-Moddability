# M4B Modifier Pipeline

## Status

M4B is complete and merged on `master`. The original closure reached final branch head `920c46331364f3959143eb25f908ada3aeb2861b`, passed Baseline PR run `37751341942`, and merged as `a096634a71a1bc0ccd74295ef11a20f3caed89dd`. That merged master head passed Baseline run `37751803143`, and the companion Android test-site build/deploy also completed successfully.

A second post-merge independent review was later requested from exact base `a096634a71a1bc0ccd74295ef11a20f3caed89dd`. Its hardening is isolated from M4C and does not begin resource primitives, production cutover, `adjustCosts()` migration, or other later work.

M4B extends the M4A calculation runner with deterministic numeric modifier composition. It deliberately does not migrate vanilla Evolve production or cost behavior.

## Purpose

M4A established named synchronous calculations over explicit inert inputs plus an optional base trace. M4B adds the generic numeric contribution layer required by later production, capacity, cost, combat and other calculations.

The calculation flow is now:

```text
explicit validated inputs
        |
        v
calculateBase(inputs)
        |
        v
finite base value
        |
        v
ordered modifier pipeline
        |
        v
finite final value
```

`calculate()` and `explain()` continue to share this exact runner. Explanation records the pipeline; it does not execute a second calculation implementation.

## Modifier registration contract

Modifiers are fixed engine-construction registrations. There is no dynamic registration API in M4B.

A modifier registration has the form:

```js
{
    id: 'example:modifier/tool-bonus',
    calculationId: 'example:calculation/worker-output',
    order: 200,
    operation: 'multiply',
    applies(inputs) { return inputs.hasTools; }, // optional
    operand(inputs) { return 1.25; }
}
```

Rules:

- `id` is a canonical namespaced content ID of type `modifier`;
- `calculationId` is a canonical calculation ID;
- modifiers may target calculations in another namespace;
- `order` is a safe integer;
- `operation` is one of `add`, `multiply`, `override`, `cap`, or `floor`;
- `applies` is optional and, when present, must be synchronous and return exactly `true` or `false`;
- `operand` is synchronous and must return a finite number;
- callbacks receive only the already validated, detached and frozen calculation inputs;
- callbacks do not receive the current intermediate calculation value;
- Promise/thenable, async, generator and class callback forms fail closed;
- calculation and modifier callbacks are contractually deterministic functions of explicit validated inputs plus immutable construction-time constants. Hidden mutable closure state is not a legitimate semantic input. JavaScript closure purity cannot be fully introspected by this generic runtime, so later slices that own real registrations must preserve and architecture-test this composition boundary.

Canonical modifier identity is the M4B ownership anchor. M4B intentionally does not introduce the future package-loader/public-Mod-API ownership protocol.

## Deterministic ordering

For one calculation, modifiers are sorted by:

1. `order` ascending;
2. canonical modifier ID ascending.

Registration order is never gameplay authority. Equal order values are allowed so independent packages do not have to coordinate globally unique integers.

The hardened result/trace contract independently rejects duplicate modifier IDs and non-deterministically ordered modifier steps when `createCalculationResult()` is called directly. This proves the internal ordering and arithmetic truth of the supplied trace. Only an engine-produced trace additionally proves provenance from that engine instance's actual registered modifier pipeline.

## Numeric operations

Operations are sequential:

```text
add       after = before + operand
multiply  after = before * operand
override  after = operand
cap       after = min(before, operand)
floor     after = max(before, operand)
```

Base values, operands, intermediate values and final values must all remain finite JavaScript numbers. Negative zero is normalized to zero.

A conditional contribution is not a sixth arithmetic operation. `applies(inputs)` decides whether the modifier participates. When it returns false, the operand callback is not evaluated.

## Override permission

Override is target-owned permission.

Calculation registrations may add:

```js
allowOverride: true
```

The default is `false`. Registering an override modifier against a calculation that did not explicitly opt in fails during engine construction.

This prevents a modifier from granting itself replacement authority.

## Trace contract

The M4A base step remains the first trace entry:

```js
{
    kind: 'base',
    before: null,
    after: 100
}
```

M4B appends one entry for every targeted modifier in deterministic order:

```js
{
    kind: 'modifier',
    modifierId: 'example:modifier/tool-bonus',
    operation: 'multiply',
    order: 200,
    applied: true,
    operand: 1.25,
    before: 100,
    after: 125
}
```

Skipped conditional modifiers remain visible in `explain()`:

```js
{
    kind: 'modifier',
    modifierId: 'example:modifier/forest-bonus',
    operation: 'multiply',
    order: 300,
    applied: false,
    operand: null,
    before: 125,
    after: 125
}
```

The result contract validates trace continuity and arithmetic truthfulness:

- the base step begins at `before: null`;
- modifier IDs are unique within the trace;
- modifier steps follow deterministic `(order, modifierId)` order;
- each modifier `before` equals the previous step's `after`;
- an applied step's `after` matches its declared operation and operand;
- a skipped step has `operand: null` and `before === after`;
- the final step's `after` equals `result.value`;
- any direct result that supplies `modifierSteps` must also supply an explicit `baseValue`, so modifier traces cannot silently infer their starting value from the final result;
- with no modifier steps, the M4A base-only trace may still infer its base from `result.value`.

Normal `calculate()` calls allocate no modifier trace and continue to return `trace: null`.

## Failure semantics

Modifier contract failures throw `EngineContractError`; they are not gameplay rejection results.

Diagnostics retain the enclosing `calculationId` and calculation phase and add `modifierId` plus modifier-specific phase information where relevant. This includes hostile Promise/thenable inspection failures as well as callback exceptions. Failures include malformed registrations, unknown targets, duplicate modifier IDs, unauthorized override, invalid predicate results, Promise/thenable leakage, non-finite operands and non-finite arithmetic results.

Promise/thenable inspection itself is bounded. The runtime follows only a finite prototype-chain depth while checking returned objects, so a hostile proxy cannot manufacture an endless stream of fresh prototypes and trap synchronous evaluation forever.

The existing calculation reentrancy lock remains active throughout modifier evaluation, so modifier callbacks cannot recursively invoke a calculation engine. The lock is released after failure.

## Architecture boundary

M4B remains inside `src/engine/calculations/**` and inherits the M4A boundary:

- no GameState/state infrastructure;
- no mutation authority;
- no commands/conditions/costs/effects/execution/queue dependency;
- no legacy bridge or legacy `global` access;
- no platform/DOM/runtime capability access;
- no clock/random sources;
- no first-party `evolve:` identities in the generic calculation package;
- no executable use of the inert M1 Registry.

A dedicated M4B architecture gate additionally proves that the modifier pipeline is composed through the existing calculation engine, registrations remain fixed at engine construction, dynamic modifier-registration authority is absent, and production calculation consumers remain zero before M4D. The complete exported surface of `src/engine/calculations/**` is ratcheted to the reviewed M4A/M4B exports. Any new export, including an arbitrarily named authority or an export from a newly added calculation module, requires an explicit reviewed architecture-gate change. Runtime tests also pin the engine's frozen public surface to exactly `calculate`, `explain`, `has`, and `ids` even when modifiers are configured.

## Legacy relationship

Legacy `adjustCosts()` demonstrates why deterministic numeric composition is needed, but M4B does not migrate that function. Numeric adjustment and structural resource substitution are distinct concerns. In particular, transformations such as Lumber to Chrysotile are not represented as numeric `override` modifiers.

Legacy `production()` and `fastLoop()` are also unchanged by M4B.

## Test coverage

M4B coverage includes:

- add/multiply/override/cap/floor semantics;
- mixed non-commutative ordering;
- canonical-ID tie-breaking;
- registration-order independence;
- cross-namespace modifier contribution;
- target-owned override permission;
- conditional short-circuiting and skipped-trace entries;
- calculate/explain value parity;
- trace continuity, ordering, uniqueness and frozen result shapes;
- explicit base provenance for direct modifier traces while preserving M4A base-only trace shorthand;
- strict boolean predicates;
- async/generator/thenable rejection;
- hostile accessor-backed thenables without getter invocation;
- bounded hostile thenable prototype traversal;
- non-finite operands and arithmetic overflow;
- negative-zero normalization;
- duplicate IDs, unknown targets, invalid operations/orders;
- hostile registration shapes;
- detached deeply frozen callback inputs and `this === undefined`;
- modifier-specific diagnostic attribution;
- reentrancy rejection and lock recovery;
- exact frozen engine public surface with modifiers configured;
- the reviewed calculation-package export-surface ratchet;
- the zero-production-consumer architecture boundary;
- negative controls proving dynamic modifier registration and arbitrarily named/new-module exports are rejected while comments/strings do not cause false positives.

## Browser CI hardening discovered during implementation

M4B itself has no production consumer and therefore does not execute in the browser game yet. During implementation proof, however, the inherited M0E4 browser startup negative control exposed pre-existing CI harness weaknesses that could make a healthy branch hang or fail nondeterministically:

- WebDriver/Chrome and local HTTP teardown could wait indefinitely after an unhealthy browser session;
- Chrome browser-log delivery is asynchronous and draining, so one-shot reads after fixed sleeps can miss relevant severe errors.

The harness was hardened rather than weakening the gate. Cleanup now bounds session deletion, process-tree shutdown and HTTP server shutdown, attempts later cleanup phases even if an earlier phase fails, streams phase diagnostics, and has a final watchdog. Marker-bearing checks use bounded polling with a post-marker settling window, while the normal successful smoke repeatedly drains logs for a bounded observation window. Failure diagnostics also perform a short bounded drain.

These are test-infrastructure corrections only; they do not connect the M4 calculation package to production gameplay.

## Independent review and hardening

The post-implementation review treated M4B as untrusted against the approved design, M4A/M3 contracts, legacy modifier ordering evidence, production composition, hostile inputs, architecture boundaries and the browser proof path.

The review found and fixed three substantive issues:

1. **Trace authority was incomplete.** Runtime modifiers were deterministically sorted, but direct result construction could supply duplicate or out-of-order modifier steps as long as arithmetic continuity remained true. The result contract now independently rejects duplicate modifier IDs and enforces the same `(order, modifierId)` total order as the pipeline.
2. **Hostile thenable diagnostics lost modifier attribution.** Accessor-based thenable inspection could throw after a modifier callback returned but outside the modifier error-enrichment block. Both `applies` and `operand` thenable inspection now preserve `modifierId`, `modifierPhase`, `calculationId` and the underlying cause code without invoking hostile accessors.
3. **Browser cleanup was not fully fail-through.** A hard failure during driver process-tree cleanup could prevent the HTTP server cleanup phase from running. Teardown now attempts every phase and reports aggregated fatal cleanup failures only after all bounded cleanup work has been attempted.

The review also strengthened the M4B architecture gate so dynamic modifier registration authority is rejected recursively across the calculation package, with a negative control proving the scanner ignores comments and string literals.

Code-hardening head `9b94f0e4c7bb62d72987c637e2e8a447a1586ae1` passed the complete Baseline workflow in run `37727211512`. That was an implementation checkpoint, not the final original M4B closure proof. The final original M4B branch head `920c46331364f3959143eb25f908ada3aeb2861b` passed Baseline PR run `37751341942`, merged as `a096634a71a1bc0ccd74295ef11a20f3caed89dd`, and the merged master commit passed Baseline run `37751803143`.

The branch diff was re-audited after hardening. It remained limited to the generic M4 calculation/modifier package, M4B tests/architecture/documentation, and the browser harness corrections required to make the existing CI proof bounded and deterministic. No legacy production path, `prod.js`, `fastLoop()`, resource primitive, M3 payment path or live calculation consumer was changed.

## Second post-merge independent review and hardening

A second thorough review was requested after the original M4B closure. It froze merged master `a096634a71a1bc0ccd74295ef11a20f3caed89dd` as its base and rechecked the calculation/modifier implementation, result contract, production composition, architecture gates, hostile inputs, browser proof path, documentation and original closure evidence.

This review found and fixed six additional issues or proof gaps:

1. **Thenable prototype inspection was not time-bounded.** Cycle detection prevented ordinary prototype loops, but a hostile proxy could return a fresh prototype object on every `getPrototypeOf()` trap and keep synchronous evaluation inside an unbounded loop. Thenable inspection now has an explicit prototype-depth limit, with validator and modifier regression tests proving bounded rejection, diagnostic attribution and lock recovery.
2. **Two browser-log checks still used one-shot sampling.** The harness's own uncaught-exception probe and the normal successful smoke could miss Chrome errors delivered after their single browser-log drain. Both now use bounded repeated polling/draining, and failure diagnostics use a short bounded drain as well.
3. **The marker settling window could be truncated.** The first polling helper used one initial absolute deadline, so a marker arriving near that deadline did not receive the promised full post-marker settling interval. The marker now starts its own bounded settling deadline, with a regression test that injects a later unrelated severe error.
4. **The durable M4B authority pinned an intermediate proof.** The status fitness gate and this document emphasized code-hardening head `9b94f0e4...` even though later branch, PR, merge and merged-master proof existed. The authority now records the actual original closure chain and the status guard protects that evidence.
5. **Direct modifier traces could omit base provenance.** `createCalculationResult()` accepted `modifierSteps` without an explicit `baseValue`, silently treating the final result as the starting base. Engine-produced traces were already correct, but the direct contract could manufacture a misleading modifier narrative. Direct modifier traces now require explicit `baseValue`; base-only M4A traces retain their existing shorthand.
6. **Dynamic-authority enforcement was partly name-based.** The architecture gate rejected familiar names such as `registerModifier`, but an exported authority with an unrelated name could evade that terminology check. The gate now ratchets every export in the calculation package to the reviewed M4A/M4B surface, including exports from newly added modules, with negative controls using arbitrary non-registration terminology.

The second review also adds an explicit runtime proof that configuring modifiers cannot expand the frozen calculation-engine API, and clarifies the permanent determinism obligation for future registration owners: hidden mutable closure state is not a valid calculation input even though generic JavaScript runtime code cannot introspect closure purity completely.

Code-bearing second-review head `e67b2ba30e86ee79701d5fa8192d2470cbf69d51` passed the complete Baseline workflow in run `37755684579`: Node tests, cumulative architecture gates, production build/cleanliness, injected-startup-failure browser negative control and normal real-browser smoke all passed.

The later code-and-architecture hardening head `d27baaf373f5be70e26b5752e06002f7d4fd4664` also passed the complete Baseline workflow in run `37758991381`, including the explicit-base trace contract and export-surface architecture ratchet. The final documentation-bearing head must still pass the same complete exact-head chain before this second review can be merged. M4C remains untouched throughout this review.

## Deliberate deferrals

M4B does not implement:

- M4C resource production/consumption/capacity/storage primitives;
- M4D vanilla production cutover;
- `adjustCosts()` migration;
- Lumber/Plywood to Chrysotile structural substitution;
- `prod.js` or `fastLoop()` migration;
- GameState/resource authority migration;
- calculation caching/memoization;
- nested calculation dependency graphs;
- dynamic modifier registration;
- package loading or public Mod API ownership enforcement;
- persistence of calculations/modifiers;
- UI explanation panels.

Production calculation consumers remain zero at M4B exit. Resource substitution remains a structural transformation problem, not a numeric override.

## Next slice

M4C Resource calculation primitives is the next slice.

M4C must be deep-dived separately before implementation. It may build production, consumption, capacity, storage and resource-delta primitives on the hardened calculation/modifier foundation, but M4B does not pre-design or implement those semantics.
