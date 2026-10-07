# M3 Closure Review

## Scope

This review closes M3A0 through M3G as one command-architecture milestone before M4 calculation work begins.

M3 established the contracts for commands, conditions, effect planning, payment planning, queue work items, atomic resource settlement and the first real vanilla cutover. M3G does not broaden the gameplay migration. It audits those slices as one system, adds cumulative cross-layer ownership checks, exercises adversarial production failure paths, extends the architecture report and records the remaining intentional compatibility debt.

## Final M3 execution model

The first live vanilla command path is the DNA action:

```text
legacy actions.js compatibility shim
        |
        v
application/evolve composition root
        |
        v
CommandBus
        |
        v
evolve:command/evolution/dna
        |
        +--> execution condition: DNA below capacity
        |
        +--> fresh PaymentQuote: RNA 2
        |
        +--> PaymentPlan + EffectPlan: DNA +1
        |
        v
atomic resource commit executor
        |
        v
bounded Evolve legacy resource commit capability
        |
        v
legacy RNA/DNA state while resource authority is not yet migrated
```

The legacy callback remains only a compatibility surface: it dispatches the command and preserves the historical `false` return required by legacy control flow. It does not own affordability, capacity, payment or mutation logic.

## M3A: command contract and bus

M3A froze the legacy command behavior before introducing new execution authority, then established the generic command contract:

- canonical namespaced command identities;
- closed inert command envelopes and payload validation;
- synchronous registrations and deterministic dispatch;
- non-executing `prepare()` for durable command intent;
- structured success/rejection results;
- deterministic command/phase contract diagnostics;
- async/thenable and reentrancy rejection;
- a sealed public bus surface of `prepare`, `dispatch`, `has` and `ids`;
- no raw GameState mutation authority in the bus.

The bus orchestrates command execution. It does not become a generic gameplay-state writer.

## M3B: condition boundary

M3B established machine-readable reusable conditions and kept four different questions separate:

1. availability/presentation qualification;
2. execution conditions;
3. current affordability/payment;
4. queue/prediction feasibility.

The generic condition engine remains read-only. Legacy compatibility providers may expose reviewed reads while authoritative domains are still legacy-owned, but condition evaluation cannot mutate or pay.

For the DNA vertical, the command execution condition is DNA below capacity. RNA affordability is deliberately revalidated by settlement rather than being confused with that execution condition.

## M3C: effect planning

M3C established inert semantic `EffectPlan` data rather than an executor with hidden authority.

For the DNA vertical the effect side is exactly one semantic `resource.grant` of one DNA. The two-RNA debit belongs to payment, not to the effect plan. This separation is machine-enforced and the generic effect package contains no Evolve-specific execution authority.

## M3D: quote and payment planning

M3D established:

- deterministic payment quotes;
- current-affordability assessment where appropriate;
- fresh inert payment plans;
- queue-feasibility support that remains payment-side only;
- explicit handling for reviewed special/prestige payment families.

A quote or payment plan is not durable authorization. Live settlement still validates the current resource state immediately before mutation. This matters when state changes between an earlier condition/quote and execution.

## M3E: queue work-item model

M3E established the inert queue architecture without waking it up as production gameplay authority:

- prepared commands;
- closed inert WorkItems;
- pure WorkQueue/list operations;
- transient readiness and deterministic selection;
- legacy build/research queue evidence;
- cumulative queue architecture guards.

At M3 exit, the production gameplay source tree has zero reviewed consumers that execute gameplay through `WorkQueue`. Scheduler, admission, reconciliation, persistence and live queue cutover remain later work. M3E is deliberately asleep rather than half-authoritative.

## M3F: first live vanilla cutover

M3F added the minimum execution boundary necessary for one real vertical:

- a generic atomic resource commit executor;
- a bounded legacy RNA/DNA write capability;
- the first first-party command registration, `evolve:command/evolution/dna`;
- an application composition root;
- the live legacy DNA shim;
- differential, reactive-Vue, architecture, build and browser proof.

The generic executor knows semantic resource changes, not Evolve globals. The Evolve-specific legacy bridge owns the temporary compatibility knowledge required to apply those changes to current RNA/DNA state.

## M3G: integrated hardening and closure

M3G adds one whole-M3 architecture gate over the already-reviewed slice gates and checks the cross-layer ownership model directly.

The guarded direction is:

```text
legacy compatibility/UI caller
        |
        v
application composition
        |
        v
first-party content command
        |
        v
generic command/condition/cost/effect/execution contracts

legacy bridge capabilities point inward to generic contracts;
generic engine packages never point back outward to application,
content, legacy or platform layers.
```

The M3G gate also verifies that:

- the reviewed DNA command, runtime, execution authority and legacy write capability exist at their exact production seams;
- generic command, condition, cost, effect, execution and queue packages do not embed first-party `evolve:` identities;
- generic M3 packages do not acquire upward dependencies on application/content/legacy/platform code;
- all prerequisite M3A-M3F architecture gates remain green;
- the queue package still has no production gameplay consumer.

The versioned architecture report now includes the whole-M3 `commandArchitecture` summary and its violations alongside the permanent M0-M2 floor.

## Failure and atomicity review

The integrated production-path matrix proves the important failure classes at the composition boundary:

- RNA can become insufficient after the execution condition passes and settlement rejects without granting DNA;
- DNA can reach capacity after the execution condition passes and settlement rejects without debiting RNA;
- a partial legacy write failure rolls already-attempted resource mutations back atomically;
- rollback failure remains a hard engine contract failure rather than being disguised as an ordinary gameplay rejection.

The stale-state tests intentionally mutate the live legacy resource state after condition evaluation and before settlement. They prove that a prior condition/quote is not treated as authorization and that the compatibility settlement capability reads current state at commit time.

Gameplay refusals are structured command rejections. Broken configuration, malformed contracts, impossible compatibility state, write failures and rollback failures remain hard `EngineContractError` diagnostics.

## Production ownership at M3 exit

| Concern | Owner at M3 exit |
| --- | --- |
| Command identity/envelope/dispatch | `src/engine/commands/**` |
| Reusable conditions | `src/engine/conditions/**` |
| Quotes/payment plans | `src/engine/costs/**` |
| Inert semantic effects | `src/engine/effects/**` |
| Generic atomic resource-plan settlement | `src/engine/execution/resource-commit.mjs` |
| Generic queue representation/readiness | `src/engine/queue/**` |
| DNA command semantics | `src/content/evolve/commands/evolution-dna.mjs` |
| First-party wiring | `src/application/evolve/evolution-dna-command-runtime.mjs` |
| Temporary RNA/DNA legacy mutation compatibility | `src/legacy/bridge/evolve-resource-commit-adapter.mjs` |
| Legacy callback return compatibility | `src/actions.js` |

## Remaining intentional debt

M3 does not claim that the full game uses the new command architecture.

Intentional remaining debt includes:

- most vanilla actions still use legacy action/callback infrastructure;
- RNA/DNA authoritative state still lives in legacy resource state;
- the bounded RNA/DNA commit adapter remains until resource/state migration removes that compatibility need, with M6B retained as the planned removal target for this command-era bridge;
- M3E WorkQueue is not a production scheduler or queue executor;
- the broader calculation/modifier pipeline does not exist yet;
- persistence v2 and public mod-loading/API stability remain later milestones;
- DOM/UI and legacy gameplay code still exist outside the migrated DNA vertical.

These are explicit later-milestone responsibilities, not hidden M3 completion claims.

## Closure proof

The corrected M3G implementation proof on commit `3c4d29527fc7ff69224153cfeb98d9ea19c95de7` is GitHub Actions run `37628724289`.

That run passed together:

- the complete Node test suite, including the M3G cross-layer stale-state and rollback matrix;
- the cumulative architecture fitness chain, including the whole-M3 closure gate;
- production game/wiki build;
- generated-output cleanliness;
- matching browser-driver setup;
- the startup-exception negative control;
- the real-browser smoke test.

The status/documentation commits that record this closure must also retain that same CI chain. A documentation-only follow-up run does not replace the behavioral proof above; it proves the repository remains green after the authority documents are advanced.

## What M3 does not claim

M3 completion does not mean:

- every legacy action has been migrated;
- all resources have moved to GameState;
- legacy build/research queues use WorkQueue;
- M4 calculation/modifier logic has been implemented;
- the old save format has been replaced;
- the legacy bridge has been deleted;
- the engine exposes a stable public third-party Mod API.

## Exit

M3 satisfies its roadmap exit condition: at least one real vanilla action now validates, checks its execution condition, constructs fresh payment/effect plans, settles atomically against live state and emits structured results through the new command architecture without using a DOM element as gameplay authority or allowing the legacy callback to own the mutation.

With M3 closed, the next architectural slice is **M4A Calculation context and trace**.
