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

## Explicit hydration

`hydrateSimulationState()` is the one explicit transition from installed persisted state to a runnable legacy simulation.

It currently:

1. supplies generic government defaults through Evolve's own `defineGovernment(true)`;
2. supplies generic garrison/MAD defaults through Evolve's own `commisionGarrison()`;
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

## Frozen-oracle rule

M0E3A is structural test-harness work. It must not change the existing eleven p20 historical oracle results.

Any existing p20 SHA-256 change is treated as a regression to investigate, not a golden to accept.

M0E3B may add new Orc/cadence/catch-up scenarios after this hydration contract is proven.
