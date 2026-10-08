# M4C Resource calculation primitives

M4C adds a generic, state-free resource calculation vocabulary on top of the hardened M4A calculation kernel and M4B modifier pipeline. It does not cut over vanilla production. M4D owns the first reviewed live production vertical, while M5C later owns moving migrated production/capacity/consumption application out of `main.js`.

## Scope

M4C models five concepts without taking gameplay-state authority:

- production as a non-negative finite sum of explicit contributions;
- consumption as a non-negative finite sum of explicit contributions;
- capacity as non-negative finite base capacity plus explicit additions;
- storage contribution as non-negative quantity multiplied by non-negative capacity per unit;
- ordered resource-delta resolution as a pure transformation that reports what would happen without mutating state.

The numerical primitives are ordinary helpers intended for use by M4A calculation registrations. They do not create a second calculation engine or a resource-specific modifier mechanism. M4B modifiers remain the single deterministic contribution layer around numerical calculation results.

## Capacity policy

Legacy Evolve overloads non-positive `resource.max` values as special storage semantics. M4C makes the distinction explicit when resolving deltas:

```js
{ mode: 'bounded', value: 100 }
{ mode: 'unbounded' }
```

`bounded` capacity requires a non-negative finite value, including a legitimate zero bound. `unbounded` has no numeric value and therefore does not inject `Infinity` into the M4A finite-number contract. A vanilla migration is responsible for mapping legacy sentinel values to the explicit policy.

## Ordered delta semantics

`resolveResourceDelta()` accepts an explicit starting amount, capacity policy and dense ordered sequence of:

```js
{ kind: 'credit', amount: 10 }
{ kind: 'debit', amount: 4 }
```

Amounts are non-negative finite magnitudes. Credits and debits are not pre-netted because legacy ordering is observable.

For bounded resources, M4C preserves the legacy fast-loop buffer behavior used by `resetResBuffer()` and `modRes()`:

1. the working ceiling begins at `real capacity + starting amount`;
2. credits are clipped against that working ceiling;
3. debits floor stored amount at zero and report any shortfall;
4. every requested debit lowers the working ceiling by the requested amount, even when the stored amount was insufficient to satisfy the full debit;
5. after all ordered operations, the remaining buffered amount is clamped to the real capacity.

This is why an at-capacity `credit 10 -> debit 10` can finish at the original cap rather than losing the credit before the debit, while `debit 10 -> credit 10` from an empty resource finishes with 10 rather than being incorrectly netted to zero.

## Resolution evidence

The resolver returns deeply frozen inert evidence including:

- starting, buffered-final and real-final amounts;
- requested signed delta;
- operation-applied signed delta;
- final net delta after capacity cleanup;
- clipped credit overflow;
- debit shortfall;
- final capacity discard;
- frozen ordered per-operation steps with requested amount, before/after amounts, applied delta, overflow/shortfall and the generic working ceiling before/after the step.

Overflow and shortfall are normal gameplay outcomes, not contract failures. Malformed inputs, negative magnitudes, non-finite values, unsupported operation kinds, sparse/oversized structures and non-finite arithmetic are contract failures.

## Architecture boundary

M4C remains inside `src/engine/calculations/**` and inherits the M4A restrictions against state, mutation, runtime, legacy, platform, clock/random, M3 semantic-package and first-party identity dependencies.

Dependency direction is one-way: M4C resource modules may use the generic calculation contracts, but the generic M4A/M4B core may not import M4C resource modules. The fixed calculation-engine surface therefore remains `calculate`, `explain`, `has`, and `ids`.

M4C also retains zero production consumers of the calculation package. No live `prod.js`, `fastLoop()`, `modRes()` or resource-state path is cut over before M4D.

## Deliberate deferrals

M4C does not:

- register first-party `evolve:` calculations;
- migrate any vanilla production formula;
- mutate `global.resource` or GameState;
- replace M3F1 atomic command settlement;
- own scheduler/tick timing or UI rate display;
- repair crate/container allocation state;
- migrate `modRes()` or `resetResBuffer()`;
- add source-attribution taxonomy to M4 calculation traces;
- introduce nested calculations or dynamic modifiers.

The M4A/M4B trace remains numerical base plus ordered modifiers. Resource-delta steps are separate resolution evidence rather than new calculation-trace step kinds.

## Implementation proof expected before M4C closure

Implementation must prove the four numerical primitives, ordered legacy-compatible resolution, bounded-zero versus unbounded policy, requested/applied distinctions, overflow/shortfall behavior, hostile/malformed input rejection, M4A/M4B composition, unchanged calculation-engine surface, one-way dependency direction and zero live production consumers.

M4C is not closed merely because these files exist or focused tests pass. Independent review/hardening and final CI proof are still required before the roadmap status advances to M4D.
