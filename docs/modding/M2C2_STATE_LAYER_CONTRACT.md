# M2C2 State-Layer Ownership and Lifecycle Contract

## Purpose

M2C2 turns the source-backed M2C1 legacy classification into the permanent ownership, lifecycle, persistence and dependency contract for mutable state.

M2C2 remains behavior-neutral. It does not migrate a gameplay domain, create a preferences store, move settings out of legacy `global.settings`, change persistence, or add a writable `GameState` root.

M2C1 answers:

> What kind of legacy value is this, and what migration risk does it represent?

M2C2 answers:

> Where may the represented concept live in the target architecture, who owns it, how long does it live, may it affect simulation, may it persist, what happens on gameplay reset, and how is the legacy representation translated?

The machine-readable contract lives in:

```text
tests/architecture/m2c-state-layer-contract.cjs
```

and is enforced by:

```text
tests/architecture/m2c-state-layer-contract.test.cjs
```

M2C1 remains intact as historical migration evidence. M2C2 normalizes it rather than rewriting its original labels.

## Permanent state layers

### `game-state`

Authoritative deterministic gameplay/session/meta state.

Rules:

- lifecycle is owned by the game domain;
- persistence is the future authoritative game save;
- simulation role is authoritative;
- gameplay reset behavior is domain-defined;
- schema/invariants belong to the owning engine domain;
- only explicit domain migrations may add state here.

M2C2 does not add any such field. The real GameState remains the M2A V1 root with `schemaVersion` only.

### `application-preference`

Stable user choices such as theme, locale, keyboard mappings, presentation layout and action-authoring preferences.

Rules:

- survives gameplay resets;
- may later persist independently as application preferences;
- is never implicit authoritative simulation state;
- a behavior-affecting preference may influence simulation only by shaping an explicit command/input at the application boundary.

For example, a future queue merge preference may cause the application to dispatch a command with an explicit merge mode. Engine simulation must not reach back into application preferences to discover that policy.

### `application-control`

Application/scheduler control state that determines whether work is dispatched, without becoming gameplay authority.

`pause` is the first explicit example. Legacy code currently checks `global.settings.pause` from gameplay actions and loop control. The target architecture moves that concern outward: the application/scheduler decides whether to run a step or dispatch an action.

Persisting a paused preference does not make pause part of GameState.

### `ui-session`

Current navigation/view state such as selected tabs.

Rules:

- never drives authoritative gameplay decisions;
- may optionally be restored as application session state;
- reset behavior is application/session defined, not a gameplay-domain concern.

### `derived-state`

Reconstructible calculations, caches and projections.

Rules:

- never authoritative;
- never stored as authoritative game-save data;
- may be used only when equivalent to recomputation from authoritative inputs/definitions/environment inputs;
- must be invalidated/recomputed rather than reset as independent gameplay state.

This layer covers both calculation caches and UI projections. It deliberately does not create one global `TransientState` object. Derived data remains owned by the capability that computes it.

### `simulation-working`

Deterministic operation-local mutable context used while a simulation/system operation executes.

Examples include the legacy power/support activation maps.

Rules:

- operation lifecycle only;
- no persistence;
- reconstructed from authoritative inputs;
- discarded after the operation;
- if future characterization proves a value cannot be discarded/reconstructed without changing later outcomes, that value is not merely working state and must receive authoritative domain ownership instead.

### `application-working`

Ephemeral application working state, such as currently pressed keyboard keys.

It is not a user preference and not simulation state. It is recreated with the application/runtime session and is never saved as GameState.

### `runtime-service`

Executable/orchestration machinery such as callback queues, worker orchestration and interval handling.

These are services, not data state. Executable references can never enter GameState.

### `platform-service`

Platform/environment dependencies such as storage adapters.

New engine code accesses these through the M1 runtime ports. Browser/localStorage objects are never state.

### `migration`

Legacy/import-only representations that exist solely to translate old state into the target architecture.

`global` as one mixed legacy object is a decomposition source, not a future state layer. Old migration markers are discarded after import.

### `debug`

Developer/debug configuration and diagnostics.

Debug state cannot become authoritative gameplay input. Any future simulation experiment/debug configuration that intentionally changes simulation must cross a dedicated explicit configuration/test boundary rather than silently influencing normal saved state.

## Orthogonal contract axes

Every M2C2 classification has separate fields for:

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

This prevents one overloaded label from trying to express ownership, persistence and migration at once.

### Lifecycles

The closed lifecycle vocabulary is:

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

The closed persistence vocabulary is:

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

The closed simulation-role vocabulary is:

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

The distinctions are intentional:

- `authoritative` changes gameplay because it is the gameplay fact;
- `explicit-command-input` may shape a command before it enters the engine;
- `scheduling-gate` decides whether the engine/application dispatches work;
- `derived-read-only` must be equivalent to recomputation from authoritative inputs;
- `working-context` exists only inside a deterministic operation;
- runtime/platform/debug concerns never become hidden gameplay authority.

### Migration dispositions

The closed migration vocabulary is:

```text
direct
translate
derive
reconstruct
decompose
discard
replace-by-service
```

`semantic-debt` and `legacy-mixed-container` therefore stop being target layers. Their meaning is expressed through dispositions such as `derive` or `decompose`.

### Gameplay-reset behavior

The closed reset vocabulary is:

```text
domain-defined
survive-gameplay-reset
session-defined
recompute
discard-after-operation
recreate-runtime
import-only
debug-defined
```

This establishes an important separation: gameplay resets affect authoritative domains according to domain rules, but should not wipe theme, locale, keyboard mappings, queue presentation or other application-profile preferences.

## Dependency direction

Target dependency direction is:

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
Migration -------------------> importer only
```

Hard rules:

1. engine simulation may not implicitly read application preferences;
2. engine simulation may not read UI-session state;
3. application preferences that change action behavior must cross as explicit command/options input;
4. application control such as pause gates scheduling/dispatch instead of becoming an engine-domain flag;
5. derived state cannot write authoritative state merely because it caches a calculation;
6. authoritative state cannot depend on a cache existing;
7. simulation-working state must be reconstructible at its defined operation boundary;
8. runtime/platform service handles cannot be serialized into GameState;
9. migration data cannot leak past the importer boundary;
10. debug state cannot silently influence normal authoritative simulation results.

M3 will operationalize the explicit command-input side of this contract. M5 will operationalize scheduling/simulation boundaries. M8 will operationalize the final application/UI ownership separation.

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

M2C2 classifies their leaves rather than assigning one meaning to the parent object.

### ARPA

`arpa.arpaTabs` is UI-session navigation.

`arpa.physics`, `arpa.genetics`, `arpa.crispr`, and `arpa.blood` are progression-driven availability projections. They are derived from authoritative progression rather than independently persisted target state.

### Region containers

`space.*`, `portal.*`, `eden.*`, and `tau.*` are legacy region-availability mirrors. Gameplay actions currently toggle these values and renderers use them to decide which regions appear.

The target architecture derives region availability from authoritative progression/world facts. These flags are not copied into a future UI store or GameState.

### Message filters

Each `msgFilters.<category>` object currently combines:

```text
unlocked
vis
max
save
```

M2C2 splits them:

- `unlocked` is a derived progression/capability projection;
- `vis`, `max`, and `save` are application preferences.

The legacy parent therefore requires decomposition.

### Keyboard mappings

`keyMap.*` is application-profile input configuration and survives gameplay resets.

This is distinct from the module-level `keyMap` runtime binding in `vars.js`, which represents currently pressed keys and is application working state.

### Resource bars

`resBar.<resource>` is an application presentation preference. Future representation should use canonical resource IDs rather than localized/legacy object keys where applicable.

The mirrored `global.resource[resource].bar` presentation field should not become authoritative resource state merely because legacy code copies the preference there.

## Important top-level corrections/refinements

### `pause`

M2C1 conservatively classified pause as a GameState candidate because it affects current gameplay and action gating.

M2C2 source review refines the target ownership: pause is application/scheduler control. The target engine receives no command/step while paused rather than reading hidden application state from inside simulation.

M2C1 remains unchanged because it records the earlier migration classification; M2C2 is the permanent target contract.

### `show*`

Legacy `show*` fields are treated as derived projections, not generic UI-session state. They are predominantly progression visibility mirrors and should be recomputed from authoritative facts.

`showCivic` is the strongest example because legacy gameplay logic also observes it. The target does not contain `GameState.showCivic`; the underlying progression fact becomes authoritative and UI visibility is derived from it.

### Behavior-affecting queue/input preferences

`qAny`, `qAny_res`, `qKey`, and `q_merge` stay application preferences even though M0 observes them. Their simulation role is `explicit-command-input`, not `authoritative`.

## Runtime classification

M2C2 preserves and sharpens the M2C1 runtime split:

- `breakdown`, `power_generated`, cached levels and reports/graphs -> derived state;
- `p_on`, `support_on`, `int_on`, `gal_on`, `spire_on`, `atrack`, `active_rituals` -> operation-local simulation working state;
- module-level pressed-key `keyMap` -> application working state;
- `callback_queue`, `webWorker`, `intervals` -> runtime services;
- direct `save`/localStorage handle -> platform service;
- legacy `global` -> import/decomposition source;
- generic `tmp_vars` -> legacy derived scratch that must be decomposed, not recreated as a global transient bucket.

## What M2C2 deliberately does not build

M2C2 does not create:

```text
PreferencesStore
UIStore
TransientState
CacheStore
```

Creating empty production stores now would invite legacy synchronization and dual authority before real consumers are migrated.

M7 owns persistence formats. M8 owns final UI/application separation. Domain-local caches/working contexts are introduced only when the owning capability migrates.

## Behavior boundary

M2C2 must leave all of the following unchanged:

- gameplay behavior;
- authoritative legacy `global` behavior;
- GameState schema/version;
- GameState writable roots;
- save/load/import/export;
- reset implementation;
- simulation loops;
- UI implementation;
- power/support implementation;
- oracle snapshots.

The current GameState therefore remains:

```js
{
    schemaVersion: 1
}
```

and M2B still exposes zero writable GameState roots.

## Relationship to later slices

### M2C3

M2C3 turns these contracts into final boundary/closure gates, checks architecture-source compliance where appropriate, and closes M2C without beginning a gameplay-domain migration.

### M2D

M2D remains the first real authoritative state-domain migration. That slice may add the first actual GameState domain/writable authority after characterizing its semantics.

### M3

M3 commands/conditions/effects/costs operationalize the rule that application preferences may influence simulation through explicit command inputs rather than hidden shared settings.

### M5

M5 deterministic simulation operationalizes scheduler/application-control boundaries such as pause and runtime timing.

### M7/M8

M7 defines persistence envelopes and application-preference storage strategy. M8 performs the large UI/application separation using this ownership contract.

## Definition of done

M2C2 is complete when:

1. permanent target layers use a closed vocabulary independent from M2C1 migration labels;
2. lifecycle, persistence, simulation role, migration disposition, reset behavior, owner and rationale are explicit;
3. every M2C1 top-level setting and runtime binding normalizes into one legal M2C2 contract;
4. only GameState can claim authoritative/game-save semantics;
5. behavior-affecting application preferences are explicit-command-input concerns rather than hidden engine dependencies;
6. pause is application scheduling/control, not target GameState;
7. show/region visibility mirrors are derived from authoritative progression/world facts;
8. every current nested settings leaf receives exactly one target classification;
9. ARPA navigation is separated from ARPA progression availability;
10. message-filter availability is separated from user message preferences;
11. keyboard mappings/resource-bar choices remain application-profile preferences;
12. simulation working state is operation-local, non-persistent and reconstructible;
13. executable/platform machinery is replaced by services rather than serialized;
14. gameplay resets cannot accidentally erase unrelated application preferences;
15. no production migration, GameState schema change, persistence change or oracle rebaseline occurs;
16. the complete existing CI/test/build/browser safety net remains green.
