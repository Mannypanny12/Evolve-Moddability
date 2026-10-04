# M2D1 Achievement-State Characterization

## Purpose

M2D1 characterizes the first real authoritative state domain before any production authority moves.

The selected M2D domain is legacy achievement progression under:

```text
global.stats.achieve
```

M2D1 is intentionally behavior-neutral. It does not add an `achievements` GameState root, change `GAME_STATE_SCHEMA_VERSION`, introduce production selectors or mutation services, alter `unlockAchieve()`, change raw-global persistence, or change reset/UI behavior.

Its job is to freeze the legacy semantics that M2D2-M2D4 must preserve while replacing the representation and authority model.

## Why achievements are the first state domain

Achievements are a better first authority cut than a resource slice because they are persistent authoritative meta-progression with a comparatively bounded mutation surface.

A resource such as Food already participates in production, consumption, capacity, jobs, trade, cost/payment, queue and storage behavior. Migrating it end-to-end would prematurely pull M3 command/cost and M4 calculation work into M2.

Achievement state already has:

- a static-definition family from M1B;
- explicit M2A guidance that mutable achievement progress belongs in GameState after characterization;
- centralized ordinary writes through `unlockAchieve()`;
- widespread gameplay reads that make the migration meaningful rather than decorative;
- reset/save persistence through the existing raw `global` object.

M2D therefore migrates the complete achievement-progress ledger as one domain. It does not split authority by individual achievement.

## Scope boundary

M2D achievement state includes only:

```text
global.stats.achieve
```

It does not include:

- `global.stats.feat`;
- other statistics under `global.stats`;
- achievement presentation/localization definitions;
- perk definitions;
- challenge/task scratch progress such as `global.stats.banana` or `global.stats.endless_hunger`;
- cached `achieve_level` / `universe_level` values from `vars.js`;
- UI state such as `settings.showAchieve` or achievement message-filter preferences.

Those remain in their already assigned domains/layers.

## Legacy representation

Each achievement is keyed by its legacy string ID. A record contains a base rank and zero or more compact universe-rank fields.

Observed affix mapping:

| Meaning | Legacy field |
| --- | --- |
| base / standard | `l` |
| evil | `e` |
| antimatter | `a` |
| heavy | `h` |
| micro | `m` |
| magic | `mg` |

`universeAffix()` falls back to `l` for universe names outside those explicitly handled, including the current `bigbang` state.

The future engine representation must not retain these compact field names merely for compatibility. M2D2 should use explicit semantics and canonical achievement IDs.

## Rank-cap semantics

`alevel()` determines the maximum rank an ordinary unlock may award.

The cap starts at 1 and increments for each active legacy race/challenge flag:

```text
no_plasmid
no_trade
no_craft
no_crispr
weak_mastery
nerfed
badgenes
```

The result is capped at 5.

`unlockAchieve()` clamps an omitted or higher requested rank to this current cap before writing either base or universe progress.

The active challenge flags are inputs to the unlock operation. They are not part of the achievement-state domain.

## Monotonic progress

Ordinary achievement progression is monotonic.

For an existing record:

- a base rank is written only when the new rank is greater than the stored `l` rank;
- a universe rank is written only when the new rank is greater than the stored universe-affix rank;
- a lower/equal request does not downgrade either track.

M2D2 must make monotonic advancement an explicit domain invariant/service rule rather than relying on ad-hoc object mutation.

## Base and universe writes

For a normal non-Micro run, an ordinary unlock without an explicit universe-affix argument can update two pieces of state in one call:

```text
base rank (`l`)
current-universe rank (`e`, `a`, `h`, `mg`, etc.)
```

For Standard, the current-universe affix is `l`, so there is effectively one stored rank.

Callers can explicitly pass a legacy affix. This has two important behaviors:

1. passing `l` suppresses a universe-specific write;
2. passing another affix such as `h` targets that affix even if the active run is in another universe.

The target engine API must model this as explicit intent, not as arbitrary property access.

## Micro and `small` behavior

Micro has special legacy semantics that must be preserved during migration.

### Non-Micro + `small === true`

`unlockAchieve()` returns `false` immediately and does not create an achievement record.

### Micro + `small === true`

The base rank may advance and the Micro rank may advance. A successful base-rank advance returns `true`.

### Micro + normal/non-small unlock

The base rank does not advance, but the Micro rank can advance. In this case legacy `unlockAchieve()` can change persisted achievement state while still returning `false`, because its return value reports the base unlock rather than "any state changed".

This distinction must be preserved at the legacy compatibility boundary. The future engine mutation result should be richer than the old boolean so it can represent base and universe changes independently.

## Presence versus zero rank

Legacy state distinguishes an absent achievement record from a present record with rank zero.

A rank-zero call can create:

```js
{ l: 0 }
```

while returning `false`.

Presence is observable by legacy code because many readers first test whether the achievement object exists. M2D2 therefore must not silently canonicalize every zero-rank record to absence unless all affected legacy semantics are explicitly translated.

The cleanest initial migration contract is to preserve record presence as an explicit state fact while normal compatibility reads still exist.

## `undefined` universe fields

Legacy achievement code can transiently assign `undefined` to a universe-specific property when constructing aggregate achievements. JSON persistence subsequently omits those fields.

Legacy derived-level reads treat a missing affix and an explicitly `undefined` affix equivalently as no universe rank.

New GameState cannot contain `undefined` under the M2A state-value contract. The migration adapter must therefore translate both:

```text
missing property
explicit property with value undefined
```

into the same clean engine representation: no stored universe rank.

This is translation, not a GameState exception.

## Derived achievement levels

`universeLevel(universe)` derives two totals from achievement state:

```text
aLvl  = sum of base ranks
uLvl  = sum of ranks for the requested universe affix
```

Each individual rank contribution is capped at 5 when summed, even if malformed/old in-memory state contains a larger number.

For Standard, the universe affix is `l`, so `aLvl` and `uLvl` are the same sum.

The calculation does not mutate stored ranks.

The mutable legacy `achieve_level` and `universe_level` exports are therefore caches/projections, not authoritative state. M2C already classifies both as derived transient values. M2D must replace their authority with selectors/calculations rather than add them to GameState.

## Target identity contract

M2D2 should use canonical content IDs as GameState keys, for example:

```text
evolve:achievement/trade
evolve:achievement/explorer
evolve:achievement/mass_extinction
```

Legacy IDs such as `trade` remain compatibility inputs only.

The state-domain validator must require the canonical ID to have content type `achievement`. Registries still own definitions; GameState owns only mutable progress.

## Planned target representation

M2D2 should introduce an explicit representation conceptually equivalent to:

```js
{
    schemaVersion: 2,
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

Exact field names are finalized in M2D2 implementation, but these semantics are fixed by M2D1:

- canonical typed achievement identity;
- explicit base rank;
- explicit named universe ranks;
- preservation of record presence when required for legacy compatibility;
- no `undefined` values;
- no compact legacy-affix keys in authoritative engine state;
- no static definition/presentation data in runtime state.

Adding the mandatory `achievements` root changes the closed GameState structure, so M2D2 is expected to bump `GAME_STATE_SCHEMA_VERSION` from 1 to 2.

## Planned mutation contract

M2D2 should create a dedicated achievement mutation capability rather than expose generic GameState mutation authority.

The operation needs enough result detail to distinguish at least:

```text
baseRankChanged
universeRankChanged
previousBaseRank
newBaseRank
previousUniverseRank
newUniverseRank
```

The legacy adapter can then reproduce the old `unlockAchieve()` boolean contract while the engine preserves truthful mutation diagnostics.

The domain operation must remain synchronous and execute through the M2B transaction machinery.

## Planned read contract

M2D2/M2D4 need selectors equivalent to:

```text
hasAchievement(id)
achievementRank(id)
achievementUniverseRank(id, universe)
achievementLevel()
achievementUniverseLevel(universe)
```

Engine-facing selectors use canonical IDs.

Legacy callers may temporarily use a quarantined compatibility facade that accepts legacy achievement IDs and resolves them to canonical IDs. Ordinary gameplay reads must migrate away from direct `global.stats.achieve` access before M2D closes.

## Bootstrap and test-harness lifecycle

There is a critical lifecycle constraint in the current application/test architecture.

The legacy test bundle imports `achieve.js` before a scenario fixture is installed with `setGlobal()`. Therefore an achievement GameState runtime created once during module evaluation would capture the pristine startup object and become stale when the harness replaces `global`.

Production also loads/historically migrates the legacy save before the future M2D authority handoff.

The M2D compatibility layer therefore needs explicit or lazy hydration from the *current* legacy state rather than a permanent module-load snapshot.

Tests must prove that replacing legacy state after module import causes subsequent migrated achievement operations to use the newly installed state, not an earlier bootstrap copy.

This lifecycle seam is test/compatibility plumbing only. It must not expose a public generic `replace GameState` capability.

## Persistence and reset boundary

M2D does not implement persistence v2.

Legacy save/export/reset code still serializes the raw `global` object. Once GameState becomes authoritative in M2D3, `global.stats.achieve` must therefore remain as a one-way compatibility projection so current saves remain byte/shape compatible enough for existing import paths.

The direction after authority cutover is:

```text
legacy save/import
    -> M2D hydration/translation
    -> GameState.achievements (authoritative)
    -> compatibility projection
    -> global.stats.achieve (legacy save/read surface only)
```

There must not be continuing independent writes to both sides.

The compatibility projection is temporary:

- M6A owns broader achievement/feat/statistics content cleanup;
- M7F removes normal raw-global persistence;
- M9C remains the hard backstop for deleting the legacy bridge.

## M2D slice sequence

### M2D1 - characterization and migration contract

- expose the existing achievement functions through the test harness only;
- freeze legacy rank-cap, affix, monotonic, Micro/small, explicit-target, zero-rank and derived-level behavior;
- document translation and lifecycle rules;
- no production behavior change.

### M2D2 - pure engine achievement domain

- add GameState schema v2 with the achievement root;
- add validator/default construction;
- add selectors;
- add dedicated scoped mutation capability;
- keep production legacy authority unchanged.

### M2D3 - authority cutover and compatibility projection

- hydrate authoritative achievement state from the migrated legacy save;
- route achievement writes through GameState;
- project authoritative state back to the legacy save shape;
- preserve legacy `unlockAchieve()` observable behavior.

### M2D4 - read migration and closure

- move ordinary gameplay achievement reads to selectors/compatibility facade;
- freeze remaining direct legacy achievement access as explicit compatibility debt;
- run differential/oracle/browser/build closure review;
- leave no ordinary gameplay write authority in `global.stats.achieve`.

## M2D1 behavior boundary

M2D1 must not change:

- `GameState` schema/version;
- production `unlockAchieve()`;
- achievement state representation;
- save/load/import/export;
- resets;
- simulation;
- UI/rendering;
- existing oracle snapshots;
- M2C architecture baselines.

Only test-harness exposure, characterization tests and documentation are added.

## Definition of done

M2D1 is complete when:

1. achievement progression is confirmed as the complete first M2D authority domain rather than one individual achievement;
2. the legacy base/universe affix mapping is frozen;
3. challenge-derived rank-cap semantics are frozen;
4. monotonic base and universe advancement is frozen;
5. explicit `l` and cross-universe affix targeting are frozen;
6. all three Micro/small cases are frozen;
7. absent versus present rank-zero state is recorded and tested;
8. missing versus explicitly `undefined` universe progress is recorded as one translation semantic;
9. derived achievement/universe totals and per-rank cap behavior are frozen;
10. canonical target identity and representation rules are documented;
11. the module-load / `setGlobal()` hydration hazard is explicitly recorded for M2D2-M2D3;
12. the temporary one-way legacy persistence projection and its removal milestones are explicit;
13. no production authority or behavior changes;
14. the complete CI safety net remains green.
