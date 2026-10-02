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

Authoritative legacy-state normalization must fail closed for unknown top-level state roots and unknown top-level settings. Mixed settings require an explicit include/exclude decision backed by production behavior; names that appear presentational are not sufficient evidence for exclusion.

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

Worker cadence defaults used by the deterministic oracle must come from a frozen, validated runtime contract rather than duplicated test-local constants. Where cadence spans multiple worker messages, tests should protect phase continuity across calls as well as single-call totals.

Do not make deterministic simulation depend on the real date or system clock.

## Floating-point policy

Prefer exact equality when legacy behavior is exact.

Where tolerance is necessary:

- document why;
- use the narrowest practical tolerance;
- do not widen tolerances to hide regressions.

Frozen historical oracle snapshots are stricter: their canonical normalized state and SHA-256 must match exactly. Numeric tolerance is reserved for differential comparison between legacy and a migration candidate, not for accepting drift in a frozen golden.

## Architecture fitness tests

The refactor needs machine-enforced architectural direction.

### Legacy reference budgets

Measure by directory/module:

- direct `global.*`;
- jQuery/DOM/window access;
- localStorage/save direct access;
- `Date.now/new Date` in simulation;
- `Math.random/Math.rand` in simulation.

`src/engine/**` has a hard budget of zero. Browser/platform adapters belong outside that protected engine directory.

Legacy budgets are recorded per top-level legacy module. They may decrease but never increase. When a measured value decreases, the stored baseline must be lowered in the same change so the old headroom cannot be reused later.

### Dependency rules

Fail CI for:

- engine importing first-party Evolve content;
- engine importing UI;
- domain/simulation importing browser adapters;
- forbidden layer cycles.

Track both the size and membership of legacy strongly connected components until they are eliminated. A module that becomes acyclic is removed from the allowed legacy-cycle set and may not silently rejoin later.

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
- characterization tests;
- minimal real-browser bootstrap/UI smoke with a proven startup-exception negative control;
- M0E5 architecture fitness gate with zero-budget `src/engine/**` rules and downward-only legacy ratchets.

### M2-M5

Add:

- state/command/calculation tests;
- differential simulation;
- state-ownership and layer rules layered onto the existing M0E5 architecture budgets.

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
