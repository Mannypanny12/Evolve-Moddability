# M3D4C Special Payment and Supply Pool Foundation

## Purpose

M3D4C introduces the first generic `special` payment family on top of the hardened M3D quote, assessment, and inert planning pipeline.

The first-party evidence vertical is legacy `Supply`, whose real payment source is `global.portal.purifier.supply` rather than an ordinary resource named `Supply`.

This slice remains read-only and inert. It does not execute settlement, mutate purifier supply, enqueue work, or cut over a vanilla action.

## Generic special quote contract

A pool-backed special quote line is:

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

The quote therefore keeps two identities distinct:

- `paymentId` identifies the semantic payment family;
- `poolId` identifies the actual finite source against which affordability is assessed.

M3D4C admits only `source.kind === 'pool'`. Resource-backed or compound special sources remain deferred.

The existing resource and prestige quote families remain unchanged.

## Source resolution precedes generic quoting

First-party Evolve names do not belong in the generic cost engine.

For compatibility, declared legacy `Supply` is resolved outside `src/engine/costs/**`:

```text
legacy Supply
    ↓
evolve:payment/supply
    ↓
first-party source resolver
    ↓
{
    kind: 'pool',
    poolId: 'evolve:payment-pool/purifier_supply'
}
    ↓
PaymentQuote
```

The first-party resolver supports exactly `evolve:payment/supply` in this slice.

## Pool read capability

The generic payment-read capability may optionally expose:

```js
pool: {
    present(poolId),
    amount(poolId),
    capacity(poolId),
}
```

Contracts are deliberately strict:

- `present()` returns a boolean;
- `amount()` returns a finite number;
- `capacity()` returns a non-negative finite number.

A pool family is required only when the quote actually contains a pool-backed special line.

The first-party legacy bridge supports exactly one pool mapping:

```text
evolve:payment-pool/purifier_supply
    ↔ global.portal.purifier
```

Its reviewed state fields are exactly:

```text
supply
sup_max
```

No ordinary `global.resource.Supply` fallback is permitted.

## Current affordability

Legacy Supply current affordability is based on current purifier supply, not storage capacity:

```text
cumulative required Supply <= purifier.supply
```

The pool must also exist. Missing purifier state is an ordinary failed assessment rather than an invented zero-valued ordinary resource.

## Queue-payment feasibility

Legacy max/queue feasibility for Supply uses purifier capacity:

```text
cumulative required Supply <= purifier.sup_max
```

Current supply is not consulted by this assessment.

This preserves the M3D distinction between what can be paid now and what can eventually fit within the payment source.

## Cumulative accounting by actual pool source

Special requirements accumulate by the actual source pool, not by semantic `paymentId`.

For example:

```text
payment alpha -> shared pool -> 4
payment beta  -> shared pool -> 4
pool amount                  -> 5
```

requires 8 from the shared pool and therefore fails current affordability.

Quote order and duplicate lines remain intact. Accumulation is an assessment concern only.

Finite-number overflow while accumulating requirements is a contract failure rather than an affordability result.

## PaymentPlan

Each special quote line maps one-to-one to an inert operation:

```js
{
    kind: 'payment.special.settle',
    paymentId,
    source: {
        kind: 'pool',
        poolId,
    },
    amount,
}
```

Planning does not:

- check affordability;
- aggregate operations;
- debit a pool;
- call legacy `payCosts`;
- own mutation authority.

`payment.special.settle` is descriptive settlement intent for a later execution slice.

## Legacy Supply behavior and target hardening

Valid legacy behavior is preserved for:

- missing purifier state;
- current supply below, equal to, or above the price;
- capacity below, equal to, or above the price;
- the semantic split between current and max checks;
- precedence of purifier Supply over a same-named ordinary resource.

Some malformed legacy state is intentionally not reproduced. Legacy comparisons can accidentally approve records with missing numeric fields and later poison state with `NaN`. M3D4C fails closed instead.

The compatibility bridge therefore rejects:

- malformed portal/purifier containers;
- accessor-backed state fields;
- missing numeric fields on a present pool;
- non-finite supply;
- negative or non-finite capacity;
- asynchronous/thenable root providers.

## Read consistency boundary

The compatibility readers obtain current legacy state through an injected synchronous `readLegacyRoot()` provider.

As with the pre-existing M3D2 resource bridge, separate semantic read calls may reacquire that live root. M3D4C does not introduce a one-off pool snapshot protocol because doing so would make the new family inconsistent with the established generic payment-read contract.

Cross-read snapshot consistency, if required before settlement/cutover, is a whole-M3D concern and should be solved once for resource, prestige, and special reads rather than only for Supply.

Within one assessment, the generic assessor caches the observations it has already taken for each source so duplicate quote lines do not repeatedly query the same semantic fact.

## Architecture invariants

M3D4C keeps these boundaries:

1. generic cost code contains no first-party Supply/purifier knowledge;
2. `special` admits only pool-backed sources in this slice;
3. the first-party resolver supports exactly Supply -> purifier supply;
4. the first-party pool bridge supports exactly one purifier mapping;
5. compatibility reads are limited to `supply` and `sup_max`;
6. Knowledge and Species remain deferred;
7. no payment execution or mutation authority exists;
8. no M4 calculation/modifier pipeline is introduced;
9. no queue work-item/scheduler ownership is introduced;
10. no EffectPlan coupling is introduced;
11. no vanilla action is cut over.

The cumulative architecture command includes both the M3D4C boundary gate and its review-hardening companion ratchet.

## Definition of done

M3D4C is complete when:

1. `special` is a closed third quote family beside resource and prestige;
2. special sources are pool-only and identities are typed canonical IDs;
3. Supply resolves outside the generic engine to the purifier supply pool;
4. current assessment uses pool presence plus current amount;
5. queue assessment uses pool presence plus capacity;
6. duplicate requirements sharing a pool accumulate;
7. pool observations remain isolated from ordinary resource reads;
8. cumulative overflow fails closed;
9. one inert `payment.special.settle` is planned per quote line;
10. valid Supply boundary behavior matches legacy;
11. malformed legacy purifier state fails deterministically;
12. hostile inputs cannot escape through diagnostics;
13. architecture ratchets prevent hidden first-party scope widening;
14. the full test, architecture, build, and browser-smoke pipeline is green.

## Next slice

M3D4D can add the next explicitly modeled special payment semantics, including Knowledge and Species, without widening the M3D4C Supply bridge or turning generic special planning into execution.
