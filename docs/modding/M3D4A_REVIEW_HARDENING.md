# M3D4A Review and Hardening

## Purpose

This document records the adversarial review of the M3D4A special-payment evidence and taxonomy slice.

The review treated the initial D4A design as provisional and re-checked it against:

- the M3A0 behavior contract;
- the hardened M3D1-D3 boundaries;
- the actual `checkCosts()`, `checkMaxCosts()` and `payCosts()` branches;
- modding neutrality requirements;
- malformed legacy state;
- source convergence and cumulative accounting;
- atomicity requirements for later settlement.

No production payment contract is widened by this pass.

## Main architectural correction

The initial D4A draft proposed five top-level generic quote kinds:

```text
resource
prestige
pool
knowledge
species
```

That model did not survive review.

`Knowledge` and `Species` are first-party Evolve gameplay semantics. Giving them dedicated generic engine quote or plan kinds would leak vanilla content concepts into `src/engine/costs/**` and contradict the established rule that the generic engine must remain namespace/content neutral.

The corrected generic taxonomy is:

```text
resource
prestige
special
```

A `special` line is inert data identified by a canonical `paymentId` and an explicit closed assessment-source descriptor. The generic assessor reasons about the source, not about what the first-party payment means.

Conceptually:

```text
special payment identity
    + resolved resource/pool source
    + positive finite amount
```

not:

```text
if Knowledge ...
if Species ...
if Supply ...
```

First-party mappings/resolvers stay outside the generic engine.

## New architecture ratchet

The review found that this neutrality rule was otherwise only prose.

A new architecture fitness gate now scans every source file under:

```text
src/engine/costs/**
```

and rejects first-party special-payment knowledge including:

```text
Plasmid
AntiPlasmid
Supply
Knowledge
Species
```

The guard intentionally checks literal text as well as executable code. Generic vocabulary such as `resource`, `prestige`, `special`, `pool`, `paymentId`, and source descriptors remains allowed.

The guard has companion tests proving that each forbidden concept is detected and that the intended generic vocabulary remains legal. It is wired into `npm run test:architecture` so later D4 slices must consciously preserve this boundary.

## Prestige/source-resolution findings

### Plasmid resolution is genuinely contextual

Characterization now proves both directions:

- outside antimatter, Plasmid affordability/payment remains on Plasmid;
- in antimatter, Plasmid affordability/max checks resolve to AntiPlasmid.

### Missing resolved AntiPlasmid is a legacy crash

If Plasmid exists but the antimatter-resolved AntiPlasmid source is missing, legacy affordability checks throw.

The target architecture must instead fail deterministically at a reviewed source/wiring boundary before mutation.

### Legacy classification is state-shape dependent

A more fundamental review finding is that legacy uses prestige-object presence to decide what a cost key means.

If `global.prestige.Plasmid` is removed and a same-named ordinary resource is present, legacy reinterprets the declared `Plasmid` cost as an ordinary resource payment.

This behavior is now executable evidence and is deliberately **not** target parity.

New payment-family classification must be based on reviewed identity/mapping, not on whichever runtime bucket happens to exist.

### Malformed prestige counts can poison state

A present prestige record with a missing numeric `count` can pass both legacy affordability paths. Payment then subtracts from `undefined` and produces `NaN`.

D4B must therefore validate resolved prestige observations as finite numeric holdings. Presence alone is insufficient.

### Resolved-source convergence can overdraw

The already-characterized antimatter case remains critical:

```text
AntiPlasmid holdings = 5
Plasmid cost         = 4 -> AntiPlasmid
AntiPlasmid cost     = 4 -> AntiPlasmid
```

Legacy checks the declared keys independently, approves both, and pays both, ending at `-3`.

The target architecture must group cumulatively by the **resolved actual source** before returning affordability success.

## Supply findings

The review adds evidence that Supply payment truly uses purifier supply and ignores a same-named ordinary resource.

It also freezes malformed-source behavior:

- missing purifier makes both current and max affordability false;
- a present purifier with missing numeric fields can nevertheless pass legacy checks;
- payment against that malformed object can produce `NaN`.

The target pool reader must therefore distinguish source presence from valid numeric source state and fail closed on malformed observations.

## Species findings

The active species resource is confirmed as the assessment source and retains the ordinary-resource distinction between current affordability and queue/capacity feasibility.

Additional hardening evidence shows:

- a missing active species resource causes legacy affordability checks to throw;
- Species payment reduces default-job workers with a floor at zero;
- if the default-job record is missing, legacy can debit population first and then throw while attempting the worker mutation.

That last case is direct evidence of partial mutation inside one semantic payment.

The target Species settlement must preflight all required state and later commit atomically.

## Knowledge findings

Knowledge payment remains a compound semantic operation:

```text
Knowledge resource debit
+ cumulative stats.know increment
```

The additive behavior is characterized.

The review also proves that if `stats.know` is absent, legacy can first debit the Knowledge resource and then turn the cumulative counter into `NaN`.

That behavior is not target parity. Future Knowledge settlement must validate every required component before mutation and participate in the same atomic command settlement boundary.

## Species identity mapping

The vanilla species-key evidence remains source-backed and uses the repository's comment/string masker before extracting live top-level race keys. This prevents commented-out entries from being mistaken for live species while avoiding any production or gameplay-surface change merely for testing.

Every live vanilla species key is proven compatible with the canonical resource-ID grammar, and resource initialization is anchored to the exact `global.race.species` key.

## Atomicity conclusion

D4A still creates no executor, but the review now has concrete legacy evidence for:

- negative resolved-source overdraw;
- `NaN` prestige state;
- `NaN` Supply state;
- `NaN` Knowledge statistics;
- Species partial mutation before exception.

Therefore later settlement cannot treat legacy write ordering as a behavior to preserve.

The downstream contract is explicit:

1. classify independently of runtime bucket presence;
2. resolve actual sources before affordability;
3. validate every required source/component before mutation;
4. aggregate requirements by actual resolved source;
5. re-check the required facts at commit time;
6. apply payment plus semantic effects atomically;
7. leave authoritative state unchanged on failure.

M3D defines the semantic payment language needed for this. M3F/M3G remain responsible for the reviewed execution/transaction boundary and closure.

## M4 boundary remains intact

This review does not move contextual price calculation into M3D.

The distinction remains:

```text
Lumber -> Chrysotile
```

is contextual cost/resource transformation and belongs to M4 or a bounded temporary pre-M4 resolver.

```text
Plasmid -> AntiPlasmid in antimatter
```

is payment-source resolution and belongs to M3D4.

## Resulting next-slice contract

M3D4B may now add prestige support, but it must do so under the hardened rules:

- generic `prestige` quote semantics only;
- no first-party names inside the generic cost engine;
- finite validated prestige reads;
- state-independent family classification;
- first-party Plasmid/AntiPlasmid mapping outside the engine;
- source resolution before assessment;
- cumulative accounting over resolved sources;
- missing/malformed source as structured contract/wiring failure;
- no payment execution yet.

M3D4C can then introduce the generic `special` source foundation and Supply, followed by Knowledge/Species closure in M3D4D.

## Review conclusion

The initial D4A evidence direction was useful, but its first taxonomy was too Evolve-specific and its malformed-state evidence was not yet strong enough.

The hardening pass corrects the abstraction before production code adopts it, adds executable evidence for the dangerous legacy edge cases, and adds a permanent architecture ratchet against first-party special-payment leakage into the generic cost engine.

No production gameplay behavior, save format, UI behavior, reset behavior, or payment execution authority changes in this pass.
