# M3C3 DNA Effect Closure

## Purpose

M3C3 closes the M3C effect/operation-planning milestone by proving that the hardened generic EffectPlan model can describe a real vanilla Evolve gameplay effect without absorbing payment, condition, state, legacy callback, or presentation responsibilities.

The selected evidence remains `evolution.dna`, the first M3 vertical established in M3A0.

M3C3 deliberately adds no new production effect operation kind and does not cut over vanilla gameplay. The existing M3C1/M3C2 production effect code is sufficient.

## Legacy DNA decomposition

The legacy DNA action combines multiple concerns in one callback:

```text
execution guard:
  RNA >= 2
  DNA < DNA.max

mutation:
  RNA -2
  DNA +1

legacy callback result:
  false
```

Its separate presentation/qualification `condition()` also checks DNA availability/display and the final evolution-menu state. M3A0 and M3B already proved that these are not one semantic contract.

M3C3 freezes the authoritative decomposition as:

```text
2 RNA consumption
  -> payment evidence
  -> M3D responsibility

1 DNA grant
  -> gameplay-effect evidence
  -> M3C responsibility
```

The M3C representation is therefore exactly:

```js
createEffectPlan([
    {
        kind: 'resource.grant',
        resourceId: 'evolve:resource/dna',
        amount: 1,
    },
]);
```

There is intentionally no `resource.consume` RNA operation in the DNA EffectPlan.

## Why RNA is excluded

M3C2 supports `resource.consume` because gameplay effects may semantically remove resources. That does not make ordinary command prices effects.

Putting both lines into the DNA EffectPlan would recreate the legacy `pay + mutate` coupling:

```text
resource.consume RNA 2
resource.grant DNA 1
```

That shape is structurally valid M3C data but semantically wrong for this command. The RNA line is a command payment and remains owned by M3D.

This distinction is now executable regression evidence rather than documentation only.

## Planning validity is not executability

The DNA effect definition remains `grant 1 DNA` even when current state prevents execution, for example:

- RNA is below the required payment amount;
- DNA is already at capacity.

Those states cause later condition/payment/execution rejection. They do not change the semantic effect definition into an empty plan.

M3C therefore still does not read:

- current RNA;
- current DNA;
- DNA capacity;
- resource display/availability;
- `evoFinalMenu`;
- affordability;
- any other gameplay state.

## Differential evidence

`tests/characterization/m3c3-dna-effect-closure.test.cjs` uses the real legacy action harness.

For a successful DNA action it proves:

```text
legacy declared cost: RNA 2
legacy observed mutation: RNA -2, DNA +1
legacy callback return: false
```

It then proves that the M3C plan projects only:

```text
evolve:resource/dna +1
```

and contains neither an RNA subject nor a `resource.consume` operation.

The same plan remains unchanged in representative states where the legacy callback cannot mutate because of insufficient RNA or full DNA capacity.

This is test-only semantic evidence. M3C3 does not add an EffectExecutor, net-delta calculator, simulator, or legacy effect adapter to production code.

## Generic engine boundary

M3C3 deliberately does not add an engine-level `createDnaEffectPlan()`.

`src/engine/effects/**` is generic infrastructure. First-party vanilla identities such as `evolve:resource/dna` belong in first-party content/command composition, not in reusable engine internals.

The closure architecture gate therefore adds a new permanent rule:

```text
src/engine/effects/** may not embed first-party evolve:* content IDs
```

Third-party/generic canonical IDs are not inherently prohibited by that scanner, but production M3C currently contains no concrete content identity at all.

## Payment and condition closure rules

`tests/architecture/m3c3-effect-closure.cjs` is cumulative over the M3C1 and M3C2 fitness gates.

In addition to all existing dependency, runtime, authority, and entry-surface restrictions, it rejects effect-engine source that begins to own identifiers associated with:

- costs/prices;
- quotes;
- affordability;
- payment plans/payment helpers;
- condition evaluation.

Strings/comments used only for diagnostics are not treated as executable payment/condition identifiers, while first-party content IDs are forbidden even in effect-source comments so the generic layer does not accumulate vanilla-specific knowledge.

## No legacy effect bridge

M3B3 required a temporary semantic read provider because conditions must inspect current legacy state.

M3C does not read state and therefore needs no equivalent effect bridge. The existing test-only legacy harness is sufficient to observe historical DNA behavior for differential evidence.

No `src/legacy/bridge` effect adapter is introduced by M3C3.

## Production impact

M3C3 does not modify:

- `src/engine/effects/**`;
- `src/actions.js`;
- `src/functions.js`;
- GameState schema or writable roots;
- legacy bridge production modules;
- command registrations;
- payment/cost behavior;
- queues;
- persistence;
- UI/presentation;
- oracle snapshots.

Vanilla DNA still executes through the legacy path. Actual routing through the new command architecture remains M3F.

## M3C closure

M3C is complete when M3C1, M3C2 and M3C3 collectively prove:

1. EffectPlans are explicit, inert, detached, immutable descriptions of semantic operations;
2. EffectPlan possession grants no mutation authority;
3. operation data is fail-closed against hostile shapes and bounded for resource exhaustion;
4. `resource.grant` and `resource.consume` use canonical typed resource IDs and positive finite amounts;
5. operation order and duplicates are preserved exactly;
6. M3C performs no GameState/legacy-state reads or writes;
7. M3C owns no capacity, affordability, quote, payment, queue or presentation semantics;
8. the generic effect layer contains no first-party Evolve content identities;
9. real legacy DNA behavior is decomposed into payment evidence (`RNA -2`) and effect evidence (`DNA +1`);
10. the DNA M3C representation contains exactly one `resource.grant(evolve:resource/dna, 1)` operation and no RNA payment operation;
11. planning validity remains distinct from current executability;
12. no legacy effect adapter, EffectExecutor or vanilla cutover is introduced;
13. the M3C1, M3C2 and M3C3 architecture gates are cumulative in CI;
14. the full unit, architecture, build and browser safety net remains green.

After M3C closure, M3D owns quote, affordability and semantic payment planning. DNA's `2 RNA` price becomes the first simple payment evidence while special legacy payment families remain separately modeled rather than being forced into ordinary resource effects.
