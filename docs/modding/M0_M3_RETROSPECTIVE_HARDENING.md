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

No unresolved in-scope gameplay-correctness or architectural-boundary defect remains in M0-M3 after the retrospective and the later cleanup hardening recorded below.

The retrospective itself found one concrete cross-milestone test-wiring weakness and several documentation/authority gaps. A later repository-cleanup and branch audit discovered two justified M3 hardening pieces stranded on the abandoned `m3-post-closure-hardening` line rather than merged into the final M3 line: stronger synchronous resource-settlement verification and stronger M3 architecture-authority/reporting guards. Both have now been recovered into the current line without changing vanilla gameplay semantics.

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

No unresolved GameState/StateStore/achievement correctness defect was found. The only concrete M2 issue found by the retrospective was the architecture-test wrapper asymmetry fixed by Finding 1.

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

M3 remains complete after the earlier dedicated final review, the cross-milestone retrospective, and the later cleanup corrections described below.

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

## Post-retrospective cleanup review

A later cleanup review looked specifically for dead tests, forgotten branch work, generated residue, stale proof text and artifacts that had become unusable after M0-M3 closure.

### Recovered M3 resource-settlement hardening

The abandoned `m3-post-closure-hardening` line had identified a narrow synchronous atomicity gap in `evolve-resource-commit-adapter.mjs`. The final M3 branch had started again from the earlier M3G closure, so that adapter hardening and its expanded integration matrix never reached `master`.

The gap existed between sequential compatibility writes. A custom/reactive setter on an earlier resource write could synchronously mutate a later resource, replace the live legacy root, replace a mapped resource record or transform the written value. The old commit path had already preflighted the transaction and could therefore continue using a stale projection.

The cleanup hardening recovers the justified part of that branch:

- the live root must remain the same root before, after and at the end of the write sequence;
- the mapped resource record must remain the same record;
- amount and capacity are re-read and verified around each write;
- written amounts are read back rather than assuming `Reflect.set()` stored the requested value;
- drift or malformed state rolls back already-attempted resource writes before the hard failure escapes;
- rollback itself verifies restoration and retains `LEGACY_RESOURCE_COMMIT_ROLLBACK_FAILURE` when restoration cannot be proven.

The stronger cases are folded into the existing `m3g-command-path-closure.test.cjs` integration suite rather than adding the abandoned branch's separate overlapping post-closure test file. This preserves the behavioral proof while avoiding another redundant test artifact.

### Recovered M3 architecture-authority hardening

The branch audit found a second justified piece of work on the same abandoned line. The post-closure M3G scanner had made several important ownership assumptions explicit, but those changes were absent from the later final-review line.

The recovered architecture hardening now:

- records the reviewed command bus, condition evaluator, payment-plan boundary, effect-plan boundary, WorkQueue model and resource-settlement authority as explicit M3 semantic boundaries;
- requires those reviewed production seams to continue to exist;
- records `evolve-resource-commit-adapter.mjs` as intentional legacy compatibility debt with removal target `M6B`;
- records WorkQueue authority as `inert-no-production-consumers` while that condition holds;
- turns any production import of the WorkQueue package before its reviewed later cutover into an M3G architecture violation;
- preserves the newer M3 architecture-test coverage self-audit that was added after the abandoned branch diverged.

Because these fields change the machine-readable architecture report shape, `ARCHITECTURE_REPORT_VERSION` is bumped from 5 to 6. Tests assert the new semantic-boundary, compatibility-debt and queue-authority fields while retaining the newer architecture-test coverage assertions.

The old `M3_POST_CLOSURE_AUDIT.md` and separate `m3-post-closure-resource-settlement-hardening.test.cjs` are not resurrected. Their useful conclusions are represented by the current retrospective authority and existing consolidated test suites.

### Test cleanup decision

No existing tracked test was found that was both unreachable and semantically superseded.

The test layers intentionally overlap at their boundaries but protect different failure classes:

- characterization tests freeze legacy behavior;
- differential tests compare legacy and refactored behavior;
- engine tests protect generic contracts and hostile inputs;
- integration tests protect composed production paths;
- architecture tests prohibit invalid dependency/ownership states;
- browser tests exercise the built application rather than isolated modules.

The direct architecture gates and their `*.test.cjs` wrappers do execute related scanner logic twice in the full CI chain. That duplication is deliberate today: one surface is the explicit architecture gate while the other guarantees recursive `npm test` cannot silently lose the same invariant. Removing one side would weaken the coverage contract added by this retrospective. A future test-runner redesign may consolidate orchestration, but deleting individual guards during cleanup would be the wrong tradeoff.

### Artifact and branch cleanup decision

No generated test bundle, `dist/` output or source map is tracked by the current tree. Those paths remain ignored and CI continues to verify that the production build changes only expected generated outputs.

The branch audit found that repository clutter is branch-level rather than source-tree-level. Ordinary M0-M3 milestone and review branches are merged, represented byte-for-byte on `master`, or superseded by later stricter versions. The early `ci-bootstrap`, `modding-foundation` and `full-refactor-architecture` branches contain only superseded workflow/document proposals. Temporary M3 test-site branches contain deployment wiring and the same abandoned post-closure experiment. The two justified pieces of that experiment are now recovered into the current line.

After this recovery, no completed pre-M4 branch needs to remain as an authority or source of unique required implementation. `master` is the only branch that must be retained for the completed M0-M3 line. Historical PRs/commits remain the appropriate record of the implementation sequence.

The cleanup review intentionally does not move or delete the slice design documents. They remain useful migration history, and `CURRENT_ARCHITECTURE.md` already establishes that later closure/final-review/retrospective authorities supersede them when their historical wording differs from current architecture.

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

The first retrospective hardening checkpoint was commit `1d683bd1e121b57be82b266f8bf929dac767e518` on branch `m0-m3-retrospective-hardening`.

GitHub Actions run `37642820326` passed the complete baseline safety chain after the architecture-test coverage hardening.

The completed retrospective branch reached final reviewed head `d1015ab110f8a9c6d6f874995e9df3a25b1b537a`. GitHub Actions run `37646786601` passed the full repository safety chain on that exact head, including recursive Node tests, architecture fitness, production build/cleanliness, startup-exception negative control and real-browser smoke.

PR #50 merged the retrospective into `master` as `0ac0a0578af183508cea8a0d152671fe767df603`. Post-merge Baseline build run `37647289815` and Android test-site run `37647289871` both passed on that merge commit.

The first cleanup code-hardening checkpoint was `26ada8ee27a4f25e0a9a0e1f15a53b152c408668` on `m0-m3-cleanup-review`. PR #51 Baseline build run `37651107187` passed the complete safety chain on that exact code checkpoint, including the recovered synchronous-drift/root-rebind settlement cases. PR #51 was later merged as `e26feae88c826a86c9eb867a8189e7af54cfa34d`; post-merge Baseline build run `37651862439` and Android test-site deployment run `37651862374` both passed.

The follow-up branch-audit recovery reached head `ebf250c7add354b5630e9d3b50000d7fe57ce7d4` on `m0-m3-branch-audit-recovery`. Baseline build run `37659904355` passed recursive Node tests, the architecture fitness chain, production build/cleanliness, the startup-exception negative control and real-browser smoke with the recovered M3 authority/reporting guards and architecture report version 6.

## Exit assessment

M0-M3 form a coherent cumulative foundation for M4 after the retrospective, cleanup hardening and branch audit.

The cleanup review found no reason to remove useful regression layers or reopen milestone scope. Its material corrections were to recover the stranded M3 intra-commit atomicity hardening and the stranded M3 architecture-authority/reporting hardening, while consolidating both into the current authority/test surfaces rather than preserving abandoned duplicate audit/test layers.

M4 should therefore build on this foundation rather than compensating for known unresolved debt inside M0-M3.
