# M3 Post-Closure Audit

## Purpose

This audit re-opens **review**, not milestone scope, after M3A0-M3G was declared complete.

The goal is to test the closure claim against the actual repository rather than merely checking that the roadmap says `complete`.

The audit asks four questions:

1. Did each M3 slice implement the responsibility assigned to it?
2. Was any required M3 behavior silently skipped, deferred without an owner, or replaced by documentation-only claims?
3. Do the implemented boundaries still compose correctly in the real DNA production vertical?
4. Can M3 be hardened further without pulling M4-M10 work backward into M3?

The audit baseline is closed-M3 commit:

```text
71a2d1792d92138e481aa72ba4c72bf42d96d022
```

This document records the post-closure review and the hardening performed from that baseline.

## Overall verdict

After reviewing the M3 design authorities, production modules, compatibility adapters, architecture gates, integration tests and the live DNA composition, **no required M3 subsystem was found missing or skipped**.

The original M3 scope remains coherent:

- one real vanilla action had to cross the new architecture end to end;
- generic command/condition/effect/payment/queue contracts had to exist before broad migration;
- queues had to be representable without becoming production scheduler authority;
- special payment families had to be represented and assessable without requiring every special family to be executable in the first DNA vertical;
- legacy resource authority could remain temporarily behind a bounded compatibility capability;
- M4 calculation/modifier work, M5 scheduling, M6 migration waves, M7 persistence and M10 public Mod API work had to remain outside M3.

The audit did find **two hardening weaknesses**, one of them containing a real narrow atomicity hole. Both are fixed in this audit.

## Slice-by-slice reconciliation

| Slice | Required responsibility | Audit result | Missing M3 work? |
| --- | --- | --- | --- |
| M3A0 | Freeze legacy command/payment/effect/queue behavior and establish scope boundaries | Evidence and deferrals remain consistent with later implementation and later milestone ownership | No |
| M3A1 | Generic command contract, validation, `prepare()`, dispatch, structured results and diagnostics without raw state authority | Production `CommandBus` remains synchronous, closed, reentrancy-hardened and mutation-neutral | No |
| M3B | Read-only reusable condition system while separating availability, execution conditions, affordability and queue feasibility | Condition kernel and first-party read adapters preserve that separation; no payment or mutation authority leaked into conditions | No |
| M3C | Inert semantic effect planning | `EffectPlan` remains inert and first-party-neutral; no hidden executor or raw mutation path appeared | No |
| M3D | Quotes, affordability/feasibility, inert payment plans and explicit special/prestige families | Resource, prestige and special families remain explicit; execution was intentionally not assigned to M3D | No |
| M3E | Prepared command/WorkItem/WorkQueue/readiness model without scheduler authority | Generic queue package remains pure and has no production gameplay consumer | No |
| M3F1 | Narrow atomic resource settlement for the first resource-only vertical | Core design is correct; this audit found and fixed an intra-commit synchronous-drift atomicity hole | Fixed |
| M3F2 | First concrete `evolve:command/evolution/dna` command | DNA still separates execution condition, payment and effect semantics and owns no legacy/UI state | No |
| M3F3 | Live vanilla DNA cutover through application composition | Production composition remains narrow; legacy callback is compatibility-only | No |
| M3F4 | Production/reactive/browser closure of the first live vertical | Existing reactive Vue compatibility and browser proof remain relevant and cumulative | No |
| M3G | Whole-M3 ownership, failure semantics, reporting and closure | Correct overall; audit strengthened direct queue-authority enforcement and report completeness | Hardened |

## M3A0 audit: behavior contract and scope

M3A0 correctly established the distinctions that the later architecture relies on:

```text
availability/presentation
!= execution condition
!= current affordability
!= queue/prediction feasibility
```

It also captured that legacy `action()` return values are overloaded and therefore unsuitable as a new engine result contract.

The later slices implement those decisions rather than quietly collapsing them again:

- M3B owns read-only conditions;
- M3D owns payment representation and affordability/feasibility;
- M3E owns inert queued intent and selection;
- M3F owns the first bounded execution settlement/cutover.

No M3A0 requirement was found stranded without either implementation or an explicit later owner.

## M3A1 audit: command bus

`src/engine/commands/command-bus.mjs` remains a generic orchestrator rather than a gameplay authority.

The audit confirmed:

- registrations are fixed at construction;
- command IDs are canonical and duplicates fail closed;
- command envelopes are closed inert data;
- payloads are detached/canonicalized before validation;
- validators and handlers must be synchronous;
- Promise/thenable leakage fails closed;
- `prepare()` validates without executing;
- `dispatch()` executes exactly one resolved handler;
- nested prepare/dispatch is rejected through a module-wide lock;
- the lock recovers through `finally`;
- command outcomes are normalized into structured engine results;
- contract failures carry command/phase context;
- the public bus surface remains only `prepare`, `dispatch`, `has`, and `ids`;
- the bus imports no GameState write authority and does not know Evolve content.

Nothing additional is required inside M3A1 for M3 closure.

## M3B audit: conditions

The condition engine remains synchronous, read-only and generic.

The audit confirmed:

- closed condition definitions;
- bounded nesting/counts;
- reserved compound kinds `all`, `any`, and `not`;
- explicit registration for primitive kinds;
- parameter validation before evaluation;
- normalized structured failure reasons;
- Promise/thenable and reentrancy rejection;
- no payment, effect, queue or mutation authority in the condition kernel.

For DNA, the execution condition is correctly **DNA below capacity**. RNA affordability is not disguised as an execution condition; it is revalidated by resource settlement.

That separation is intentional and correct.

## M3C audit: effects

`EffectPlan` remains a representation layer only.

The DNA effect is exactly:

```text
resource.grant(evolve:resource/dna, 1)
```

The RNA cost does not leak into effect planning. Order and duplicate operations remain explicit, and the generic effect package has no legacy/Evolve execution authority.

A general EffectExecutor is not missing M3 work. M3F deliberately introduced only the bounded resource settlement executor needed for the first real vertical.

## M3D audit: quotes, affordability and payment plans

The post-closure review specifically rechecked the apparent asymmetry between M3D and M3F:

- M3D understands ordinary resource payments;
- M3D also models prestige and semantic special payments;
- M3F1 executes only the ordinary resource subset required by DNA.

This is **not an omission**.

M3D's contract is representation, source resolution, assessment and inert planning. Its own closure explicitly keeps payment execution outside M3D.

The first M3 live vertical is resource-only, so implementing live prestige/Supply/Knowledge/Species mutation merely to make all M3D plan kinds executable would broaden M3 beyond its stated exit condition and prematurely absorb later vanilla migration work.

The special families remain useful now because they prevent future migrations from redesigning payment identity/taxonomy around legacy buckets.

## M3E audit: queue model

M3E is intentionally a sleeping subsystem at M3 exit.

The audit confirms the generic package still owns only:

```text
PreparedCommand
WorkItem
WorkQueue
transient readiness
selection policy
```

It does not own:

- command-specific queue admission;
- queue execution;
- successful-work decrement/removal policy;
- technology prerequisite reconciliation;
- scheduler cadence;
- pause/offline progression;
- persistence;
- ARPA/ship/mech special execution.

Those are assigned to later execution/simulation/content/persistence milestones.

The original M3E architecture gate already rejected any production consumer outside `src/engine/queue/**`. The post-closure audit nevertheless found that M3G's *integrated* closure scanner only reported `queueProductionConsumers` and relied on the M3E prerequisite gate to make a consumer fatal.

That was weaker than necessary for a whole-M3 closure gate.

The audit now makes production queue consumers a direct M3G violation as well.

## M3F audit: production DNA vertical

The production path remains:

```text
src/actions.js
    -> application composition root
    -> CommandBus
    -> evolve:command/evolution/dna
    -> DNA-below-capacity execution condition
    -> fresh 2-RNA PaymentQuote/PaymentPlan
    -> fresh +1-DNA EffectPlan
    -> generic resource commit executor
    -> bounded Evolve RNA/DNA compatibility capability
```

The content command itself does not import `global`, DOM, queue code or legacy helpers.

The application layer composes capabilities but does not reimplement DNA gameplay rules.

The legacy action callback retains historical `false` return compatibility but no longer owns the RNA debit or DNA grant.

### Settlement-time stale state

M3G already proved two important windows:

1. RNA can become insufficient after condition evaluation and settlement refuses without granting DNA;
2. DNA can become full after condition evaluation and settlement refuses without debiting RNA.

That confirms a condition/quote is not treated as durable authorization.

## Hardening finding 1: intra-commit synchronous state drift

### Problem found

Before this audit, the compatibility adapter:

1. captured the current legacy root;
2. resolved RNA/DNA records;
3. preflighted the complete ordered transaction;
4. wrote the projected resource values sequentially.

The preflight was correct, but there was a narrow synchronous gap **between writes**.

A reactive/custom setter on the first write could synchronously:

- change the later resource amount;
- replace the live legacy root;
- make a later resource malformed.

The original transaction would then still hold the old projected values and could overwrite a newer state change or escape after a partial debit.

Normal Evolve gameplay is single-threaded, but JavaScript setters/reactive bridges are synchronous code and M3 claims atomic settlement. Therefore this was a real hardening defect, not merely a hypothetical concurrency feature request.

### Fix

The bounded legacy resource commit capability now:

- verifies the live root is still the exact preflight root before and after each write;
- re-reads the resource amount immediately before each write and requires it to match the preflight original;
- reads the amount back immediately after each write and requires the projected value;
- re-verifies root identity and all committed amounts at the end;
- raises `LEGACY_RESOURCE_COMMIT_STATE_DRIFT` for clean value/root drift;
- rolls back already-attempted transaction writes before any intra-commit verification error escapes;
- treats malformed state/root discovered during the write sequence as a hard contract failure **after rollback**;
- verifies rollback writes by reading their values back;
- retains `LEGACY_RESOURCE_COMMIT_ROLLBACK_FAILURE` as the catastrophic diagnostic if restoration itself cannot be proven.

The new integration matrix covers:

- ordinary stale RNA after condition;
- ordinary stale DNA capacity after condition;
- synchronous DNA mutation caused by the earlier RNA write;
- a later resource becoming malformed during the transaction;
- live-root replacement during the transaction;
- the live root becoming malformed during the transaction;
- ordinary partial write failure;
- rollback failure.

This closes the narrow atomicity crack without adding generic locking, async transactions, new state ownership or later-milestone machinery.

## Hardening finding 2: integrated queue-authority enforcement

The whole-M3 architecture report already exposed the number/list of production queue consumers, and M3E4 already prohibited them.

The audit strengthened M3G so the integrated closure gate independently fails if that count is nonzero.

The M3 architecture report also now names the reviewed semantic seams directly:

- CommandBus;
- condition evaluator;
- payment plan boundary;
- effect plan boundary;
- queue model;
- resource settlement authority;
- application runtime;
- bounded legacy write capability;
- explicit M6B removal target for the resource-era compatibility bridge.

This improves inspection quality without inventing a second architecture model.

## Intentionally deferred work that is not missing

The audit rechecked each major apparent gap.

### More live vanilla commands

Not required for M3. M3 proves one complete real vertical and establishes reusable contracts. Broad action migration is M6 work.

### Live WorkQueue cutover

Not required for M3 and actively prohibited at M3 exit. Execution/reconciliation belongs to M5D plus domain-specific M6 migration; persistence belongs to M7.

### Full prestige/Supply/Knowledge/Species payment execution

Not required for the resource-only DNA vertical. M3D has already frozen their semantic plan shapes and assessment model. Their mutation semantics belong with the commands/domains that first execute them.

### General calculation/modifier pipeline

Explicitly M4. Pulling price modifiers/calculation trace into M3 would make commands/costs own the wrong layer.

### Resource authority migration into GameState

Later state/domain migration, primarily M6B. The bounded RNA/DNA compatibility capability exists specifically to avoid forcing that migration into M3.

### Queue/save persistence

M7 owns persistence v2. Persisting WorkQueue now would stabilize a save contract before scheduler/content migration has exercised it.

### Public Mod API / package loading

M10 by design. M3 contracts are internal architecture and may still evolve through later refactor milestones.

## Remaining risks/debt after hardening

M3 is complete, but several limitations remain deliberately visible:

1. only DNA is a live first-party command consumer;
2. most resource/state authority remains legacy-owned;
3. the RNA/DNA mutation adapter is temporary compatibility infrastructure;
4. special payment operation kinds are not yet executable by the M3F1 resource executor;
5. WorkQueue has no production scheduler consumer;
6. command tracing/inspection UI is not a public developer surface yet;
7. the broader game still contains legacy action objects, DOM/presentation coupling and callback semantics outside the migrated vertical.

None of these contradicts the M3 specification or exit condition. They are exactly the seams later milestones are intended to consume.

## Audit exit decision

After the hardening above, the audit finds no reason to reopen M3 scope.

M3 should remain **complete** if the final hardened head passes together:

- complete Node tests;
- cumulative architecture fitness;
- production game/wiki build;
- generated-output cleanliness;
- browser startup-exception negative control;
- real-browser smoke tests.

The next architectural work remains **M4A Calculation context and trace**.
