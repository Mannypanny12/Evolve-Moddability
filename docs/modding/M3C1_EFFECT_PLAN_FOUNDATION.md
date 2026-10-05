# M3C1 Effect-plan foundation

## Status

M3C1 establishes the inert effect-planning boundary. It does not introduce gameplay execution authority and does not cut over any vanilla action.

## Purpose

M3C answers one narrow question in the M3 command pipeline: **what gameplay changes would this command intend to cause?**

An EffectPlan is a detached, immutable description of intended semantic operations. Possessing an EffectPlan does not authorize or perform mutation. It is not a transaction, queue item, save object, callback bundle, or executor.

The intended later pipeline remains:

1. M3B evaluates execution conditions.
2. M3D quotes cost, affordability, and payment.
3. M3C plans gameplay effects.
4. A later execution coordinator atomically commits approved payment and effects through narrow domain mutation capabilities.
5. Committed gameplay facts can drive presentation separately.

M3C1 implements only step 3's safe data foundation. It deliberately does not implement step 4.

## Public foundation

### `createEffectPlan(operations = [])`

`src/engine/effects/effect-plan.mjs` creates a closed frozen plan:

```js
{
    operations: []
}
```

M3C1 recognizes no gameplay operation kinds yet. Any non-empty operation currently fails closed. This is intentional: stable resource semantics are introduced in M3C2 rather than being smuggled into the foundation slice.

### Effect contract data

`src/engine/effects/common.mjs` provides bounded inert-data canonicalization and closed-object/array readers for later operation schemas.

Effect contract data:

- accepts only `null`, strings, booleans, finite numbers, normal arrays, and plain/null-prototype objects;
- normalizes negative zero;
- is detached from caller-owned objects;
- is deeply frozen after canonicalization;
- has deterministic sorted object keys;
- rejects functions, symbols, bigint, exotic objects, accessors, hidden fields, symbol fields, sparse arrays, array subclasses, cycles, and repeated object/array aliases;
- fails closed when hostile objects cannot be safely inspected;
- enforces nesting, collection-length, and object-width limits.

These properties ensure later EffectPlans remain inert data rather than a disguised execution surface.

## Shared inert-data inspection

M3C1 extracts only the genuinely generic hostile-object inspection primitives into:

`src/engine/contracts/inert-data.mjs`

The shared contract owns:

- unambiguous data-path construction;
- safe plain-object inspection;
- safe dense-array inspection;
- accessor/symbol/sparse/exotic-object rejection;
- optional collection-width limits.

Command and condition layers now reuse those inspection primitives while retaining their own domain-specific canonicalizers, limits, error codes, and policies. Mutable GameState canonicalization is intentionally not routed through this frozen-data contract.

## Architecture boundary

`tests/architecture/m3c1-effect-boundary-fitness.cjs` makes the effect-planning boundary executable.

Effect modules may depend only on:

- `src/engine/identity.mjs`;
- `src/engine/contracts/inert-data.mjs`;
- sibling effect modules.

The boundary rejects:

- all `src/engine/state/**` imports;
- mutation scopes, mutation authority, transaction authority, and legacy resource mutation helpers;
- legacy/platform/runtime adapters;
- command and condition execution modules;
- the inert definition Registry as executable storage;
- external packages and dynamic imports;
- browser/UI globals, storage, network APIs, timers, clock/random sources, and dynamic code evaluation.

The neutral inert-data contract itself may import only the identity contract and is checked by the same fitness gate.

This intentionally stronger rule means the planner does not merely promise not to mutate GameState: it cannot import GameState at all.

## Deliberate non-goals

M3C1 does **not** add:

- `resource.grant` or `resource.consume` semantics;
- technology, structure, population, achievement, or other gameplay operation kinds;
- an EffectExecutor or generic state patch/set operation;
- GameState reads or writes;
- mutation scopes, transactions, drafts, or domain mutation services;
- conditions inside effect operations;
- cost, affordability, or payment semantics;
- queue/work-item behavior;
- UI, DOM, localization, sound, or presentation reactions;
- persistence of EffectPlans;
- mod-facing operation registration;
- the `evolution.dna` cutover.

## M3C2 handoff

M3C2 can now add the first closed semantic operation schemas on top of this foundation. The planned initial pair is:

- `resource.grant`;
- `resource.consume`.

Those operations should remain semantic deltas, preserve declared order and duplicates, and still carry no mutation authority. Costs/payment remain owned by M3D even when payment ultimately consumes resources.

## Verification

M3C1 tests cover the empty EffectPlan contract, unsupported-operation fail-closed behavior, deterministic canonicalization, detachment, deep freezing, hostile inspection, accessors, hidden/symbol fields, sparse arrays, exotic arrays/objects, cycles, repeated aliases, non-finite numbers, excessive depth/width/length, and architecture-boundary violations.

Existing M3A/M3B behavior remains covered by their original command and condition suites after the shared inspection extraction.
