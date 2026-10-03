# M2C2 State-Layer Ownership and Lifecycle Contract

## Purpose

M2C2 turns the source-backed M2C1 legacy classification into the permanent ownership, lifecycle, persistence, dependency, migration and reset contract for mutable state.

M2C2 remains behavior-neutral. It does not migrate a gameplay domain, create production preferences/UI/transient stores, move settings out of legacy `global.settings`, change persistence, or add a writable `GameState` root.

M2C1 answers:

> What kind of legacy value is this, and what migration risk does it represent?

M2C2 answers:

> Where may the represented concept live in the target architecture, who owns it, how long does it live, may it affect simulation, may it persist, how is the legacy representation migrated, and what happens on gameplay reset?

The machine-readable contract lives in:

```text
tests/architecture/m2c-state-layer-contract.cjs
```

and is enforced by:

```text
tests/architecture/m2c-state-layer-contract.test.cjs
```

M2C1 remains intact as historical migration evidence. M2C2 normalizes it rather than rewriting its original labels.

## Review-hardening corrections

The post-implementation review hardened four areas:

1. migration disposition is now part of each permanent layer's legal-combination rule instead of merely using a global vocabulary;
2. `pause` and `disableReset` follow the legacy reset semantics that explicitly clear them, so neither is treated as a durable application-profile preference;
3. legacy `message_logs` is decomposed into selected-view UI state and reconstructed message presentation buffers;
4. `show*` progression projections are an explicit closed set rather than a name-prefix heuristic, so a future `showFoo` setting cannot be silently reclassified.

The same legality hardening also makes mixed `tmp_vars` a decomposition source rather than pretending it is one coherent derived-state target.

## Permanent state layers

### `game-state`

Authoritative deterministic gameplay/session/meta state.

Rules:

- lifecycle is game-domain owned;
- persistence is the future authoritative game save;
- simulation role is authoritative;
- gameplay reset behavior is domain-defined;
- migration may be direct or translated;
- schema/invariants belong to the owning engine domain.

M2C2 adds no GameState field. The real GameState remains:

```js
{
    schemaVersion: 1
}
```

with zero writable gameplay roots.

### `application-preference`

Stable user choices such as theme, locale, keyboard mappings, presentation preferences and action-authoring preferences.

Rules:

- application-profile lifecycle;
- application-preference persistence;
- survives gameplay reset;
- never implicit authoritative simulation state;
- behavior-affecting preferences may influence simulation only by shaping an explicit command/input at the application boundary;
- migration may be direct or translated.

For example, a future queue merge preference may cause the application to dispatch a command with an explicit merge mode. Engine simulation must not reach back into application preferences to discover that mode.

### `application-control`

Application/session control that decides whether work is dispatched without becoming gameplay authority.

`pause` is the first explicit example.

Target rules for pause are:

- application-session lifecycle;
- optional application-session restoration, not profile preference ownership;
- scheduling-gate simulation role;
- gameplay reset returns it to its default unpaused value;
- the engine does not read a hidden pause flag from authoritative GameState.

### `ui-session`

Current navigation/view/interaction state such as selected tabs and temporary safety latches.

Rules:

- application-session lifecycle;
- never drives authoritative gameplay decisions;
- may be session-restorable or non-persistent;
- reset behavior is session-defined unless source behavior explicitly resets it to default.

`disableReset` belongs here. It is a temporary destructive-action safety latch. Legacy reset handling explicitly clears it, so it is not a durable preference.

### `derived-state`

Reconstructible calculations, caches and projections.

Rules:

- never authoritative;
- never stored as authoritative game-save data;
- may be used only when equivalent to recomputation from authoritative inputs/definitions/environment inputs;
- migration is derive or reconstruct;
- reset behavior is recomputation.

This layer includes calculation caches and UI projections. It does not create a global `TransientState` object.

### `simulation-working`

Deterministic operation-local mutable context used while a simulation/system operation executes.

Rules:

- operation lifecycle only;
- no persistence;
- working-context simulation role;
- reconstructed from authoritative inputs;
- discarded after the operation.

If characterization proves a value cannot be discarded/reconstructed without changing later outcomes, it is not working state and must receive authoritative ownership.

### `application-working`

Ephemeral application/runtime working data such as pressed-key state and rendered-message buffers.

Rules:

- session/process lifecycle;
- no persistence in this representation;
- no simulation role;
- reconstructed/recreated by the owning application capability.

### `runtime-service`

Executable/orchestration machinery such as callback queues, worker orchestration and intervals.

Rules:

- process lifecycle;
- service-owned persistence semantics only;
- orchestration role only;
- replaced by services, never migrated as data state.

### `platform-service`

Platform/environment dependencies such as storage adapters.

New engine code accesses these through the M1 runtime ports. Browser/localStorage objects are never state.

### `migration`

Legacy/import/decomposition representations that have no one-to-one permanent target container.

Examples include:

- legacy `global` as a mixed source;
- mixed `arpa`/`msgFilters` parents;
- mixed runtime `message_logs` and `tmp_vars` parents;
- obsolete migration markers.

Allowed migration dispositions are decomposition or discard only.

### `debug`

Developer/debug configuration and diagnostics.

Debug state cannot silently influence normal authoritative simulation. Intentional simulation experiments require an explicit test/configuration boundary.

## Orthogonal contract axes

Every classification has:

```text
targetLayer
lifecycle
persistence
simulationRole
migrationDisposition
resetBehavior
owner
reason
```

### Lifecycles

```text
game-domain
application-profile
application-session
operation
process
import
debug-session
```

### Persistence

```text
game-save
application-preference
application-session
none
service-owned
import-only
```

Only `game-state` may use `game-save`.

### Simulation roles

```text
authoritative
explicit-command-input
scheduling-gate
derived-read-only
working-context
orchestration-only
platform-only
none
debug-only
```

### Migration dispositions

```text
direct
translate
derive
reconstruct
decompose
discard
replace-by-service
```

Migration disposition is not merely a free label. Every permanent layer declares the exact dispositions legal for that layer, and tests reject illegal cross-axis combinations.

Examples of illegal combinations include:

```text
runtime-service + direct
game-state + replace-by-service
derived-state + direct
migration + reconstruct
```

### Gameplay-reset behavior

```text
domain-defined
survive-gameplay-reset
session-defined
reset-to-default
recompute
discard-after-operation
recreate-runtime
import-only
debug-defined
```

`reset-to-default` is intentionally distinct from `session-defined`: it records a source-backed reset invariant rather than leaving behavior to a future application policy.

## Dependency direction

Target direction is:

```text
Definitions
    |
    v
GameState ----> simulation systems
    |                 ^
    |                 |
    |          explicit command inputs
    |                 ^
    |                 |
    +--> selectors/derived state ---> UI
                              ^
                              |
Application preferences -----+
UI session state ------------> UI only
Application control ---------> scheduler / command dispatch
Runtime services ------------> orchestration interfaces
Platform services -----------> M1 runtime ports
Migration -------------------> importer/decomposition boundary only
```

Hard rules:

1. engine simulation may not implicitly read application preferences;
2. engine simulation may not read UI-session state;
3. application preferences that change action behavior cross as explicit command/options input;
4. application control such as pause gates scheduling/dispatch instead of becoming an engine-domain flag;
5. derived state cannot become hidden authority;
6. authoritative state cannot depend on a cache existing;
7. simulation-working state must be reconstructible at its defined operation boundary;
8. runtime/platform service handles cannot be serialized into GameState;
9. migration/decomposition containers cannot leak into the permanent architecture;
10. debug state cannot silently affect normal authoritative results.

M3 will operationalize explicit command inputs. M5 will operationalize scheduler/simulation boundaries. M8 will operationalize final UI/application ownership.

## Nested legacy settings

M2C1 identified these current object-valued settings containers:

```text
arpa
eden
keyMap
msgFilters
portal
resBar
space
tau
```

M2C2 classifies leaves rather than assigning one meaning to each parent.

### ARPA

- `arpa.arpaTabs` -> UI-session navigation;
- `arpa.physics`, `genetics`, `crispr`, `blood` -> derived progression availability.

### Region containers

`space.*`, `portal.*`, `eden.*`, and `tau.*` are legacy region-availability mirrors. Target UI availability is derived from authoritative progression/world facts rather than persisting these mirrors as independent UI authority.

### Message filters

Each `msgFilters.<category>` combines:

```text
unlocked
vis
max
save
```

Target split:

- `unlocked` -> derived capability/progression projection;
- `vis`, `max`, `save` -> application preferences.

### Keyboard mappings

`settings.keyMap.*` is application-profile input configuration.

This is distinct from module-level `keyMap` in `vars.js`, which represents currently pressed keys and is application-working state.

### Resource bars

`resBar.<resource>` is an application presentation preference. Future representation should use canonical resource IDs.

## Explicit `show*` ratchet

Current progression/UI projection flags are listed explicitly in `SHOW_PROJECTION_SETTINGS`.

The contract does not classify arbitrary settings with `name.startsWith('show')`.

Tests compare the explicit reviewed list against every current M2C1 `show*` key. Adding a new `showFoo` therefore fails until its semantics are reviewed deliberately.

## Runtime decomposition

### Working state

`p_on`, `support_on`, `int_on`, `gal_on`, `spire_on`, `atrack`, and `active_rituals` remain reconstructible non-persistent simulation working context.

### `message_logs`

The legacy runtime object is mixed and therefore decomposed:

- `message_logs.view` -> UI-session selected message category;
- `message_logs.<category>` arrays -> application-working presentation buffers.

The per-category arrays are reconstructed during startup from legacy persisted message history (`global.lastMsg`) and are not themselves authoritative or independently persisted target state.

The current message-filter category list is source-ratcheted so adding/removing a category forces review.

### `tmp_vars`

`tmp_vars` is a generic mixed scratch bucket. The target does not recreate it as a generic derived-state object. It is a decomposition source whose future members belong with their owning capabilities.

### Services

- `callback_queue`, `webWorker`, `intervals` -> runtime services;
- direct `save`/localStorage handle -> platform service.

## What M2C2 deliberately does not build

M2C2 does not create:

```text
PreferencesStore
UIStore
TransientState
CacheStore
```

Creating empty production stores now would invite dual authority and legacy synchronization before consumers migrate.

M7 owns persistence formats. M8 owns final UI/application separation. Domain-local caches and working contexts are introduced with their owning capabilities.

## Behavior boundary

M2C2 leaves unchanged:

- gameplay behavior;
- authoritative legacy `global` behavior;
- GameState schema/version and writable roots;
- save/load/import/export;
- reset implementation;
- simulation loops;
- UI implementation;
- power/support implementation;
- oracle snapshots.

## Relationship to later slices

### M2C3

M2C3 turns these contracts into final boundary/source-compliance gates and closes M2C without beginning a gameplay migration.

### M2D

M2D remains the first real authoritative GameState-domain migration.

### M3

M3 commands/conditions/effects/costs operationalize explicit command inputs.

### M5

M5 deterministic simulation operationalizes scheduling/application-control boundaries.

### M7/M8

M7 defines persistence envelopes and preference-storage strategy. M8 performs the large UI/application separation using this ownership contract.

## Definition of done

M2C2 is complete when:

1. permanent target layers use a closed vocabulary independent from M2C1 pseudo-layers;
2. lifecycle, persistence, simulation role, migration disposition, reset behavior, owner and rationale are explicit;
3. every layer constrains all legal axes, including migration disposition;
4. every M2C1 top-level setting/runtime binding normalizes into one legal M2C2 contract;
5. only GameState can claim authoritative/game-save semantics;
6. behavior-affecting preferences are explicit-command-input concerns rather than hidden engine dependencies;
7. pause is resettable application-session scheduling control, not target GameState/profile preference;
8. `disableReset` is a resettable non-persistent UI safety latch;
9. reviewed `show*` projections are explicitly fail-closed;
10. region visibility mirrors are derived from authoritative progression/world facts;
11. every current nested settings leaf receives exactly one target classification;
12. ARPA navigation is separated from progression availability;
13. message-filter capability is separated from user preferences;
14. `message_logs` selected view is separated from reconstructed message buffers;
15. keyboard mappings/resource-bar choices remain application-profile preferences;
16. simulation working state is operation-local, non-persistent and reconstructible;
17. executable/platform machinery is replaced by services rather than serialized;
18. mixed scratch containers are decomposed rather than recreated globally;
19. no production migration, GameState schema change, persistence change or oracle rebaseline occurs;
20. the complete existing CI/test/build/browser safety net remains green.
