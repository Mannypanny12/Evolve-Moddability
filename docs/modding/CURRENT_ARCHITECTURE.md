# Current Architecture Authority

This is the short navigation index for the architecture that is true **now**.

Slice documents remain valuable migration history, but when an older slice note conflicts with a later closure, final-review or cumulative retrospective document, use the newest authority listed here.

## Milestone status

| Milestone | Status | Current authority |
| --- | --- | --- |
| M0 Safety and reproducibility | complete | `M0_CLOSURE_REVIEW.md`, `M0_M3_RETROSPECTIVE_HARDENING.md` |
| M1 Engine kernel and seams | complete | `M1_CLOSURE_REVIEW.md`, `M0_M3_RETROSPECTIVE_HARDENING.md` |
| M2 Explicit state architecture | complete | `M2_CLOSURE_REVIEW.md`, `M0_M3_RETROSPECTIVE_HARDENING.md` |
| M3 Commands, conditions, effects and costs | complete | `M3_CLOSURE_REVIEW.md`, `M3_FINAL_REVIEW_HARDENING.md`, `M0_M3_RETROSPECTIVE_HARDENING.md` |
| M4 Calculation and modifier engine | in progress | `M4A_CALCULATION_CONTEXT_TRACE.md`, `ROADMAP.md` |

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
            +-- calculation context + base trace                [M4A]

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
- M4A calculations are named, synchronous finite-number computations over explicit inert inputs; the generic calculation package does not read state, runtime, platform or legacy data itself.
- `calculate()` and `explain()` share one base-calculation path; explanation adds inert trace data rather than a second gameplay implementation.
- `src/engine/calculations/**` has zero production consumers at M4A exit; live calculation cutover begins only in a later reviewed migration slice.

## M0 authority: safety net

`M0_CLOSURE_REVIEW.md` is the combined M0 exit authority added by the pre-M4 retrospective.

Read these for the underlying safety contracts:

- `M0E5_ARCHITECTURE_GUARDRAILS.md` for engine/legacy dependency and ratchet rules.
- `M0D_SIMULATION.md` for deterministic differential simulation.
- `M0C_FIXTURES.md` and `M0E3_FIXTURE_HYDRATION.md` for representative fixtures and hydration.
- `BROWSER_SMOKE.md` for real-browser startup and interaction smoke coverage.
- `TEST_STRATEGY.md` for the complete regression strategy.

The full Node suite recursively discovers every `*.test.cjs` file. Architecture gates then run as a cumulative explicit command chain in CI. The repository-wide architecture-test coverage gate requires every direct command in that chain to exist exactly once and to have an independently discovered same-name `*.test.cjs` wrapper. M3G additionally self-audits the direct M3 gate inventory so M3-specific gates cannot silently fall out of its milestone closure.

## M1 authority: engine kernel

`M1_CLOSURE_REVIEW.md` is the combined authority for M1. The later `M0_M3_RETROSPECTIVE_HARDENING.md` records the pre-M4 revalidation against the enlarged M2/M3 repository.

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

`M2_CLOSURE_REVIEW.md` is the combined authority for M2. The later `M0_M3_RETROSPECTIVE_HARDENING.md` records the pre-M4 revalidation and the cross-milestone test-wiring hardening.

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

Read `M3_CLOSURE_REVIEW.md` for the integrated milestone design/exit authority, `M3_FINAL_REVIEW_HARDENING.md` for the later whole-M3 audit, and `M0_M3_RETROSPECTIVE_HARDENING.md` for the subsequent cross-milestone pre-M4 revalidation.

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
- atomic settlement revalidates live resource state immediately before mutation and rolls partial writes back.
- generic command/condition/cost/effect/execution/queue packages remain first-party-neutral and cannot depend upward on application/content/legacy/platform code.
- the DNA content command has no direct `global`, DOM, queue or raw legacy-state access.
- the application layer composes reviewed capabilities but does not reimplement gameplay semantics.
- the legacy RNA/DNA write bridge remains temporary compatibility debt until the owning migration removes it.
- `WorkQueue` remains deliberately non-authoritative in production at M3 exit.
- every direct M3 architecture gate must remain represented exactly once in `test:architecture` and by an independently discovered `*.test.cjs` wrapper.

## M4 authority: calculation architecture

`M4A_CALCULATION_CONTEXT_TRACE.md` is the current M4 authority. M4A establishes the base calculation contract only; modifier semantics remain M4B.

Current M4 laws:

- calculation identity reuses the canonical M1 content-ID grammar with type `calculation`;
- contexts are closed `{ id, inputs }` inert data;
- executable calculation registrations are fixed `{ id, validateInputs, calculateBase }` handlers rather than M1 Registry definitions;
- base calculation output is a finite number, with `-0` normalized to `0`;
- raw and validated inputs are detached/canonicalized/frozen and hostile shapes fail closed;
- `calculate()` is the normal low-allocation path and returns `trace: null`;
- `explain()` runs the same validation/base calculation and adds a frozen base trace containing validated inputs and one `before: null` / `after: value` step;
- async/generator/class handlers, Promise/thenable leakage and nested/cross-instance evaluation are rejected;
- the calculation package owns no state read/write authority and has no direct runtime, legacy, platform, M3 semantic-package or first-party Evolve dependency;
- production code has no calculation-package consumer yet, so vanilla behavior remains unchanged at M4A exit.

The M4A boundary and status-document gates are cumulative members of `npm run test:architecture`. The historical M3 status gate now protects M3 closure rather than owning current M4 progression markers.

## Architecture inspector

Run:

```text
npm run inspect:architecture
```

Architecture report version 6 currently combines:

- M0 legacy budgets and dependency-cycle data;
- M1 protected-layer status and concrete engine-kernel structure;
- legacy mapping inspection;
- M2C state-boundary debt;
- M2D authority/reader migration gates;
- M2E ownership, write-capability, selector, and dependency gates;
- M3 command-architecture closure, including the reviewed live DNA command/runtime/settlement seams, generic package roots, queue-production-consumer count, prerequisite gate counts, cross-layer violations, and M3 architecture-test coverage violations.

The report is not bumped solely for M4A because M4A adds no new report field. Its boundaries are enforced directly by the M4A architecture gates. A later calculation-architecture report extension should bump the report version when the report shape actually changes.

M2D3/M2D4 and the M3G closure gate expose composable scanner functions directly, so the report consumes the same rule implementations as their standalone CLI gates rather than maintaining a second architecture truth.

## Historical documents

A slice design/review document describes what was true or being decided at that slice. Do not rewrite those files merely because later work advanced the architecture.

When two documents appear to disagree:

1. use this index to identify the current closure/final-review/retrospective authority;
2. prefer the latest milestone or cumulative authority over an earlier slice document;
3. prefer machine-enforced contracts/tests over stale prose;
4. update this index, the relevant closure/final-review/retrospective authority, roadmap, and backlog when a later milestone intentionally changes a permanent rule.

## Cumulative pre-M4 verification

`M0_M3_RETROSPECTIVE_HARDENING.md` records the later whole-stack audit of all completed milestones. It does not replace the detailed milestone designs; it records that their current implementations, test surfaces and cross-milestone assumptions were rechecked together before M4.

## Next architectural work

M4A is complete: **Calculation context and trace**.

M4B is next: **Modifier pipeline**.

M4B should add deterministic modifier operations, ordering and ownership on top of the M4A base-calculation/result/trace contract. It must preserve M4A's explicit-input, state-free calculation kernel and must not prematurely begin M4C resource primitives or M4D vanilla production cutover.
