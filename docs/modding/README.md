# Evolve Engine Refactor and Modding Project

This directory is the design authority for the Evolve Moddability fork.

## Goal

Refactor Evolve completely into a clean, modular incremental-game engine while preserving vanilla behavior during migration.

Vanilla Evolve will be migrated onto the same engine capabilities later exposed to mods. Legacy adapters are temporary scaffolding, not the final architecture.

The end state is:

```text
platform/browser
      |
application + UI
      |
engine
|-- state
|-- commands
|-- conditions/effects
|-- calculations/modifiers
|-- simulation
|-- events
|-- persistence
|-- registries
      |
      +-- first-party Evolve content
      +-- external content/mods
      +-- total conversions
```

## Core rules

1. Preserve vanilla behavior unless a change is explicitly designated as gameplay-changing.
2. New engine code must not depend on legacy `global`, DOM structure, or vanilla content IDs.
3. Vanilla must eventually use the same content/engine mechanisms available to mods.
4. Adapters must have explicit deletion milestones.
5. Do not freeze a public Mod API until vanilla has exercised the internal engine contracts.
6. Every migrated slice ends by deleting or shrinking the old path.
7. Keep the game buildable and preferably playable throughout migration.

## Documents

Start with [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) when you need to know which document or machine-enforced contract is authoritative **now**. Slice documents remain migration history; milestone closure documents, later final-review hardening records and the cumulative retrospective win when they supersede an earlier slice description.

- [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md): compact authority index, current dependency direction, and M0-M3 contract map.
- [M0_M3_RETROSPECTIVE_HARDENING.md](M0_M3_RETROSPECTIVE_HARDENING.md): cumulative pre-M4 re-audit of all completed milestones and cross-milestone hardening.
- [FULL_REFACTOR_AUDIT.md](FULL_REFACTOR_AUDIT.md): code-driven architectural audit and migration implications.
- [ARCHITECTURE.md](ARCHITECTURE.md): target engine architecture and dependency rules.
- [ROADMAP.md](ROADMAP.md): staged full-refactor roadmap.
- [TEST_STRATEGY.md](TEST_STRATEGY.md): regression, differential, architecture, and migration testing.
- [MOD_API.md](MOD_API.md): public API direction after internal contracts are proven.
- [MOD_FORMAT.md](MOD_FORMAT.md): package, manifest, dependency, and storage format.
- [TOTAL_CONVERSIONS.md](TOTAL_CONVERSIONS.md): total-conversion certification requirements.
- [BACKLOG.md](BACKLOG.md): current implementation sequence and issue mapping.
- [BASELINE.md](BASELINE.md): reproducible M0A baseline.
- [M0B_HARNESS.md](M0B_HARNESS.md): legacy characterization harness and deterministic browser/runtime shims.
- [M0C_FIXTURES.md](M0C_FIXTURES.md): representative source-anchored fixture catalog.
- [M0D_SIMULATION.md](M0D_SIMULATION.md): deterministic legacy simulation oracle and differential harness.
- [M0E3_FIXTURE_HYDRATION.md](M0E3_FIXTURE_HYDRATION.md): persisted-fixture lifecycle, hydration ownership, and runtime-isolation rules.
- [BROWSER_SMOKE.md](BROWSER_SMOKE.md): M0E4 real-browser bootstrap, fresh-game interaction, and startup-failure tripwire.
- [M0E5_ARCHITECTURE_GUARDRAILS.md](M0E5_ARCHITECTURE_GUARDRAILS.md): protected engine boundary, legacy ratchets, dependency-cycle baseline, and future milestone CI.
- [M0_CLOSURE_REVIEW.md](M0_CLOSURE_REVIEW.md): integrated M0 safety/reproducibility closure authority added by the pre-M4 retrospective.
- [M1_CLOSURE_REVIEW.md](M1_CLOSURE_REVIEW.md): final M1 kernel/seam audit before state architecture began.
- [M2A_GAME_STATE_SCHEMA.md](M2A_GAME_STATE_SCHEMA.md): GameState value, schema-version, ownership, and layer laws.
- [M2B_STATE_STORE_SELECTORS.md](M2B_STATE_STORE_SELECTORS.md): read store, selectors, mutation authority, scopes, transactions, snapshots, and change diagnostics.
- [M2C3_STATE_BOUNDARY_CLOSURE.md](M2C3_STATE_BOUNDARY_CLOSURE.md): final settings/transient-state boundary and legacy debt ratchets.
- [M2D4_ACHIEVEMENT_READER_CUTOVER.md](M2D4_ACHIEVEMENT_READER_CUTOVER.md): completed read-side cutover for the first authoritative domain.
- [M2E1_STATE_DOMAIN_OWNERSHIP.md](M2E1_STATE_DOMAIN_OWNERSHIP.md): machine-readable GameState domain ownership.
- [M2E2_MUTATION_BOUNDARY.md](M2E2_MUTATION_BOUNDARY.md): write-capability confinement and semantic mutation surfaces.
- [M2E3_SELECTOR_STATE_DEPENDENCIES.md](M2E3_SELECTOR_STATE_DEPENDENCIES.md): semantic read surfaces and state-layer dependency DAG.
- [M2_CLOSURE_REVIEW.md](M2_CLOSURE_REVIEW.md): final integrated M2 exit architecture and closure gate.
- [M3_CLOSURE_REVIEW.md](M3_CLOSURE_REVIEW.md): integrated M3 command/condition/effect/payment/queue/first-cutover architecture at milestone exit.
- [M3_FINAL_REVIEW_HARDENING.md](M3_FINAL_REVIEW_HARDENING.md): full post-closure M3 audit, test-manifest hardening, architecture-report versioning, and cross-milestone review.

Older slice-specific M2 and M3 design/review-hardening notes remain useful migration history. `M0_CLOSURE_REVIEW.md`, `M1_CLOSURE_REVIEW.md` and `M2_CLOSURE_REVIEW.md` are the combined authorities for their milestones. For M3, read `M3_CLOSURE_REVIEW.md` together with the later `M3_FINAL_REVIEW_HARDENING.md` audit. `M0_M3_RETROSPECTIVE_HARDENING.md` records the later cumulative pre-M4 verification and any cross-milestone hardening that supersedes those earlier reviews.

## Non-goals for early milestones

Early milestones do not:

- redesign vanilla balance;
- bulk-convert every definition to JSON;
- replace the UI framework in one shot;
- expose raw `global` to mods;
- promise long-term compatibility for internal migration adapters;
- package Android before persistence/package semantics stabilize;
- perform a big-bang rewrite.

The refactor is incremental, but the destination is not incremental: the legacy architecture is intended to be removed.
