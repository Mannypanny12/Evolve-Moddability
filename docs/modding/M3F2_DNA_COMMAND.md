# M3F2 DNA Command Composition

## Purpose

M3F2 creates the first concrete first-party command registration without yet changing the live legacy caller. The production command is:

```text
evolve:command/evolution/dna
```

It composes the already-completed M3 condition, payment, effect and M3F1 atomic resource-commit contracts. The command remains independent of DOM/UI state, queue policy and direct legacy state access.

## Execution contract

The semantic execution pipeline is deliberately narrower than the legacy presentation `condition()`:

```text
DNA below capacity
  -> current affordability for 2 RNA
  -> PaymentPlan: debit 2 RNA
  -> EffectPlan: grant 1 DNA
  -> one atomic resource commit
  -> structured CommandResult
```

The command does **not** test DNA display, RNA display or `evoFinalMenu`. Existing characterization proves those values belong to presentation/availability behavior rather than direct execution semantics. RNA holdings are also not duplicated as a condition; current affordability remains owned by M3D.

## Capability boundary

`createEvolutionDnaCommandRegistration()` receives only three synchronous semantic capabilities:

```text
evaluateCondition
assessCurrentAffordability
commitResourcePlans
```

It receives no legacy root, DOM handle, settings object, GameState mutation authority, queue object or raw resource writer. The first-party command therefore describes the operation while lower layers retain read/mutation authority.

All capability result shapes are validated fail-closed before they can influence command success.

## Failure ordering

Execution is fail-fast and deterministic:

1. DNA capacity condition;
2. current RNA affordability;
3. final atomic resource commit.

Condition failure prevents payment assessment and commit. Affordability failure prevents commit. The M3F1 commit remains the final mutation authority and can still reject if the underlying resource state no longer supports the complete debit/grant exchange.

Expected gameplay refusal becomes `commandRejected(...)`. Contract/configuration failures remain `EngineContractError` values handled by the command bus.

## Payload

The command payload is exactly:

```js
{}
```

Legacy control values such as `isQueue`, action names, DOM identity and presentation flags are prohibited from entering the command envelope.

## First-party placement

The registration lives at:

```text
src/content/evolve/commands/evolution-dna.mjs
```

The generic command, condition, cost, effect and execution packages remain first-party neutral. The DNA module may depend only on reviewed engine contracts and receives runtime capabilities by injection.

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

## M3F3 handoff

M3F3 owns the live caller cutover. It must create the reviewed production composition root, wire the real legacy read/commit adapters to the DNA command, replace the bounded legacy DNA caller, and explicitly translate structured command results into the historical caller/queue lifecycle without making the UI authoritative again.

## Verification requirements

M3F2 is complete when:

1. the concrete DNA registration exists and accepts only an empty payload;
2. the execution condition is exactly DNA-below-capacity and contains no presentation availability rule;
3. the price is freshly represented as a 2-RNA PaymentQuote and PaymentPlan;
4. the effect is freshly represented as a +1 DNA EffectPlan;
5. condition and affordability failures are complete non-mutation;
6. M3F1 remains the final atomic authority for the debit/grant pair;
7. real M3B/M3D/M3F1 implementations plus legacy compatibility adapters pass differential DNA evidence;
8. the architecture gate keeps the first-party command out of legacy/UI/settings/queue/state-mutation authority;
9. no production consumer exists before M3F3;
10. the complete repository test, architecture, build and browser safety net remains green.
