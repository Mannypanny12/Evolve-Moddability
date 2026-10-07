# M0 Closure Review

## Purpose

This document is the whole-milestone closure authority for M0, the safety and reproducibility foundation of the refactor.

M0 was implemented before later milestones adopted dedicated whole-milestone closure documents. The M0-M3 retrospective therefore re-audited M0 as one system and records its final exit contract here without rewriting the historical slice documents.

## Reviewed scope

M0 consists of:

- M0A reproducible vanilla baseline;
- M0B deterministic characterization harness;
- M0C representative source-anchored fixture catalog;
- M0D deterministic simulation oracle and golden snapshots;
- M0E1 broader state/technology parity coverage;
- M0E2 ARPA/space exposure coverage;
- M0E3 persisted-fixture hydration and runtime isolation;
- M0E4 real-browser bootstrap and interaction smoke coverage;
- M0E5 architecture, legacy-debt and dependency guardrails.

The retrospective also reviewed the recursive test runner, fixture inventory checks, state-normalization fail-closed behavior, oracle snapshot updater, CI ordering, production build, generated-output cleanliness and browser negative controls.

## Exit result

No unresolved in-scope M0 behavior or safety defect was found in the retrospective review.

M0 remains a valid safety floor for later refactor milestones. It does not attempt to prove every future feature correct. It proves that the repository has deterministic characterization tools, representative legacy fixtures, a source-backed simulation oracle, real-browser smoke coverage and machine-enforced architectural ratchets capable of detecting unintended migration drift.

## Current M0 contract

### Reproducible baseline

The legacy baseline is tied to a reviewed upstream revision and build procedure. Refactor work is compared against that known baseline rather than against an unspecified moving target.

### Deterministic characterization

The Node harness controls browser/runtime dependencies needed by characterized legacy code, including storage, time and randomness. Characterization runs use isolated state rather than sharing hidden mutable process state across scenarios.

### Representative fixtures

Fixtures are named, source-anchored scenarios built from the canonical initialized base plus explicit overlays. Catalog tests fail closed on malformed metadata, duplicate or mismatched fixture identity, missing source evidence and unknown invariant syntax.

Fixtures are representative parity evidence, not an exhaustive save-format schema.

### Persisted-to-live hydration

Persisted fixture input is explicitly hydrated into the legacy live runtime before simulation. A process may not silently reuse a previously hydrated scenario as if it were a fresh load.

### Deterministic simulation oracle

The simulation harness uses the production legacy loop and records normalized deterministic results for reviewed scenario/tick combinations. Each oracle execution occurs in a fresh child process, and repeated execution must agree.

Normalization is deliberately fail-closed:

- unknown top-level state is not silently ignored;
- unknown settings/resource fields are not silently accepted;
- unsupported non-finite values are rejected except where a reviewed legacy contract explicitly allows them;
- the undefined sentinel remains distinct from missing data.

### Golden snapshot maintenance

`npm run oracle:update` is not an unconditional expectation rewriter.

For selected scenarios the updater first runs and validates the complete selected set, including repeatability, before writing snapshots. A behavioral hash change requires explicit `--accept`; without acceptance, behavioral drift is rejected. Canonical-byte rewrites with the same behavior hash remain permitted.

### Architecture guardrails

M0E5 protects the engine boundary with import/dependency rules, cycle detection, legacy-global ratchets and reviewed browser/storage/time/randomness boundaries. Later milestones may tighten these budgets, but they may not silently weaken the M0 floor.

### Real-browser proof

The browser smoke layer serves and boots the production build in real Chrome. It includes a startup-exception negative control that deliberately injects failure and proves the harness observes it before the positive smoke run is trusted.

The positive smoke performs a fresh-game RNA-to-DNA interaction and treats severe browser/runtime errors as failures.

## CI contract

The repository safety chain keeps the following ordering:

1. recursive Node tests;
2. architecture fitness gates;
3. production game/wiki build;
4. generated-output cleanliness;
5. browser startup-failure negative control;
6. real-browser smoke coverage.

Later milestones may add stronger gates and browser proofs, but M0's baseline protections remain part of the chain.

## Reviewed suspicious areas

The retrospective specifically rechecked areas where a safety harness can accidentally become self-approving:

- fixture catalog/invariant parsing remains fail-closed;
- the state normalizer rejects unknown shape instead of merely dropping it;
- simulation goldens are source/runtime-derived, not hand-authored desired results;
- the oracle updater requires explicit acceptance for behavioral hash changes and validates selected scenarios before writes;
- browser smoke proves its own startup-error detection before using the same machinery as positive evidence.

No justified code change was found in these M0 components.

## Relationship to later milestones

M1-M3 build on M0 rather than replace it.

- M1 adds engine identity, registries, runtime ports and bridge boundaries under the M0 safety floor.
- M2 adds explicit authoritative state and migration gates while M0 remains the parity oracle.
- M3 adds command/condition/effect/payment/execution architecture and its first live DNA cutover while retaining M0 Node/build/browser proof.

The M0-M3 retrospective added a repository-wide architecture-test coverage guard so direct architecture gates in the explicit CI chain must also have independent `*.test.cjs` coverage. That is a later hardening of the test wiring, not a change to M0 gameplay semantics.

## Authority

For current M0 safety rules, read this document together with:

- `BASELINE.md`;
- `M0B_HARNESS.md`;
- `M0C_FIXTURES.md`;
- `M0D_SIMULATION.md`;
- `M0E3_FIXTURE_HYDRATION.md`;
- `BROWSER_SMOKE.md`;
- `M0E5_ARCHITECTURE_GUARDRAILS.md`;
- `TEST_STRATEGY.md`.

Historical slice documents explain how the safety floor was built. This closure review records the integrated M0 exit state after the M0-M3 retrospective.
