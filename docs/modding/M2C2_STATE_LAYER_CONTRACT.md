# M2C2 State-Layer Ownership and Lifecycle Contract

## Purpose

M2C2 turns the source-backed M2C1 legacy classification into the target ownership, lifecycle, persistence, dependency, migration, and reset contract for mutable state.

M2C2 remains behavior-neutral. It does not migrate a production gameplay domain, create production preferences/UI/transient stores, move settings out of legacy `global.settings`, change persistence, or add a writable `GameState` root.

M2C1 answers:

> What kind of legacy value is this, and what migration risk does it represent?

M2C2 answers:

> Does the represented concept have a permanent target layer? If so, which one owns it, how long does it live, may it affect simulation, may it persist, how is the legacy representation migrated, and what happens on gameplay reset?

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

The implementation was hardened through two adversarial review passes.

The resulting corrections are:

1. migration disposition is part of every target layer's legal-combination rule;
2. `pause` and `disableReset` follow the source-backed reset semantics that explicitly clear them;
3. `message_logs` is decomposed into selected-view UI state and reconstructed message presentation buffers;
4. `show*` progression projections use an explicit closed set instead of a name-prefix heuristic;
5. mixed legacy parents do not pretend to be a permanent `migration` target layer: they use `targetLayer: null` plus `migrationDisposition: decompose`;
6. persisted legacy region flags are translated into authoritative world/progression facts before their UI visibility becomes derived;
7. the reset tests inspect the actual `clearStates()` source section rather than merely finding matching assignments anywhere in `vars.js`.

## Permanent target layers

### `game-state`

Authoritative deterministic gameplay/session/meta state.

Rules:

- game-domain lifecycle;
- future authoritative game-save persistence;
- authoritative simulation role;
- domain-defined gameplay reset behavior;
- migration may be direct or translated;
- schema/invariants belong to the owning engine domain.

M2C2 adds no production GameState field. The real GameState remains:

```js
{
    schemaVersion: 1
}
```

with zero writable gameplay roots.

### `application-preference`

Stable user choices such as theme, locale, keyboard mappings, presentation preferences, and action-authoring preferences.

Rules:

- application-profile lifecycle;
- application-preference persistence;
- survives gameplay reset;
- never implicit authoritative simulation state;
- behavior-affecting preferences may influence simulation only by shaping explicit command/input data at the application boundary;
- migration may be direct or translated.

### `application-control`

Application/session control that decides whether work is dispatched without becoming gameplay authority.

`pause` is the first explicit example:

- application-session lifecycle;
- optional session restoration, not profile preference ownership;
- scheduling-gate simulation role;
- gameplay reset returns it to the default unpaused value;
- the engine does not read an implicit pause flag from GameState.

### `ui-session`

Navigation/view/interaction state such as selected tabs and temporary safety latches.

Rules:

- application-session lifecycle;
- never drives authoritative gameplay decisions;
- may be session-restorable or non-persistent;
- reset behavior is session-defined unless source behavior explicitly resets it to default.

`disableReset` belongs here. It is a temporary destructive-action safety latch and is explicitly cleared by legacy reset handling.

### `derived-state`

Reconstructible calculations, caches, and projections.

Rules:

- never authoritative;
- never authoritative game-save data;
- usable only when equivalent to recomputation from authoritative inputs/definitions/environment inputs;
- migration is derive or reconstruct;
- reset behavior is recomputation.

### `simulation-working`

Deterministic operation-local mutable context used while a simulation/system operation executes.

Rules:

- operation lifecycle only;
- no persistence;
- working-context simulation role;
- reconstructed from authoritative inputs;
- discarded after the operation.

If characterization proves a value cannot be discarded/reconstructed at its stated boundary without changing later outcomes, it is not working state and needs authoritative ownership.

### `application-working`

Ephemeral application/runtime working data such as pressed-key state and rendered-message buffers.

Rules:

- session/process lifecycle;
- no persistence in this representation;
- no simulation role;
- reconstructed/recreated by the owning application capability.

### `runtime-service`

Executable/orchestration machinery such as callback queues, worker orchestration, and intervals.

These are replaced by services, never migrated as data state.

### `platform-service`

Platform/environment dependencies such as storage adapters. New engine code reaches these through the M1 runtime ports.

### `migration`

Actual importer/migration-only state or markers that exist specifically to interpret legacy data and have no normal runtime role.

Current examples include migration-only legacy settings such as `restoreCheck` and `tLabels`.

The `migration` layer is **not** the bucket for arbitrary mixed legacy containers.

### `debug`

Developer/debug configuration and diagnostics. Debug state cannot silently influence normal authoritative simulation.

## No-target decomposition sources

Some legacy containers do not represent one future concept and therefore have **no permanent target layer**.

They use:

```text
targetLayer: null
lifecycle: import
persistence: import-only
simulationRole: none
migrationDisposition: decompose
resetBehavior: import-only
```

Current decomposition sources include:

```text
global
settings.arpa
settings.msgFilters
settings.space
settings.portal
settings.eden
settings.tau
message_logs
tmp_vars
```

Their children are independently classified into their real owners.

This preserves the orthogonality of the contract:

- `targetLayer` answers where the target concept belongs;
- `migrationDisposition` answers what to do with the legacy representation.

A source container that disappears after decomposition therefore does not receive a fake permanent owner.

## Orthogonal contract axes

Every classification records:

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

`targetLayer` may be `null` only for a reviewed decomposition source.

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

Migration disposition is constrained by the selected target layer. Examples of illegal combinations include:

```text
runtime-service + direct
game-state + replace-by-service
derived-state + direct
migration + reconstruct
```

`decompose` is reserved for a `targetLayer: null` decomposition source rather than a permanent layer.

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

`reset-to-default` records a source-backed reset invariant rather than a future policy choice.

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
Migration -------------------> importer-only concerns
No-target legacy sources ----> decomposition/import only
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
9. importer/no-target decomposition representations cannot leak into permanent runtime architecture;
10. debug state cannot silently affect normal authoritative results.

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
- `arpa.physics`, `genetics`, `crispr`, `blood` -> derived progression availability;
- parent `arpa` -> no-target decomposition source.

### Region containers

`space.*`, `portal.*`, `eden.*`, and `tau.*` need a two-stage target model.

Legacy behavior shows that these flags are not safely disposable UI cache:

- `setRegionStates(false)` initializes missing keys but preserves existing saved values;
- gameplay actions explicitly set region flags, for example `settings.space.belt = true` and `settings.eden.isle = true`;
- historical save migration has used `settings.space.belt` as evidence to reconstruct gameplay state.

Therefore the conservative migration contract is:

```text
persisted legacy region flag
        |
        | translate during legacy import
        v
authoritative world/progression region-unlock fact
        |
        | selector
        v
derived UI region visibility
```

Every current region flag is listed in `REGION_REPLACEMENT_PATHS` / `REGION_REPLACEMENT_MAP` and ratcheted against the actual initialized legacy containers.

M2C2 deliberately does not invent the final GameState schema/path for these facts. The owning gameplay-domain migration must choose the canonical representation. The important invariant is that import may not discard the legacy flag before equivalent authoritative information exists.

The parent `space`, `portal`, `eden`, and `tau` settings objects have no permanent target and are decomposed.

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
- `vis`, `max`, `save` -> application preferences;
- parent `msgFilters` -> no-target decomposition source.

### Keyboard mappings

`settings.keyMap.*` is application-profile input configuration.

This is distinct from module-level `keyMap` in `vars.js`, which represents currently pressed keys and is application-working state.

### Resource bars

`resBar.<resource>` is an application presentation preference. Future representation should use canonical resource IDs.

## Explicit `show*` ratchet

Current progression/UI projection flags are listed explicitly in `SHOW_PROJECTION_SETTINGS`.

The contract does not classify arbitrary settings via `name.startsWith('show')`.

Tests compare the explicit reviewed list against every current M2C1 `show*` key. Adding a new `showFoo` therefore fails until its semantics are reviewed deliberately.

## Runtime decomposition

### Working state

`p_on`, `support_on`, `int_on`, `gal_on`, `spire_on`, `atrack`, and `active_rituals` remain reconstructible non-persistent simulation working context.

### `message_logs`

The parent object is a no-target decomposition source:

- `message_logs.view` -> UI-session selected message category;
- `message_logs.<category>` arrays -> application-working presentation buffers.

The per-category arrays are reconstructed at startup from legacy persisted message history (`global.lastMsg`) and are not independently authoritative.

### `tmp_vars`

`tmp_vars` is a generic mixed scratch bucket. The target does not recreate it as a generic derived-state object. It is a no-target decomposition source whose future members belong with their owning capabilities.

### `global`

Legacy `global` is the largest mixed source container. It is not itself a target GameState or migration-state object. Its members migrate domain by domain through the strangler plan.

### Services

- `callback_queue`, `webWorker`, `intervals` -> runtime services;
- direct `save`/localStorage handle -> platform service.

## Source-backed reset rule

The contract test for `pause` and `disableReset` now extracts the actual `clearStates()` source section and verifies that both assignments occur there:

```text
global.settings.disableReset = false
global.settings.pause = false
```

This prevents an unrelated initialization assignment elsewhere in `vars.js` from falsely satisfying the reset invariant.

## What M2C2 deliberately does not build

M2C2 does not create:

```text
PreferencesStore
UIStore
TransientState
CacheStore
```

Nor does it add the authoritative region-unlock facts to production GameState yet. Those are migration contracts for later owning-domain work, not premature schema changes.

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

M2D remains the first real authoritative GameState-domain migration. Region authority is only a target/import contract here, not an implemented GameState field.

### M3

M3 commands/conditions/effects/costs operationalize explicit command inputs.

### M5

M5 deterministic simulation operationalizes scheduling/application-control boundaries.

### M7/M8

M7 defines persistence envelopes and preference-storage strategy. M8 performs the large UI/application separation using this ownership contract.

## Definition of done

M2C2 is complete when:

1. target layers use a closed vocabulary independent from M2C1 pseudo-layers;
2. no-target decomposition sources are explicitly distinct from the target-layer vocabulary;
3. lifecycle, persistence, simulation role, migration disposition, reset behavior, owner, and rationale are explicit;
4. every target layer constrains every legal axis, including migration disposition;
5. every M2C1 top-level setting/runtime binding normalizes into one legal contract or reviewed no-target decomposition source;
6. only GameState can claim authoritative/game-save semantics;
7. behavior-affecting preferences are explicit-command-input concerns rather than hidden engine dependencies;
8. pause is resettable application-session scheduling control, not target GameState/profile preference;
9. `disableReset` is a resettable non-persistent UI safety latch;
10. reviewed `show*` projections are explicitly fail-closed;
11. every current region flag is fail-closed in the replacement map and translates into authoritative world/progression information before UI visibility is derived;
12. every current nested settings leaf receives exactly one target classification;
13. ARPA navigation is separated from progression availability;
14. message-filter capability is separated from user preferences;
15. `message_logs` selected view is separated from reconstructed message buffers;
16. keyboard mappings/resource-bar choices remain application-profile preferences;
17. simulation working state is operation-local, non-persistent, and reconstructible;
18. executable/platform machinery is replaced by services rather than serialized;
19. mixed scratch/legacy containers are decomposed rather than recreated globally;
20. reset semantics are proven against the actual reset-function source section;
21. no production migration, GameState schema change, persistence change, or oracle rebaseline occurs;
22. the complete existing CI/test/build/browser safety net remains green.
