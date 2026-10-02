# Full Refactor Test Strategy

## Purpose

The refactor is allowed to replace almost every internal implementation detail while preserving intended vanilla behavior.

Testing therefore has two jobs:

1. prove behavioral equivalence during migration;
2. prove architectural progress toward the new engine.

## Test layers

### 1. Build tests

Required continuously:

- locked dependency install;
- game bundle;
- game CSS;
- wiki bundle;
- wiki CSS;
- generated-output guard.

### 2. Legacy characterization tests

Before migrating a behavior, capture what the current implementation does.

Examples:

- action affordability/payment;
- resource production;
- capacity calculation;
- job output;
- technology unlock/grant;
- queue completion;
- achievement unlock;
- event result;
- reset/prestige reward.

Characterization does not imply every legacy behavior is desirable. If a bug is intentionally fixed, that is a separately documented gameplay/bug-fix change.

### 3. Differential tests

During migration, run equivalent scenarios through legacy and new implementations.

Compare normalized outputs.

Use differential mode only as temporary migration scaffolding. Do not keep two authoritative engines permanently.

### 4. Deterministic simulation tests

Control:

- initial state;
- RNG;
- clock/environment;
- number and cadence of simulation steps.

Compare:

- resources;
- caps/deltas;
- population/jobs;
- structures;
- technologies;
- queues;
- power/support;
- statistics;
- event state;
- combat state where deterministic;
- reset-relevant state.

### 5. Definition/schema tests

Validate:

- namespaced identity;
- owner/package;
- references to other IDs;
- condition/effect schemas;
- cost definitions;
- progression graph integrity;
- missing localization/assets where required.

### 6. Engine unit tests

Cover isolated primitives:

- registry;
- ID parser;
- state store;
- commands;
- conditions;
- effects;
- cost quotes/payment;
- modifiers;
- calculation trace;
- domain events;
- serializers/migrations.

### 7. Command transaction tests

Verify:

- validation happens before mutation;
- failed commands leave state unchanged;
- payments are atomic;
- emitted events reflect committed state;
- duplicate/replayed commands behave according to contract where relevant.

### 8. Calculation trace tests

Test both final numeric value and attributed contributors.

This catches cases where the total accidentally matches while the underlying modifier composition is wrong.

### 9. Save migration tests

Maintain:

- historical legacy fixtures;
- new-format fixtures;
- malformed/incompatible fixtures.

For each:

- load/import;
- migrate;
- validate;
- serialize;
- reload;
- compare invariants.

### 10. UI/application tests

UI tests focus on boundaries:

- selectors/view models;
- command dispatch;
- error display;
- package/mod manager;
- import/export;
- extension surfaces.

Do not use UI automation to prove simulation math.

## Fixture matrix

Initial M0 fixtures should expand beyond simple progression bands.

Minimum categories:

1. fresh evolution;
2. early civilization;
3. pre-industrial;
4. industrial;
5. early space;
6. interstellar;
7. portal/hell;
8. Eden;
9. Tau Ceti/Truepath where stable;
10. late/high-complexity;
11. reset-ready MAD;
12. reset-ready Bioseed;
13. higher reset tier;
14. active challenge;
15. multiple substantially different race/trait combinations;
16. active queues;
17. nontrivial power/support;
18. crafting/trade;
19. event-ready state.

Not every fixture must test every subsystem.

## RNG policy

Legacy behavior currently includes both seeded and unseeded random paths.

Tests should:

- capture current behavior with injected/frozen randomness where possible;
- migrate simulation randomness to the Rng port;
- avoid broad tolerances as a substitute for control;
- preserve distinct RNG streams if behavior relies on them.

## Time policy

Tests must distinguish:

- simulation time;
- wall clock;
- seasonal/calendar environment;
- worker scheduling time.

Do not make deterministic simulation depend on the real date or system clock.

## Floating-point policy

Prefer exact equality when legacy behavior is exact.

Where tolerance is necessary:

- document why;
- use the narrowest practical tolerance;
- do not widen tolerances to hide regressions.

## Architecture fitness tests

The refactor needs machine-enforced architectural direction.

### Legacy reference budgets

Measure by directory/module:

- direct `global.*`;
- jQuery/DOM/window access;
- localStorage/save direct access;
- `Date.now/new Date` in simulation;
- `Math.random/Math.rand` in simulation.

New engine directories have a budget of zero.

Legacy budgets may decrease but never increase without explicit architectural approval.

### Dependency rules

Fail CI for:

- engine importing first-party Evolve content;
- engine importing UI;
- domain/simulation importing browser adapters;
- forbidden layer cycles.

Track the size of the legacy strongly connected component until it is eliminated.

### Dead-path verification

When a migration slice declares a legacy path removed, tests should prove no call sites remain.

## Per-migration PR checklist

Every behavior-moving PR should state:

1. legacy behavior characterized;
2. new behavior tests added;
3. differential result;
4. state/save impact;
5. architecture budget impact;
6. old path deleted or explicit reason/deadline for temporary adapter;
7. no new public Mod API promise introduced accidentally.

## CI progression

### M0-M1

- build;
- harness/unit tests;
- characterization tests.

### M2-M5

Add:

- state/command/calculation tests;
- differential simulation;
- architecture budgets.

### M6-M9

Add:

- content schema validation;
- save migration suite;
- dependency-layer enforcement;
- dead legacy path checks.

### M10+

Add:

- package compatibility;
- public Mod API contract tests;
- sample mod tests;
- total-conversion certification suite.
