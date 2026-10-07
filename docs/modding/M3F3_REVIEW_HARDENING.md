# M3F3 review hardening

This second-pass review re-audits the completed M3F3 DNA live cutover after the first full green CI run. The goal is not to widen M3F3, but to test whether the first real vanilla command cutover is strong enough to serve as a precedent for later migrations.

## Review conclusion

The M3F3 gameplay design remains sound. No semantic defect was found in the live `evolution.dna` command path, presentation/execution split, payment/effect composition, legacy `false` return compatibility, or live-root rebinding behavior.

The review did find four justified hardening gaps around the cutover's protective evidence and one adversarial atomicity edge in the temporary M3F1 legacy resource commit bridge. All were fixed without widening M3F3 into queue execution, persistence, broader evolution migration, or general resource authority.

## Finding 1: stale-root guard was name-sensitive

The M3F3 architecture gate already required the reviewed live provider:

```js
const readLegacyRoot = () => global;
```

but its negative-control rule for captured roots only recognized a small set of variable names. A differently named alias such as `snapshot = global` could therefore capture stale state while evading that particular rule.

The gate now constrains executable `global` references to the reviewed import/provider shape and retains the exact live-provider marker. Negative controls prove that alternate-name capture is rejected even when the approved provider line is left in place as a decoy.

## Finding 2: runtime wiring could accumulate extra authority

The original gate proved the application runtime had the reviewed dependencies and exported only `dispatchEvolutionDnaCommand()`, but it did not prove that the exported function remained only a command-bus dispatch or that reviewed forwarding calls appeared only once.

The gate now requires:

- `dispatchEvolutionDnaCommand()` to normalize exactly to `return commandBus.dispatch(DNA_COMMAND);`;
- one condition-evaluator forwarding call;
- one resource-capability forwarding call;
- one resource-executor forwarding call;
- one command-bus dispatch call.

Negative controls prove both extra settlement inside the exported dispatcher and extra top-level settlement outside the reviewed composition wiring are rejected.

The DNA action extractor was hardened at the same boundary. Executable `evolution-dna` identity must occur exactly once, so a duplicate/decoy action cannot make the fitness test inspect the wrong callback.

## Finding 3: the frozen oracle still depended on live `modRes`

The M3F2/M3F3 differential tests described their old side as a frozen pre-cutover oracle, but that helper still called the live legacy test API's resource-delta function, which delegates to production `modRes`. A future `modRes` change could therefore move the supposed oracle together with production and hide a regression.

Both DNA differential suites now contain a literal test-only implementation of the characterized `modRes(..., true)` semantics needed by this vertical:

- add the delta to the current amount;
- clamp to finite capacity when `max >= 0`;
- floor negative results to zero;
- do not write a `NaN` result.

The old side is now genuinely independent of future production-helper changes while retaining the reviewed RNA/DNA behavior.

## Finding 4: contract-failure characterization was too permissive

The live-cutover contract-failure test previously accepted any non-empty `EngineContractError.code`. That proved only that an exception escaped, not that the public diagnostic chain remained intact.

The test now verifies the actual layered contract for malformed DNA capacity state:

- public error code `CONDITION_READ_FAILURE`;
- `readerCauseCode === INVALID_LEGACY_CONDITION_STATE`;
- condition kind `resource.below_capacity`;
- command ID `evolve:command/evolution/dna`;
- command phase `execute`.

This matches the intentional read-capability normalization and command-bus enrichment instead of pinning the test to a hidden bridge implementation detail.

## Finding 5: attempted write was missing from rollback set

The temporary bounded legacy resource commit adapter preflights every reviewed record and rolls back earlier writes if a later write fails. Its bookkeeping previously added a resource to the rollback list only after `Reflect.set(...)` reported success.

A hostile Proxy setter can mutate its target and then throw before the call returns. In that case the currently attempted resource had changed but was not yet in the rollback set.

The adapter now records the resource as attempted immediately before the write. If the write then throws or returns failure, rollback restores that resource together with all earlier attempted writes.

A regression test uses a DNA Proxy that deliberately mutates `amount` and then throws. The commit fails with `LEGACY_RESOURCE_COMMIT_WRITE_FAILURE`, while both RNA and DNA are restored to their original values.

This is a bounded correction to M3F1's atomicity guarantee. It does not make the bridge generic, expand its RNA/DNA mapping set, or add new gameplay behavior.

## What did not change

The review did not change:

- `src/actions.js` DNA gameplay semantics;
- `src/application/evolve/evolution-dna-command-runtime.mjs` production wiring;
- the M3F2 DNA command rules or payload contract;
- the 2 RNA cost or 1 DNA effect;
- presentation versus execution semantics;
- queue behavior or M3E consumption;
- resource ownership migration;
- public mod APIs, persistence, scheduling, or offline simulation.

The only production-code change is the attempted-write rollback bookkeeping inside the already-bounded M3F1 legacy resource commit adapter.

## Verification

Implementation verification on review head `033e36db7504529f02c58358c42060cc6ab887b7`, GitHub Actions run `37581964696`:

- `npm test`: 933/933 tests passed;
- standalone architecture fitness gate passed;
- game and wiki build passed;
- generated-output cleanliness check passed;
- real-browser startup-failure negative control passed;
- real-browser smoke test passed.

The first hardening run intentionally exposed two overly specific new test assumptions. Those tests were corrected to the actual public contracts rather than weakening the new protections, then the complete pipeline passed.

## Exit state

After this review, M3F3 can be treated as fully implemented and second-pass hardened. The first real vanilla cutover remains intentionally narrow, but its runtime boundary, differential evidence, diagnostics, and atomic rollback behavior now have stronger regression protection.

M3F4 remains the next roadmap slice for whole-cutover proof, architecture-ratchet reconciliation, full closure evidence, and M3F completion. M3G remains the later whole-M3 hardening/closure audit.
