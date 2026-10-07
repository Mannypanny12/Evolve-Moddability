# M3D3 PaymentPlan Foundation

## Purpose

M3D3 introduces the inert semantic `PaymentPlan` foundation above the resolved `PaymentQuote` contract.

This slice answers one narrow question:

```text
If this resolved ordinary-resource quote were paid, what semantic payment operations would that mean?
```

It does not answer whether the quote is affordable, whether it is queue-feasible, or whether payment may now be committed. M3D2 remains the read-only assessment layer, while actual payment execution and atomic payment + effect commit remain later M3 work.

## Public production surface

The reviewed production entry is:

```js
createPaymentPlan(paymentQuote)
```

It is synchronous and accepts exactly one argument.

Callers do not author raw PaymentPlan operations directly. The plan is derived from a validated PaymentQuote so the engine does not create a second independent price-description path that can drift from quoting.

## Ordinary resource operation

M3D3 supports exactly one planned payment operation:

```js
{
    kind: 'payment.resource.debit',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

For every ordinary `resource` PaymentQuote line, M3D3 emits exactly one corresponding debit operation with the same canonical resource ID and amount.

No amount calculation, source remapping, registry lookup, state read or mutation occurs during planning.

## Quote-to-plan derivation

The mapping is one-to-one and order-preserving:

```text
PaymentQuote line N
    -> PaymentPlan operation N
```

Example:

```text
quote:
  RNA 2
  Wood 5
  RNA 3

plan:
  debit RNA 2
  debit Wood 5
  debit RNA 3
```

M3D3 does not coalesce duplicate resource lines. This preserves the semantic structure established by M3D1 and the deterministic line identity used by M3D2 diagnostics.

The position itself is the current provenance relationship, so M3D3 does not add a redundant `quoteLineIndex` field. If a later special payment family requires one quote line to expand into several semantic payment operations, that later reviewed slice must introduce an explicit provenance rule.

## Planning is not authorization

A PaymentPlan is inert intent, not proof that payment is currently safe.

Therefore plan construction does not require a satisfied M3D2 affordability result.

The intended relationship is:

```text
                 -> current affordability / queue-payment feasibility
PaymentQuote ---|
                 -> PaymentPlan
```

This prevents a time-of-check/time-of-use contract in which an earlier affordability observation would accidentally authorize later mutation after state may have changed.

The eventual commit path must revalidate the state facts required for safe application and atomically coordinate payment with gameplay effects.

## Free payment

An empty PaymentQuote:

```js
{ lines: [] }
```

becomes an empty PaymentPlan:

```js
{ operations: [] }
```

There is no special free operation and no zero-value debit. M3D1 already requires zero-valued resolved prices to be omitted before quote construction.

## Shared hostile-input boundary

M3D2 already revalidated arbitrary caller-provided PaymentQuote-shaped values rather than trusting their provenance. Its review hardening showed that the top-level quote wrapper requires careful defensive inspection so hostile caller objects cannot escape through diagnostics.

M3D3 needs the same boundary. Rather than duplicating that security-sensitive code, this slice extracts one internal helper:

```text
payment-quote-input.mjs
```

Both `PaymentAssessor` and `PaymentPlan` construction use this shared normalizer.

The helper:

- requires a plain inert top-level quote record;
- requires exactly the `lines` field;
- delegates line validation to the authoritative M3D1 `createPaymentQuote()` contract;
- returns a detached frozen PaymentQuote;
- does not retain hostile rejected wrapper objects in diagnostics.

This refactor is behavior-neutral for M3D2.

## Distinction from EffectPlan

`payment.resource.debit` is deliberately not M3C `resource.consume`.

A resource may be consumed as a gameplay effect without being a command price. Conversely ordinary command payment carries quote/affordability/payment semantics that do not belong in the general effect language.

M3D3 therefore does not import or depend on the effect layer.

For the DNA evidence vertical the two plans remain separate:

```text
PaymentPlan:
  payment.resource.debit evolve:resource/rna 2

EffectPlan:
  resource.grant evolve:resource/dna 1
```

The eventual M3F cutover will coordinate them atomically through semantic mutation capabilities rather than merging the two inert languages.

## DNA evidence

Legacy `evolution.dna` declares exactly:

```text
2 RNA
```

M3D3 characterization converts that resolved price into exactly:

```js
{
    operations: [{
        kind: 'payment.resource.debit',
        resourceId: 'evolve:resource/rna',
        amount: 2,
    }],
}
```

The characterization also proves PaymentPlan construction leaves the complete installed legacy state unchanged.

No first-party DNA/RNA knowledge exists inside the generic PaymentPlan implementation itself.

## Special payment families remain deferred

Legacy payment contains semantics that cannot safely be disguised as ordinary resource debit:

- prestige currencies debit a different state family;
- Plasmid may resolve to AntiPlasmid in the antimatter universe;
- Knowledge also increments cumulative knowledge-spending statistics;
- Supply uses the purifier supply pool;
- Species payment is compound population/default-job behavior.

Those families require explicit source resolution and semantic operation design in a later M3D slice.

In particular, actual payment-source resolution must happen before affordability is treated as authoritative for a remapped source. M3D2's current ordinary-resource grouping by quote `resourceId` must not be mistaken for the final source model once special remapping exists.

## Architecture boundary

`payment-plan.mjs` may depend only on the internal hardened PaymentQuote input normalizer.

It may not acquire:

- state reads or affordability/capacity logic;
- legacy/global access;
- GameState mutation or transaction authority;
- payment execution;
- effect execution or EffectPlan coupling;
- special payment-family behavior;
- price calculation/modifier behavior;
- queue scheduling/work-item behavior;
- runtime/platform/UI dependencies;
- first-party Evolve namespace knowledge;
- async/Promise/generator control flow;
- dynamic loading.

Production source outside `src/engine/costs/**` may import only the reviewed M3D public entries:

```text
payment-quote.mjs
payment-assessor.mjs
payment-plan.mjs
```

The internal quote-input normalizer is not a production entry point.

The dedicated M3D3 architecture gate is part of `npm run test:architecture`.

## Queue boundary

A PaymentPlan is not intended to be the authoritative stored M3E queue item.

Queued work may wait while context changes. The future queue model should retain canonical command/work identity and authoritative progress data, then derive the current quote/payment semantics at the appropriate execution attempt rather than treating a stale PaymentPlan as permanent authorization.

## Deliberate non-goals

M3D3 adds no:

- payment execution;
- resource mutation capability;
- atomic transaction coordinator;
- GameState resource migration;
- affordability or queue-feasibility behavior change;
- prestige payment operation;
- Knowledge/Supply/Species payment operation;
- Plasmid/AntiPlasmid source remapping;
- pseudo-cost handling;
- M4 calculation/modifier pipeline;
- M3E queue work item;
- vanilla command cutover;
- public mod-facing payment-operation authoring API.

## Definition of done

M3D3 is complete when:

1. `createPaymentPlan(paymentQuote)` exists as the only public PaymentPlan entry;
2. the only planned operation is `payment.resource.debit`;
3. each ordinary quote line maps one-to-one to a debit with identical canonical resource ID and positive finite amount;
4. order and duplicate lines are preserved exactly;
5. free quotes produce empty plans;
6. PaymentPlan, operations array and operations are detached and frozen;
7. arbitrary caller quote objects are revalidated through the shared hardened quote-input boundary;
8. M3D2 uses that same helper without semantic behavior change;
9. planning does not read affordability/capacity state and does not require successful assessment;
10. planning performs no mutation or payment execution;
11. generic plan source has no first-party Evolve knowledge or special-payment semantics;
12. PaymentPlan remains distinct from EffectPlan/resource.consume;
13. DNA evidence proves legacy `2 RNA` maps to exactly one `payment.resource.debit` for canonical RNA;
14. DNA planning is complete legacy-state non-mutation;
15. architecture guards prevent execution authority, special-family drift, internal-helper leakage, effect coupling and hidden async/runtime dependencies;
16. the M3D3 architecture gate is wired into the explicit repository architecture command;
17. no gameplay, persistence, reset, UI or oracle behavior changes;
18. special payment families/source resolution remain a later M3D slice.
