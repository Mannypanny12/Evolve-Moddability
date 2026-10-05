# M3D1 Payment Quote Foundation

## Purpose

M3D1 introduces the first production primitive for M3D: a resolved, inert `PaymentQuote` contract.

The slice answers one narrow question:

```text
Is this a well-formed resolved description of what an action would cost?
```

It deliberately does not answer whether the player can afford the quote, whether it is queue-feasible, how a declared legacy cost is adjusted, or how payment mutates gameplay state.

M3D1 therefore adds no state read capability and no payment execution authority.

## Contract

The public entry point is:

```js
createPaymentQuote(resolvedLines)
```

It returns:

```js
{
    lines: [...]
}
```

The quote object, line array, and every normalized line are detached and frozen.

An empty line array is the canonical representation of a free resolved quote.

The public entry remains a synchronous one-argument function. Production code outside `src/engine/costs/**` may reach the cost layer only through this entry and only by static ESM import.

## M3D1 line family

M3D1 supports exactly one quote-line family:

```js
{
    kind: 'resource',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

This is sufficient for the first DNA payment vertical without prematurely defining prestige and special-payment families.

The supported line set will widen only in reviewed later M3D slices.

### Kind

A line kind must first be a syntactically valid stable lowercase engine kind. Malformed values fail with `INVALID_PAYMENT_QUOTE_LINE_KIND`.

A syntactically valid family that M3D1 does not yet support fails with `UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND`.

This distinction matters for future M3D expansion: malformed caller data is not confused with a reviewed-but-not-yet-supported semantic family.

### Identity

`resourceId` must be a canonical M1 content ID whose type is exactly `resource`.

The generic quote engine accepts arbitrary valid namespaces. It contains no built-in knowledge of first-party Evolve IDs.

Legacy resource names such as `RNA` or `DNA` are not valid quote identities.

### Amount

`amount` must be a JavaScript number that is finite and strictly greater than zero.

Fractional costs are supported.

Zero, negative zero, negative values, `NaN`, infinities, strings, BigInt and other non-number values fail closed.

A zero-cost action is represented by omitting the line, normally yielding an empty quote when no other prices remain.

### Legacy non-positive cost evidence

The positive-only rule is an intentional hardening boundary rather than an assumption about the old helper implementation.

M3D1 characterization proves that legacy `checkCosts()` / `payCosts()` accept a zero ordinary-resource cost as affordable and treat payment as a no-op. More importantly, they also accept a negative ordinary-resource cost and `payCosts()` then increases that resource because it subtracts the negative value.

The review hardening pass also proves that the legacy adjustment pipeline can turn a positive declared price into a resolved zero price. A representative `Food: 1` synthetic cost under the lone-survivor adjustment resolves to `Food: 0` after rounding.

M3D1 does not preserve negative arithmetic as payment semantics. A negative resolved price is invalid. A resolved zero price is normalized away before quote construction rather than represented as `{ amount: 0 }`. If later vanilla characterization finds a legitimate mechanic whose semantic meaning is a refund or grant, that mechanic must be represented explicitly rather than smuggled through a negative payment amount.

## Resolved means resolved

M3D1 does not evaluate legacy cost functions and does not reproduce `adjustCosts()`.

The intended architecture remains:

```text
declared cost
  -> contextual calculation/transformation (M4, or a bounded compatibility seam before M4)
  -> remove semantically empty zero-valued resolved lines
  -> resolved PaymentQuote (M3D)
  -> current affordability (M3D2)
  -> payment planning (later M3D)
  -> atomic payment + gameplay effect commit (M3F)
```

Numeric modifiers and general resource substitution remain outside the quote contract.

The bounded pre-M4 compatibility resolver is responsible for translating legacy zero-valued adjusted entries into omission. PaymentQuote itself remains strict and never treats zero as a normal payment line.

## Ordering and duplicate preservation

PaymentQuote preserves line order exactly.

M3D1 never sorts, coalesces, cancels or deduplicates lines.

Repeated input object identity is allowed, but each list position is normalized into a separate detached frozen line.

This is important because later affordability must account for cumulative debit against a shared payment source without destroying the semantic quote structure.

## Hostile-input handling

Quote arrays and line records reuse the hardened inert-data inspection primitives established earlier in the engine.

M3D1 rejects:

- sparse arrays;
- array subclasses and extra array properties;
- symbol-keyed fields;
- hidden fields;
- accessors without invoking their getter;
- exotic line objects;
- malformed line kinds;
- well-formed but unsupported line families;
- malformed or wrongly typed content IDs;
- unknown fields;
- missing fields;
- invalid amounts;
- over-large line collections.

A quote line is inspected into captured inert fields before its values are validated, so validation does not repeatedly dereference the original record.

For the reviewed scalar fields (`kind`, `resourceId`, `amount`), validation failures do not retain hostile caller objects in diagnostic details. Non-string/non-number values are represented by safe type metadata instead, so ordinary serialization of those contract-error details cannot re-trigger caller-controlled proxy traps.

## Architecture boundary

Production source under `src/engine/costs/**` may depend only on:

- `src/engine/identity.mjs`;
- `src/engine/contracts/inert-data.mjs`;
- sibling cost modules.

M3D1 cost source may not import or access:

- GameState or state infrastructure;
- legacy state or adapters;
- runtime/platform services;
- commands, conditions or effects;
- the definition Registry;
- mutation or transaction authority;
- `payCosts()` or `modRes()`;
- DOM/UI/browser APIs;
- dynamic loading or runtime code generation;
- first-party Evolve content namespace knowledge.

The D1 boundary also machine-rejects ordinary code-level drift into later M3D responsibilities such as affordability, queue/capacity feasibility, PaymentPlan/payment execution, and cost modifier/calculation logic. That vocabulary ratchet is deliberately D1-specific and must be consciously revised when M3D2 begins.

Production consumers outside the cost package may enter M3D1 only through `payment-quote.mjs` using static ESM import.

That module exposes exactly one synchronous production export with one explicit input: `createPaymentQuote(resolvedLines)`.

The dedicated D1 boundary executable is part of `npm run test:architecture`, not merely covered incidentally through unit-test discovery.

## DNA boundary

M3D1 does not add a first-party DNA quote factory because generic engine source must remain content-neutral.

The eventual resolved DNA price can be represented by first-party composition as:

```js
createPaymentQuote([
    {
        kind: 'resource',
        resourceId: '<canonical RNA resource id>',
        amount: 2,
    },
]);
```

The DNA `+1` grant remains an M3C EffectPlan operation. The two concepts stay separate.

## Deliberate non-goals

M3D1 does not:

- read resource amount, capacity, display state, prestige holdings or special payment pools;
- determine current affordability;
- determine queue/capacity feasibility;
- create a `PaymentPlan`;
- execute payment;
- mutate legacy state or GameState;
- define Knowledge, Supply, Species or prestige payment behavior;
- resolve Plasmid to AntiPlasmid;
- evaluate pseudo-cost requirements such as Bool, Morale, Army or Structs;
- implement the general M4 calculation/modifier pipeline;
- introduce queue behavior;
- cut over any vanilla action;
- create a public mod-facing payment registration API.

## Definition of done

M3D1 is complete when:

1. the resolved `PaymentQuote` contract exists as production engine code;
2. the only supported line family is `resource`;
3. line shape is exactly `kind`, `resourceId`, `amount`;
4. malformed kind syntax is distinct from a well-formed but unsupported family;
5. resource IDs use canonical typed M1 identity across arbitrary namespaces;
6. amounts are strictly positive finite numbers and may be fractional;
7. an empty line list represents a free quote;
8. legacy adjusted zero values are explicitly normalized to omitted lines before quote construction;
9. quote, line array and lines are detached and frozen;
10. exact order and duplicates are preserved, including repeated input object identity;
11. malformed containers, hostile records, malformed IDs, bad amounts, unknown fields and unsupported kinds fail closed;
12. scalar validation errors do not retain hostile caller objects in diagnostic details;
13. the line collection has an explicit safety ceiling;
14. legacy zero and negative ordinary-resource helper behavior and positive-to-zero adjustment behavior are characterized, with the positive-only engine rule recorded as an intentional hardening decision;
15. generic M3D1 source contains no state reads, mutation/payment authority, later-M3D semantic scope, legacy dependencies, UI/runtime dependencies or first-party namespace knowledge;
16. production callers cannot bypass or dynamically load around the reviewed quote entry module;
17. the dedicated M3D1 boundary is wired into the repository architecture command;
18. no gameplay, persistence, reset, UI or oracle behavior changes;
19. M3D2 remains responsible for current affordability and queue-payment feasibility.
