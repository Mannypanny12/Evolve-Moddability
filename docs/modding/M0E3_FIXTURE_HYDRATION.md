# M0E3 Fixture Hydration Contract

## Purpose

M0E3 separates synthetic persisted fixture intent from legacy runtime hydration before the engine migration begins.

The fixture system now has an explicit four-stage ownership model:

```text
canonical base
    |
persisted scenario overlay
    |
materialized persisted fixture
    |
cloned legacy runtime + hydration
    |
runtime simulation state
```

This prevents test fixtures from becoming accidental bags of runtime scaffolding.

## Persisted fixture input

`materializePersistedFixture()` deep-merges a fixture patch onto a fresh canonical legacy base.

That returned object represents persisted scenario input. Once materialized, the simulation harness must not mutate it.

`installLegacyState()` therefore installs a structured clone instead of passing the persisted object directly to legacy `global`.

Every isolated oracle run fingerprints its persisted input before hydration and verifies the same fingerprint after hydration and after simulation.

The legacy simulation adapter is intentionally **one hydrated fixture per process**. Before hydration, a test may replace an installed state. After `hydrateSimulationState()` imports the real `main.js` graph, module-level simulation state such as `loopTick` exists outside serialized `global` state. `installLegacyState()` therefore rejects attempts to replace the fixture after hydration and requires a fresh isolated process instead.

## Explicit hydration

`hydrateSimulationState()` is the one explicit transition from installed persisted state to a runnable legacy simulation.

It currently:

1. supplies generic government defaults through Evolve's own `defineGovernment(true)`;
2. reconstructs Evolve's complete generic garrison/MAD default shape through `commisionGarrison()`, then overlays any persisted scenario-specific garrison values;
3. imports the real `src/main.js` startup path.

`runGameLoops()` no longer silently performs hydration. Calling it before hydration is an error.

The real legacy startup remains responsible for its own runtime/transient initialization, including power/support activation maps, jobs/resources, queue startup, rituals, and related module-level state. M0E3 deliberately does not reimplement that startup logic in test code.

## Ownership rule

Hydration may reconstruct **generic state that normal legacy loading/startup reconstructs regardless of scenario intent**.

Hydration must not invent gameplay choices or progression.

Examples:

| State | Owner |
| --- | --- |
| default tax object | hydration |
| missing garrison bookkeeping defaults | hydration |
| garrison workers/raid/wounded | persisted fixture |
| powered structure count/on values | persisted fixture |
| power priority array | persisted fixture |
| support priority arrays | persisted fixture |
| active ARPA project progress | persisted fixture |
| Hell observation settings/history | persisted fixture |
| spire/mechbay state | persisted fixture |
| Truepath rival-government state | persisted fixture |

If a fixture only works because hydration manufactures scenario-specific progression, the fixture is incomplete and should fail.

## Zero-period characterization

A zero-period real simulation run is used as a hydration probe.

For `early-civilization-human`:

- the persisted overlay intentionally omits the default tax object;
- hydration creates the legacy tax and garrison defaults;
- zero periods produce no simulation progress, so normalized `before` and `after` remain identical.

This distinguishes load/startup reconstruction from actual loop behavior.

## M0E3B oracle matrix

The final M0E3 matrix contains 15 frozen scenarios.

The early Human fixture isolates cadence as the variable:

```text
p1  -> fast only
p3  -> representative multi-period worker catch-up
p4  -> first mid-loop boundary
p20 -> first long-loop boundary
```

The worker period and fast/mid/long ratios are frozen in the canonical `legacy-base.json` runtime contract. The legacy adapter verifies the imported production defaults match that contract before any test reset occurs; cadence tests derive their boundaries from the same metadata.

The existing worker characterization proves that a 500 ms scheduling delay at the frozen 250 ms worker period produces a three-period catch-up message. The p3 oracle protects what the real game loop does with that batch.

Additional split-call characterizations prove module-level cadence phase survives real worker-style call boundaries:

- `execGameLoops(2)` followed by `execGameLoops(3)` must equal one `execGameLoops(5)` run, crossing the first mid boundary inside the second call;
- `execGameLoops(18)` followed by `execGameLoops(3)` must equal one `execGameLoops(21)` run, crossing the first long boundary inside the second call.

`preindustrial-orc-p20` adds a materially different race/profile through the full loop. Exercising it exposed an M0C fixture-shape error: the persisted city trade structure used `routes` where the real legacy structure uses `count`. M0E3 corrects that field and pins `city.trade.count = 6` with an invariant.

Every matrix scenario is required to change normalized state and to match in two independent child processes.

## Reviewed historical-golden correction

M0E3A initially required all eleven existing p20 hashes to remain unchanged. The new p1 cadence probe provided new evidence that partial garrison overlays were not legacy-compatible persisted inputs: Evolve's fast loop read missing `garrison.max` before later cadence phases could mask the problem.

Hydration now builds Evolve's complete default garrison shape and overlays persisted scenario values such as workers, raid, and wounded.

That correction changed five existing p20 goldens after exact path-by-path review:

- `early-civilization-human-p20`;
- `industrial-human-queues-p20`;
- `portal-hell-balorg-p20`;
- `challenge-steelen-run-p20`;
- `reset-ready-mad-p20`.

The other six historical p20 goldens did not change. The affected diffs consist of missing generic garrison defaults becoming explicit plus the limited downstream state that had previously been influenced by undefined garrison capacity.

The recapture was targeted to those five scenarios only. It was not a blanket `--accept --all`.

## M0E3 completion

M0E3 now guarantees:

- explicit persisted-fixture -> cloned runtime -> hydration -> simulation ownership;
- no mutation of persisted fixture objects through hydration or simulation;
- generic hydration centralized in the legacy adapter rather than scattered through individual tests;
- full-loop Orc coverage;
- explicit p1/p3/p4/p20 cadence coverage derived from the frozen production cadence contract;
- a worker-linked catch-up simulation case;
- cross-call cadence continuity across both mid and long boundaries;
- enforced one-hydrated-fixture-per-process lifecycle;
- every oracle scenario produces real normalized state progress;
- no gameplay-source changes.
