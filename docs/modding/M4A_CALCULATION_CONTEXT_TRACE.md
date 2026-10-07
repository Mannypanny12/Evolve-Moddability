# M4A Calculation Context and Trace

## Purpose

M4A establishes the first generic calculation substrate for the refactor. It defines what a named calculation is, what data it may consume, how its result is represented, and how the same calculation can produce an inspectable base trace without moving modifier, production or state authority into the calculation kernel.

M4A is intentionally infrastructure-only. No vanilla production path, `prod.js` case, `fastLoop()` calculation, cost-adjustment chain, resource authority, command path or save format is cut over by this slice.

## Calculation contract

A calculation is identified with the existing canonical M1 content-ID grammar and must use content type `calculation`, for example:

```text
example:calculation/worker-output
```

The calculation context is a closed inert record:

```js
{
    id: 'example:calculation/worker-output',
    inputs: {
        workers: 4,
        outputPerWorker: 10
    }
}
```

`inputs` are explicit inert data. The generic engine does not discover hidden GameState, legacy `global`, runtime, platform or application state on behalf of a calculation. The registered base function receives only its validated frozen inputs. A future first-party calculation that requires a semantic fact must arrange for that fact to be supplied explicitly at the appropriate composition boundary.

M4A calculations return finite JavaScript numbers. Positive, zero, negative and fractional values are valid. `NaN`, infinities and non-numeric results are contract failures, and negative zero is canonicalized to zero.

## Registration and runtime surface

Executable calculations are not stored in the inert M1 definition `Registry`. A calculation engine is created from a fixed registration set:

```js
{
    id,
    validateInputs,
    calculateBase
}
```

Both executable callbacks must be directly callable synchronous non-generator functions. Declared async functions, generators and classes fail registration. Runtime Promise/thenable leakage fails closed.

The frozen runtime surface is:

```text
calculate(context)
explain(context)
has(id)
ids()
```

`ids()` is deterministic and sorted. Duplicate calculation IDs fail construction.

`calculate()` and `explain()` use the same internal validation and base-calculation runner. There is no separate debug implementation that could drift from the normal result path.

## Context hardening

Raw context and input data are detached before registration callbacks see them. Calculation data rejects:

- accessors/getters;
- symbol-keyed fields;
- exotic object/array prototypes;
- sparse or extra-field arrays;
- non-finite numbers;
- functions and unsupported primitive types;
- cycles;
- repeated object identity;
- excessive nesting or collection sizes;
- hostile inspection failures.

Canonicalized objects, arrays, validated inputs, results and trace records are frozen. Caller mutation after evaluation cannot mutate the data observed by the calculation.

## Result and trace

Normal calculation returns a small frozen result:

```js
{
    calculationId: 'example:calculation/worker-output',
    value: 40,
    trace: null
}
```

The opt-in explanation path returns the same value with an inert base trace:

```js
{
    calculationId: 'example:calculation/worker-output',
    value: 40,
    trace: {
        inputs: {
            outputPerWorker: 10,
            workers: 4
        },
        steps: [
            {
                kind: 'base',
                before: null,
                after: 40
            }
        ]
    }
}
```

M4A has only one trace-step kind because modifier semantics do not exist yet. The base step establishes the continuity rule that later M4 work can extend: the base `after` is the result value, and future ordered steps can use each previous `after` as their next `before`.

Tracing is deliberately opt-in so a future hot production loop does not have to allocate explanation data on every tick.

## Determinism and failure semantics

Calculation evaluation is synchronous. The package contains no direct clock, randomness, timers, storage, network, DOM, browser or platform access. If a future calculation is affected by time or another environmental fact, that dependency must cross the appropriate later architecture boundary explicitly rather than being read invisibly inside the generic calculation kernel.

Nested calculation evaluation is prohibited, including across two calculation-engine instances. This keeps M4A free of an implicit calculation dependency graph, recursion ordering and cycle semantics. The evaluation lock is released through `finally` so a failed calculation cannot poison subsequent evaluation.

Malformed contracts and broken calculation implementations throw structured `EngineContractError` diagnostics. Evaluation errors are attributed to stable phases such as context, resolve, validate, calculate and result where possible. M4A does not invent a gameplay-style rejected result because a calculation contract failure is engine/content configuration failure rather than an expected player refusal.

## Architecture boundary

The production package is:

```text
src/engine/calculations/common.mjs
src/engine/calculations/calculation-context.mjs
src/engine/calculations/calculation-result.mjs
src/engine/calculations/calculation-engine.mjs
```

A dedicated architecture gate enforces that this package:

- remains first-party-neutral and contains no `evolve:` identities;
- imports only the M1 identity contract, the shared inert-data contract and sibling calculation modules;
- has no GameState/state-infrastructure dependency;
- has no command, condition, cost, effect, execution or queue dependency;
- has no legacy, platform or runtime dependency;
- has no mutation/transaction authority;
- has no dynamic module loading or executable dynamic-code capability;
- has no direct clock/random/browser/network/storage/timer access;
- does not repurpose the inert M1 Registry for executable handlers.

At M4A exit, production gameplay has zero consumers of `src/engine/calculations/**`. The architecture gate freezes that condition so M4A cannot accidentally become a half-cut-over production system before the reviewed M4D migration slice.

The general M0E5 engine dependency/cycle gate remains cumulative underneath this M4-specific boundary.

## Relationship to M3

M3A0 established the conceptual cost path:

```text
declared cost
  -> contextual calculation/transformation
  -> resolved quote
  -> affordability
  -> semantic payment
```

M4A supplies the generic named numeric calculation substrate without changing M3D quote/payment ownership. Payment quotes/plans remain contextual and are not durable authorization. No M3 command, including the live DNA vertical, is modified by this slice.

The legacy `adjustCosts()` chain also proves that later calculation work needs explicit deterministic transformation order, including cases that can substitute one payment resource for another. M4A deliberately does not encode those modifier/transformation rules in the base calculation contract.

## Independent review and hardening

After the initial implementation, M4A was reviewed again as untrusted work against the approved design and the completed M0-M3 contracts.

The review found and fixed two concrete closure issues:

1. the first calculation architecture scanner treated the safe `Function.prototype.toString` inspection used to reject async/generator/class callbacks as if it were executable dynamic code; the rule was narrowed to actual dynamic-code construction/execution and a negative control now distinguishes the two;
2. the historical M3 status-document gate still owned the current `M4A is next` markers. That ownership is transferred to a dedicated M4A status-document gate so the M3 guard continues to protect M3 history while M4A can advance current roadmap state to M4B.

The review also reconfirmed that no production source imports the calculation package, no vanilla gameplay behavior was moved, and no new authoritative state or mutation capability was introduced.

The hardened implementation checkpoint `173c25487e97a83f3f0a2ad1c2b9e8c0a5035c01` passed the complete Baseline build workflow in run `37666591294`: recursive Node tests, cumulative architecture gates, production build/cleanliness, the startup-exception negative control and real-browser smoke all passed. Final M4A closure additionally requires the same complete chain to pass on the final documented/hardened branch head.

## Tests

M4A test coverage includes:

- canonical calculation ID/type validation;
- fixed registration and duplicate rejection;
- deterministic `ids()` and `has()` behavior;
- detached/frozen input validation;
- finite scalar output rules including zero, negative, fractional and negative-zero cases;
- exact `calculate()` / `explain()` value parity;
- frozen base-trace shape and result continuity;
- async/generator/class and runtime thenable rejection;
- stable validation/evaluation error attribution;
- same-instance and cross-instance reentrancy rejection with lock recovery;
- hostile getter, symbol, sparse-array, cycle, repeated-identity, function and excessive-depth inputs;
- calculation dependency/authority architecture negative controls;
- dynamic-code negative controls without false-positive rejection of safe function introspection;
- zero production consumers at M4A exit;
- current status/document handoff from M4A to M4B.

No differential production comparison is added because M4A deliberately cuts over no legacy calculation. Existing characterization, simulation, build and browser suites remain the behavior-neutral regression proof.

## Deliberate deferrals

M4A does not implement:

- modifier operations or modifier ownership/order -> M4B;
- add/multiply/override/cap/floor/conditional contributions -> M4B;
- resource production/consumption/capacity/storage primitives -> M4C;
- a vanilla production vertical -> M4D;
- broad `prod.js` / `fastLoop()` migration -> M4E and M5;
- resource substitution or the permanent replacement for the full legacy `adjustCosts()` chain -> later M4 work as required by real migrations;
- authoritative resource-state migration -> M6B;
- calculation caching/memoization;
- calculation persistence;
- nested calculation/dependency-graph semantics;
- UI calculation explanation surfaces -> M8/M11;
- dynamic package registration or a public mod calculation API -> M10.

## Exit

M4A provides a hardened generic foundation for named, explicit-input, synchronous numerical calculations with an optional structured base trace. It remains inert with respect to live vanilla production and preserves the M0-M3 authority boundaries.

M4B Modifier pipeline is the next slice.
