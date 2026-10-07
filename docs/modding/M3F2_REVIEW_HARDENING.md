# M3F2 Review and Hardening

## Scope

This pass reviews the complete M3F2 DNA-command path after the initial M3F2 implementation and before M3F3 changes the live legacy caller.

The review covers:

- `src/content/evolve/commands/evolution-dna.mjs`;
- the M3B condition path used by DNA;
- the M3D quote/payment-plan representation used by DNA;
- the M3F1 resource commit executor and bounded Evolve resource adapter used by DNA;
- M3F2 orchestration and legacy differential tests;
- the M3F2 architecture fitness gate.

M3F3 is deliberately not started by this pass. `actions.js` remains on the legacy DNA callback.

## Findings and fixes

### 1. Current affordability was incorrectly used as execution authorization

The initial M3F2 command called `assessCurrentAffordability()` before settlement. That collapsed two contracts which M3A0 explicitly separated.

For `evolution.dna`, the authoritative legacy execution guard is:

```text
RNA amount >= 2
AND DNA amount < DNA.max
```

Legacy current affordability additionally asks whether the required RNA cost fits the resource capacity. It may therefore disagree with direct action execution. This is intentionally characterized in M3A0 and must not become an extra command-execution gate.

M3F2 now still creates a fresh 2-RNA `PaymentQuote` and `PaymentPlan`, but actual payment authorization is owned by the final atomic resource settlement. `assessCurrentAffordability` is no longer injected into or called by the DNA command.

Correct execution sequence:

```text
DNA below capacity
  -> create fresh 2-RNA PaymentQuote
  -> derive PaymentPlan
  -> derive +1 DNA EffectPlan
  -> atomically settle payment + effect
  -> structured success/rejection
```

### 2. M3F1 bounded debits did not fully preserve `modRes()` clamping

The stronger differential exposed a cross-layer parity gap. Legacy `modRes(res, delta, true)` clamps the resulting amount to the resource max for both positive and negative deltas.

The M3F1 legacy commit adapter already clamped credits, but a debit used only `projected -= amount`. If a bounded resource began above its current max, legacy execution could clamp the post-debit value down to max while the new path left it above max.

The adapter now applies the same bounded post-change clamp to debits and credits. A dedicated M3F1 regression test covers an over-capacity RNA debit.

This is a compatibility hardening of the temporary legacy resource adapter, not a new generic resource-engine rule. The adapter remains bounded to the reviewed RNA/DNA mappings and still has M6B as its removal target.

### 3. Direct registration execution could bypass payload validation

The command bus validates the payload before dispatch, but the registration object also exposes `execute`. The initial handler ignored its argument, so direct internal invocation could bypass the closed empty-payload contract.

`execute(payload)` now defensively calls the same `validatePayload(payload)` function. Both bus dispatch and direct handler invocation reject legacy control data such as `isQueue`.

### 4. Direct handler reentrancy was not guarded

The command bus already blocks nested dispatch, but an injected semantic capability could call the exposed DNA handler directly and bypass the bus lock.

M3F2 now has a module-wide DNA execution lock. Nested direct execution fails with `DNA_COMMAND_REENTRANCY`, and a `finally` block guarantees lock recovery after failure.

### 5. The M3F2 differential proof was not truly old-versus-new

The initial M3F2 characterization asserted expected new-state values. That was useful but could let implementation and expected values drift together.

The hardened differential now runs the real legacy DNA action and the new command from identical installed states and compares the complete serialized resulting legacy state.

The reviewed matrix includes:

- normal success;
- insufficient RNA;
- DNA at capacity;
- hidden DNA;
- active `evoFinalMenu`;
- hidden RNA;
- RNA holdings above a reduced capacity;
- a fractional DNA value whose +1 grant clamps at capacity.

It separately proves that presentation qualification/current affordability can disagree with direct execution without being promoted into execution authority.

### 6. Architecture-gate negative controls were missing

The M3F2 fitness gate was expanded to prohibit reintroducing current-affordability authorization and to require direct-handler payload revalidation and the DNA reentrancy guard.

Review also caught two bugs in the new scanner itself: the first `payment.current.*` pattern was too weak, and the first payload-validation assertion could match the validator definition instead of a call inside `execute()`.

Both were corrected. Dedicated negative-control tests now prove the scanner rejects:

- `assessCurrentAffordability` execution authorization;
- `resource.available` presentation qualification;
- removal of direct-handler payload validation.

## Resulting authority boundary

The hardened DNA registration receives only:

```text
evaluateCondition
commitResourcePlans
```

It receives no legacy root, DOM/UI handle, settings object, queue authority, raw resource writer, GameState mutation authority or affordability service.

M3D remains responsible for quote/payment-plan representation. M3F1 remains the final atomic settlement authority. M3B remains responsible for the DNA capacity execution predicate. Presentation and affordability observations remain separate contracts.

## Verification

The hardened production/test head is:

```text
2e1be6d3793b74faba06bd3b56d4bec81929d658
```

GitHub Actions run `37569895823` passed the complete repository safety net on that head:

- full test suite, including the new true legacy-versus-command DNA differential;
- cumulative architecture fitness, including M3F2 negative controls;
- game and wiki build;
- generated-output cleanliness check;
- real-browser startup-exception negative control;
- real-browser smoke test.

## M3F3 handoff

M3F3 may now treat M3F2 as the reviewed semantic command authority. Its job is limited to production composition and live caller cutover:

```text
legacy DNA caller
  -> CommandBus.dispatch(evolve:command/evolution/dna)
  -> hardened M3F2 semantic command
  -> M3B condition + M3D plans + M3F1 atomic settlement
  -> structured result
  -> bounded compatibility translation to legacy caller behavior
```

M3F3 must preserve the historical outward `false` callback behavior where required by the legacy caller/queue lifecycle without leaking that overloaded boolean back into the command result contract.
