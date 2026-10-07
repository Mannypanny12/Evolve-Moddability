# M2D2a Review and Hardening

## Purpose

This pass reviews M2D2a before the mutation service is introduced in M2D2b.

The review stays inside the read-model boundary:

- no achievement mutation authority;
- no legacy hydration or projection;
- no `unlockAchieve()` cutover;
- no save/reset changes;
- no ordinary gameplay reader migration.

## Review result

The M2D2a production design is sound. No production schema or selector correction was required.

The review did identify one legacy-compatibility edge that needed to be frozen explicitly before M2D2b and several adversarial cases that deserved direct domain coverage rather than relying only on the generic M2A state-value tests.

## Hardening 1: present zero-valued universe tracks

M2D1 already established that achievement-record presence can be observable at rank zero.

The follow-up review confirmed a parallel universe-track case in legacy `unlockAchieve()`:

- a new non-Standard achievement starts as `{ l: 0 }`;
- requesting rank `0` does not increase the base rank;
- the missing current-universe property still satisfies the legacy write condition;
- the universe property is therefore written explicitly with value `0`.

For an Evil run this produces:

```js
{
    l: 0,
    e: 0
}
```

The legacy return value remains `false`, and derived levels remain zero.

The M2D2a representation already supports the lossless equivalent:

```js
{
    rank: 0,
    universeRanks: {
        evil: 0
    }
}
```

This is intentionally distinct in stored structure from:

```js
{
    rank: 0,
    universeRanks: {}
}
```

Both read as universe rank `0`, but the explicit zero-valued track is not normalized away.

This matters to M2D2b because creating a previously absent zero-valued universe track is a real state change even though the numeric rank remains zero.

A dedicated characterization test now freezes the legacy behavior, and an engine hardening test proves validated GameState preserves the corresponding explicit zero-valued track.

## Hardening 2: safe-integer boundary

The rank contract intentionally allows stored values above the ordinary achievement cap of five for lossless compatibility, but ranks must still be non-negative safe integers.

Hardening coverage now proves:

- `Number.MAX_SAFE_INTEGER` remains structurally valid;
- a value beyond the safe-integer boundary fails with `INVALID_ACHIEVEMENT_STATE_RANK`.

This keeps the structural compatibility allowance precise rather than accidentally becoming an unrestricted numeric contract.

## Hardening 3: nested inert-data enforcement

M2A already rejects accessors and exotic state values generically. M2D2a now adds direct achievement-domain coverage proving that:

- accessor-backed achievement rank fields are rejected without invoking the getter;
- the achievement map cannot be replaced by an array;
- an achievement record cannot be replaced by an array;
- `universeRanks` cannot be replaced by an array.

These tests make the domain boundary locally legible and protect future edits to `achievement-state.mjs` from accidentally bypassing the generic state-value contract.

## Hardening 4: selector input inertness

Derived total selectors accept an explicit array of recognized canonical achievement IDs.

That list is treated as inert data and canonicalized before use. Hardening coverage now proves that accessor-backed recognized-ID arrays fail without invoking the accessor.

Selectors deliberately do not revalidate the complete GameState tree on every call. Their state argument is expected to be validated engine GameState, normally supplied by `createGameStateStore()` / `store.select()`.

This keeps selector reads cheap and preserves the M2B separation between state validation at construction/commit boundaries and pure read operations.

## Decisions retained after review

The review specifically re-checked and retained these M2D2a choices:

1. **GameState schema version 2** is correct because `achievements` is a new mandatory root.
2. **State validation is syntactic, not registry-membership based.** Unresolved canonical achievement IDs remain representable.
3. **Derived totals are catalog-filtered.** They receive explicit recognized IDs rather than enumerating every stored ledger record.
4. **Stored ranks may exceed five.** Derived totals cap each contribution at five without mutating stored state.
5. **Unknown engine universe names fail closed.** Legacy fallback-to-base behavior belongs in the future compatibility adapter.
6. **Standard progress is the base `rank`.** Only non-Standard tracks live in `universeRanks`.
7. **No write capability exists in M2D2a.** `createGameStateStore()` remains a read-only facade and the GameState composition point still configures zero writable roots.
8. **No generic state mutation API is introduced.** M2D2b must mint only a dedicated achievement-domain capability.

## M2D2b implications

The mutation service must now preserve all of the following distinctions:

```text
achievement absent
achievement present at rank 0
universe track absent
universe track present at rank 0
universe track present at positive rank
```

Therefore a rank-zero operation may still commit when it creates either a record or a universe track.

The future mutation result must distinguish structural creation from numeric advancement. In particular, it must not derive `changed` solely from `baseRankChanged` or `universeRankChanged` if a zero-valued record/track was newly created.

Aggregate recalculation still additionally requires explicit universe-track removal as established by M2D1.

## Closure criteria

M2D2a is ready to close when:

1. the original M2D2a tests remain green;
2. zero-valued non-Standard legacy track presence is characterized;
3. GameState preserves an explicit zero-valued universe track;
4. safe-integer boundaries are covered;
5. nested achievement state remains inert plain data;
6. selector input canonicalization remains getter-safe;
7. architecture/build/browser regression gates remain green;
8. no production legacy authority or behavior changes occurred.

After these gates pass, M2D2b can add the dedicated mutation service without reopening the read-model contract.
