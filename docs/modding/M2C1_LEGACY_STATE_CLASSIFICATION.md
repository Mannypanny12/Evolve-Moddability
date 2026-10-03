# M2C1 Legacy State Classification

## Purpose

M2C1 is the first bounded slice of M2C (`Settings and transient-state separation`).

It does **not** migrate state. It creates a fail-closed, source-backed classification of legacy mixed state so later migration cannot accidentally copy implementation debris into `GameState`.

M2C1 classifies two especially dangerous legacy surfaces:

1. every known top-level member of `global.settings`;
2. every exported mutable runtime binding in `src/vars.js`.

The classification lives in:

```text
tests/architecture/m2c-state-classification.cjs
```

and is enforced by:

```text
tests/architecture/m2c-state-classification.test.cjs
```

This catalog is migration architecture evidence, not production state code. Legacy paths therefore remain outside `src/engine/**`.

## Why this slice exists

Legacy Evolve combines several different categories under the same mutable objects.

`global.settings` contains all of the following at once:

- simulation-affecting state;
- action/input preferences;
- navigation state;
- layout/presentation preferences;
- debug switches;
- migration leftovers;
- derived localized display data.

Likewise, `vars.js` exports mutable values ranging from the legacy authoritative `global` object to:

- calculation breakdown caches;
- power/support reconciliation working maps;
- cached derived levels;
- report/graph projections;
- input state;
- callback queues containing executable references;
- worker and interval handles;
- direct storage access.

Copying either surface wholesale into a new settings or transient object would preserve the old architecture under a new name.

## M0 observation versus M2 ownership

M0E1 answers a behavioral-observation question:

> Can this legacy value affect the currently observed game behavior?

M2C answers a different architecture question:

> Which target layer should own this concept after the refactor?

M2C1 deliberately preserves both answers.

Every `global.settings` entry records its existing M0 `include`/`exclude` mode and a separate M2 target classification. Tests require the M0 observation mode to match the existing `SIMULATION_SETTING_POLICY`; M2C cannot silently rewrite the oracle's meaning.

This distinction is important for queue/input preferences. `qAny`, `qAny_res`, `qKey`, and `q_merge` are behaviorally observed by M0, but M2C1 classifies them as future application preferences rather than hidden `GameState`. The future command/application layer should translate them into explicit command choices.

## Target layers

M2C1 uses a closed target vocabulary.

### `game-state-candidate`

A legacy value whose meaning appears to require future authoritative simulation ownership.

Current setting candidates are:

- `alwaysPower`;
- `at`;
- `boring`;
- `lowPowerBalance`;
- `mtorder`;
- `pause`.

`candidate` is intentional. M2C1 does not add these fields to `GameState`; their exact target schemas are characterized when their owning domains migrate.

### `application-settings`

Stable user/input/presentation preferences owned by the application layer.

These may be persisted independently as application preferences later, but are not authoritative gameplay save state merely because the legacy save object contains them.

### `ui-state`

Navigation, selected tabs, panel/view state and UI projections.

Some legacy `show*` flags may ultimately be derived from authoritative progression rather than stored at all. M2C1 therefore marks those entries `directMigration: false`.

### `derived-transient`

Values that can be reconstructed from authoritative state, definitions or environment inputs.

Examples include:

- calculation breakdowns;
- power-generation reporting;
- cached achievement/universe/quantum levels;
- report/graph projections;
- localized string-pack status text.

Persistence intent is `recompute`.

### `runtime-working`

Deterministic mutable working state used while a simulation/application operation is in progress, but which is not independently authoritative.

Examples include the legacy power/support activation maps and accelerated-time tracker.

These values require careful migration because they can influence behavior during a loop, but that does **not** make them save state. Future systems should reconstruct or create them from authoritative inputs for their execution scope.

### `runtime-service`

Runtime orchestration rather than data state.

Examples include:

- `callback_queue`, which contains executable callback references;
- `webWorker`;
- `intervals`.

These can never be serialized as `GameState`.

### `platform-service`

Platform/environment dependencies such as the direct legacy `localStorage` handle.

These migrate behind M1C runtime ports/adapters, not into state.

### `migration-only`, `debug-only`, `legacy-mixed-container`

These identify state that exists only because of the old implementation/lifecycle and must not be promoted into permanent engine state.

### `semantic-debt`

A legacy value whose *current* meaning crosses architecture layers and therefore must be translated rather than copied.

The first explicit example is `settings.showCivic`.

It looks like presentation state but legacy technology conditions read it as a gameplay gate. The target is not `GameState.showCivic`. The future progression migration must identify the underlying progression/unlock fact and the UI should derive civic visibility from that fact.

## Persistence intent is separate from target layer

M2C1 records a persistence intent for every entry.

The important rules are:

- only `game-state-candidate` may currently claim `authoritative-save` intent;
- application settings use independent application-preference persistence;
- UI state may be session/preference state but is not authoritative `GameState`;
- derived state is recomputed;
- runtime working state is runtime-only;
- runtime/platform services own their own lifecycle;
- migration/debt/legacy containers do not acquire permanent save semantics merely by being classified.

M7 still owns the actual persistence format and serializers.

## Direct migration is an explicit decision

Every classification entry must state `directMigration: true` or `directMigration: false` explicitly.

There is deliberately no default. Omitting the field fails the architecture test. This prevents a newly catalogued legacy value from silently being treated as safe for direct translation merely because the reviewer forgot to decide.

`directMigration: true` means only that the represented concept can plausibly carry across without first discovering a different underlying semantic fact. It does **not** authorize migration in M2C1 and does not define the final target schema.

## Fail-closed coverage

### Legacy settings

The M2C1 test requires:

```text
keys(SETTING_TARGET_POLICY)
    ==
keys(SIMULATION_SETTING_POLICY)
```

Therefore a future setting first added to the M0 fail-closed observation policy will immediately require an M2 target decision as well.

The test also requires the stored legacy observation mode to equal M0's current mode. M2C classification cannot weaken or redefine simulation observation.

M2C1 hardening adds an independent third leg: the deterministic legacy harness is initialized and its actual current top-level `settings` keys are compared with both policies. This means M0 and M2C can no longer silently omit a current initialized top-level setting together.

The hardening test also records the current object-valued nested settings containers:

```text
arpa
keyMap
msgFilters
portal
resBar
space
```

If that set grows, CI fails. M2C2 must sub-classify the nested members and formalize whether each is a stable preference, UI projection, derived value, or semantic debt.

### Exported runtime values

The test reads `src/vars.js` directly and extracts every top-level mutable binding declared as either:

```js
export var name = ...
export let name = ...
```

It requires that exact set to equal `RUNTIME_TARGET_POLICY`.

A newly exported mutable `var` or `let` runtime bucket therefore fails CI until explicitly classified.

Exported `const` bindings are separately ratcheted. The existing `message_filters` constant is the only allowed exported `const` container in `vars.js`; adding another exported `const` there requires architectural review instead of becoming a back door around the mutable-binding guard.

This source scanner is intentionally scoped to `vars.js`. It is not a claim that all mutable state in every legacy module has already been inventoried. M2C2 can broaden permanent state-layer enforcement where needed.

## Important decisions recorded by M2C1

### Queue/input preferences do not automatically become GameState

`qAny`, `qAny_res`, `qKey`, and `q_merge` are currently behavior-affecting and therefore observed by M0.

The target design treats them as application preferences translated into explicit future command behavior. Their resulting queue/action state is authoritative; the UI/input preference is not hidden simulation state.

### Power/support working maps are not save state

`p_on`, `support_on`, `int_on`, `gal_on`, and `spire_on` are behavior-relevant mutable working maps.

They are nevertheless classified as runtime working state because they are reconstructed from authoritative structure state and then adjusted during reconciliation. Future power/support systems should own deterministic execution-local working context rather than persist these maps.

### Executable callback state is never data state

`callback_queue` contains a `Map` of executable callback references. It is classified as runtime-service state and can never satisfy the M2A inert plain-data contract.

Future command/event orchestration replaces this style of callback scheduling.

### No new generic transient bucket

`tmp_vars` is classified as legacy derived scratch data, not as a target `TransientState` root.

Future caches/working state should be owned by the calculation/system/application capability that creates them. A generic mutable scratch object would recreate `global` at another layer.

## Behavior boundary

M2C1 is intentionally behavior-neutral:

- no gameplay source changes;
- no new `GameState` field;
- `GAME_STATE_SCHEMA_VERSION` stays `1`;
- no writable `GameState` root is added;
- no `global`/GameState synchronization;
- no setting is moved out of `global.settings` yet;
- no save/import/export/reset change;
- no UI migration;
- no power/support migration;
- no oracle rebaseline.

## Relationship to later M2 slices

### M2C2

M2C2 turns this source classification into the full settings/transient-state layer contract, including ownership, lifecycle and dependency rules. It should also normalize today's migration-oriented labels such as `semantic-debt` and `legacy-mixed-container` into separate permanent layer and migration-disposition concepts rather than canonizing them as runtime layers.

### M2C3

M2C3 adds the final boundary enforcement/closure gates and closes M2C without beginning a gameplay-domain migration.

### M2D

M2D remains the first real authoritative state-domain migration. It is the point where `GameState` gains a real domain and actual scoped mutation authority.

## Definition of done for M2C1

M2C1 is complete when:

1. every current initialized top-level legacy setting has one explicit M2 target classification;
2. every M0-classified legacy setting has one explicit M2 target classification;
3. M0 observation semantics and M2 target ownership remain separate and are cross-checked by tests;
4. every exported mutable `var`/`let` binding in `vars.js` has one explicit target classification;
5. new exported `const` containers in `vars.js` cannot silently bypass classification;
6. every catalog entry makes an explicit direct-migration decision;
7. persistence intent is explicit and non-authoritative layers cannot claim authoritative-save intent;
8. behavior-relevant working state is distinguished from reconstructible derived state;
9. executable/platform machinery is explicitly excluded from data-state layers;
10. `showCivic` and other non-direct translations are recorded rather than copied into new state;
11. no gameplay, GameState schema, persistence, save, reset, UI or oracle behavior changes;
12. the complete existing safety net remains green.
