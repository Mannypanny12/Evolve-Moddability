# M2D3 Achievement Authority Cutover

M2D3 moves persistent achievement progression authority from the legacy `global.stats.achieve` ledger to `GameState.achievements` without forcing the rest of the legacy game to stop reading the compact ledger yet.

## Authority model

After hydration, the ownership rule is:

`GameState.achievements` -> authoritative persistent achievement state

`global.stats.achieve` -> synchronous compatibility projection for legacy readers and the existing save surface

Ordinary gameplay must no longer create, advance, or clear achievement ranks by assigning directly into `global.stats.achieve`. Historical save migrations in `vars.js` remain direct legacy mutations because they intentionally run before GameState hydration.

## Hydration seam

`src/vars.js` performs all historical version migrations and `setupStats()` shape repair first. Only then does it call `bindLegacyAchievementState(global)`.

The adapter converts the complete post-migration legacy ledger into schema-version-2 GameState achievement records. `setGlobal()` also calls the same binding function so replacing the legacy root, as the characterization harness does, cannot leave a stale authoritative runtime attached to the previous object.

Rebinding is fail-atomic: `setGlobal()` binds and validates the candidate root before publishing it as the live legacy `global`. A failed candidate therefore leaves both the prior legacy root and the prior GameState authority intact.

## Legacy codec

The compatibility adapter maps the compact legacy fields as follows:

| Legacy field | GameState meaning |
| --- | --- |
| `l` | base `rank` |
| `e` | `universeRanks.evil` |
| `a` | `universeRanks.antimatter` |
| `h` | `universeRanks.heavy` |
| `m` | `universeRanks.micro` |
| `mg` | `universeRanks.magic` |

Legacy local IDs are represented canonically as `evolve:achievement/<legacy-id>`.

Explicit zero ranks are preserved. Missing or explicitly `undefined` universe fields hydrate as absent GameState universe tracks. GameState itself never stores `undefined`.

Hydration and mutation command objects are treated as inert data. The adapter rejects unsupported fields, symbol fields, accessors, arrays where records are expected, and exotic prototypes instead of invoking user-supplied getters or silently accepting extra authority-bearing shape.

## Ordinary unlock cutover

`unlockAchieve()` remains the legacy orchestration boundary for now because it owns UI behavior, messages, redraws, challenge rank capping, micro-universe rules, and its historical boolean return contract.

Persistent mutation is delegated to `advanceLegacyAchievement()`, which in turn calls the M2D2 achievement mutation service.

The bridge result deliberately distinguishes:

- base-rank change, which controls the historical `unlockAchieve()` return value and base unlock/upgrade message;
- the historical universe write branch, including its truthiness behavior for explicit zero tracks;
- actual engine-state change, which can differ from the legacy branch decision.

This keeps visible legacy behavior stable while making GameState the source of truth.

## Aggregate clear/restore cutover

Aggregate achievements historically performed a temporary direct write such as `record.e = undefined` after granting the base rank, then restored that universe rank only if enough child achievements qualified in the current universe.

M2D3 preserves the sequence but changes ownership:

1. base progression is applied through the authoritative mutation service;
2. the current named universe track is removed through `removeUniverseRank()`;
3. the compatibility projection may expose an explicit `undefined` property to preserve the in-memory legacy quirk;
4. universe qualification runs against that mirror;
5. any qualifying restore goes back through authoritative advancement.

The explicit `undefined` therefore exists only in the compatibility mirror. JSON serialization omits it, and the authoritative GameState record represents the cleared track by absence.

## Projection safety and rollback

Before an authoritative mutation is granted, the adapter inspects whether the currently bound legacy mirror can be updated safely. A non-writable, non-configurable mirror fails before GameState can advance. A replaceable invalid mirror can instead be reconstructed from the authoritative state.

The adapter also snapshots authoritative state before each compatibility-projected mutation. If an unexpected projection failure still occurs after the engine commit, the achievement runtime is recreated from that snapshot before the error is surfaced. This prevents a failed compatibility write from leaving GameState and the legacy mirror knowingly split.

Replacing `global.stats` behind the adapter is rejected and requires a proper `setGlobal()` rebind. The adapter does not silently follow a new nested root after authority was established.

## Mirror drift

After hydration, direct changes made only to `global.stats.achieve` are not authoritative. The next authoritative mutation reprojects GameState and repairs such drift.

The test harness has an explicit rebind helper solely for characterization cases that intentionally construct a pre-hydration legacy ledger. Production progression must not use mirror writes as an alternate authority path.

## Authority surface

The M2D3 compatibility bridge deliberately remains narrow. Production source imports are ratcheted to only:

- `src/vars.js`, for hydration and root rebinding;
- `src/achieve.js`, for legacy achievement orchestration.

The exported bridge surface is also locked to the reviewed bind, snapshot, advance, and universe-removal operations. New consumers or new authority-bearing exports require an explicit architecture change rather than silently expanding the singleton seam.

## Remaining legacy debt

M2D3 intentionally does **not** migrate the many ordinary achievement readers. They continue reading the synchronous legacy projection. Reader migration belongs to M2D4.

Historical achievement migrations in `vars.js` also remain direct writers by design, but only before the hydration seam. Characterization now explicitly fails if a direct `vars.js` achievement write appears after hydration.

## Verification gates

M2D3 adds characterization coverage for:

- complete legacy-ledger hydration into canonical GameState;
- unknown but valid legacy achievement IDs;
- explicit zero universe tracks and `undefined` omission;
- mirror drift repair;
- successful and failed `setGlobal()` rebinding;
- aggregate explicit-`undefined` compatibility behavior;
- accessor-safe and closed hydration/mutation inputs;
- locked-mirror projection preflight;
- replaceable invalid-mirror repair;
- failed-bind preservation of the previous authority;
- the source-authority ratchet that leaves `vars.js` migrations as the only direct achievement writer, and only before hydration.

`tests/architecture/m2d3-achievement-authority-fitness.cjs` additionally locks the hydration order, fail-atomic rebinding order, bridge consumer/export surface, mutation-service delegation, projection preflight/rollback, aggregate clear delegation, and removal of the former direct gameplay writes.

M2D3 is complete when the full tests, architecture gates, production build, generated-output cleanliness checks, and real-browser smoke tests all pass with this authority model in place.
