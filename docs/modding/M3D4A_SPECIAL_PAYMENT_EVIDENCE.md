# M3D4A Special Payment Evidence and Taxonomy

## Purpose

M3D4A freezes the legacy evidence and target taxonomy needed before the M3D cost engine is widened beyond ordinary resources.

This is an evidence/design-authority slice only. It does **not** widen `PaymentQuote`, `PaymentAssessor`, `PaymentPlan`, the payment read capability, or any mutation authority.

The goal is to ensure M3D4B-D are driven by source-backed semantics rather than by a generic `special` escape hatch.

## Existing M3D foundation

M3D1 established a closed inert `PaymentQuote` containing only ordinary resource lines.

M3D2 established separate read-only questions for:

- current affordability;
- queue-payment feasibility.

M3D3 established an inert `PaymentPlan` in which every ordinary resource quote line maps one-to-one to `payment.resource.debit`.

The M3D3 hardening pass explicitly requires any future quote-family widening to update quote, assessment/source-resolution, and plan semantics together.

## Legacy payment families

Legacy `payCosts()` does not implement one uniform payment primitive. M3D4A classifies the consumptive branches into five target semantic families.

| Target resolved quote family | Actual payment source | Current affordability | Queue-payment feasibility | Target planned operation |
| --- | --- | --- | --- | --- |
| `resource` | resource amount | amount + bounded capacity | availability + bounded capacity | `payment.resource.debit` |
| `prestige` | prestige holdings | current holdings | current holdings | `payment.prestige.debit` |
| `pool` | named special pool | present + current amount | present + capacity | `payment.pool.debit` |
| `knowledge` | resource amount | resource amount + bounded capacity | resource availability + bounded capacity | `payment.knowledge.spend` |
| `species` | resolved species resource | species-resource amount + bounded capacity | species-resource availability + bounded capacity | `payment.species.consume` |

The names `knowledge` and `species` are intentionally semantic. They are resource-backed for affordability, but paying them has additional authoritative meaning that must not be disguised as a plain resource debit.

## Prestige and payment-source resolution

Legacy prestige payment deducts from `global.prestige[res].count`.

`Plasmid` has contextual payment-source semantics: in the antimatter universe the actual source is `AntiPlasmid`.

M3D4A characterization proves that both current affordability and the legacy max/queue-facing check use `AntiPlasmid` holdings when the declared cost key is `Plasmid` in antimatter.

Therefore payment-source resolution must happen **before** a resolved quote is assessed.

Target ordering:

```text
declared / adjusted cost
    -> payment-family classification
    -> contextual payment-source resolution
    -> resolved PaymentQuote
    -> affordability / queue-payment feasibility
    -> PaymentPlan
```

The generic engine must not contain first-party checks such as `if Plasmid && antimatter`.

A bounded first-party resolver outside `src/engine/**` will eventually own that Evolve-specific mapping.

## Converging-source legacy bug and target hardening

M3D4A freezes a legacy edge case:

```text
antimatter holdings:
  AntiPlasmid = 5

legacy costs:
  Plasmid     = 4
  AntiPlasmid = 4
```

Legacy checks the two declared keys independently. Both checks see 5 AntiPlasmids and succeed. `payCosts()` then resolves both deductions onto the same actual AntiPlasmid bucket and leaves it at `-3`.

This is not behavior the new engine should preserve.

M3D4B must aggregate requirements by **resolved actual payment source** before declaring the payment affordable:

```text
Plasmid 4      -> AntiPlasmid
AntiPlasmid 4  -> AntiPlasmid

resolved cumulative requirement = 8
holdings = 5
=> unaffordable
```

This is an intentional hardening backed by characterization evidence.

The same cumulative-source rule later applies whenever different semantic quote lines converge on one actual source.

## Supply as a payment pool

Legacy `Supply` is not `global.resource.Supply`.

Its current payment source is:

```text
global.portal.purifier.supply
```

and its queue/capacity-facing limit is:

```text
global.portal.purifier.sup_max
```

M3D4A characterization also proves that both affordability modes fail when the purifier source does not exist.

The target abstraction is a resolved `pool` family, not a literal engine-wide `Supply` special case.

Conceptual line:

```js
{
    kind: 'pool',
    poolId: 'namespace:payment-pool/local_id',
    amount: positiveFiniteNumber,
}
```

The future read capability should keep the D2 read separation:

```text
current pool assessment:
  present + amount

queue pool assessment:
  present + capacity
```

## Knowledge as semantic spending

Legacy Knowledge payment performs two authoritative changes:

```text
Knowledge resource amount -= cost
global.stats.know         += cost
```

M3D4A adds evidence that an existing `stats.know` value is increased additively rather than replaced.

The target quote family remains resource-backed for assessment but plans one compound semantic operation:

```text
payment.knowledge.spend
```

The statistic update belongs to payment semantics, not a general gameplay EffectPlan.

## Species as semantic consumption

Legacy `Species` resolves its payment source to the current species population resource:

```text
global.resource[global.race.species]
```

M3D4A proves current and queue-facing affordability use that resolved species resource with the same amount/capacity vs display/capacity distinction as ordinary resources.

Payment is compound:

```text
species population -= cost
current default-job workers = max(0, workers - cost)
```

M3D4A explicitly freezes the worker-floor behavior when the default job has fewer workers than the species payment amount.

The target operation is therefore:

```text
payment.species.consume
```

The operation should carry the resolved species resource ID and amount, but **not** a cached default-job ID. The current default job is contextual commit-time state and must not be frozen into an earlier inert plan.

## Vanilla Species canonical mapping evidence

Legacy resource setup creates the population resource using the exact species key:

```text
loadResource(global.race.species, ...)
```

M3D4A source-backed characterization extracts the complete first-party `races` key set and proves every vanilla key is accepted by the current canonical resource ID grammar as:

```text
evolve:resource/<species-key>
```

This supports a bounded first-party species-source resolver for vanilla races.

It does **not** authorize arbitrary unvalidated string synthesis for third-party content. A future public extension model must still use canonical IDs and reviewed definitions/capabilities.

## PaymentQuote target union

M3D4A records the intended closed resolved line shapes for later production slices.

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

### Pool

```js
{
    kind: 'pool',
    poolId: 'namespace:payment-pool/local_id',
    amount: positiveFiniteNumber,
}
```

### Knowledge

```js
{
    kind: 'knowledge',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

### Species

```js
{
    kind: 'species',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

These remain a **design target** in M3D4A. Production `PaymentQuote` still supports only `resource` until M3D4B deliberately widens the contract.

## PaymentPlan target mapping

The intended one-line-to-one-operation mapping is:

```text
resource  -> payment.resource.debit
prestige  -> payment.prestige.debit
pool      -> payment.pool.debit
knowledge -> payment.knowledge.spend
species   -> payment.species.consume
```

This preserves M3D3's ordering, duplicate identity and positional provenance without decomposing compound semantic payments into unrelated generic effects.

## Assessment source grouping

M3D2 currently groups cumulative requirements by `resourceId` because every line is an ordinary resource.

M3D4 must generalize that concept to an actual debit-source key, conceptually:

```text
resource:<canonical-resource-id>
prestige:<canonical-prestige-id>
pool:<canonical-pool-id>
```

`resource`, `knowledge`, and `species` lines can therefore converge on the same underlying resource source and must be assessed cumulatively.

Prestige source resolution happens before quote assessment, so declared Plasmid and direct AntiPlasmid can also converge safely.

## Future payment read capability

The target capability shape for later D4 slices is conceptually:

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

`resource` remains the ordinary baseline.

`prestige` and `pool` should be optional capability families so an RNA-only assessor does not need meaningless dummy readers. A quote requiring a missing family is an engine wiring/configuration error, not a gameplay affordability rejection.

## Pseudo-cost boundary remains unchanged

The following legacy cost keys remain outside PaymentQuote:

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

## M4 boundary remains unchanged

Resource/numeric cost transformation and payment-source resolution are distinct concerns.

Example:

```text
Lumber -> Chrysotile
```

is price/resource calculation and remains M4 territory (or a bounded pre-M4 compatibility seam).

Example:

```text
Plasmid -> AntiPlasmid in antimatter
```

is payment-source resolution and belongs to M3D4.

M3D4 must not reimplement the general `adjustCosts()` pipeline.

## Planned M3D4 slices

### M3D4A - evidence and taxonomy

- freeze antimatter affordability source behavior;
- freeze converging prestige-source overdraw behavior;
- freeze missing Supply-source behavior;
- freeze Species current/queue source behavior;
- freeze Species default-job floor behavior;
- freeze additive Knowledge spending;
- verify vanilla species keys map safely to canonical resource IDs;
- record the closed target payment-family taxonomy.

No production payment contract widening.

### M3D4B - prestige and source resolution

- add `prestige` quote family;
- add prestige read capability;
- add cumulative resolved-source assessment;
- add `payment.prestige.debit`;
- add bounded first-party Plasmid -> AntiPlasmid resolution;
- deliberately reject the characterized converging-source overdraw.

### M3D4C - pool / Supply

- add `pool` quote family;
- add optional pool reads;
- add `payment.pool.debit`;
- prove exact Supply current-vs-capacity parity.

### M3D4D - Knowledge, Species, and D4 closure

- add `knowledge` and `species` quote families;
- add `payment.knowledge.spend` and `payment.species.consume`;
- aggregate resource-backed semantic families by actual source;
- add bounded first-party evidence/adapters;
- hostile-input and architecture hardening;
- review/close M3D4.

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
- public mod-facing payment-family extension API.

## Definition of done

M3D4A is complete when:

1. antimatter Plasmid affordability is proven to use AntiPlasmid for both current and legacy max checks;
2. converging Plasmid/AntiPlasmid legacy overdraw is executable evidence;
3. missing purifier makes Supply unaffordable in both assessment modes;
4. Species affordability is proven to resolve through the active species resource;
5. Species current-vs-queue semantics remain distinct;
6. Species default-job worker subtraction is proven to floor at zero;
7. Knowledge spending is proven additive over an existing statistic value;
8. first-party vanilla species keys are proven compatible with canonical resource IDs and legacy resource setup uses the exact species key;
9. the five-family target taxonomy is written;
10. payment-source resolution is explicitly ordered before affordability;
11. cumulative accounting is defined over actual resolved payment sources;
12. the converging-source legacy behavior is explicitly marked for intentional hardening rather than parity;
13. pseudo-costs remain outside PaymentQuote;
14. the M3/M4 transform-vs-source-resolution boundary remains explicit;
15. no production payment engine contract is widened in this slice;
16. no gameplay, persistence, reset or UI behavior changes.
