# M3C2 Core Resource Operations

## Purpose

M3C2 introduces the first real semantic EffectPlan operation kinds on top of the hardened M3C1 inert planning boundary.

The slice answers one narrow question:

```text
Is this a well-formed inert instruction describing an intended resource change?
```

It does not answer whether the change can happen against current state and it does not execute the change.

## Supported operation kinds

M3C2 supports exactly:

```text
resource.grant
resource.consume
```

Both use the same closed shape:

```js
{
    kind: 'resource.grant' | 'resource.consume',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

No other fields are permitted.

### `resource.grant`

`resource.grant` describes an intended positive increase to a resource.

It does not promise that the committed amount will increase by the full requested amount. Capacity/clamping, availability, actual committed quantity and domain-specific side effects belong to the later authoritative resource mutation capability.

### `resource.consume`

`resource.consume` describes an intended positive decrease to a resource.

The operation amount is still positive; the operation kind carries the direction. Zero, negative zero and negative amounts are invalid.

`resource.consume` is not the ordinary command-payment mechanism. M3D owns quote, affordability and PaymentPlan semantics. A gameplay effect whose meaning is resource loss may use `resource.consume`; an ordinary command price remains a payment operation.

## Resource identity

`resourceId` must be a canonical M1 typed content ID whose content type is `resource`.

Examples:

```text
evolve:resource/dna
example:resource/dragon_blood
```

Legacy aliases such as `DNA` are not accepted by the engine effect contract.

M3C2 does not consult the resource definition Registry and does not prove that a named resource currently exists in gameplay state. This keeps EffectPlan validation independent of both definition registration and runtime authority.

## Amount contract

`amount` must be:

- a JavaScript number;
- finite;
- strictly greater than zero.

Fractional values are supported. Safe-integer-only semantics would be incorrect for Evolve resources and costs.

Rejected examples include:

```text
0
-0
negative values
NaN
Infinity
strings
BigInt
objects
```

## Operation ordering

EffectPlan preserves operation sequence exactly.

M3C2 never:

- sorts operations;
- coalesces duplicate operations;
- cancels opposite operations;
- rewrites grant/consume pairs into a net delta.

Those transformations could change later capacity, statistics, event or domain-hook semantics.

## Single-inspection parsing

M3C2 refines the M3C1 parser so an untrusted operation object is inspected once into inert captured fields before its `kind` selects the fixed built-in schema.

This avoids reading a hostile Proxy once to discover the kind and then reflecting over the original object again during schema validation.

The normalization path is:

```text
inspect operation object once
  -> capture inert fields
  -> require + validate kind
  -> select fixed core schema
  -> validate required/allowed fields
  -> canonicalize typed resource ID and amount
  -> construct detached frozen operation
```

There is no public or dynamic operation registration mechanism.

## Architecture boundary

M3C2 requires no widening of the hardened M3C1 architecture boundary.

Effect modules may continue to depend only on:

- `src/engine/identity.mjs`;
- `src/engine/contracts/inert-data.mjs`;
- sibling effect modules.

The effect layer still may not import or access:

- GameState or state infrastructure;
- mutation authority or transactions;
- legacy `global` or legacy adapters;
- runtime/platform services;
- condition or command execution modules;
- the definition Registry;
- DOM/UI APIs;
- dynamic loading or runtime code generation.

## Deliberate non-goals

M3C2 does not:

- execute EffectPlans;
- introduce an EffectExecutor;
- read current resource amount, capacity, display/availability or unlock state;
- decide resource underflow or overflow behavior;
- mutate legacy or GameState resources;
- introduce the temporary resource mutation compatibility adapter;
- implement affordability or payment;
- put ordinary costs into `resource.consume`;
- add technology, structure, population or achievement operation kinds;
- add conditions inside effects;
- add queues, persistence or presentation reactions;
- add mod-facing effect registration;
- create the `evolution.dna` planner or cut over vanilla gameplay.

## DNA boundary example

The eventual DNA action is expected to separate payment and effect semantics.

Its M3C portion is expected to contain only:

```js
{
    kind: 'resource.grant',
    resourceId: 'evolve:resource/dna',
    amount: 1,
}
```

The 2 RNA price belongs to M3D PaymentPlan rather than to the DNA EffectPlan.

M3C3 will turn that separation into explicit DNA contract evidence before any M3F execution cutover.

## Definition of done

M3C2 is complete when:

1. `resource.grant` and `resource.consume` are the only supported core effect operation kinds;
2. each operation has exactly `kind`, `resourceId` and `amount`;
3. resource IDs are canonical typed `resource` content IDs across arbitrary valid namespaces;
4. amounts are positive finite numbers and may be fractional;
5. operations are detached and frozen;
6. EffectPlan and its operation array remain frozen;
7. operation order and duplicates are preserved exactly;
8. malformed IDs, amounts, missing fields, unknown fields and unsupported kinds fail closed;
9. hostile accessors are not invoked and operation schema parsing uses the captured single inspection;
10. the M3C1 architecture fitness boundary remains unchanged and green;
11. no state, registry, payment, executor, legacy or UI dependency is introduced;
12. no production gameplay behavior changes.
