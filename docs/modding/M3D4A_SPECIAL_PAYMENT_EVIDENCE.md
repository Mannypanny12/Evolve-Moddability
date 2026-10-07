# M3D4A Special Payment Evidence and Taxonomy

## Purpose

M3D4A freezes the legacy evidence and target taxonomy needed before the M3D cost engine is widened beyond ordinary resources.

This is an evidence/design-authority slice only. It does **not** widen `PaymentQuote`, `PaymentAssessor`, `PaymentPlan`, the payment read capability, or any mutation authority.

The goal is to ensure M3D4B-D are driven by source-backed semantics without turning the generic engine into a collection of Evolve-specific payment branches.

## Review-hardening correction

The first M3D4A draft described five top-level quote kinds: `resource`, `prestige`, `pool`, `knowledge`, and `species`.

The review-hardening pass rejects that design.

`Knowledge` and `Species` are first-party Evolve payment semantics. Encoding them as generic engine quote kinds would make the engine understand Evolve gameplay concepts directly and would conflict with the earlier M3D direction that special payments use generic contracts plus canonical payment identities.

The corrected target separates two concerns:

1. **what actual source is assessed and debited**;
2. **what settlement semantics must occur when payment commits**.

The generic resolved quote union therefore has three conceptual top-level families:

- `resource`;
- `prestige`;
- `special`.

A `special` line carries a canonical payment identity and an explicit generic assessment source. It never carries executable behavior.

This correction is made before any production D4 contract widening, so no migration or compatibility burden is created.

## Existing M3D foundation

M3D1 established a closed inert `PaymentQuote` containing only ordinary resource lines.

M3D2 established separate read-only questions for:

- current affordability;
- queue-payment feasibility.

M3D3 established an inert `PaymentPlan` in which every ordinary resource quote line maps one-to-one to `payment.resource.debit`.

The M3D3 hardening pass explicitly requires any future quote-family widening to update quote, assessment/source-resolution, and plan semantics together.

## Legacy payment semantics

Legacy `payCosts()` does not implement one uniform payment primitive.

The relevant consumptive behaviors are:

| Legacy behavior | Actual assessment/payment source | Settlement meaning |
| --- | --- | --- |
| ordinary resource | resource amount | debit resource |
| prestige | prestige holdings | debit prestige holdings |
| Supply | purifier supply pool | debit named pool |
| Knowledge | Knowledge resource | debit resource and increment cumulative Knowledge spending |
| Species | current species resource | debit population and reduce current default-job workers, floored at zero |

The pseudo-cost keys remain non-consumptive and outside PaymentQuote:

```text
Custom
Structs
Bool
Morale
Army
HellArmy
Troops
```

## Family classification is not runtime-state discovery

Legacy often decides what a cost means by looking at current object shape, for example `global.prestige.hasOwnProperty(res)`.

The new architecture must not preserve that ambiguity.

Payment-family classification must come from reviewed cost/payment identity or bounded first-party mapping, not from whether a state bucket happens to exist at runtime.

Consequences:

- a missing prestige source must not cause the same declared cost to fall through and become an ordinary resource;
- a missing special source must not silently change the payment family;
- malformed runtime state is a wiring/state-contract failure, not a new interpretation of the cost;
- third-party content must use canonical reviewed identities rather than relying on object-key coincidence.

## Resolution order

The target ordering is:

```text
declared cost
    -> M4/bounded contextual price transformation when applicable
    -> payment-family classification
    -> contextual actual-source resolution
    -> resolved PaymentQuote
    -> current affordability / queue-payment feasibility
    -> PaymentPlan
    -> later atomic settlement
```

Two distinct examples remain important:

```text
Lumber -> Chrysotile
```

is price/resource transformation and belongs to M4 or a bounded pre-M4 compatibility seam.

```text
Plasmid -> AntiPlasmid in antimatter
```

is payment-source resolution and belongs to M3D4.

The generic engine must not contain first-party checks such as `if Plasmid && antimatter`.

## Prestige and payment-source resolution

Legacy prestige payment deducts from `global.prestige[res].count`.

`Plasmid` has contextual payment-source semantics:

- outside antimatter, Plasmid affordability and payment use Plasmid holdings;
- in antimatter, Plasmid affordability and payment resolve to AntiPlasmid holdings.

M3D4A characterization now freezes both directions.

If the antimatter resolver selects AntiPlasmid but the AntiPlasmid source is missing, legacy current and max checks throw instead of producing an affordability result. The new adapter/resolver must convert that into a deterministic contract/wiring failure before any mutation.

### Converging-source legacy bug

M3D4A also freezes this legacy edge case:

```text
antimatter holdings:
  AntiPlasmid = 5

legacy costs:
  Plasmid     = 4
  AntiPlasmid = 4
```

Legacy checks the declared keys independently. Both checks see 5 AntiPlasmids and succeed. Payment then resolves both deductions onto AntiPlasmid and leaves it at `-3`.

The new engine must not preserve this.

M3D4B must aggregate by **resolved actual payment source**:

```text
Plasmid 4      -> AntiPlasmid
AntiPlasmid 4  -> AntiPlasmid

resolved cumulative requirement = 8
holdings = 5
=> unaffordable
```

## Corrected PaymentQuote target union

### Ordinary resource

```js
{
    kind: 'resource',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

### Prestige

```js
{
    kind: 'prestige',
    prestigeId: 'namespace:prestige/local_id',
    amount: positiveFiniteNumber,
}
```

### Special semantic payment

```js
{
    kind: 'special',
    paymentId: 'namespace:payment/local_id',
    source: {
        kind: 'resource',
        resourceId: 'namespace:resource/local_id',
    },
    amount: positiveFiniteNumber,
}
```

or, for a named pool-backed special payment:

```js
{
    kind: 'special',
    paymentId: 'namespace:payment/local_id',
    source: {
        kind: 'pool',
        poolId: 'namespace:payment-pool/local_id',
    },
    amount: positiveFiniteNumber,
}
```

`special` is deliberately **not** an executable escape hatch:

- `paymentId` must be a canonical typed identity;
- `source` is a closed inert discriminated union;
- the line contains no function, callback, state path, mutation authority, or arbitrary payload;
- the generic assessor reasons only about the explicit source;
- first-party settlement behavior remains outside the generic quote engine and must later be wired through reviewed capabilities/handlers.

Production `PaymentQuote` still supports only `resource` during M3D4A.

## PaymentPlan target mapping

The corrected generic mapping is:

```text
resource -> payment.resource.debit
prestige -> payment.prestige.debit
special  -> payment.special.settle
```

A future `payment.special.settle` operation remains inert data. It carries the canonical `paymentId`, resolved assessment source, amount, and positional provenance. It does not contain executable behavior.

This preserves M3D3 ordering and duplicate identity while avoiding first-party `payment.knowledge.*` or `payment.species.*` operation kinds inside the generic engine.

## Assessment source grouping

M3D2 currently groups cumulative requirements by `resourceId` because every line is an ordinary resource.

M3D4 generalizes that to an actual source key:

```text
resource:<canonical-resource-id>
prestige:<canonical-prestige-id>
pool:<canonical-pool-id>
```

A special resource-backed line and an ordinary resource line can therefore converge on the same resource source and must be assessed cumulatively.

Prestige source resolution happens before assessment, so declared Plasmid and direct AntiPlasmid can converge safely as well.

## Future payment read capability

The target read capability remains source-oriented rather than payment-ID-oriented:

```js
{
    resource: {
        amount(id),
        available(id),
        capacity(id),
    },
    prestige?: {
        amount(id),
    },
    pool?: {
        present(id),
        amount(id),
        capacity(id),
    },
}
```

A special line chooses one of these reviewed source families. The assessor does not need to know what `paymentId` means in gameplay terms.

Optional families allow an RNA-only assessor to avoid meaningless dummy readers. A quote requiring a missing capability family is an engine wiring/configuration error, not a gameplay affordability rejection.

All provider results remain subject to the D2 rule: malformed, async, non-finite, or otherwise invalid read results fail closed.

## Supply evidence and hardening

Legacy `Supply` uses:

```text
global.portal.purifier.supply
```

for current affordability/payment and:

```text
global.portal.purifier.sup_max
```

for the legacy max/queue-facing check.

The review-hardening evidence proves three separate facts:

1. a missing purifier makes both affordability modes return false;
2. payment actually debits purifier supply and ignores a same-named `global.resource.Supply` bucket;
3. a present but malformed purifier with missing numeric fields can pass both legacy checks and payment can poison `supply` with `NaN`.

The new pool reader must therefore validate numeric pool fields. `present === true` is not sufficient evidence of a valid source.

Supply is a first-party special payment whose assessment source is a pool. The generic engine does not get a literal `Supply` branch.

## Knowledge evidence and hardening

Legacy Knowledge payment performs:

```text
Knowledge resource amount -= cost
global.stats.know         += cost
```

The evidence proves normal additive behavior over an existing counter.

The review also freezes a malformed-state hazard: if `stats.know` is missing, legacy first debits the Knowledge resource and then turns the cumulative counter into `NaN`.

This is **not** target parity.

Future Knowledge settlement must preflight every state component it requires and commit atomically. It is represented by a first-party canonical special `paymentId` with a resource assessment source, not by a generic `knowledge` quote kind.

## Species evidence and hardening

Legacy `Species` resolves its assessment source to:

```text
global.resource[global.race.species]
```

Current and queue-facing affordability use the same ordinary-resource amount/capacity versus availability/capacity distinction once that source is resolved.

Payment performs the compound mutation:

```text
species population -= cost
current default-job workers = max(0, workers - cost)
```

The evidence freezes the worker floor.

The review-hardening evidence adds two failure modes:

- if the active species resource is missing, legacy current and max checks throw;
- if the species resource is valid but the current default-job record is missing, legacy payment debits population first and only then throws while touching the job record.

The latter is direct evidence of partial mutation.

The new semantic settlement must preflight all required state and commit atomically. A failed Species settlement must leave population and worker state unchanged.

The inert plan should carry the resolved species resource source and amount, but not cache the current default-job ID. The default job is commit-time context. The command execution path must guarantee that assessment/plan/commit use one coherent execution transaction rather than permitting arbitrary state drift between phases.

Species is represented by a first-party canonical special `paymentId` with a resource assessment source, not by a generic `species` quote kind.

## Vanilla Species canonical mapping evidence

Legacy resource setup creates the population resource using the exact species key:

```text
loadResource(global.race.species, ...)
```

M3D4A source-backed characterization extracts the live first-party `races` keys after comments and strings are masked and proves every vanilla key is accepted by the canonical resource-ID grammar as:

```text
evolve:resource/<species-key>
```

This supports a bounded first-party Species source resolver.

It does **not** authorize arbitrary unvalidated string synthesis for third-party content.

## Atomicity is now an explicit downstream requirement

M3D4A itself still performs no payment mutation, but the review evidence proves that legacy special payments can fail after partial writes or can poison state with invalid numeric values.

Therefore later settlement work must satisfy all of the following:

1. resolve every payment source before mutation;
2. validate every required state component before mutation;
3. assess cumulative requirements against resolved sources;
4. reject missing/malformed sources as structured contract/wiring failures;
5. commit all operations for one command atomically;
6. roll back or avoid all writes if any settlement operation cannot complete;
7. never preserve legacy negative/NaN/partial-mutation behavior merely for parity.

M3F/M3G remain responsible for the actual transaction/commit architecture. D4 must produce contracts that make that atomic settlement possible.

## Pseudo-cost boundary remains unchanged

The following legacy cost keys stay outside PaymentQuote:

```text
Custom
Structs
Bool
Morale
Army
HellArmy
Troops
```

They participate in requirements/eligibility but are deliberately non-consumptive in `payCosts()`.

M3D4 must not absorb them merely because legacy stores them under `cost`.

## Planned M3D4 slices after review hardening

### M3D4A - evidence and taxonomy

- freeze both sides of Plasmid source resolution;
- freeze missing resolved-prestige-source failure evidence;
- freeze converging prestige-source overdraw;
- freeze Supply source, missing-source, and malformed-pool behavior;
- freeze Species current/queue source behavior and malformed-source failures;
- freeze Species worker-floor and partial-mutation behavior;
- freeze Knowledge additive spending and malformed-counter poisoning;
- verify vanilla Species keys map safely to canonical resource IDs;
- record the corrected generic `resource | prestige | special` taxonomy;
- require state-independent family classification and atomic downstream settlement.

No production payment contract widening.

### M3D4B - prestige and source resolution

- add `prestige` quote family;
- add prestige read capability;
- keep classification independent of runtime bucket presence;
- add cumulative resolved-source assessment;
- add `payment.prestige.debit`;
- add bounded first-party Plasmid -> AntiPlasmid resolution outside the generic engine;
- fail closed on missing/malformed resolved holdings;
- deliberately reject the characterized converging-source overdraw.

### M3D4C - special source foundation and Supply

- add the generic inert `special` quote family;
- add the closed special source union needed for pool-backed payments;
- add optional pool reads with strict numeric validation;
- add inert `payment.special.settle` planning;
- add bounded first-party Supply mapping outside the generic engine;
- prove exact current-vs-capacity parity while rejecting malformed pool state.

### M3D4D - Knowledge, Species, and D4 closure

- extend the already-generic special source union only if required by evidence;
- add bounded first-party Knowledge and Species payment IDs/mappings outside the generic engine;
- aggregate resource-backed special lines with ordinary resource lines by actual source;
- preserve Knowledge additive semantics and Species worker-floor semantics in the inert settlement contract;
- require preflight/atomic settlement behavior for malformed compound state;
- add hostile-input and architecture hardening;
- review and close M3D4.

## Deliberate non-goals

M3D4A adds no:

- production `PaymentQuote` family;
- production payment read family;
- new PaymentPlan operation;
- payment executor;
- mutation capability;
- GameState resource/prestige/pool migration;
- pseudo-cost migration;
- M4 modifier/calculation pipeline;
- queue work item;
- vanilla action cutover;
- executable special-payment callback;
- public mod-facing payment-handler registry.

## Definition of done

M3D4A review hardening is complete when:

1. antimatter Plasmid is proven to use AntiPlasmid for current and max checks;
2. non-antimatter Plasmid is proven to stay on Plasmid through payment;
3. missing resolved AntiPlasmid source is frozen as a legacy failure hazard;
4. converging Plasmid/AntiPlasmid overdraw is executable evidence and explicitly rejected as target parity;
5. missing purifier makes Supply unaffordable in both modes;
6. Supply payment is proven to use purifier supply rather than a same-named resource;
7. malformed present Supply state is frozen as a numeric-poison hazard;
8. Species affordability is proven to resolve through the active species resource;
9. Species current-vs-queue semantics remain distinct;
10. missing Species source is frozen as a legacy failure hazard;
11. Species worker subtraction is proven to floor at zero;
12. Species partial mutation before missing-job failure is executable evidence;
13. Knowledge spending is proven additive;
14. missing Knowledge counter poisoning after resource debit is executable evidence;
15. vanilla Species keys are proven compatible with canonical resource IDs;
16. generic quote taxonomy is `resource | prestige | special`, with no `knowledge` or `species` engine kind;
17. special payments use canonical payment IDs and inert explicit source descriptors rather than callbacks;
18. family classification is explicitly independent of runtime bucket presence;
19. payment-source resolution occurs before affordability;
20. cumulative accounting is defined over actual resolved sources;
21. downstream atomicity/preflight is explicit for compound special payments;
22. pseudo-costs remain outside PaymentQuote;
23. the M3/M4 transformation boundary remains explicit;
24. no production payment engine contract is widened in this slice;
25. no gameplay, persistence, reset, or UI behavior changes.
