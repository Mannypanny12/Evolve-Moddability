# M4E production migration

Status: M4E2 implementation and independent hardening complete; exact-head CI is the closure authority. M4E remains in progress.

M4E expands the reviewed M4 calculation architecture across vanilla production without taking the later M5 simulation/application responsibilities. M4E1 established the shared composition/inventory foundation. M4E2 migrates the reviewed simple scalar/variant/fact-fed family through that foundation while preserving the legacy `production()` compatibility surface. It does not move `fastLoop()` resource application and does not make M4E complete.

## M4E1 composition contract

`src/application/evolve/production-calculation-runtime.mjs` is the single shared Evolve production-calculation composition root. It constructs one fixed M4 calculation engine from reviewed first-party registrations and modifiers and exposes one cheap synchronous scalar calculation entry point. The runtime has no authority to read `global`, traits, biomes, government state, DOM/platform state, clocks/randomness, mutation capabilities, Promise/async capabilities, or other legacy gameplay helpers.

M4E2 removes the former `src/application/evolve/oil-well-production-runtime.mjs` compatibility adapter. `src/prod.js` now consumes the shared production runtime directly for Oil Well and the migrated M4E2 family. The first-party Oil-Well definition remains unchanged; M4E2 changes routing/composition for the new family without changing the closed M4D numerical semantics.

### Production calculation identity convention

M4E production registrations use canonical IDs under `evolve:calculation/production/<production-source>`. By default, a legacy top-level `production()` source maps to one kebab-case production-source identity, for example `oil_well` -> `evolve:calculation/production/oil-well`. Legacy `val` variants remain explicit validated inputs to that source unless a later reviewed semantic decomposition justifies distinct calculations. Any deviation must be documented in this migration authority before cutover.

The shared runtime is the aggregation point for reviewed registrations and modifiers. New M4E production calculations are added to that fixed construction-time composition rather than creating parallel engines or runtime-specific registration mechanisms.

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

## M4E2 simple production cutover

M4E2 migrates exactly the 27 reviewed simple production identities defined by `src/content/evolve/calculations/simple-production.mjs`. The family includes fixed scalar constants, threshold-driven scalars, exact completion gates, resource variants and Isolation-dependent variants. Each calculation receives only closed validated facts from the `src/prod.js` compatibility seam; the first-party calculation module contains no direct legacy state reads or mutation authority.

The migrated family is composed into the same shared production calculation engine as Oil Well. `src/prod.js` remains the legacy compatibility router and continues to snapshot the required explicit facts before delegation. Invalid variants and malformed explicit facts fail closed at the calculation boundary rather than falling through to hidden state.

The redundant one-off Oil-Well runtime adapter is removed in M4E2. This is an architecture simplification only: Oil Well retains the M4D compatibility seam and numerical behavior, while the shared runtime now has `src/prod.js` as its reviewed live consumer.

## `fastLoop()` boundary

M4E2 does not move `fastLoop()` orchestration. M4E5 owns extracting related pure numerical resource-production composition for selected migrated verticals. Until then, `fastLoop()` continues to own legacy orchestration, breakdown presentation and `modRes()` application. M5C still owns moving production/capacity/consumption application itself out of `main.js`.

M4E2 nevertheless includes one real fast-loop consumer proof for `gas_mining` so the cutover is not validated only through direct function calls. The proof uses a coherent gas-giant-era fixture with deterministic coal-backed surplus power, an explicit zero/off coal mine needed by the legacy Coal path, and gas mining first in the legacy power-priority list. The legacy allocator therefore derives `p_on.gas_mining` naturally, and the proof observes both the locked `2 * 0.5 = 1v` and helium-unlocked `2 * 0.65 = 1.3v` contributions.

## Proof and ratchets

M4E1 moved engine construction into the shared production runtime and froze the 44-ID migration inventory. M4E2 extends that proof surface with:

- engine tests that freeze exactly 27 simple-production identities and cover constants, technology thresholds, exact `=== 100` gates, all reviewed variants, Isolation branches, hostile/malformed explicit inputs, explain traces and shared-runtime composition;
- an M4E2 architecture gate that pins the reviewed `src/prod.js` cutovers, forbids hidden numeric authority from reappearing in the compatibility cases and keeps the first-party simple-production module state/platform/mutation free;
- differential compatibility proof over the reviewed matrix plus the real gas-mining fast-loop consumer;
- an isolated child-process runner that removes inherited `NODE_TEST_CONTEXT` before invoking the nested Node test runner, preventing the recursive test-runner stall recovered during M4E2;
- generated-bundle diagnostics in the isolated proof so a future legacy fast-loop crash reports the exact bundled source statement around the failure rather than only an opaque stack line;
- removal guards that prevent the historical one-off Oil-Well runtime adapter from being reintroduced.

The initial M4E1 implementation is commit `e09bc5e882de724b4218b49902e15bcd461f4427`. Baseline build workflow run 1341 completed successfully for that implementation head.

## M4E1 review and hardening

The checkpoint review treated the implementation as untrusted before M4E2. It found no numerical or production-call-path regression, but did find two justified hardening issues:

- **Current architecture/status drift.** The code had advanced to a shared M4E production composition root while roadmap/backlog/current-architecture text still described M4D as current and M4E as not started. The current authority documents and their lifecycle guard were updated together; the historical M4D closure document remained unchanged.
- **Ambient capability gaps.** The production-specific content/application scanners blocked broad mutation and async capabilities but omitted transaction `commitTransaction` / `rollbackTransaction` names and direct `Promise` construction. Those are explicitly forbidden, with adversarial negative controls in both the M4D Oil-Well and M4E1 shared-runtime guards.

No production formula, `prod.js` arithmetic, Oil-Well input resolution, `fastLoop()` composition, resource mutation, or M5-owned authority changed in the M4E1 hardening pass.

## M4E2 review and hardening

The independent M4E2 review re-read the whole slice from the closed M4E1 boundary rather than treating the repaired differential proof as sufficient closure evidence. It found two classes of hardening work:

- **Differential-harness coherence and diagnosability.** The original proof first stalled because a nested Node test runner inherited `NODE_TEST_CONTEXT`, then falsely injected transient `p_on` state that the real legacy fast loop immediately recalculated. The hardened proof clears the nested-runner context, supplies coherent legacy power/fuel/priority state, lets the real allocator derive powered gas collectors, supplies the zero/off coal-mine structure required once Coal is active, and preserves generated-bundle source diagnostics for future failures.
- **Current-authority/status drift.** After the code cutover, the migration authority, backlog, roadmap and current-architecture index still described M4E2 as future work and the deleted Oil-Well adapter as live. Those current authorities are advanced together, and the M4E1/M4E status guard is tightened to require the M4E2 review marker and current status text.

The implementation head `fb7b863975371db27634f36fd3555a66bfcacf8c` passed the complete baseline workflow before this independent hardening commit: Node tests, architecture fitness, game/wiki build, generated-output cleanliness, browser startup-failure negative control and real-browser smoke. That successful implementation run is supporting evidence only; it is not the M4E2 closure authority.

M4E remains in progress after M4E2. M4E3 is the next implementation checkpoint only after the exact M4E2 hardening head has completed the full final CI proof.
