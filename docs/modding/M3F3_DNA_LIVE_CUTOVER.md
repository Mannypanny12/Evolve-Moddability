# M3F3 DNA live cutover

M3F3 performs the first production vanilla-action cutover onto the M3 command architecture. The selected vertical remains `evolution.dna`.

This slice is intentionally narrow. It changes execution authority for the DNA action without bulk-migrating the surrounding legacy action definition, queue system, persistence, UI presentation, or broader evolution content.

## Production path

The live execution path is now:

```text
legacy caller / runAction
    -> actions.evolution.dna.action()
    -> dispatchEvolutionDnaCommand()
    -> CommandBus.dispatch(evolve:command/evolution/dna)
    -> evolution DNA registration
       -> resource.below_capacity execution condition
       -> PaymentQuote: 2 RNA
       -> PaymentPlan
       -> EffectPlan: grant 1 DNA
       -> atomic resource commit
    -> temporary bounded Evolve resource compatibility adapter
    -> current legacy resource state
```

`src/actions.js` no longer owns the RNA affordability check or the RNA/DNA mutation for this action. Its DNA callback is now only a compatibility shim:

```js
action(args){
    dispatchEvolutionDnaCommand();
    return false;
}
```

The historical `false` return is preserved deliberately. Legacy `runAction()` uses overloaded callback return values as control protocol, and DNA historically returns `false` even after a successful mutation. M3 command consumers receive structured success/rejection results internally; the legacy callback continues exposing its historical outward value.

## Application composition root

M3F3 adds one small first-party application composition module:

`src/application/evolve/evolution-dna-command-runtime.mjs`

It is responsible only for wiring the already-reviewed pieces together:

- CommandBus;
- core condition evaluator/requirements;
- bounded Evolve condition reads;
- the M3F2 DNA registration;
- M3F1 resource commit execution;
- the bounded Evolve legacy resource commit capability.

The composition module does not contain DNA gameplay rules, arbitrary state mutation, UI/DOM access, queue behavior, or a public generic command-dispatch API.

This location is intentionally above both `src/content/**` and `src/legacy/bridge/**`. The legacy bridge remains quarantined and does not import first-party content registrations; the content registration remains independent of `global` and legacy mutation details.

## Live legacy-root rule

`vars.js` can rebind the exported `global` object through `setGlobal(gameState)`. A production singleton must therefore not capture the current object while composing the command runtime.

M3F3 uses:

```js
const readLegacyRoot = () => global;
```

Because the imported ESM binding is live, every condition read and atomic resource commit resolves the current legacy root at execution time. Characterization explicitly replaces the installed legacy state after an earlier DNA execution and proves the second execution mutates only the replacement state.

## Execution versus presentation

The cutover preserves the M3A0/M3B semantic split.

Legacy DNA presentation qualification still checks, among other things, `DNA.display` and `!evoFinalMenu`. Direct DNA execution historically does not use those presentation conditions. The new command therefore authorizes execution from its execution condition and settlement state rather than reusing the legacy presentation predicate.

Characterization proves direct execution still succeeds when DNA is hidden or `evoFinalMenu` is true, provided the actual execution/payment constraints are satisfied.

## Failure semantics

Expected gameplay refusal remains structured inside the command path and non-mutating:

- insufficient RNA is rejected during atomic settlement;
- DNA at capacity is rejected by the execution condition.

The legacy action shim still returns historical `false` for these expected refusals.

Contract/configuration failures are different. The shim does not catch or translate `EngineContractError`; malformed state or broken wiring remains visible as an engine contract failure. Tests also prove malformed capacity state cannot consume RNA or grant DNA before the error escapes.

## Differential-oracle preservation

Before M3F3, `tests/characterization/m3f2-evolution-dna-differential.test.cjs` could use the live legacy DNA callback as the old-side oracle. After this cutover that callback itself dispatches the new command, so leaving the test unchanged would collapse the comparison into new-versus-new.

M3F3 freezes the pre-cutover DNA behavior as a test-only oracle using the characterized legacy `modRes(..., true)` behavior. The M3F2 command differential therefore remains genuinely old-versus-new after the production cutover.

A separate M3F3 characterization executes the actual production `actions.evolution.dna.action()` and compares its resulting state against the same frozen oracle across the reviewed matrix.

## Architecture enforcement

The cumulative M3F2 gate now permits exactly one reviewed production consumer of the DNA registration: the M3F3 application runtime.

The new M3F3 fitness gate additionally enforces that:

- the application runtime exports only `dispatchEvolutionDnaCommand()`;
- its dependency set is closed to the reviewed engine/content/bridge modules;
- it reads the current `global` through a live provider rather than capturing a legacy root;
- it cannot use direct legacy resource mutation, DOM/UI, queue authority, GameState mutation authority, async execution, or dynamic loading;
- the runtime may be consumed in production only by `src/actions.js`;
- the DNA action body remains exactly dispatch plus historical `return false`;
- direct state access, embedded RNA/DNA rules, direct mutation, queue behavior, and exception swallowing cannot return to that action body.

Negative-control architecture tests prove the gate rejects stale-root capture, direct `modRes` reintroduction, and exception swallowing.

## Characterization matrix

The live cutover is checked against the frozen pre-cutover oracle for both direct and queue-shaped legacy callback arguments across:

- normal success;
- insufficient RNA;
- DNA at capacity;
- hidden DNA presentation state;
- final evolution menu presentation state;
- hidden RNA presentation state;
- RNA holdings above a low displayed capacity, preserving legacy `modRes` clamping semantics;
- fractional DNA headroom, preserving grant clamping at capacity.

Additional tests prove:

- presentation/execution separation on the actual production callback;
- current-root behavior after `setGlobal()` rebinding;
- refusal leaves state unchanged;
- contract failures escape rather than being collapsed into legacy refusal.

## Explicitly deferred

M3F3 does not:

- migrate `runAction()`;
- migrate the legacy DNA `condition`, `cost`, `effect`, or `queue_complete` presentation/lifecycle metadata;
- consume the M3E WorkItem/WorkQueue package;
- add scheduling, queue execution, offline progress, or persistence;
- expose a public generic command API;
- move resources into authoritative GameState;
- bulk-migrate evolution/general actions.

Those remain owned by their later roadmap slices. Resource authority migration remains M6B work; broader evolution/action content migration remains M6F work.

## Exit state

After M3F3, `evolution.dna` is the first real vanilla action whose successful gameplay mutation no longer lives in its legacy action callback. The callback crosses a narrow compatibility seam into the reviewed M3 command, condition, payment/effect planning, and atomic settlement path while preserving legacy outward behavior.

`ROADMAP.md` and `BACKLOG.md` are synchronized with this slice: M3F1-M3F3 are complete, M3F4 is next, and M3G remains the later whole-M3 hardening/closure audit.

M3F4 remains the next slice for whole-cutover proof, architecture ratchet reconciliation, full CI/browser evidence, and M3F closure. M3G remains the later whole-M3 hardening/closure audit.
