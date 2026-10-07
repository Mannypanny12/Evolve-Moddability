# M3D4B Prestige Payment Foundation

## Purpose

M3D4B adds the generic prestige payment family to the already-hardened M3D quote, assessment and planning pipeline.

It deliberately remains read-only/inert. No prestige balance is mutated by this slice.

## Generic quote contract

A resolved prestige payment line is:

```js
{
    kind: 'prestige',
    prestigeId: 'namespace:prestige/local_id',
    amount: positiveFiniteNumber,
}
```

The `prestigeId` is the **actual resolved payment source**. Generic engine code never receives a declared first-party name that still needs contextual remapping.

The existing resource line remains unchanged:

```js
{
    kind: 'resource',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

`special` remains unsupported until M3D4C.

## Payment-source resolution comes before quoting

The important order is:

```text
declared / adjusted cost
        ↓
payment-family classification
        ↓
contextual payment-source resolution
        ↓
resolved PaymentQuote
        ↓
affordability / queue-payment feasibility
        ↓
PaymentPlan
```

For first-party Evolve compatibility, Plasmid resolves to AntiPlasmid in antimatter before a `PaymentQuote` is constructed. Outside antimatter it remains Plasmid. AntiPlasmid already denotes its own source and remains unchanged.

This resolution lives outside `src/engine/costs/**` in a bounded first-party compatibility resolver. The generic engine contains no Plasmid or AntiPlasmid knowledge.

## Prestige read semantics

The generic payment read capability may optionally expose:

```js
prestige: {
    amount(prestigeId),
}
```

The returned amount must be finite. Negative finite holdings are valid state observations and therefore produce an insufficiency result rather than a contract error.

Prestige has no M3D4B `available()` or `capacity()` reads.

### Current affordability

```text
cumulative required prestige <= current prestige holdings
```

### Queue-payment feasibility

Legacy max-affordability for prestige also compares against current holdings. M3D4B intentionally preserves that semantic:

```text
cumulative required prestige <= current prestige holdings
```

Queue-payment feasibility for prestige therefore does not predict future prestige production and does not use a hypothetical capacity.

## Cumulative accounting by resolved source

Requirements are accumulated by payment family plus actual resolved source identity.

For example, in antimatter:

```text
Plasmid 4      -> evolve:prestige/anti_plasmid
AntiPlasmid 4 -> evolve:prestige/anti_plasmid
```

becomes two ordered quote lines with the same resolved `prestigeId`. The assessor cumulatively requires 8 AntiPlasmids.

This intentionally hardens legacy behavior. Legacy checks those declared keys independently and can approve both against 5 AntiPlasmids, then overdraw the source to -3. M3D4B rejects the combined requirement instead.

Quote ordering and duplicates remain intact. Accumulation is an assessment concern only.

## PaymentPlan

A prestige quote line maps one-to-one to:

```js
{
    kind: 'payment.prestige.debit',
    prestigeId,
    amount,
}
```

The existing resource mapping remains:

```js
{
    kind: 'payment.resource.debit',
    resourceId,
    amount,
}
```

Planning still does not imply affordability and does not aggregate operations.

## First-party compatibility boundaries

M3D4B adds two narrow bridge surfaces:

- `createEvolvePrestigePaymentReadProvider(...)`
- `createEvolvePrestigePaymentSourceResolver(...)`

The read bridge supports only the canonical first-party Plasmid and AntiPlasmid prestige identities and validates legacy counts as finite numbers.

The source resolver supports only those same first-party identities and reads only the context required to decide the antimatter remap.

The older RNA payment read bridge is not widened.

## Architecture invariants

M3D4B keeps the following boundaries:

- no first-party special-payment names inside `src/engine/costs/**`;
- no global/UI access in the generic engine;
- no direct global/UI access in the prestige compatibility bridges;
- no mutation/payment execution authority;
- no prestige capacity/availability semantics;
- no `special`/pool/payment-ID semantics yet;
- no M4 cost calculation/modifier logic;
- no queue scheduling/work-item logic;
- no EffectPlan coupling;
- no action cutover.

The cumulative architecture command includes a dedicated M3D4B prestige boundary gate.

## Legacy malformed-state hardening

Legacy can treat malformed prestige records as affordable and later create `NaN`. M3D4B does not preserve that failure mode.

A missing resolved prestige source or non-finite/missing `count` is rejected by the bounded compatibility reader before any mutation exists.

## Definition of done

M3D4B is complete when:

1. resource-only M3D behavior remains unchanged;
2. resolved prestige lines are validated, detached and frozen;
3. prestige reads expose current holdings only;
4. both assessment modes use current prestige holdings;
5. duplicate resolved prestige sources are cumulative;
6. cumulative overflow fails closed;
7. PaymentPlan emits inert prestige debit operations;
8. first-party Plasmid source resolution happens outside the generic engine;
9. standard and antimatter behavior matches legacy where legacy is valid;
10. converging-source overdraw is intentionally rejected rather than reproduced;
11. missing/malformed prestige state fails deterministically;
12. no payment execution or mutation is introduced.

## Next slice

M3D4C introduces the generic `special` payment source foundation and the Supply pool case. Knowledge and Species remain deferred to M3D4D.
