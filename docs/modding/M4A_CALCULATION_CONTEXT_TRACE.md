# M4A Calculation Context and Trace

## Purpose

M4A establishes the generic calculation substrate for the refactor. It defines what a named calculation is, what explicit data it may consume, how its numerical result is represented, and how the same calculation path can emit an inspectable base trace.

M4A remains infrastructure-only. No vanilla production path, `prod.js` case, `fastLoop()` calculation, cost-adjustment chain, resource authority, command path or save format is cut over by this slice.

## Calculation contract

A calculation uses the existing canonical M1 content-ID grammar and must use content type `calculation`, for example:

```text
example:calculation/worker-output
```

The public calculation context is a closed inert record:

```js
{
    id: 'example:calculation/worker-output',
    inputs: {
        workers: 4,
        outputPerWorker: 10
    }
}
```

`inputs` are explicit inert data. The generic calculation package does not discover hidden GameState, legacy `global`, runtime, platform or application state. A future first-party calculation that needs a semantic fact must receive that fact explicitly at the appropriate composition boundary.

M4A calculations return finite JavaScript numbers. Positive, zero, negative and fractional values are valid. `NaN`, infinities and non-numeric results are contract failures. Negative zero is canonicalized to zero.

## Registration and runtime surface

Executable calculations are not stored in the inert M1 definition `Registry`. A calculation engine is constructed from a fixed registration set:

```js
{
    id,
    validateInputs,
    calculateBase
}
```

Both callbacks must be directly callable synchronous non-generator functions. Declared async functions, generators and classes fail registration. Runtime Promise/thenable leakage also fails closed.

The frozen engine surface is:

```text
calculate(context)
explain(context)
has(id)
ids()
```

`ids()` is deterministic and sorted. Duplicate calculation IDs fail construction.

`calculate()` and `explain()` share one validation and base-calculation runner. Explanation is not a second gameplay implementation.

## Context hardening

Raw context and input data are detached before a registration callback sees them. Calculation data rejects:

- accessors/getters;
- symbol-keyed fields;
- exotic object/array prototypes;
- sparse or extra-field arrays;
- non-finite numbers;
- functions and unsupported primitive types;
- cycles;
- repeated object identity;
- excessive nesting;
- excessive collection lengths and object field counts;
- hostile inspection failures.

Canonicalized objects, arrays, validated inputs, results and trace records are frozen. Validator output is canonicalized again before `calculateBase()` receives it, so a validator cannot smuggle an accessor, exotic object or shared mutable structure into the evaluator.

## Result and trace

Normal calculation returns a small frozen result:

```js
{
    calculationId: 'example:calculation/worker-output',
    value: 40,
    trace: null
}
```

The internal result builder independently revalidates `calculationId`; it cannot manufacture a result carrying a command ID, non-canonical ID or other non-calculation identity even if called directly by later sibling calculation code.

The result builder's options are also a closed inert contract. The optional `trace` flag must be boolean, unknown/accessor-backed options fail closed, and trace inputs are required when tracing is enabled.

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

M4A has one trace-step kind because modifier semantics do not exist yet. The base step establishes the continuity law for later M4 work: base `after` equals the calculation result, and later ordered modifier steps may continue from the preceding `after` value.

Tracing is opt-in so future hot production loops do not have to allocate explanation data on every tick.

## Determinism and failure semantics

Calculation evaluation is synchronous. The package contains no direct clock, randomness, timers, storage, network, DOM, browser or platform access. Environmental facts needed by later calculations must cross reviewed boundaries explicitly rather than being read invisibly inside the calculation kernel.

Nested calculation evaluation is prohibited, including across different calculation-engine instances. M4A therefore does not accidentally define recursive calculation ordering, dependency-graph or cycle semantics. A module-level evaluation lock is released through `finally`, so failure cannot poison later evaluations.

Malformed contracts and broken calculation implementations throw structured `EngineContractError` diagnostics. Evaluation failures carry stable phase context such as context, resolve, validate, calculate and result where possible. M4A does not convert engine/content contract failures into gameplay-style rejected results.

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

At M4A exit, production gameplay has zero consumers of `src/engine/calculations/**`. The scanner protecting that rule has an executable negative control proving it detects static ESM imports, dynamic literal imports and CommonJS `require()` consumers while ignoring unrelated engine imports. This prevents a broken scanner from falsely reporting a clean zero-consumer state.

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

M4A supplies only the generic named numeric calculation substrate. It does not change M3D quote/payment ownership. Payment quotes/plans remain contextual and are not durable authorization. No M3 command, including the live DNA vertical, is modified by M4A.

The legacy `adjustCosts()` chain proves that later calculation work needs explicit deterministic transformation order, including resource-substitution cases. M4A deliberately does not encode those modifier/transformation semantics in the base calculation contract.

## Independent review and hardening

The first implementation review treated M4A as untrusted against the approved design and completed M0-M3 contracts. It found and fixed two closure issues:

1. the initial calculation architecture scanner treated safe `Function.prototype.toString` inspection used to reject async/generator/class callbacks as executable dynamic code; the rule was narrowed to actual dynamic-code construction/execution and a negative control distinguishes the two;
2. the historical M3 status-document gate still owned current `M4A is next` markers; current M4 status ownership moved to the M4A status guard while the M3 guard retained historical M3 closure responsibility.

The initial hardened implementation checkpoint `173c25487e97a83f3f0a2ad1c2b9e8c0a5035c01` passed the complete Baseline workflow in run `37666591294`. The later documented implementation head also passed the complete branch workflow before PR #53 merged M4A to `master` as `304947a9993460458107e3a47a7eff3ccbeafb4a`.

The first post-merge Baseline run on `304947a9993460458107e3a47a7eff3ccbeafb4a` passed Node tests, architecture and build/cleanliness, but was eventually cancelled while running the browser startup-failure negative control. That incomplete run is not used as final closure proof.

## Post-merge independent review and hardening

A second independent review was explicitly requested after the first M4A merge. The review froze `304947a9993460458107e3a47a7eff3ccbeafb4a` as its base and inspected the implementation, hostile-input behavior, architecture boundaries, production-consumer proof, status documents and CI evidence again before changing code.

This review found and fixed the following justified gaps:

1. `createCalculationResult()` trusted its caller-supplied `calculationId`. It now independently requires a canonical content ID of type `calculation`, matching the defensive pattern already used by M3 result normalization.
2. The internal result builder accepted an open options bag and could read accessor-backed `trace`/`inputs` properties. Result options are now a closed inert contract with boolean trace semantics and required inputs when tracing.
3. The zero-production-consumer scanner had only a positive clean-repository assertion. A synthetic negative control now proves static imports, dynamic imports and CommonJS consumers are actually detected.
4. Adversarial coverage was expanded for validator-returned hostile/accessor data, accessor-backed thenables, exotic/proxy inputs, collection/object limits, hidden registration fields, sparse registration arrays, lock recovery after hostile input, and direct result construction.

No production source gained a calculation import, no first-party calculation registration was added, no vanilla behavior moved, and no M4B modifier semantics were introduced.

Code-hardening head `442182acb737e520144ff54e1fe0c6a1c131b263` passed the complete Baseline workflow in run `37673775002`: recursive Node tests, cumulative architecture gates, production build/cleanliness, the browser startup-failure negative control and the real-browser smoke test all passed. The earlier browser cancellation did not reproduce on this fixed head, so no unrelated browser-harness change was pulled into M4A.

The merge gate for this review remains the execution protocol's final exact-head rule: the documentation-bearing hardening head must pass the same complete Baseline chain before it is merged, and the merged `master` head must be verified again before M4A is considered closed after this second review.

## Tests

M4A coverage now includes:

- canonical calculation ID/type validation at context, registration and result-construction boundaries;
- fixed registration and duplicate rejection;
- hidden registration-field and sparse-registration-array rejection;
- deterministic `ids()` and `has()` behavior;
- detached/frozen raw and validated inputs;
- hostile/accessor/exotic/proxy input rejection without executing accessors;
- cycle and repeated-identity rejection;
- nesting, array-length and object-field limits;
- finite scalar output rules including zero, negative, fractional and negative-zero cases;
- exact `calculate()` / `explain()` path/value contract;
- frozen base-trace shape and result continuity;
- closed inert result options;
- async/generator/class and runtime thenable rejection;
- accessor-backed thenable rejection without invoking the accessor;
- stable validation/evaluation error attribution;
- same-instance and cross-instance reentrancy rejection with lock recovery;
- calculation dependency/authority architecture negative controls;
- dynamic-code negative controls without false-positive rejection of safe function introspection;
- executable negative control for the zero-production-consumer scanner;
- current status/document handoff from M4A to M4B.

No differential production comparison is added because M4A cuts over no legacy calculation. Existing characterization, simulation, build and browser suites remain the behavior-neutral regression proof.

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
