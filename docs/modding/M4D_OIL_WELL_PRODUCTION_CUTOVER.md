# M4D Oil Well production cutover

Status: implementation candidate complete; independent review and hardening pending.

M4D is the first reviewed live vanilla consumer of the M4 calculation stack. It migrates only the scalar result returned by `production('oil_well')`. M4C remains the accepted M4 architecture authority until this candidate passes the separate independent review/hardening phase and final closure proof.

## Scope

The migrated vertical is the per-Oil-Well production calculation before the existing downstream Oil aggregation in `main.js`.

The live compatibility call remains `production('oil_well')`. Its arithmetic now runs through the M4 calculation engine using the canonical calculation ID `evolve:calculation/production/oil-well`.

M4D does not migrate `oil_extractor`, resource mutation, well counts, Psychic Boost, queue multipliers, syndicate/ziggurat effects, Blubber/whale oil, Hunger, `global_multiplier`, Gravity Well/teamsters, resource capacity, `fastLoop()` scheduling, biome definitions, government state, Warlord state, pumpjack state, or any other `production()` branch. M4E is not started by this slice.

## Legacy production contract

The legacy multiplication order is preserved exactly:

1. Base production is `0.4`, or `0.48` from Oil technology level 4 onward.
2. Oil technology then multiplies by `1.25` at level 5, `1.75` at level 6, or `2` from level 7 onward.
3. A truthy Oil geology bonus multiplies by `geology + 1`.
4. The active Desert, Tundra, or Taiga Oil-Well biome multiplier is applied when relevant.
5. A truthy Dirty Jobs value multiplies by `1 + percent / 100`.
6. Warlord multiplies by `1 + (pumpjackRank || 1) * 0.24`, preserving the historical zero-rank fallback to rank one.

The order matters for exact floating-point differential parity and is represented by deterministic modifier orders rather than by a replacement monolithic formula.

## First-party calculation definition

`src/content/evolve/calculations/oil-well-production.mjs` owns the Evolve-specific semantics. It registers one calculation and five ordered modifiers:

- `evolve:modifier/production/oil-well/technology`;
- `evolve:modifier/production/oil-well/geology`;
- `evolve:modifier/production/oil-well/biome`;
- `evolve:modifier/production/oil-well/dirty-jobs`;
- `evolve:modifier/production/oil-well/warlord`.

Its input contract is closed and explicit: Oil technology level, Oil geology bonus, already-resolved biome Oil multiplier, Dirty Jobs percent, Warlord state, and pumpjack rank. The definition imports no legacy state, runtime, browser/platform authority, or mutation capability.

The base calculation uses the M4C production primitive. M4B owns the ordered numeric modifier application and M4A owns calculation execution and optional trace construction.

## Application composition

`src/application/evolve/oil-well-production-runtime.mjs` constructs the fixed calculation engine once from the generic M4 engine and the Evolve Oil-Well definition. Its public surface is deliberately narrow: production code supplies explicit inert inputs and receives the calculated number.

The application runtime does not read `global`, `biomes`, government state, or any other legacy authority. This also avoids creating a `prod.js` -> runtime -> `races.js` -> `prod.js` cycle.

## Compatibility seam

`src/prod.js` remains the compatibility seam for this slice. The `oil_well` case snapshots the current legacy semantic facts, resolves the active biome multiplier through the existing `biomes.*.vars()` authority, reads Dirty Jobs once through `govActive('dirty_jobs', 2)`, and delegates the arithmetic to the application runtime.

Keeping biome resolution at this seam preserves the existing rejuvenated biome variants without copying their content constants into the new calculation definition. Existing callers such as `main.js` and `actions.js` continue to call `production('oil_well')` unchanged.

The old embedded Oil-Well arithmetic has been removed from the live branch. The legacy root architecture budget therefore ratchets `src/prod.js` direct `global` access from 113 to 109 rather than leaving an artificially stale allowance.

## Verification

`tests/engine/evolve-oil-well-production.test.cjs` provides a frozen legacy reference model and deterministic differential matrix across technology thresholds, geology, biome values, Dirty Jobs values, Warlord state, and pumpjack ranks. It also proves exact technology thresholds, the rank-zero fallback, ordered explain trace attribution, skipped modifier behavior, and the closed hostile-input contract.

`tests/architecture/m4d-oil-well-production-fitness.cjs` pins the reviewed content/runtime/compatibility boundaries. It rejects hidden legacy authority in the first-party calculation, widened runtime authority, retained Oil-Well arithmetic in `prod.js`, and additional unreviewed production consumers.

The cumulative M4A/M4B/M4C consumer guards are changed from the historical zero-consumer exit state to the exact reviewed M4D consumer set. This is a ratchet, not a general permission for production code to import calculation internals.

## Phase boundary

This document records the implementation candidate only. It does not declare M4D closed. `ROADMAP.md`, `BACKLOG.md`, and `CURRENT_ARCHITECTURE.md` intentionally continue to identify M4D as the next unclosed slice and M4C as the accepted current M4 authority during this phase.

The next lifecycle step is an independent review and hardening pass against the approved M4D design, legacy behavior, real production call paths, edge cases, failure semantics, tests, architecture boundaries, and documentation. Any justified findings must be fixed before final CI proof and closure.
