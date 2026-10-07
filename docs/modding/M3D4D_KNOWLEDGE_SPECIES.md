# M3D4D Knowledge and Species Payment Foundation

## Purpose

M3D4D completes the M3D4 special-payment model by adding the two remaining reviewed first-party semantic payments from M3D4A: Knowledge and Species.

This slice remains read-only and inert. It does not execute settlement, mutate resources, touch cumulative Knowledge spending, change population/job state, enqueue work, or cut over a vanilla action.

## Final special-source union

The generic `special` quote family now accepts exactly two assessment-source families:

```js
{
    kind: 'resource',
    resourceId: 'namespace:resource/local_id',
}
```

or:

```js
{
    kind: 'pool',
    poolId: 'namespace:payment-pool/local_id',
}
```

There is no generic `knowledge`, `species`, `compound`, or executable source kind.

The public quote families remain exactly:

```text
resource | prestige | special
```

## Actual-source accounting

Affordability is cumulative by actual resolved payment source rather than by quote-line family or semantic payment identity.

Therefore an ordinary resource line and a resource-backed special line targeting the same canonical resource are assessed together.

For example:

```text
ordinary resource requirement -> evolve:resource/human -> 4
Species special requirement   -> evolve:resource/human -> 4
current population                                   -> 5

cumulative requirement = 8
=> unaffordable
```

The assessor reuses the existing resource amount/availability/capacity semantics for resource-backed specials. No Knowledge- or Species-specific generic read capability is introduced.

## Knowledge

The first-party Knowledge payment identity is:

```text
evolve:payment/knowledge
```

Its assessment source is:

```text
evolve:resource/knowledge
```

Legacy compatibility maps that canonical resource to:

```text
global.resource.Knowledge
```

The inert plan remains semantically special:

```js
{
    kind: 'payment.special.settle',
    paymentId: 'evolve:payment/knowledge',
    source: {
        kind: 'resource',
        resourceId: 'evolve:resource/knowledge',
    },
    amount,
}
```

This deliberately preserves the information needed by later settlement to implement the complete first-party meaning:

```text
Knowledge resource -= amount
cumulative Knowledge spending += amount
```

M3D4D does not read or mutate the cumulative spending counter.

## Species

The first-party Species payment identity is:

```text
evolve:payment/species
```

Its assessment source is the active first-party species population resource:

```text
global.race.species = human
    -> evolve:resource/human

global.race.species = orc
    -> evolve:resource/orc
```

The compatibility bridge does not synthesize arbitrary identities in the reserved `evolve` namespace. A reviewed first-party species catalog is pinned to the live uncommented top-level keys of the vanilla `races` definition. Catalog drift is an architecture/test failure requiring explicit review.

The resource reader also verifies that the active species still matches the resolved Species source when the source is read. Context drift therefore fails closed rather than charging a stale population bucket.

Missing or malformed active-species resource state is a structured contract/wiring failure, not an invented zero-valued resource.

The inert Species plan contains only:

```js
{
    kind: 'payment.special.settle',
    paymentId: 'evolve:payment/species',
    source: {
        kind: 'resource',
        resourceId: 'evolve:resource/<active-species>',
    },
    amount,
}
```

It deliberately does not cache the current default-job identity, worker count, worker-floor behavior, or any mutation path. Those are commit-time semantics.

## Legacy hardening

Valid legacy affordability semantics are preserved where they are intentional and well-defined.

Malformed legacy behavior is not reproduced:

- a missing Knowledge spending counter must not be allowed to turn into `NaN` after a resource debit;
- a missing Species default-job record must not permit population to be debited before settlement fails;
- a missing active Species resource is converted from a legacy crash into a deterministic contract/read failure;
- arbitrary or corrupted species strings cannot mint first-party canonical resource identities;
- Species context drift between source resolution and assessment fails closed.

These differences are deliberate target hardening, not parity regressions.

## Atomicity boundary

M3D4D records the information required for later atomic settlement but does not build that settlement executor.

Future command execution must perform source resolution, preflight, payment settlement, and semantic effects within one coherent transaction. Knowledge and Species compound settlement must commit completely or not at all.

That transaction/commit architecture belongs to the later M3 execution/cutover work, primarily M3F/M3G, rather than to the inert M3D4 payment-planning layer.

## Architecture invariants

M3D4D closes with the following rules:

1. generic quote families remain exactly `resource | prestige | special`;
2. generic special sources remain exactly `resource | pool`;
3. generic payment reads remain resource plus optional prestige/pool families;
4. generic cost code contains no first-party Supply, Knowledge, Species, job, or Knowledge-stat semantics;
5. first-party special payment IDs are exactly Supply, Knowledge, and Species at M3D4 closure;
6. the Supply pool remains exactly the purifier supply pool;
7. Knowledge resolves exactly to `evolve:resource/knowledge`;
8. Species resolution uses the reviewed first-party species catalog;
9. active Species reads reject context drift and malformed/missing population state;
10. PaymentPlan remains inert and retains only `payment.resource.debit`, `payment.prestige.debit`, and `payment.special.settle`;
11. special settlement operations contain no callbacks, mutation authority, default-job state, or Knowledge-stat paths;
12. no M4 price/modifier pipeline, queue work-item ownership, EffectPlan coupling, or vanilla cutover is introduced.

## Definition of done

M3D4D is complete when:

1. resource-backed special quote sources are closed, canonical and frozen;
2. resource-backed specials share cumulative accounting with ordinary resource lines by actual source;
3. Knowledge resolves and assesses through the Knowledge resource while retaining semantic `paymentId` in the plan;
4. Species resolves to the active reviewed first-party population resource;
5. Species current and queue-facing affordability match valid legacy resource semantics;
6. malformed/missing Species state fails deterministically;
7. Knowledge and Species planning is complete non-mutation;
8. no default-job or Knowledge-stat implementation detail leaks into generic PaymentPlan;
9. hostile resolver/adapter inputs fail closed;
10. the Species compatibility catalog exactly matches the live vanilla race key set;
11. cumulative architecture gates enforce the closed D4 surface;
12. the full test, architecture, build and browser-smoke pipeline is green.
