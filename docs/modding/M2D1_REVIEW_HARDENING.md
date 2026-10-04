# M2D1 Review and Hardening

## Purpose

This pass reviews M2D1 after the initial achievement-state characterization and hardens gaps before M2D2 begins.

The review deliberately remains inside the M2D1 boundary:

- no `GameState` schema change;
- no production achievement authority cutover;
- no production selector or mutation service;
- no persistence-v2 work;
- no ordinary gameplay behavior change.

Only test-harness exposure, characterization coverage, source-backed authority inventory and documentation are hardened.

## Review result

The original M2D1 direction was correct, but the first pass was not yet complete enough to serve as the migration contract for M2D2.

Four gaps were found.

### 1. Aggregate achievements have a second authoritative mutation path

The initial characterization focused on `unlockAchieve()`, but `checkBigAchievement()` also mutates achievement records directly.

For aggregate achievements such as `mass_extinction`, `creator` and `explorer`, the legacy flow is intentionally two-stage:

1. base aggregate progress is calculated from base ranks of the child achievements;
2. `unlockAchieve()` is called for that base aggregate;
3. in a non-Standard universe, the universe field just written by `unlockAchieve()` is explicitly assigned `undefined`;
4. `checkBigAchievementUniverse()` independently decides whether enough child achievements qualify in the current universe;
5. only then may that universe rank be restored.

Therefore the future engine model needs an explicit **remove universe rank** operation/transition. Treating achievement progress as monotonic-only would be wrong for aggregate recalculation.

`undefined` itself remains forbidden in GameState. The engine representation should model the cleared rank as absence, while the legacy projection may temporarily reproduce the old in-memory shape when required.

### 2. Derived achievement totals are definition-catalog filtered

`universeLevel()` does not iterate every key stored under `global.stats.achieve`.

It iterates the known `achievements` definition catalog and reads matching progress records. Consequently an unknown legacy ledger key can remain present in the save object while contributing nothing to `aLvl` or `uLvl`.

M2D2 must therefore not implement `achievementLevel()` or `achievementUniverseLevel()` as a blind sum over every GameState record.

The migration needs two distinct concerns:

- **state preservation:** preserve valid normalized progress records needed for compatibility/round-trip safety, including unresolved legacy IDs when appropriate;
- **derived eligibility:** count only achievement identities recognized by the applicable definition catalog/registry.

This distinction also prepares the domain correctly for mods: a registered mod achievement may participate in derived calculations, while an unresolved stale save key should not automatically do so.

### 3. Historical achievement migrations happen before the M2D hydration seam

`src/vars.js` already contains a long-lived migration pipeline that mutates achievement state before normal gameplay starts.

Reviewed achievement-specific transformations include:

- legacy achievement values normalized to rank-like values for very old saves;
- `genus_demonic` progress copied to `biome_hellscape` for the historical semantic move;
- scalar achievement values wrapped into `{ l: ... }` records;
- historical Antimatter `cross` progress synthesized;
- obsolete Evil `blood_war.e` progress cleared;
- `extinct_orge` renamed to `extinct_ogre`;
- `genus_animal` renamed to `genus_carnivore`;
- obsolete `extinct_sludge` progress removed.

M2D3 must hydrate from the **post-`vars.js` normalized state**, not from pre-migration raw save shapes.

The achievement adapter must not re-run or independently reinvent those historical migrations while `vars.js` remains the current legacy importer. Persistence-v2 can absorb that responsibility later under M7.

### 4. The complete write surface needed an executable inventory

M2D1 now performs a source scan of direct `global.stats.achieve` accesses.

The important authority invariant for the current legacy tree is:

- normal/current achievement writes are confined to `src/achieve.js`;
- historical pre-handoff migration writes are confined to `src/vars.js`;
- other legacy modules are consumers/readers rather than independent achievement authorities.

The characterization test scans the source tree and fails if another module becomes a direct writer before the M2D migration contract is updated.

This is intentionally narrower than the full M2E architecture gate. M2D4 will ratchet ordinary direct reads downward after the selector migration, while M2E generalizes the rule across GameState domains.

## Hardening added

### Aggregate mutation characterization

Tests now cover both halves of aggregate achievement behavior in a non-Standard universe:

- enough base child achievements award the aggregate base rank but leave the current-universe rank explicitly undefined in legacy memory when universe-specific child coverage is insufficient;
- when enough child achievements also qualify in that universe, the universe aggregate rank is restored.

This freezes the remove-then-possibly-restore behavior that M2D2/M2D3 must reproduce semantically.

### Unknown-ledger derived-level characterization

A test adds an unknown achievement key with high base/universe ranks alongside a known achievement.

The unknown key is proven not to affect `universeLevel()` totals.

### Historical migration anchors

The characterization suite now source-anchors the reviewed achievement migration markers in `vars.js` so an upstream change to the legacy normalization seam forces explicit M2D review rather than silently changing the future hydration assumptions.

### Direct-writer inventory

The source scan classifies direct achievement-root accesses and verifies that the only direct writer files are:

```text
src/achieve.js
src/vars.js
```

It also verifies representative ordinary read consumers remain visible, including `src/main.js` and `src/resets.js`.

The scanner ignores comments and literal text by reusing the established architecture masking utility.

## M2D2 contract after hardening

M2D2 may now proceed with the following stronger constraints.

### State representation

The engine representation must support:

- canonical typed achievement IDs;
- explicit base rank;
- explicit named universe ranks;
- present zero-rank records where compatibility requires them;
- absence/removal of a universe rank;
- no `undefined` values;
- no compact `l/e/a/h/m/mg` storage names in authoritative GameState.

### Mutation semantics

The dedicated achievement mutation capability must support at least:

- create/preserve a progress record;
- monotonic base-rank advancement;
- monotonic universe-rank advancement;
- explicit universe-rank removal for aggregate recalculation;
- a result that distinguishes base change, universe change and universe removal.

The engine operation should not expose generic GameState mutation authority.

### Derived selectors

Derived total selectors must use an explicit recognized achievement set/catalog rather than summing arbitrary stored keys.

Unknown/unresolved compatibility records and recognized definitions are separate concepts.

### Hydration

M2D3 hydration begins only after the current legacy `vars.js` migration pipeline has normalized the loaded save.

The adapter translates the normalized legacy shape into GameState. It does not become a second historical-save migration engine while the old importer still owns that role.

### Legacy projection

The one-way legacy projection remains temporary and must preserve observable save/read compatibility after authority cutover.

Where legacy memory uses an explicitly `undefined` universe property, GameState stores absence. The compatibility layer decides whether the temporary legacy object needs an omitted property or an explicit `undefined` property for the specific live path being reproduced.

## Closure criteria for this review

The M2D1 review is closed when:

1. aggregate remove/restore semantics are tested;
2. unknown ledger keys are proven excluded from derived totals;
3. historical achievement migration assumptions are source-anchored;
4. direct writer ownership is executable and fail-closed against new writer modules;
5. the existing M2D1 tests remain green;
6. architecture gates remain green;
7. build remains green;
8. browser negative control and real-browser smoke remain green;
9. no production source behavior has changed.
