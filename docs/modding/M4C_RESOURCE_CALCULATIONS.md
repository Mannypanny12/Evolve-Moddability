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

The non-negative resource primitive contracts describe their base resource magnitudes. M4B itself remains a generic finite-number modifier system and can mathematically produce a negative final value through an allowed modifier. A later first-party resource registration that requires a non-negative final domain must own and test that registration-level policy rather than silently changing M4B's generic arithmetic semantics in M4C.

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

For bounded resources, M4C preserves the tracked numeric fast-loop buffer behavior used by `resetResBuffer()` and ordinary tracked `modRes()` calls:

1. when the real capacity is positive, the working ceiling begins at `real capacity + starting amount`;
2. an explicit real capacity of zero keeps a zero working ceiling, matching the legacy `max > 0` buffer guard;
3. each operation computes its tentative amount and applies the working upper ceiling before the zero floor, matching the branch order in legacy `modRes()`;
4. debits report any lower-bound shortfall and every requested debit lowers the working ceiling by the requested amount, even when the stored amount was insufficient to satisfy the full debit;
5. after all ordered operations, the remaining buffered amount is clamped to the real capacity.

This compatibility statement is deliberately narrower than “M4C replaces `modRes()`.” The resolver does not model resource-specific legacy branches such as fasting Food behavior, the `notrack` path, direct state mutation, rate/generation bookkeeping, or the legacy boolean return protocol. Those remain legacy/application concerns until an owning migration characterizes them explicitly.

The upper-bound-first rule is normally observable through credits. It also matters for a bounded-zero resource that begins with a pre-existing positive amount: the next tracked operation can discard that over-bound amount immediately, just as legacy `modRes()` does.

This is why an at-capacity `credit 10 -> debit 10` can finish at the original cap rather than losing the credit before the debit, while `debit 10 -> credit 10` from an empty positive-capacity resource finishes with 10 rather than being incorrectly pre-netted to zero.

## Resolution evidence

The resolver returns deeply frozen inert evidence including:

- starting, buffered-final and real-final amounts;
- requested signed delta;
- operation-applied signed delta;
- final net delta after capacity cleanup;
- upper-bound overflow recorded on credit steps;
- debit shortfall;
- final capacity discard;
- frozen ordered per-operation steps with requested amount, before/after amounts, applied delta, overflow/shortfall and the generic working ceiling before/after the step.

For the bounded-zero compatibility edge case, a clamped operation can discard a pre-existing amount above the zero working ceiling in addition to handling the requested operation. A credit's overflow can therefore exceed the requested credit, while a debit can apply a larger negative stored change than the requested debit without implying debit shortfall. Requested, operation-applied and final-applied values intentionally remain separate evidence.

Overflow and shortfall are derived from actual clamp conditions rather than subtracting floating-point applied deltas from requested amounts. Unclipped fractional operations therefore cannot manufacture tiny negative overflow or shortfall values through IEEE-754 rounding.

Overflow and shortfall are normal gameplay outcomes, not contract failures. Malformed inputs, negative magnitudes, non-finite values, unsupported operation kinds, sparse/oversized structures and non-finite arithmetic are contract failures.

## Architecture boundary

M4C remains inside `src/engine/calculations/**` and inherits the M4A restrictions against state, mutation, runtime, legacy, platform, clock/random, M3 semantic-package and first-party identity dependencies.

Dependency direction is one-way: M4C resource modules may use the generic calculation contracts, but the generic M4A/M4B core may not import M4C resource modules. The M4C architecture gate enumerates every current and future JavaScript source module in the calculation package that is not in the explicit resource-module set, so adding another generic calculation module cannot silently bypass this direction rule. A later resource-specific module must be deliberately admitted to the reviewed resource-module set. The fixed calculation-engine surface remains `calculate`, `explain`, `has`, and `ids`.

M4C also retains zero production consumers of the calculation package. No live `prod.js`, `fastLoop()`, `modRes()` or resource-state path is cut over before M4D.

## Independent review and hardening

The independent post-implementation review treated the first green implementation as untrusted and rechecked the new resolver against the actual legacy `resetResBuffer()` / tracked `modRes()` numeric branch order, the M4A/M4B contracts, hostile direct inputs, architecture direction and zero-production-consumer boundary.

It found and fixed two substantive compatibility/correctness issues:

1. **Bounded-zero buffering was initially too permissive.** The first resolver initialized every bounded working ceiling as `capacity + startAmount`, but legacy `resetResBuffer()` only adds the current amount when `max > 0`. A real zero bound therefore keeps a zero temporary ceiling. The hardened resolver now matches that rule and also applies the legacy upper clamp before the zero floor for every operation. Focused and deterministic-matrix differential tests compare buffered amounts and working ceilings against a small legacy reference model.
2. **Fractional clamp evidence could become semantically false through floating-point subtraction.** Computing overflow as `requested - applied` could create a tiny negative overflow for an unclipped `0.1 + 0.2` style operation. Overflow and shortfall are now derived from the actual upper-bound and zero-floor clamp predicates instead.

Hardening also added direct hostile-input coverage for accessors, symbol keys, exotic prototypes and hostile prototype inspection, plus a broader deterministic legacy differential matrix. None of these changes introduced a production consumer, state authority, first-party registration or M4D cutover.

The hardened code-bearing head passed complete Baseline run `37879876389`, including Node tests, cumulative architecture fitness, game/wiki build, generated-output cleanliness, the injected startup-failure browser negative control and the normal real-browser smoke.

The original final M4C branch head `11548b584f95116b3060bdfbf72045e88365600c` passed Baseline run `37880678649`; PR #59 passed Baseline run `37880877583`, merged as `4ad71b8233023fdaba758bf4011c0da98e63269d`, and merged master passed Baseline run `37881028936` plus Android test-site run `37881028942`, including Pages deployment.

## Second post-merge independent review and hardening

A fresh review restarted from merged master `4ad71b8233023fdaba758bf4011c0da98e63269d` rather than trusting the first closure label. It re-read the three M4C runtime modules, M4A/M4B calculation contracts, the actual legacy buffer/clamp path, all M4C engine and differential tests, architecture gates, zero-consumer enforcement, current architecture authority and status ownership.

The second review found no new arithmetic or state-semantics defect in the M4C runtime modules. It did find and harden three surrounding contract/proof weaknesses:

1. **The one-way dependency gate only knew the six current generic-core filenames.** A future generic calculation source module could therefore import an M4C resource module without the M4C-specific direction gate noticing. The gate now recursively scans every current/future calculation source module outside the explicit resource-module set, and a negative control proves that a newly added nested generic module cannot acquire a resource dependency.
2. **The in-repo closure authority did not pin the actual final M4C proof chain.** The status guard previously required the earlier code-bearing Baseline proof but not the final branch, PR, merge, merged-master Baseline and Android deployment evidence. The original closure chain is now durable in this authority and the status guard requires it.
3. **Legacy parity wording needed a narrower boundary.** M4C matches the tracked numeric temporary-capacity, clamp and debit-ceiling behavior needed by the resource resolver. It does not claim to reproduce unrelated `modRes()` special cases, mutation/bookkeeping or `notrack` behavior.

The second review also expanded direct primitive hostile-input coverage and added resource-delta evidence invariants for step continuity and aggregate requested/applied/overflow/shortfall/final-discard fields. These tests did not require a runtime arithmetic change.

The second-review code-bearing head `384529a1ceeb6683a5cadce9d1653ec5398932e6` passed complete Baseline run `37881759568`: Node tests, cumulative architecture fitness, game/wiki build, generated-output cleanliness, injected startup-failure browser negative control and normal real-browser smoke all passed.

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

## Closure criteria

M4C closure requires proof of the four numerical primitives, ordered legacy-compatible tracked numeric resolution including the bounded-zero `max > 0` buffer edge, bounded-zero versus unbounded policy, requested/applied distinctions, overflow/shortfall behavior, hostile/malformed input rejection, M4A/M4B composition, unchanged calculation-engine surface, one-way dependency direction and zero live production consumers.

The second post-merge review retains M4C as complete only if its final documentation/status-bearing head passes the complete relevant CI chain and the current roadmap/architecture authorities still identify M4D as the next separately reviewed slice.
