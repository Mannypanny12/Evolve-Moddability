# Current Architecture Authority

This is the short navigation index for the architecture that is true **now**.

Slice documents remain valuable migration history, but when an older slice note conflicts with a later closure document, use the newest authority listed here.

## Milestone status

| Milestone | Status | Current authority |
| --- | --- | --- |
| M0 Safety and reproducibility | complete | `ROADMAP.md`, `M0E5_ARCHITECTURE_GUARDRAILS.md`, `TEST_STRATEGY.md` |
| M1 Engine kernel and seams | complete | `M1_CLOSURE_REVIEW.md` |
| M2 Explicit state architecture | complete | `M2_CLOSURE_REVIEW.md` |
| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md` |
| M4 Calculation and modifier engine | next | `ROADMAP.md` |

## Current dependency direction

```text
legacy gameplay / compatibility caller
            |
            v
application composition
            |
            v
first-party content commands
            |
            v
generic engine semantic APIs
            |
            +-- identity + registries + definitions       [M1]
            +-- runtime ports                             [M1]
            +-- GameState selectors / mutation services  [M2]
            +-- commands / conditions                    [M3]
            +-- costs / effects / execution              [M3]
            +-- inert queue model                        [M3]

legacy bridge (temporary) may adapt legacy state to reviewed
engine contracts, but generic engine packages never depend back
on application, first-party content, legacy or platform layers.
```

Permanent direction rules:

- `src/engine/**` does not depend on legacy gameplay, DOM/browser globals, platform implementations, application composition or first-party Evolve content.
- platform code may depend on engine contracts but not on the legacy bridge.
- the legacy bridge may depend on reviewed engine APIs while it exists; engine/platform may not depend back on it.
- definitions and registries describe content identity/static data and do not own mutable save state.
- authoritative GameState domains have explicit owners, semantic selectors, and semantic mutation services.
- raw mutation authority and raw whole-state reads are infrastructure capabilities, not ordinary gameplay APIs.
- command dispatch orchestrates reviewed semantic capabilities rather than becoming generic state-mutation authority.
- conditions remain read-only and distinct from payment/affordability.
- effect and payment plans are inert data, not stored mutation authority.
- `WorkQueue` remains an inert queue model at M3 exit and has no production gameplay execution consumer.

## M0 authority: safety net

Read these when changing test/build/refactor safety:

- `M0E5_ARCHITECTURE_GUARDRAILS.md` for engine/legacy dependency and ratchet rules.
- `M0D_SIMULATION.md` for deterministic differential simulation.
- `M0C_FIXTURES.md` and `M0E3_FIXTURE_HYDRATION.md` for representative fixtures and hydration.
- `BROWSER_SMOKE.md` for real-browser startup and interaction smoke coverage.
- `TEST_STRATEGY.md` for the complete regression strategy.

The full Node suite recursively discovers every `*.test.cjs` file. Architecture gates then run as a cumulative command chain in CI.

## M1 authority: engine kernel

`M1_CLOSURE_REVIEW.md` is the combined authority for M1.

Current M1 structure is also emitted by `npm run inspect:architecture`:

- canonical identity helpers and `Registry` kernel;
- definition families and schema versions;
- registry factories/validators;
- Clock, RNG, Storage and Logger runtime ports;
- runtime-environment composition;
- registry inspection surface;
- platform and legacy-bridge boundary status.

Detailed historical design remains in `M1A_*`, `M1B_*`, `M1C_*`, and `M1D_*` notes.

## M2 authority: state architecture

`M2_CLOSURE_REVIEW.md` is the combined authority for M2.

The current authoritative root is GameState schema version 2:

```text
schemaVersion   metadata, not runtime writable
achievements    authoritative domain owned by achievement-state
```

Current laws:

- GameState is a closed inert data tree with independently versioned schema.
- every authoritative domain has one explicit owner;
- readers use semantic selectors/queries;
- writes use reviewed semantic mutation services with least-privilege scopes;
- application settings, UI session state, caches, working state, services, migration/debug data and generic catch-all buckets do not become GameState domains;
- `GameState.achievements` is authoritative after hydration;
- `global.stats.achieve` is a temporary compatibility/save projection, not competing authority.

For specific state contracts use:

- `M2A_GAME_STATE_SCHEMA.md` for state-value and ownership laws;
- `M2B_STATE_STORE_SELECTORS.md` for store/selectors/scopes/transactions;
- `M2C3_STATE_BOUNDARY_CLOSURE.md` for settings/transient separation;
- `M2D3_ACHIEVEMENT_AUTHORITY_CUTOVER.md` and `M2D4_ACHIEVEMENT_READER_CUTOVER.md` for the first real migration;
- `M2E1_STATE_DOMAIN_OWNERSHIP.md`, `M2E2_MUTATION_BOUNDARY.md`, and `M2E3_SELECTOR_STATE_DEPENDENCIES.md` for machine-enforced ownership/read/write rules.

## M3 authority: command architecture

`M3_CLOSURE_REVIEW.md` is the combined authority for M3. `M3_POST_CLOSURE_AUDIT.md` records the later whole-milestone review and hardening performed against the closed M3 head; where it strengthens an M3 implementation detail without changing milestone scope, it is the newer authority for that detail.

The first live vanilla vertical is `evolve:command/evolution/dna`:

```text
src/actions.js compatibility shim
        |
        v
src/application/evolve/evolution-dna-command-runtime.mjs
        |
        v
CommandBus -> DNA command
        |
        +--> execution condition
        +--> fresh payment/effect plans
        |
        v
src/engine/execution/resource-commit.mjs
        |
        v
bounded legacy RNA/DNA commit capability
```

Current M3 laws:

- `CommandBus` validates and orchestrates but owns no generic raw mutation authority.
- command results are structured success/rejection data; broken contracts/infrastructure remain hard diagnostics.
- availability/execution conditions, affordability/payment and queue readiness remain distinct concepts.
- conditions are read-only.
- payment quotes/plans are contextual and are not durable authorization tokens.
- effect plans are inert semantic operations without direct execution authority.
- atomic settlement revalidates live resource/root state before and throughout mutation, verifies write/rollback readback, and rolls transaction writes back before an intra-commit verification failure escapes.
- generic command/condition/cost/effect/execution/queue packages remain first-party-neutral and cannot depend upward on application/content/legacy/platform code.
- the DNA content command has no direct `global`, DOM, queue or raw legacy-state access.
- the application layer composes reviewed capabilities but does not reimplement gameplay semantics.
- the legacy RNA/DNA write bridge remains temporary compatibility debt until the owning migration removes it.
- `WorkQueue` remains deliberately non-authoritative in production at M3 exit, and the integrated M3G gate independently rejects premature production consumers.

## Architecture inspector

Run:

```text
npm run inspect:architecture
```

The versioned JSON report currently combines:

- M0 legacy budgets and dependency-cycle data;
- M1 protected-layer status and concrete engine-kernel structure;
- legacy mapping inspection;
- M2C state-boundary debt;
- M2D authority/reader migration gates;
- M2E ownership, write-capability, selector, and dependency gates;
- M3 command-architecture closure, including the reviewed live DNA command/runtime, named command/condition/payment/effect/queue/settlement seams, generic package roots, queue authority/consumer state, explicit legacy compatibility debt/removal target, prerequisite gate counts and cross-layer violations.

M2D3/M2D4 and the M3G closure gate expose composable scanner functions directly, so the report consumes the same rule implementations as their standalone CLI gates rather than maintaining a second architecture truth.

## Historical documents

A slice design/review document describes what was true or being decided at that slice. Do not rewrite those files merely because later work advanced the architecture.

When two documents appear to disagree:

1. use this index to identify the current closure authority;
2. prefer the latest milestone closure or post-closure audit document over an earlier slice document;
3. prefer machine-enforced contracts/tests over stale prose;
4. update this index, the relevant closure authority, roadmap, and backlog when a later milestone intentionally changes a permanent rule.

## Next architectural work

M4A is next: **Calculation context and trace**.

It should build traceable named calculations on top of the existing M0-M3 safety floor without moving modifier logic into commands, conditions or the compatibility bridge. M3's first command vertical remains the proof that execution can be cleanly composed while M4 introduces the calculation/modifier substrate needed for broader production migration.
