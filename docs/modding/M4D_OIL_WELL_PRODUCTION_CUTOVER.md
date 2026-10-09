# M4D Oil Well production cutover

Status: complete after independent review and hardening; final exact-head CI is the closure authority.

M4D is the first reviewed live vanilla consumer of the M4 calculation stack. It migrates only the scalar result returned by `production('oil_well')`. The hardened cutover is now the current M4 architecture authority; M4E is the next slice.

## Scope

The migrated vertical is the per-Oil-Well production calculation before the existing downstream Oil aggregation in `main.js`.

The live compatibility call remains `production('oil_well')`. Its arithmetic now runs through the M4 calculation engine using the canonical calculation ID `evolve:calculation/production/oil-well`.

M4D does not migrate `oil_extractor`, resource mutation, well counts, Psychic Boost, queue multipliers, syndicate/ziggurat effects, Blubber/whale oil, Hunger, `global_multiplier`, Gravity Well/teamsters, resource capacity, `fastLoop()` scheduling, biome definitions, government state, Warlord state, pumpjack state, or any other `production()` branch. Those remain outside this slice. M4E is not implemented by M4D.

## Legacy production contract

The legacy multiplication order is preserved exactly:

1. Base production is `0.4`, or `0.48` from Oil technology level 4 onward.
2. Oil technology then multiplies by `1.25` at level 5, `1.75` at level 6, or `2` from level 7 onward.
3. A truthy Oil geology bonus multiplies by `geology + 1`.
4. The active Desert, Tundra, or Taiga Oil-Well biome multiplier is applied when relevant.
5. A truthy Dirty Jobs value multiplies by `1 + percent / 100`.
6. Warlord multiplies by `1 + (pumpjackRank || 1) * 0.24`, preserving the historical zero-rank fallback to rank one.

The order matters for exact floating-point differential parity. The hardened tests deliberately construct expected values with the same operations instead of algebraically simplifying expressions such as `1 + 14 / 100` to a decimal literal.

## First-party calculation definition

`src/content/evolve/calculations/oil-well-production.mjs` owns the Evolve-specific semantics. It registers one calculation and five ordered modifiers:

- `evolve:modifier/production/oil-well/technology`;
- `evolve:modifier/production/oil-well/geology`;
- `evolve:modifier/production/oil-well/biome`;
- `evolve:modifier/production/oil-well/dirty-jobs`;
- `evolve:modifier/production/oil-well/warlord`.

Its input contract is closed and explicit: Oil technology level, Oil geology bonus, already-resolved biome Oil multiplier, Dirty Jobs percent, Warlord state, and pumpjack rank. The definition imports no legacy state, runtime, browser/platform authority, or mutation capability.

The biome input uses `null` to mean that no Oil-Well biome branch is active. A numeric multiplier of `1` therefore remains a real applied contribution in `explain()` rather than being confused with absence. This keeps trace semantics faithful even if content later resolves a relevant biome multiplier to the identity value.

The base calculation uses the M4C production primitive. M4B owns the ordered numeric modifier application and M4A owns calculation execution and optional trace construction.

## Application composition

`src/application/evolve/oil-well-production-runtime.mjs` constructs the fixed calculation engine once from the generic M4 engine and the Evolve Oil-Well definition. Its public surface is deliberately narrow: production code supplies explicit inert inputs and receives the calculated number.

The application runtime does not read `global`, `biomes`, government state, or any other legacy authority. This also avoids creating a `prod.js` -> runtime -> `races.js` -> `prod.js` cycle.

## Compatibility seam

`src/prod.js` remains the compatibility seam for this slice. The `oil_well` case snapshots the current legacy semantic facts, resolves the active biome multiplier through the existing `biomes.*.vars()` authority, reads Dirty Jobs once through `govActive('dirty_jobs', 2)`, and delegates the arithmetic to the application runtime.

Keeping biome resolution at this seam preserves the existing rejuvenated biome variants without copying their content constants into the new calculation definition. Existing callers such as `main.js` and `actions.js` continue to call `production('oil_well')` unchanged.

The old embedded Oil-Well arithmetic has been removed from the live branch. The legacy root architecture budget therefore ratchets `src/prod.js` direct `global` access from 113 to 109 rather than leaving an artificially stale allowance.

## Independent review and hardening

The independent pass re-read the original Oil-Well branch, current biome definitions, the real `govActive('dirty_jobs', 2)` implementation, M4A/M4B/M4C contracts, the live production seam, cumulative architecture guards, tests, and lifecycle documents.

Four justified hardening changes were made:

1. **Biome absence became explicit.** The implementation no longer overloads multiplier `1` as "no relevant biome". `null` now represents absence and an active multiplier of `1` remains visible as an applied modifier in the explain trace.
2. **Runtime-consumer enforcement was closed against alternate import spellings.** The M4D architecture scanner now catches relative, repository-root, leading-slash, and dynamic references to the Oil-Well application runtime. Negative controls prove those spellings cannot create an unreviewed caller.
3. **The real legacy composition seam is now executed.** `tests/characterization/m4d-oil-well-live-seam.test.cjs` bundles the actual `src/prod.js` path and proves normal/rejuvenated Desert, Tundra, and Taiga values from `races.js`, real Dirty Jobs governor resolution including the enhanced-governor value, Warlord rank-zero fallback, and the full modifier sequence.
4. **Exact floating-point proof was tightened.** The live differential expectation uses the original arithmetic operations rather than rounded-equivalent decimal literals. The first hardened run caught this distinction in the test itself, after which the corrected proof passed.

The browser negative-control failure seen on the implementation candidate was also re-investigated. The exact same commit passed on rerun, and the immediately preceding executable head had already passed both browser stages. No M0E4 guard was weakened or changed.

## Verification

`tests/engine/evolve-oil-well-production.test.cjs` provides a frozen legacy reference model and deterministic differential matrix across technology thresholds, geology, absent/identity/real biome values, Dirty Jobs values, Warlord state, and pumpjack ranks. It also proves exact technology thresholds, the rank-zero fallback, ordered explain trace attribution, skipped modifier behavior, identity-biome trace semantics, and the closed hostile-input contract.

`tests/characterization/m4d-oil-well-live-seam.test.cjs` proves the actual legacy compatibility seam against real biome/governor/Warlord state resolution.

`tests/architecture/m4d-oil-well-production-fitness.cjs` pins the reviewed content/runtime/compatibility boundaries. It rejects hidden legacy authority in the first-party calculation, widened runtime authority, retained Oil-Well arithmetic in `prod.js`, alternate-spelling runtime consumers, and additional unreviewed production consumers.

The cumulative M4A/M4B/M4C consumer guards retain the exact reviewed M4D calculation-consumer set. This is a ratchet, not a general permission for production code to import calculation internals.

The hardened code-bearing head `19b361962adb437f9d4662a24d4545890b893321` passed the complete Baseline chain in workflow run 1330: ordinary Node tests, cumulative architecture gates, build, generated-output cleanliness, the injected browser startup-failure negative control, and the normal real-browser smoke.

The final documented head must pass that same complete chain. That exact-head result is the closure authority and does not require a follow-up documentation-only commit merely to restate the external CI result.

## Closure

M4D is complete. The accepted architecture now contains one intentionally narrow live production vertical through the M4 calculation pipeline while all downstream Oil aggregation and all other `production()` branches remain legacy.

M4E is next. It may expand production migration across `prod.js` only through separately reviewed bounded verticals; M4D does not pre-authorize wider production consumers or move any of M4D's explicit non-goals into the calculation layer.
