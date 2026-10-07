# M3F2 DNA Command Composition

## Purpose

M3F2 creates the first concrete first-party command registration without yet changing the live legacy caller. The production command is:

```text
evolve:command/evolution/dna
```

It composes the completed M3 condition, quote/payment-plan, effect-plan and M3F1 atomic resource-commit contracts. The command remains independent of DOM/UI state, queue policy and direct legacy state access.

## Execution contract

The hardened execution pipeline follows the M3A0 DNA execution contract rather than legacy presentation qualification or current-affordability observation:

```text
DNA below capacity
  -> fresh PaymentQuote: 2 RNA
  -> PaymentPlan: debit 2 RNA
  -> EffectPlan: grant 1 DNA
  -> one atomic resource commit
  -> structured CommandResult
```

The command does **not** test DNA display, RNA display or `evoFinalMenu`. It also does not use M3D current affordability as an execution gate. M3A0 explicitly characterizes these as distinct questions: the direct DNA execution guard is `RNA amount >= 2 && DNA < DNA.max`, while current affordability may additionally fail because the price exceeds current resource capacity.

M3D still owns the fresh quote and payment-plan representation. M3F1 settlement is the final payment/mutation authority and revalidates the actual debit and grant atomically.

## Capability boundary

`createEvolutionDnaCommandRegistration()` receives only two synchronous semantic capabilities:

```text
evaluateCondition
commitResourcePlans
```

It receives no legacy root, DOM handle, settings object, GameState mutation authority, queue object, raw resource writer or affordability service. The first-party command therefore describes the operation while lower layers retain read/mutation authority.

Capability result shapes are validated fail-closed before they can influence command success.

## Failure ordering

Execution is fail-fast and deterministic:

1. validate the closed empty payload;
2. evaluate the DNA-below-capacity execution condition;
3. create the fresh 2-RNA quote/payment plan and +1 DNA effect plan;
4. atomically settle the complete resource exchange.

A capacity-condition failure prevents settlement. Settlement itself rejects insufficient RNA or an invalid/full target without partial mutation.

Expected gameplay refusal becomes `commandRejected(...)`. Contract/configuration failures remain `EngineContractError` values handled by the command bus.

## Payload and direct execution hardening

The command payload is exactly:

```js
{}
```

Legacy control values such as `isQueue`, action names, DOM identity and presentation flags are prohibited from entering the command envelope.

The exposed registration handler also revalidates its payload directly rather than relying solely on CommandBus dispatch validation. A module-wide execution lock prevents a supplied capability from re-entering the exposed handler directly; `finally` guarantees lock recovery.

## First-party placement

The registration lives at:

```text
src/content/evolve/commands/evolution-dna.mjs
```

The generic command, condition, cost, effect and execution packages remain first-party neutral. The DNA module may depend only on reviewed engine contracts and receives runtime capabilities by injection.

## M3F1 compatibility dependency

M3F2 hardening exposed one parity gap in the temporary M3F1 legacy resource adapter. Legacy `modRes(res, delta, true)` clamps the resulting amount to bounded resource capacity for both positive and negative deltas. The adapter already did this for credits but initially did not do it for debits.

The bounded adapter now applies the same post-change capacity clamp to reviewed RNA/DNA debits and credits. This matters when a resource amount is temporarily above a reduced max and preserves exact legacy DNA execution behavior without broadening the adapter into a general writer.

## Differential proof

The hardened M3F2 characterization is a true old-versus-new comparison. For each reviewed scenario it:

1. installs a controlled legacy state;
2. executes the real legacy `evolution.dna.action()`;
3. snapshots the complete resulting legacy state;
4. reinstalls the identical starting state;
5. dispatches `evolve:command/evolution/dna` through the real M3B/M3D/M3F1 composition;
6. compares the complete resulting state.

The matrix covers normal success, insufficient RNA, DNA capacity, hidden DNA, `evoFinalMenu`, hidden RNA, RNA holdings above a reduced capacity, and DNA grant clamping.

## M3F2 boundary

M3F2 deliberately does not import the M3F1 commit implementation or legacy adapters into the DNA module. Tests compose the real implementations to prove the full path. Production consumption remains prohibited until M3F3.

M3F2 therefore does not:

- modify `actions.js` or `main.js`;
- change legacy callback return behavior;
- enqueue WorkItems or schedule queues;
- change UI qualification/redraw behavior;
- migrate resources into GameState;
- change persistence/save behavior;
- introduce a general PaymentExecutor or EffectExecutor;
- execute prestige or special-payment families.

## Architecture enforcement

`tests/architecture/m3f2-dna-command-fitness.cjs` pins the first-party command boundary and prohibits:

- direct legacy/global access;
- DOM/UI or settings access;
- queue or GameState mutation authority;
- presentation-backed `resource.available` authorization;
- current-affordability authorization;
- dynamic loading/async control flow;
- production consumption before M3F3.

It also requires the reviewed command/resource IDs, DNA capacity condition, 2-RNA quote/payment plan, +1 DNA effect, direct payload revalidation and reentrancy guard.

Dedicated negative-control tests prove the scanner catches representative regressions rather than merely reporting success on the current source.

## Review and hardening

The post-implementation review found and fixed substantive issues rather than only cosmetic cleanup:

- current affordability had been incorrectly promoted into DNA execution authorization;
- the M3F1 bounded resource adapter did not clamp debits exactly like legacy `modRes()` when a resource began above capacity;
- direct handler invocation could bypass payload validation;
- direct handler reentrancy was not independently guarded;
- the original M3F2 differential proof was expectation-based rather than true old-versus-new state comparison;
- the expanded architecture scanner itself needed two edge-case fixes and negative controls.

The detailed review authority is [M3F2_REVIEW_HARDENING.md](M3F2_REVIEW_HARDENING.md).

## Verification

Initial implementation commit:

```text
c3524f4dae7adeb37745d1d0a215ea25a8c085aa
```

Hardened production/test head:

```text
2e1be6d3793b74faba06bd3b56d4bec81929d658
```

GitHub Actions run `37569895823` passed the complete repository safety net on the hardened production/test head:

- full test suite;
- cumulative architecture fitness;
- game and wiki builds;
- generated-output cleanliness;
- real-browser startup-failure negative control;
- real-browser smoke test.

The final documentation head must preserve the same safety net.

## M3F3 handoff

M3F3 owns the live caller cutover. It must create the reviewed production composition root, wire the real legacy read/commit adapters to the DNA command, replace the bounded legacy DNA caller, and explicitly translate structured command results into the historical caller/queue lifecycle without making UI or affordability presentation state gameplay authority again.

## Definition of done

M3F2 is complete when:

1. the concrete DNA registration exists and accepts only an empty payload, including direct handler invocation;
2. the execution condition is exactly DNA-below-capacity and contains no presentation availability rule;
3. current affordability is not promoted into direct execution authorization;
4. the price is freshly represented as a 2-RNA PaymentQuote and PaymentPlan;
5. the effect is freshly represented as a +1 DNA EffectPlan;
6. M3F1 remains the final atomic authority for the debit/grant pair and preserves bounded `modRes()` parity for reviewed resources;
7. real legacy execution and the real M3B/M3D/M3F1 command path are state-equivalent across the reviewed DNA matrix;
8. direct execution is payload-validated and reentrancy-safe;
9. the architecture gate and its negative controls keep the first-party command out of legacy/UI/settings/queue/state-mutation/current-affordability authority;
10. no production consumer exists before M3F3;
11. the complete repository test, architecture, build and browser safety net remains green.
