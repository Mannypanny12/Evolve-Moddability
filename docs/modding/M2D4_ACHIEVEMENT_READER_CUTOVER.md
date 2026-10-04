# M2D4 Achievement Reader Cutover

## Purpose

M2D4 completes the read side of the first authoritative GameState domain migration.
M2D3 already made `GameState.achievements` authoritative for achievement mutation while
`global.stats.achieve` remained a synchronous compatibility projection. M2D4 moves ordinary
runtime and wiki readers to a semantic, read-only facade backed by the bound GameState store.

## Result

- ordinary source readers no longer inspect `global.stats.achieve` directly;
- legacy achievement reads use `store.select()` rather than snapshot allocation;
- record presence remains distinct from rank zero;
- universe-track presence remains distinct from a missing track, including explicit zero tracks;
- base and universe ranks preserve legacy `undefined` semantics for missing records/tracks at the facade boundary;
- aggregate achievement levels remain catalog-filtered through engine selectors;
- wiki all-universe completion uses an authoritative total-rank selector;
- non-string track inputs are rejected without legacy key coercion or user-code execution;
- architecture fitness recognizes reviewed dot, bracket, template-key, and optional-chain direct ledger syntax;
- only the reader facade may consume the adapter's `selectLegacyAchievementState()` seam, and the reader export surface is pinned;
- the real-browser gate boots both the game and the built wiki achievement page;
- `global.stats.achieve` remains only for historical vars.js migration/hydration and one-way save/projection compatibility;
- feats remain outside M2D.

## Architecture

```text
legacy gameplay / wiki
        |
        v
achievement-state-reader.mjs
        |
        v
achievement-state-adapter.mjs -> bound runtime.store.select(...)
        |
        v
engine achievement selectors -> GameState.achievements

GameState mutations -> compatibility projection -> global.stats.achieve
```

The reader facade never receives mutation authority and does not expose canonical achievement
record objects. Callers ask semantic questions such as record presence, rank, track presence,
aggregate level, or total rank.

## Compatibility boundary

`src/vars.js` remains the one deliberate direct legacy achievement surface because historical
save migrations must run before GameState hydration. Persistence v2 is still deferred; therefore
the compact legacy mirror remains a serialization/projection shell rather than ordinary game
state authority.

## Closure criteria

M2D4 is closed when:

1. all ordinary `src/` readers use the read facade;
2. direct `global.stats.achieve` source access is restricted to reviewed migration/projection debt and bracket/optional syntax cannot evade the ratchet;
3. ordinary source cannot bypass the facade through the adapter selector seam, and the facade cannot widen into mutation/snapshot authority;
4. mirror drift cannot influence facade reads;
5. explicit zero-valued universe-track presence is preserved;
6. aggregate levels remain catalog-filtered;
7. hostile/non-string track keys are inert;
8. M2D3 mutation authority remains unchanged;
9. architecture, engine, characterization, differential, build, game-browser, and wiki-browser gates remain green.
