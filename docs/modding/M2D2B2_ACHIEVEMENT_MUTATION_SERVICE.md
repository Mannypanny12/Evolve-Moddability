# M2D2b2 Achievement Mutation Service

## Purpose

M2D2b2 adds the first real domain-specific mutations behind the achievement capability boundary established and hardened in M2D2b1.

This slice remains pure engine work. It does not cut production authority over from legacy achievement state.

The runtime achievement service exposes exactly two operations:

```text
advance
removeUniverseRank
```

The raw mutation scope, generic transaction function, mutation authority, and store remain private.

## Boundary

M2D2b2 does not implement or know about:

- legacy achievement IDs;
- compact `l/e/a/h/m/mg` affixes;
- the current gameplay universe;
- `small` achievement policy;
- Micro special-case policy;
- challenge flags or `alevel()`;
- UI messages, redraws, mastery recalculation, or perk rendering;
- legacy hydration or projection;
- save/import/export/reset behavior;
- historical `vars.js` migrations;
- achievement registry membership policy.

Those concerns remain outside this domain mutation service. M2D3 will translate legacy gameplay intent into these clean engine operations.

## Capability model

`createGameStateRuntime()` is still the only GameState composition path that enables the `achievements` writable root.

It mints one scope:

```text
id: achievement-state
fields: ['achievements']
```

`createAchievementStateService()` validates that scope and retains only its private transaction closure.

The public service is frozen and exposes only:

```text
advance
removeUniverseRank
```

The methods close over their originating transaction capability and do not use `this`. Rebinding a method to another runtime therefore cannot redirect authority to that other runtime.

## `advance()`

The operation accepts a closed inert command:

```js
{
    achievementId,
    rank,
    advanceBase,
    universe? 
}
```

Rules:

1. `achievementId` must be a canonical content ID of type `achievement`.
2. Registry membership is not required.
3. `rank` must be a non-negative safe integer.
4. `-0` is canonicalized to ordinary `0`.
5. `advanceBase` is required and must be boolean.
6. `universe`, when present, must be one of the named non-Standard tracks:
   - `antimatter`
   - `evil`
   - `heavy`
   - `magic`
   - `micro`
7. `standard` is rejected as a universe track because Standard progress is represented by the base `rank` field.
8. At least one target is required: base advancement or a universe track.
9. The command is closed against unknown fields, symbols, accessors, arrays, exotic prototypes and unsafe proxy inspection.

### Monotonic numeric semantics

Existing numeric ranks only advance:

```text
stored 2, requested 4 -> 4
stored 4, requested 4 -> 4
stored 4, requested 2 -> 4
```

The base and universe targets are evaluated independently.

A combined request can therefore advance only one of the two tracks.

### Structural-zero semantics

M2D2b2 preserves all structural distinctions established by M2D1/M2D2a:

```text
achievement absent
achievement present at rank 0
universe track absent
universe track present at rank 0
universe track present at positive rank
```

Consequently:

- base advancement with rank `0` creates a missing achievement record;
- universe advancement with rank `0` creates a missing explicit universe track;
- repeating those operations after the structure exists is a no-op;
- a universe-only advancement on a missing achievement creates a base record at rank `0` plus the requested universe track.

Structure creation is therefore a real commit even when no numeric rank changes.

### Atomic combined advancement

A request targeting both base and universe runs through one M2B scoped transaction.

Both changes therefore produce one revision and one deterministic diagnostic. No intermediate base-only or universe-only committed state is observable.

## `removeUniverseRank()`

The operation accepts:

```js
{
    achievementId,
    universe
}
```

The universe must be a named non-Standard track.

Semantics:

- missing achievement: no-op and no record creation;
- existing achievement with missing target track: no-op;
- positive target track: remove the property and commit;
- explicit zero target track: remove the property and commit;
- base rank and all other universe tracks are preserved;
- the achievement record is preserved even if it becomes `{ rank: 0, universeRanks: {} }`.

Removal models the clean GameState form of legacy aggregate recalculation, where an affix may be explicitly cleared before universe-specific qualification is checked.

GameState never stores `undefined`; absence is the authoritative clear state.

## Mutation result

Both operations return a frozen rich result with the same shape:

```text
operation
achievementId
universe
changed
recordCreated
baseRankChanged
universeTrackCreated
universeRankChanged
universeRankRemoved
previousBaseRank
newBaseRank
previousUniverseTrackPresent
newUniverseTrackPresent
previousUniverseRank
newUniverseRank
diagnostic
```

For base-only advancement, universe-related presence/rank fields are `null` because no universe track was targeted.

For a targeted but absent universe track, its numeric rank is represented as `0` together with an explicit `...TrackPresent: false` flag. This preserves both numeric selector semantics and structural presence semantics.

### Flag meanings

`changed` is derived from the scoped transaction diagnostic's `committed` field. It therefore includes structural creation/removal as well as numeric changes.

`recordCreated` means the achievement record changed from absent to present.

`baseRankChanged` means the effective numeric base rank increased. Rank-zero record creation does not set it.

`universeTrackCreated` means the targeted universe property changed from absent to present, including creation at rank zero.

`universeRankChanged` means the effective numeric universe rank changed. Thus:

- absent -> explicit `0`: false;
- absent -> `3`: true;
- `1` -> `3`: true;
- explicit `0` -> absent: false;
- `3` -> absent: true.

`universeRankRemoved` means a previously present universe property was deleted, including a property whose value was zero.

This separation lets M2D3 reproduce the old legacy boolean correctly as:

```text
legacy unlock result = baseRankChanged
```

rather than incorrectly using the broader `changed` flag.

## Diagnostics and revisions

The service uses the diagnostic returned directly by the transaction that performed the operation.

This matters for no-ops: M2B returns a fresh no-op diagnostic while leaving `store.getLastChange()` unchanged. The service therefore never attaches a stale prior diagnostic to a no-op result.

Combined base + universe advancement uses one transaction and increments revision at most once.

All ordinary M2B rollback, scope enforcement, deterministic JSON-pointer diagnostics and committed-state freezing remain inherited from the generic state-store layer.

## Rank policy

M2D2b2 intentionally does not cap stored ranks at five.

The service accepts any non-negative safe integer, including values above five and `Number.MAX_SAFE_INTEGER`.

Vanilla challenge-derived award caps belong to the D3 legacy compatibility/command translation layer. Derived selectors continue to clamp each contribution to five without mutating stored state.

This keeps the state domain lossless for old data and suitable for future mod content whose rank policy may differ.

## Identity policy

The mutation service validates canonical typed achievement IDs but does not require registry membership.

This keeps mutable state preservation separate from current definition availability. A canonical unresolved/stale/mod achievement can remain representable and mutable without automatically becoming eligible for recognized-achievement totals.

## D3 translation map

The characterized legacy cases can be expressed without adding another D2b2 mutation primitive:

```text
Standard normal       -> advance(base=true)
Evil normal           -> advance(base=true, universe=evil)
Antimatter normal     -> advance(base=true, universe=antimatter)
Heavy normal          -> advance(base=true, universe=heavy)
Magic normal          -> advance(base=true, universe=magic)
Micro normal          -> advance(base=false, universe=micro)
Micro small           -> advance(base=true, universe=micro)
explicit legacy l     -> advance(base=true)
explicit legacy h     -> advance(base=true, universe=heavy)
aggregate clear       -> removeUniverseRank(universe=current non-Standard universe)
non-Micro small       -> rejected by D3 before calling the service
```

Challenge-derived rank clamping also happens before D3 calls `advance()`.

## Files

Production implementation is confined to:

```text
src/engine/state/achievement-state-service.mjs
```

No change is required to:

```text
src/engine/state/state-store.mjs
src/engine/state/game-state.mjs
src/engine/state/achievement-state.mjs
```

beyond the D2b1 composition already present.

Tests update the service-surface expectations from the intentionally empty D2b1 shell to the two D2b2 domain methods and add dedicated mutation coverage.

## Definition of done

M2D2b2 is complete when:

1. `advance()` implements monotonic base/universe progression;
2. rank-zero record and track creation remain real structural commits;
3. universe-only progression can create a base-zero record;
4. combined base + universe advancement is one transaction/revision;
5. `removeUniverseRank()` removes positive and explicit-zero tracks without deleting the achievement record;
6. missing removals are true no-ops;
7. rich frozen results distinguish structural and numeric changes;
8. no-op results use their own diagnostic while store `lastChange` remains unchanged;
9. canonical unresolved achievement IDs and >5 ranks remain allowed;
10. Standard/unknown universe track requests and malformed/no-target commands fail closed;
11. command validation remains inert/accessor-safe;
12. runtime method rebinding cannot redirect write authority;
13. no generic write authority is exposed;
14. no legacy production authority changes;
15. the complete M0/M1/M2 architecture, build and browser regression stack remains green.
