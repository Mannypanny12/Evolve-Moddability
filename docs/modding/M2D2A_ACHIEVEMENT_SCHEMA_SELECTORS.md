# M2D2a Achievement Schema and Selectors

## Purpose

M2D2a introduces the pure engine representation and read model for achievement progression without changing production gameplay authority.

This slice adds:

- GameState schema version 2;
- the first real authoritative-domain shape, `achievements`;
- strict achievement-state validation;
- canonical achievement content IDs as state keys;
- explicit base and named universe ranks;
- pure achievement selectors;
- catalog-filtered derived achievement totals;
- continued read-only GameState integration with zero writable roots.

M2D2a deliberately does not add the achievement mutation service, legacy hydration, compatibility projection, gameplay cutover, persistence integration, or ordinary legacy read migration.

## GameState v2

The GameState root is now:

```js
{
    schemaVersion: 2,
    achievements: {}
}
```

Adding the mandatory `achievements` root changes the closed authoritative GameState contract, so the schema version moves from 1 to 2.

`validateGameState()` does not upgrade schema-v1 state. GameState persistence migration remains future persistence work.

## Achievement state shape

Achievement progression uses canonical typed content IDs:

```js
{
    achievements: {
        'evolve:achievement/trade': {
            rank: 3,
            universeRanks: {
                evil: 2,
                heavy: 1
            }
        }
    }
}
```

The representation deliberately does not carry legacy compact affixes such as `l`, `e`, `a`, `h`, `m`, or `mg`.

The base `rank` is also the Standard-universe rank. Non-Standard tracks are named explicitly in `universeRanks`.

Supported engine universe tracks are:

```text
standard
antimatter
evil
heavy
magic
micro
```

`standard` is represented by the base `rank`; only the other five may appear inside `universeRanks`.

Unknown universe names fail closed. Legacy `universeAffix()` fallthrough behavior is compatibility-layer behavior for M2D3, not a clean engine-state rule.

## Rank contract

Stored ranks must be non-negative safe integers.

They are intentionally not structurally limited to 5.

M2D1 proved that legacy state can contain ranks above 5 while derived achievement-level calculations clamp each contribution to 5 without rewriting the stored progress. Preserving that distinction lets M2D3 translate normalized legacy state without lossy normalization.

Normal future award operations can impose stricter mutation rules independently of the state validator.

## Record presence

A record with rank zero is valid and remains present:

```js
{
    rank: 0,
    universeRanks: {}
}
```

M2D1 established that legacy record presence is observable independently from positive rank. M2D2a therefore does not normalize zero-rank records away.

## Universe-rank absence

Legacy aggregate achievement recalculation may create an explicitly `undefined` universe field in memory.

GameState never stores `undefined`. A cleared/unset universe rank is represented by absence from `universeRanks`.

M2D2b will add the explicit remove-universe-rank mutation needed to model aggregate recalculation cleanly.

## Identity validation versus registry recognition

Stored state requires a syntactically canonical content ID whose content type is `achievement`.

State validation does **not** require current achievement-registry membership.

This distinction is necessary because:

- M1B currently contains representative achievement definitions rather than the complete vanilla catalog;
- normalized legacy state may need to preserve unresolved/stale canonical progress records during compatibility work;
- package/content availability policy belongs above the low-level state validator.

Therefore these are separate concepts:

```text
valid stored achievement progress
            !=
currently recognized achievement definition
```

## Selectors

M2D2a adds pure selectors:

```text
hasAchievement(state, id)
achievementRank(state, id)
achievementUniverseRank(state, id, universe)
achievementLevel(state, recognizedAchievementIds)
achievementUniverseLevel(state, universe, recognizedAchievementIds)
```

Missing achievements and missing universe tracks read as rank 0.

`hasAchievement()` remains separate so callers can distinguish a missing record from a present rank-zero record.

### Derived totals

Derived total selectors receive an explicit recognized achievement-ID collection.

They:

- validate IDs as canonical achievement identities;
- deduplicate repeated recognized IDs;
- ignore recognized IDs with no state record;
- ignore stored state records that are not in the recognized collection;
- cap every individual contribution at 5;
- do not mutate stored ranks.

This preserves the M2D1 finding that legacy `universeLevel()` iterates the known achievement definition catalog rather than blindly summing every ledger key.

Later, once the full achievement definition catalog exists, callers can naturally provide the registry's canonical IDs.

## Store integration

`createGameStateStore()` now constructs and freezes GameState v2 normally.

M2D2a intentionally keeps:

```js
GAME_STATE_WRITABLE_ROOT_FIELDS = []
```

The `achievements` domain exists structurally but cannot yet be acquired by a mutation scope through the GameState composition point.

That changes only in M2D2b, where the composition layer will create a dedicated achievement mutation capability while preserving the read-only store facade.

## Production behavior boundary

M2D2a makes no changes to:

- `src/achieve.js`;
- `src/vars.js`;
- `global.stats.achieve` authority;
- `unlockAchieve()`;
- `alevel()`;
- Micro/small achievement policy;
- mastery recalculation;
- achievement UI/messages;
- save/export/import;
- reset behavior;
- historical legacy migrations;
- ordinary legacy achievement readers.

Legacy gameplay remains authoritative throughout this slice.

## Tests

Coverage includes:

- GameState v2 default/root behavior;
- rejection of schema v1 and unknown root fields;
- canonical achievement identity validation;
- wrong-type/noncanonical ID rejection;
- unresolved canonical achievement-state preservation;
- closed achievement records;
- closed universe-rank fields;
- non-negative safe-integer rank enforcement;
- explicit rejection of `undefined`;
- zero-rank record preservation;
- ranks above 5 remaining valid stored state;
- Standard/base and non-Standard rank reads;
- missing rank normalization to zero;
- catalog-filtered totals;
- per-achievement contribution cap of 5;
- recognized-ID deduplication;
- unknown engine universe rejection;
- selector use through the frozen read-only GameState store;
- continued absence of generic mutation authority from `createGameStateStore()`.

## Exit criteria

M2D2a is complete when:

1. GameState schema v2 requires the `achievements` domain;
2. achievement progress uses canonical typed achievement IDs and explicit rank fields;
3. normalized legacy-compatible ranks can be represented losslessly without allowing legacy `undefined`;
4. zero-rank record presence is preserved;
5. pure selectors reproduce the characterized read semantics;
6. derived totals use an explicit recognized-ID set rather than raw state enumeration;
7. no GameState write authority is exposed yet;
8. existing architecture, build, browser, and legacy regression gates remain green;
9. production legacy gameplay behavior remains unchanged.

M2D2b can then add the dedicated achievement mutation service and GameState composition capability on top of this proven read model.
