# M4E production migration

Status: M4E1 implementation checkpoint

M4E expands the reviewed M4 calculation architecture across vanilla production without taking the later M5 simulation/application responsibilities. M4E1 is only the composition and inventory foundation. It does not migrate another production formula, does not move `fastLoop()` resource application, and does not make M4E complete.

## M4E1 composition contract

`src/application/evolve/production-calculation-runtime.mjs` is the single shared Evolve production-calculation composition root. It constructs one fixed M4 calculation engine from reviewed first-party registrations and modifiers and exposes one cheap scalar calculation entry point. The runtime has no authority to read `global`, traits, biomes, government state, DOM/platform state, clocks/randomness, mutation capabilities, or other legacy gameplay helpers.

The existing `src/application/evolve/oil-well-production-runtime.mjs` is retained temporarily as a compatibility adapter because `src/prod.js` still imports that historical M4D surface. It no longer constructs an engine or owns calculation composition. It supplies the canonical Oil-Well calculation ID to the shared runtime. This keeps the M4D live seam and differential oracle unchanged while avoiding a risky whole-file rewrite of `prod.js` merely to rename one import. The adapter is transitional M4E work and is expected to disappear when a later M4E checkpoint already edits the production router for additional cutovers.

The first-party Oil-Well definition remains unchanged. M4E1 therefore changes composition, not numerical semantics.

## Frozen production inventory

The M4E1 architecture gate freezes the current top-level `production(id, val, wiki)` switch at 44 IDs. Nested `val` cases are variants of their owning production ID, not separate top-level IDs. This inventory is the migration ledger for M4E2-M4E4.

| Production ID | Legacy shape / notable dependency | Planned migration family |
| --- | --- | --- |
| `transmitter` | scalar constant | M4E2 simple scalar |
| `oil_well` | scalar; technology, geology, biome, Dirty Jobs, Warlord | already live from M4D; shared runtime in M4E1 |
| `iridium_mine` | `iridium` compound `{b,g,f}`; `coal` scalar | M4E4 compound compatibility |
| `helium_mine` | compound `{b,g,f}`; Warlord and government | M4E4 compound compatibility |
| `red_mine` | mixed scalar/compound variants; high-pop and government | M4E4 mixed compatibility |
| `biodome` | scalar variants; universe/high-pop | M4E3 explicit state |
| `gas_mining` | scalar threshold | M4E2 simple scalar |
| `outpost` | compound `{b,d,n}`; drone and achievement state | M4E4 compound compatibility |
| `oil_extractor` | scalar technology thresholds | M4E2 simple scalar |
| `elerium_ship` | scalar asteroid-tech thresholds | M4E2 simple scalar |
| `iridium_ship` | scalar asteroid-tech thresholds | M4E2 simple scalar |
| `iron_ship` | scalar asteroid-tech thresholds | M4E2 simple scalar |
| `g_factory` | scalar; Truepath/isolation/jobs/high-pop | M4E3 explicit state |
| `harvester` | scalar resource variants | M4E2 simple scalar |
| `elerium_prospector` | scalar constant | M4E2 simple scalar |
| `neutron_miner` | scalar constant | M4E2 simple scalar |
| `bolognium_ship` | scalar constant | M4E2 simple scalar |
| `excavator` | scalar constant | M4E2 simple scalar |
| `vitreloy_plant` | scalar; government/high-tech | M4E3 explicit state |
| `infernite_mine` | scalar; Hell suppression and wiki mode | M4E3 explicit state boundary |
| `water_freighter` | scalar constant | M4E2 simple scalar |
| `titan_mine` | scalar resource variants; ratio/high-pop | M4E3 explicit state |
| `lander` | scalar completion threshold | M4E2 simple scalar |
| `orichalcum_mine` | scalar constant | M4E2 simple scalar |
| `uranium_mine` | scalar constant | M4E2 simple scalar |
| `neutronium_mine` | scalar constant | M4E2 simple scalar |
| `elerium_mine` | scalar constant | M4E2 simple scalar |
| `shock_trooper` | scalar completion threshold | M4E2 simple scalar |
| `tank` | scalar completion threshold | M4E2 simple scalar |
| `mining_pit` | scalar resource variants; isolation, Tough/fathom, Tau tech | M4E3 explicit state |
| `tau_farm` | scalar resource variants; isolation | M4E2 simple scalar |
| `womling_mine` | scalar resource variants; tech and achievement multipliers | M4E3 explicit state |
| `refueling_station` | scalar isolation threshold | M4E2 simple scalar |
| `ore_refinery` | scalar Tau-tech threshold | M4E2 simple scalar |
| `whaling_station` | scalar constant | M4E2 simple scalar |
| `mining_ship` | scalar; patrol support curve and Tau tech | M4E3 explicit state |
| `mining_ship_ore` | scalar resource variants; isolation | M4E2 simple scalar |
| `whaling_ship` | scalar; patrol support curve | M4E3 explicit state |
| `whaling_ship_oil` | scalar isolation threshold | M4E2 simple scalar |
| `alien_outpost` | scalar constant | M4E2 simple scalar |
| `psychic_boost` | shared scalar resource modifier; timers/channel/achievement rounding | M4E4 shared production concept |
| `psychic_cash` | shared scalar money modifier; timers/channel/achievement rounding | M4E4 shared production concept |
| `asphodel_harvester` | scalar; Hell Lake/railway/Warlord corruptor state | M4E3 explicit state |
| `shadow_mine` | scalar resource variants | M4E2 simple scalar |

`highPopAdjust()`, `teamster()` and `factoryBonus()` are not top-level production IDs, but they are also production authority currently living in `prod.js`. They remain explicit M4E3/M4E4 migration targets rather than being forgotten because they do not appear in the switch inventory.

## `fastLoop()` boundary

M4E1 deliberately does not change `fastLoop()`. M4E5 owns extracting related pure numerical resource-production composition for selected migrated verticals. Until then, `fastLoop()` continues to own legacy orchestration, breakdown presentation and `modRes()` application. M5C still owns moving production/capacity/consumption application itself out of `main.js`.

## Proof and ratchets

M4E1 keeps the M4D Oil-Well differential/live seam intact while moving engine construction into the shared production runtime. The M4A production-consumer ratchet now admits that shared runtime instead of the historical one-off runtime. A dedicated M4E1 architecture gate requires fixed static composition, forbids hidden state/platform/mutation capabilities, pins the shared runtime consumer to the Oil-Well compatibility adapter for this checkpoint, and pins the 44-ID migration inventory above.

M4E is not closed by M4E1. M4E2 is the next implementation checkpoint after M4E1 implementation proof and the later independent hardening lifecycle for the full slice remains mandatory.
