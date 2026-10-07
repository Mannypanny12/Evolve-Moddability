# M0-M3 Retrospective Review and Hardening

## Purpose

This document records the pre-M4 retrospective review of every completed milestone from M0 through M3.

The goal was not to redesign already-closed milestones. The review re-opened their contracts as one cumulative system, looked for correctness gaps, stale tests, weak architecture wiring, documentation drift and cross-milestone contradictions, and fixed justified findings before M4 adds another architectural layer.

## Scope

The review covered:

- M0 safety, characterization, fixtures, deterministic simulation, browser smoke and architecture guardrails;
- M1 identity, registries, definitions, runtime ports and legacy-bridge boundaries;
- M2 GameState, StateStore, selectors, scoped mutation, achievement authority migration and read-side cutover;
- M3 commands, conditions, effects, payments, inert queues, atomic resource settlement and the live DNA cutover;
- the cumulative Node, architecture, build and browser safety chain;
- current architecture/reporting documentation and milestone authority.

## Overall result

No unresolved in-scope gameplay-correctness or architectural-boundary defect was found in M0-M3 after hardening.

One concrete cross-milestone test-wiring weakness was found and fixed. Several documentation/authority gaps were also corrected. The review did not change vanilla gameplay semantics.

This assessment does not mean the repository is mathematically bug-free. It means the reviewed completed milestone contracts are internally coherent, actively guarded, and no justified unresolved defect was found within their defined scope.

## Finding 1: architecture gates did not have uniform independent test coverage

### Problem

The repository has two complementary test surfaces:

- `npm test` recursively discovers `*.test.cjs` files;
- `npm run test:architecture` executes an explicit architecture command chain.

M3 had already learned to self-audit its direct architecture gates, but the same protection was not uniform across earlier completed milestones.

The retrospective found two real examples:

- `m2d3-achievement-authority-fitness.cjs` was in `test:architecture` but had no same-name `*.test.cjs` wrapper;
- `m2d4-achievement-reader-fitness.cjs` had the same asymmetry.

That did not mean the gates were unused: CI still executed them in `test:architecture`, and other closure/report tests exercised their scanner functions. The weakness was that they could not independently fail through the recursive `npm test` surface in the same way as the surrounding direct gates.

### Hardening

The retrospective added `tests/architecture/architecture-test-coverage.cjs` as a direct architecture gate.

For every command currently declared in `scripts.test:architecture`, it now requires:

- a direct `node tests/architecture/<gate>.cjs` invocation rather than shell-bypass syntax;
- an existing regular gate file;
- no symbolic-link indirection;
- exactly one occurrence in the architecture chain;
- a corresponding same-name `*.test.cjs` wrapper that is also a regular file.

A dedicated negative-control test proves rejection of missing wrappers, duplicate targets, stale/missing gates and bypass syntax.

Independent wrappers were added for M2D3 and M2D4.

This is intentionally a coverage audit of the explicit architecture command manifest. It does not assume every helper/inspector `.cjs` file under `tests/architecture` is itself a direct gate.

## M0 review: safety and reproducibility

### Result

M0 remains a strong and appropriate parity/safety foundation. No M0 implementation defect requiring code changes was found.

### Revalidated strengths

The review rechecked:

- frozen/reproducible vanilla baseline assumptions;
- deterministic browser/runtime shims for characterization;
- source-anchored fixture identity and invariant validation;
- explicit persisted-to-live hydration and process isolation;
- production-loop deterministic simulation;
- fresh-process oracle execution and repeatability checks;
- fail-closed state/settings/resource normalization;
- exact golden snapshots and behavior hashes;
- legacy-global/import/dependency/cycle ratchets;
- real Chrome bootstrap and fresh-game interaction smoke;
- browser startup-failure negative control;
- production build and generated-output cleanliness.

The oracle snapshot updater was also reviewed specifically because expectation-update tools can invalidate otherwise strong differential testing. It precomputes and validates selected scenarios before writes, requires explicit acceptance when the behavior hash changes, and matches the documented maintenance contract.

### Documentation hardening

M0 predated the later convention of a dedicated whole-milestone closure document. `M0_CLOSURE_REVIEW.md` was added during this retrospective so M0 now has the same explicit integrated authority shape as M1-M3.

## M1 review: engine kernel and seams

### Result

No unresolved M1 defect was found.

### Revalidated strengths

The review rechecked:

- canonical ID normalization and namespace ownership;
- inert data-only definition/metadata validation;
- hostile-accessor rejection where inert data is required;
- immutable registry definitions and duplicate-ID rejection;
- runtime port validation/binding and frozen environment composition;
- engine/platform/legacy-bridge dependency direction;
- bridge prohibition of direct browser/global/storage/time/random/console/timer access;
- bridge-relative imports and cycle safety;
- mapping-catalog single ownership of legacy paths;
- lifecycle introduction/removal ordering and backstop validation;
- source-backed contextual mapping requirements;
- preservation of original M1 mapping contracts while later milestones extend the catalog.

The existing adversarial M1 tests remain aligned with the implementation after M2 and M3 expanded the bridge surface.

## M2 review: explicit state architecture

### Result

No unresolved GameState/StateStore/achievement correctness defect was found. The only concrete M2 issue found was the architecture-test wrapper asymmetry fixed by Finding 1.

### Revalidated strengths

The review rechecked:

- closed/versioned GameState values;
- deep-frozen committed snapshots;
- separation of read facade from mutation authority;
- least-privilege mutation scopes;
- atomic validation-before-publish;
- rollback on mutator/validator failure;
- nested/reentrant/async mutation rejection;
- retained-draft isolation;
- validator inability to escape its bounded state view;
- prototype-shaped/adversarial keys;
- selector registration, diagnostics and cycle/reentrancy rejection;
- field-level write restrictions;
- achievement rank/universe validation;
- intentional preservation of zero-rank universe structure;
- revision and `lastChange` restoration on failure;
- authoritative GameState achievement ownership with one-way legacy projection;
- projection rollback/repair semantics and hard failure when repair itself cannot be completed;
- M2E ownership, mutation-boundary and selector-dependency closure gates.

The legacy achievement adapter remains temporary compatibility projection rather than competing state authority.

## M3 review: command architecture and first live cutover

### Result

M3 remains complete after the earlier dedicated final review and this cross-milestone retrospective. No new M3 behavior defect was found.

### Revalidated relationships

The retrospective specifically checked that M3 still respects the lower milestones:

- M0 remains the parity/build/browser safety floor;
- M1 canonical identity and downward dependency rules remain intact;
- M2 retains state ownership and generic mutation authority boundaries;
- the command bus orchestrates reviewed semantic capabilities rather than becoming a raw state writer;
- RNA/DNA remain explicitly on the temporary reviewed legacy resource boundary rather than being falsely declared migrated.

The earlier M3 hardening remains valid:

- command/condition/effect/payment/queue/execution boundaries are separately guarded;
- payment/effect settlement revalidates live state and is atomic;
- rollback failure remains a hard diagnostic rather than gameplay rejection;
- DNA UI presentation qualification remains distinct from execution eligibility;
- current affordability remains distinct from queue feasibility;
- legacy `modRes`-style clamping parity remains intentionally preserved;
- `WorkQueue` remains inert/non-authoritative until the scheduling milestone;
- the real-browser DNA vertical exercises the production build.

The user's post-merge manual test of the live M3 build also exercised successful DNA purchase, refusal/edge behavior and continued gameplay without exposing a regression. Manual confirmation complements rather than replaces the automated proof.

## Deliberate boundaries that remain later work

The retrospective does not reclassify planned future work as a defect in a completed milestone.

Examples include:

- M4 named calculations/modifiers and traceability;
- M5 scheduler/phase/cadence authority and production WorkQueue execution;
- later resource authority migration that removes the temporary RNA/DNA bridge;
- broader command migration of vanilla actions;
- later persistence/save-format work;
- eventual public mod API stabilization;
- eventual deletion of remaining legacy compatibility scaffolding.

Those boundaries remain explicit rather than hidden gaps.

## Hardening proof

The first retrospective hardening checkpoint is commit `1d683bd1e121b57be82b266f8bf929dac767e518` on branch `m0-m3-retrospective-hardening`.

GitHub Actions run `37642820326` passed the complete baseline safety chain after the architecture-test coverage hardening, including the recursive Node suite, cumulative architecture gates, production build/cleanliness checks and browser smoke.

A final full CI run on the completed retrospective branch is still required after the documentation/cleanup checkpoint. This document should be updated with that final proof before the retrospective is merged.

## Exit assessment

M0-M3 form a coherent cumulative foundation for M4.

The retrospective found no reason to reopen milestone design or roll back the live M3 cutover. The justified technical change was to make architecture-gate coverage uniform and fail-closed across the explicit architecture manifest. The justified documentation changes make M0 closure and the cumulative pre-M4 audit explicit.

M4 should therefore build on this foundation rather than compensating for known unresolved debt inside M0-M3.
