# M3 Final Review and Hardening

## Purpose

This is the post-closure review-and-hardening pass for the complete M3 milestone.

The review starts from the closed M3G branch and treats M3A0 through M3G as one system. It checks implementation, contracts, legacy parity, test quality, architecture guards, documentation, lower-milestone invariants and later-milestone boundaries. Justified findings are fixed in this pass rather than being left as review notes.

This document supplements `M3_CLOSURE_REVIEW.md`. The closure document remains the design authority for what M3 means; this document records the final audit of whether the repository actually satisfies it.

## Reviewed scope

The pass reviewed:

- M3A0 legacy command/lifecycle characterization;
- M3A1 command envelope, validation, dispatch and result contracts;
- M3B reusable read-only condition evaluation and legacy read capabilities;
- M3C inert effect planning and resource operation contracts;
- M3D quotes, affordability, queue-payment feasibility, payment plans and reviewed special/prestige payment families;
- M3E prepared commands, WorkItems, pure WorkQueue operations, transient readiness and selection;
- M3F atomic resource settlement, bounded RNA/DNA legacy writes, DNA command composition and live vanilla cutover;
- M3G whole-milestone architecture closure and stale-state/rollback hardening;
- the relationship to M0 safety, M1 identity/boundary rules and M2 state ownership;
- the hand-off boundaries to M4 calculations, M5 scheduling, M6 resource migration, later persistence and public Mod API work;
- Node, architecture, differential, characterization, integration and real-browser coverage;
- architecture-report observability and milestone documentation.

## Overall result

No unresolved in-scope M3 gameplay-correctness defect was found.

The implemented architecture matches the intended ownership model:

```text
legacy/UI compatibility caller
        |
        v
application composition
        |
        v
first-party command
        |
        v
command + condition + payment/effect plans
        |
        v
bounded atomic settlement
        |
        v
temporary reviewed legacy resource capability
```

Generic M3 engine packages remain first-party-neutral and point downward. The legacy DNA callback retains only compatibility dispatch/return behavior. WorkQueue remains inert and non-authoritative. Resource authority has not been falsely claimed as migrated.

The review did find test/observability hardening work worth fixing immediately.

## Finding 1: M3 architecture-test wiring could become stale silently

### Problem

`npm test` recursively discovers `*.test.cjs`, while `npm run test:architecture` is an explicit hand-maintained command chain.

Before this pass, M3's cumulative closure checked architecture behavior but did not check the architecture-test manifest itself. A future direct M3 architecture gate could therefore be added and accidentally omitted from `test:architecture` without the M3G closure reporting that omission.

There was also one real asymmetry: `m3b3-condition-closure.cjs` was in the direct architecture chain and was indirectly exercised through M3G, but did not have its own `*.test.cjs` wrapper like the other direct M3 gates.

### Hardening

M3G now audits the M3 architecture-test surface itself.

For every direct `tests/architecture/m3*.cjs` gate, excluding test wrappers, the cumulative M3G scanner requires:

- exactly one entry in `scripts.test:architecture`;
- a corresponding `*.test.cjs` wrapper so the gate is independently represented in recursive `npm test` coverage;
- no stale M3 gate entry in the architecture script that points at a removed/missing direct gate.

The scanner reports this as `architectureTestCoverageViolationCount` in the M3 architecture summary.

A negative-control test constructs an intentionally broken temporary architecture manifest and proves that omitted, duplicated, stale and unwrapped gates all fail closed.

`m3b3-condition-closure.test.cjs` was added to remove the one existing wrapper asymmetry.

## Finding 2: architecture-report schema changed without a schema-version change

### Problem

The versioned architecture report consumes the M3G summary. Adding `architectureTestCoverageViolationCount` therefore changes the JSON report shape.

Leaving `ARCHITECTURE_REPORT_VERSION` at version 4 would expose a changed machine-readable schema under an old version number.

The report test also did not yet pin the new M3 coverage field.

### Hardening

The architecture report version is advanced from 4 to 5.

The report test now pins:

- `reportVersion === 5`;
- `commandArchitecture.architectureTestCoverageViolationCount === 0`;
- the existing whole-M3 command-architecture invariants and zero violation state.

This keeps the architecture inspector honest for later tooling and milestones.

## Reviewed suspicious behavior that is intentionally preserved

Several behaviors look tempting to "clean up" but are deliberate compatibility contracts. They were reviewed and intentionally left unchanged.

### Legacy `modRes` clamping

The temporary RNA/DNA resource bridge preserves characterized `modRes`-style capacity clamping, including awkward states where a resource amount is already above a newly lowered capacity.

That behavior has explicit parity tests. Replacing it with mathematically simpler debit behavior during M3 would alter vanilla semantics.

### Current affordability checks bounded capacity

M3D current affordability checks amount and bounded capacity, while queue-payment feasibility checks availability and capacity rather than current amount.

This split is source-backed and differential-tested legacy behavior. It is not an accidental duplication of the condition layer.

### DNA presentation versus execution qualification

The legacy UI condition still controls presentation concerns such as display/final-menu visibility. The new DNA command's execution condition is the semantic DNA-below-capacity requirement.

That distinction is intentional. The command does not inherit DOM/UI qualification as gameplay authority.

### Payment/effect settlement revalidation

A condition or earlier quote is not authorization. Atomic settlement rereads live state and rejects if RNA became insufficient or DNA reached capacity before commit.

The stale-state integration tests prove both directions without partial mutation.

### WorkQueue remains dormant

M3E supplies inert queue representation and readiness/selection primitives, not a scheduler, persistence system or production queue executor.

The whole-M3 gate still requires zero production gameplay consumers of the generic queue package. Waking the queue up during this review would cross into later milestones rather than harden M3.

## Cross-milestone review

### M0 safety floor

M3 remains inside the M0 safety model:

- full Node regression discovery remains active;
- production build remains mandatory;
- generated-output cleanliness remains checked;
- the real-browser startup-failure negative control remains active;
- the real-browser smoke suite exercises the built game.

### M1 kernel and dependency rules

M3 reuses canonical typed content identities rather than inventing a competing command/resource ID scheme.

Generic engine packages remain independent of Evolve first-party IDs and of application, content, legacy and platform layers.

### M2 state architecture

M3 does not acquire generic GameState mutation authority. Achievement authority remains the migrated M2 state domain, while RNA/DNA remain explicitly on the temporary legacy resource boundary.

The command bus orchestrates reviewed capabilities rather than becoming a state writer.

### M4 boundary

M3 deliberately does not absorb the broader cost/modifier/calculation pipeline. Resolved payment values and command orchestration remain separate from future named calculation and modifier tracing.

M4A therefore remains the correct next milestone.

### M5 boundary

WorkQueue does not become a simulation scheduler. Phase ordering, cadence, command execution scheduling and deterministic simulation orchestration remain M5 responsibilities.

### M6 boundary

The bounded RNA/DNA legacy resource bridge remains temporary compatibility debt. Resource authority/migration belongs to the resource milestone, with M6B retained as the planned removal target for this command-era compatibility bridge.

## Failure-semantics review

The reviewed live vertical preserves the intended distinction between ordinary gameplay refusal and broken engine/compatibility contracts.

Gameplay refusal remains structured data, including:

- execution condition failure;
- insufficient live RNA at commit time;
- DNA at capacity at commit time.

Hard failures remain `EngineContractError` diagnostics, including:

- malformed command/condition/plan/capability contracts;
- unsupported legacy resource subjects;
- invalid legacy resource records;
- capability write failure;
- rollback failure;
- async/thenable leakage where synchronous contracts are required;
- reentrant command/condition/settlement operations.

The partial-write tests prove atomic rollback. Rollback failure is deliberately not disguised as a normal gameplay rejection.

## Test review

The review inspected the test layers for both missing behavior and stale proof.

Important retained proof includes:

- M3A legacy lifecycle/cost/DNA characterization;
- M3B legacy differential condition coverage;
- M3C DNA effect closure;
- M3D ordinary, prestige and special-payment differential coverage;
- M3E legacy queue evidence plus zero-execution queue integration;
- M3F resource-commit parity, atomicity and hardening;
- M3F DNA command and live-cutover differential tests;
- M3G production-path stale-state and rollback integration;
- whole-M3 architecture closure;
- real Chrome DNA interaction against the built game.

No obsolete test was found whose expected behavior contradicted the current M3 authority. The actionable staleness risk was test-manifest coverage, which is now machine-enforced.

## Hardening proof

The first code-hardening checkpoint is commit `8e8fcddeaab862a77daa1b993f04fb2589595236` on branch `m3-final-review-hardening`.

GitHub Actions run `37632909133` passed the complete repository safety chain at that checkpoint:

- recursive Node test suite;
- cumulative architecture fitness chain;
- production game/wiki build;
- generated-output cleanliness check;
- matching ChromeDriver setup;
- startup-exception negative control;
- real-browser smoke suite.

The later architecture-report schema correction and status-document fitness hardening were included in final reviewed head `abe65ee1ec2577453050778fd3d5d879aa1d28ae`.

GitHub Actions run `37636877317` passed the complete safety chain on that exact final reviewed head. The reviewed M3 branch was then merged through PR #49 into `master` as merge commit `92d22691bc18f315dc94c8d18ea82fc09610c3de`.

The post-merge Android test-site workflow run `37640580680` independently passed its Node tests, architecture gate, production build and GitHub Pages deployment from that `master` commit. M3 therefore has both pre-merge closure proof and post-merge deployment proof.

## Remaining debt is intentional later work

This review does not reclassify the following as M3 defects:

- migrating every vanilla action to commands;
- moving RNA/DNA resource authority into GameState or another later authoritative resource model;
- executing vanilla build/research queues through WorkQueue;
- implementing scheduler/phase cadence;
- implementing the M4 calculation/modifier pipeline;
- replacing persistence/save format;
- deleting the entire legacy bridge;
- promising stable third-party Mod API compatibility.

Those remain explicitly owned by later roadmap milestones.

## Exit assessment

M3 remains complete after full review.

The architecture is coherent, the first live vanilla vertical preserves characterized behavior, the mutation boundary is atomic and live-state-aware, the queue abstraction has not overreached its scope, and lower/later milestone responsibilities remain correctly separated.

The justified findings from this review were in test-manifest self-auditing and architecture-report versioning. Both are hardened rather than deferred.
