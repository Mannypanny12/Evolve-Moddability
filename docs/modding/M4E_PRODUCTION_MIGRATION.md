# M4E production migration

Status: M4E3 complete after independent review and hardening; final exact-head CI is the closure authority. M4E remains in progress.

M4E expands the reviewed M4 calculation architecture across vanilla production without taking the later M5 simulation/application responsibilities. M4E1 established the shared composition/inventory foundation. M4E2 migrated the reviewed simple scalar/variant/fact-fed family through that foundation. M4E3 now migrates the reviewed explicit-state scalar family while preserving the legacy `production()` compatibility surface. `fastLoop()` orchestration/resource mutation remains legacy-owned until its later migration slices.

## M4E1 composition contract

`src/application/evolve/production-calculation-runtime.mjs` is the single shared Evolve production-calculation composition root. It constructs one fixed M4 calculation engine from reviewed first-party registrations and modifiers and exposes one cheap synchronous scalar calculation entry point. The runtime has no authority to read `global`, traits, biomes, government state, DOM/platform state, clocks/randomness, mutation capabilities, Promise/async capabilities, or other legacy gameplay helpers.

M4E2 removes the former `src/application/evolve/oil-well-production-runtime.mjs` compatibility adapter. `src/prod.js` now consumes the shared production runtime directly for Oil Well and the migrated M4E2/M4E3 families. The first-party Oil-Well definition remains unchanged; later M4E checkpoints add registrations to the same fixed engine rather than creating parallel runtimes.

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

`highPopAdjust()`, `teamster()` and `factoryBonus()` are not top-level production IDs, but they are also production authority currently living in `prod.js`. They remain explicit later-M4E migration targets rather than being forgotten because they do not appear in the switch inventory.

## M4E2 simple production cutover

M4E2 migrates exactly the 27 reviewed simple production identities defined by `src/content/evolve/calculations/simple-production.mjs`. The family includes fixed scalar constants, threshold-driven scalars, exact completion gates, resource variants and Isolation-dependent variants. Each calculation receives only closed validated facts from the `src/prod.js` compatibility seam; the first-party calculation module contains no direct legacy state reads or mutation authority.

The migrated family is composed into the same shared production calculation engine as Oil Well. `src/prod.js` remains the legacy compatibility router and continues to snapshot the required explicit facts before delegation. Invalid variants and malformed explicit facts fail closed at the calculation boundary rather than falling through to hidden state.

The redundant one-off Oil-Well runtime adapter is removed in M4E2. This is an architecture simplification only: Oil Well retains the M4D compatibility seam and numerical behavior, while the shared runtime now has `src/prod.js` as its reviewed live consumer.

## M4E3 explicit-state production cutover

M4E3 migrates exactly ten reviewed scalar identities defined by `src/content/evolve/calculations/explicit-state-production.mjs`: `biodome`, `g_factory`, `vitreloy_plant`, `infernite_mine`, `titan_mine`, `mining_pit`, `womling_mine`, `mining_ship`, `whaling_ship`, and `asphodel_harvester`.

The new calculation module owns the numerical formulas, variants, thresholds and pure Tau support curve. It receives only closed explicit inert facts and contains no direct legacy state, trait, achievement, Hell, platform, mutation, clock/random, async or dynamic-loading capability. `src/prod.js` remains the compatibility seam and snapshots only the reviewed legacy facts before delegation.

Important compatibility details remain explicit:

- `g_factory` preserves separate High Population effects for `jobScale()`-resolved AI colonists and final production scaling rather than collapsing them into one multiplier;
- `mining_pit` preserves its historical unknown/missing-resource result of zero and the modifier order base -> Tough -> Ogre fathom -> Tau Pit Mining;
- `mining_ship` and `whaling_ship` preserve the support curve `1 - ((1 - ratio) ** 1.4)` only when support is strictly greater than `s_max`;
- `asphodel_harvester` applies Railway to its normal base before the Warlord/Corruptor branch replaces that result entirely;
- `infernite_mine` does not absorb the Hell combat/suppression subsystem. The compatibility seam resolves `hellSupression('gate', 0, wiki).supress` and passes only that numeric fact to M4E3.

M4E3 deliberately does not migrate `highPopAdjust()`, `teamster()`, `factoryBonus()`, `fastLoop()` orchestration, support/power allocation, breakdown presentation or `modRes()` application.

## `fastLoop()` boundary

M4E2/M4E3 do not move `fastLoop()` orchestration. M4E5 owns extracting related pure numerical resource-production composition for selected migrated verticals. Until then, `fastLoop()` continues to own legacy orchestration, breakdown presentation and `modRes()` application. M5C still owns moving production/capacity/consumption application itself out of `main.js`.

M4E2 includes one real fast-loop consumer proof for `gas_mining` so that cutover is not validated only through direct calls. M4E3 adds a second real consumer proof for `mining_ship`: a coherent Truepath/Tau fixture is hydrated through the real legacy runtime, legacy support allocation derives `support_on.mining_ship`, and one real `fastLoop()` is required to increase refinery fill by exactly `support_on.mining_ship * production('mining_ship') * 0.25`. Neither proof injects transient powered/support state as authoritative test setup.

## Proof and ratchets

M4E1 moved engine construction into the shared production runtime and froze the 44-ID migration inventory. M4E2/M4E3 extend that proof surface with:

- engine tests that freeze the 27 M4E2 and ten M4E3 identities and cover their reviewed constants, thresholds, variants, explicit-state branches, malformed/hostile inputs and shared-runtime composition;
- direct architecture gates that pin the reviewed `src/prod.js` cutovers and keep both first-party production calculation modules state/platform/mutation free;
- compatibility proofs over the reviewed matrices plus real gas-mining and mining-ship fast-loop consumers;
- isolated child-process runners that remove inherited `NODE_TEST_CONTEXT` before invoking nested Node test runners;
- generated-bundle diagnostics so legacy runtime crashes report the bundled source statement around the failure;
- removal guards that prevent the historical one-off Oil-Well runtime adapter from being reintroduced;
- a cumulative architecture-command ratchet that requires executable architecture gate/wrapper pairs to appear in `test:architecture`;
- shared-runtime composition markers that require both `...createSimpleProductionRegistrations()` and `...createExplicitStateProductionRegistrations()` so a reviewed registration family cannot silently disappear from the fixed live engine.

The initial M4E1 implementation is commit `e09bc5e882de724b4218b49902e15bcd461f4427`. Baseline build workflow run 1341 completed successfully for that implementation head.

## M4E1 review and hardening

The checkpoint review treated the implementation as untrusted before M4E2. It found no numerical or production-call-path regression, but did find two justified hardening issues:

- **Current architecture/status drift.** The code had advanced to a shared M4E production composition root while roadmap/backlog/current-architecture text still described M4D as current and M4E as not started. The current authority documents and their lifecycle guard were updated together; the historical M4D closure document remained unchanged.
- **Ambient capability gaps.** The production-specific content/application scanners blocked broad mutation and async capabilities but omitted transaction `commitTransaction` / `rollbackTransaction` names and direct `Promise` construction. Those are explicitly forbidden, with adversarial negative controls in both the M4D Oil-Well and M4E1 shared-runtime guards.

No production formula, `prod.js` arithmetic, Oil-Well input resolution, `fastLoop()` composition, resource mutation, or M5-owned authority changed in the M4E1 hardening pass.

## M4E2 review and hardening

The independent M4E2 review re-read the whole slice from the closed M4E1 boundary rather than treating the repaired differential proof as sufficient closure evidence. It found three classes of hardening work:

- **Differential-harness coherence and diagnosability.** The original proof first stalled because a nested Node test runner inherited `NODE_TEST_CONTEXT`, then falsely injected transient `p_on` state that the real legacy fast loop immediately recalculated. The hardened proof clears the nested-runner context, supplies coherent legacy power/fuel/priority state, lets the real allocator derive powered gas collectors, supplies the zero/off coal-mine structure required once Coal is active, and preserves generated-bundle source diagnostics for future failures.
- **Current-authority/status drift.** After the code cutover, the migration authority, backlog, roadmap and current-architecture index still described M4E2 as future work and the deleted Oil-Well adapter as live. Those current authorities were advanced together, and the M4E1/M4E status guard was tightened to require the M4E2 review marker and current status text.
- **Closure-proof wiring.** A second independent audit found that `m4e2-simple-production-cutover-fitness.cjs` existed and its npm-test wrapper ran in the broad Node suite, but the direct gate was accidentally absent from `npm run test:architecture` even though current architecture prose claimed it was cumulative. M4E2 now appears directly in that command; the architecture-coverage audit has reverse coverage for omitted executable gate/wrapper pairs; non-executable catalogs remain valid support modules rather than forced CLI gates; and the shared-runtime guard pins the simple-production registration spread explicitly.

The implementation head `fb7b863975371db27634f36fd3555a66bfcacf8c` passed the complete baseline workflow before the first independent hardening commit: Node tests, architecture fitness, game/wiki build, generated-output cleanliness, browser startup-failure negative control and real-browser smoke. That successful implementation run is supporting evidence only; it is not the M4E2 closure authority.

The closure-wiring hardening head `48ccedd6fac863a6dd831993348cbc71c03d39eb` passed Baseline build workflow run 1378, including the full Node suite, the now-complete cumulative architecture command with the direct M4E2 gate, game/wiki build, generated-output cleanliness, browser startup-failure negative control and real-browser smoke. This is supporting hardening evidence; final exact-head CI on the documentation/guard closure head remains the closure authority.

## M4E3 review and hardening

The independent M4E3 review re-read the ten cutovers against the original `prod.js` formulas and treated the green implementation run as supporting evidence rather than closure. It found no material numerical or routing defect. Two material closure gaps were corrected:

- **Real-consumer proof.** The implementation proved all ten calculations through the live `production()` compatibility seam but had not yet exercised one M4E3 calculation through a real `fastLoop()` consumer, despite that being part of the approved design. The hardened differential proof uses the existing Truepath/Tau fixture, real simulation hydration and real support allocation, then verifies the migrated mining-ship rate through the refinery-fill path without injecting transient support state.
- **Current-authority/status drift.** The migration authority, backlog, roadmap and current-architecture index still described M4E3 as future work. The current authorities and this existing M4E lifecycle ratchet are advanced together; historical closure documents remain unchanged.

The implementation head `c61d1aad42adf669548f2f84c09494014703af86` passed Baseline build workflow run 1403 completely. The real-consumer hardening head `84a1a9fb21aea039d416b4788bec009d0add937a` passed Baseline build workflow run 1404 completely. Both are supporting evidence only. Final exact-head CI on the documentation/status-ratchet closure candidate remains the M4E3 closure authority.

M4E3 is complete after independent review and hardening. M4E remains in progress. M4E4 compound/mixed/shared production family is the next checkpoint and has not started; it must begin with its own deep dive before implementation.
