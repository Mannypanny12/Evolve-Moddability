# M3D4B Review and Hardening

## Purpose

This document records the closure review of the M3D4B prestige payment foundation after the first full CI run exposed two latent test failures.

The review re-checked the complete slice against:

- the hardened M3D4A taxonomy and neutrality rules;
- the M3D1 quote, M3D2 assessment, and M3D3 inert-plan contracts;
- the actual legacy Plasmid/AntiPlasmid affordability behavior;
- the established M3D2 legacy payment-read bridge hardening contract;
- malformed/hostile compatibility inputs;
- architecture escape routes;
- differential-test isolation.

M3D4B remains a read-only/inert planning slice. This pass adds no payment execution or mutation authority.

## Review conclusion

The core prestige model is sound:

- quote lines carry only a resolved canonical `prestigeId` plus a positive finite amount;
- first-party Plasmid/AntiPlasmid resolution stays outside the generic cost engine;
- both current and queue assessments use current prestige holdings only;
- duplicate resolved sources accumulate before affordability succeeds;
- planning preserves line order and emits one inert debit operation per quote line;
- no action cutover, queue work item, modifier pipeline, or settlement executor was introduced.

The review found four hardening items around that model.

## Finding 1: milestone lifecycle grammar was too shallow

The prestige mappings correctly declared `introducedIn: 'M3D4B'`, but the older mapping lifecycle parser only understood milestone forms up to `M3D4`.

The parser is now explicitly four-part and sortable:

```text
M3D4 < M3D4A < M3D4B < M3D5
```

This is an infrastructure correction, not an M3D4B mapping workaround. The original lifecycle strings remain intact and malformed forms such as `M3DA` still fail closed.

## Finding 2: the architecture tripwire masked the literal it intended to reject

The M3D4B cost-boundary gate originally applied one combined future-scope regex to `maskNonCode(source)`.

That was internally contradictory: the regex included quoted `special`/`payment.special` alternatives, but `maskNonCode()` had already removed string literals. The negative control therefore exposed a dead branch in the guard.

The gate now separates:

- executable identifier checks, performed on masked code;
- reserved future-family literal checks, performed on the whole source.

The literal ratchet intentionally covers `special`, `pool`, payment-family IDs, and their `payment.*` operation vocabulary. As with the M3D4A first-party-name ratchet, this is a whole-source architecture rule: M3D4C must consciously relax it when that scope is actually introduced.

The review also closes easy spelling bypasses for:

- bracketed prestige `capacity` / `available` reads;
- bracketed execution-method names;
- backtick future-family literals;
- dynamic bridge imports.

## Finding 3: the antimatter differential fixture compared two different objects

The legacy harness deliberately clones installed state:

```text
input fixture -> structured clone -> installed legacy runtime
```

The first M3D4B differential helper discarded the installed runtime returned by `installLegacyState()` and returned the pre-install fixture instead.

After the first antimatter assertion, the test mutated that stale fixture from AntiPlasmid `2` to `3`. Modern readers were wired to the stale fixture and saw `3`, while the legacy oracle remained on the installed clone at `2`.

The apparent `true !== false` parity failure was therefore test isolation, not payment behavior.

The helper now returns the installed runtime object. A regression assertion pins that subsequent mutation is observed by both the modern compatibility readers and the legacy oracle.

## Finding 4: the new prestige bridges lagged the established RNA bridge hardening

The older M3D2 resource payment bridge already rejects root providers that are:

- declared `async`;
- generators;
- classes;
- synchronous-looking functions that return Promise/thenable values.

The first M3D4B prestige bridges only checked `typeof readLegacyRoot === 'function'`. They still failed eventually on many malformed roots, but they did not enforce the same explicit synchronous authority boundary.

Both prestige bridge surfaces now follow the established contract:

- provider shape is inspected without invocation;
- async/generator/class providers fail at construction;
- root results are checked for promise/thenable behavior without invoking accessor-based `then` properties;
- throwing providers remain normalized to bridge-specific contract errors;
- accessor-backed option, count, and universe fields are rejected without invoking getters.

The source resolver also now has a regression proving that an already-resolved AntiPlasmid identity does not read universe context at all. Only declared Plasmid requires the contextual antimatter lookup.

## Generic engine audit

The review found no production widening beyond the intended prestige family.

### Quote contract

`PaymentQuote` still accepts only:

```text
resource
prestige
```

`special` remains unsupported. Family fields are closed, IDs are canonical and typed, amounts are positive finite numbers, and normalized lines are detached/frozen.

### Assessment

Requirements are keyed by payment family plus resolved identity. Resource and prestige observations are cached independently per assessment.

Prestige assessment has exactly one semantic read:

```text
prestige.amount(prestigeId)
```

There is no prestige availability or capacity concept in M3D4B.

Cumulative finite overflow fails before a false affordability result can be constructed.

### Planning

`PaymentPlan` remains purely inert and one-to-one:

```text
prestige quote line -> payment.prestige.debit
resource quote line -> payment.resource.debit
```

It neither checks affordability nor aggregates operations, and it owns no executor.

## Compatibility audit

The first-party compatibility surface remains bounded to:

```text
evolve:prestige/plasmid
evolve:prestige/anti_plasmid
```

The mapping catalog owns their legacy state locations and removal lifecycle. The read bridge observes finite `count` only. The resolver observes `race.universe` only when Plasmid requires contextual source resolution.

Missing or malformed resolved prestige state is target hardening, not legacy parity: it fails deterministically before any future mutation boundary exists.

## Differential behavior retained

The reviewed parity cases are:

- standard universe Plasmid affordability;
- antimatter Plasmid -> AntiPlasmid resolution below the required holdings;
- antimatter exact-holdings success;
- current and max/queue prestige checks using the same current holdings semantics.

The intentional non-parity case remains source convergence:

```text
Plasmid 4      -> AntiPlasmid
AntiPlasmid 4 -> AntiPlasmid
holdings       = 5
```

Legacy can approve the declared keys independently and later overdraw. M3D4B cumulatively requires 8 from the actual resolved source and rejects the payment before settlement.

## Boundary status after hardening

M3D4B still guarantees:

1. no first-party payment names in generic cost code;
2. no generic `special`/pool/payment-ID family yet;
3. no prestige capacity/availability semantics;
4. no global/UI access in generic cost code;
5. no direct global/UI access in the prestige bridges;
6. no payment execution or mutation authority;
7. no M4 modifier/calculation ownership;
8. no queue work-item/scheduling ownership;
9. no EffectPlan coupling;
10. no vanilla action cutover.

## Closure criterion

M3D4B is ready to close only when the full repository test suite, cumulative architecture chain, build checks, and browser smoke path all pass from the hardened branch head.

M3D4C remains the next payment-family slice and is the point where the generic `special` family and Supply pool source may be introduced deliberately.
