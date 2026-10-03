# M2A GameState Schema

## Purpose

M2A introduces the first explicit engine-owned state contract without moving authoritative gameplay state out of legacy `global` yet.

The slice establishes:

- a versioned `GameState` root;
- inert plain-data rules for future state domains;
- domain ownership rules;
- fail-closed structural validation;
- a clean boundary between authoritative game state, definitions, settings, transients, runtime ports, and persistence metadata.

M2A is intentionally behavior-neutral. It does not migrate a gameplay domain, introduce a state store, change save/load, or synchronize `GameState` with legacy `global`.

## Root schema

The M2A root is deliberately minimal:

```js
{
    schemaVersion: 1
}
```

`GAME_STATE_SCHEMA_VERSION` is independent from:

- Evolve content/game version;
- legacy `global.version` migration history;
- definition-family schema versions;
- the future persistence/save-envelope format;
- future package/API versions.

M2A does not clone the current legacy top-level state layout. Future authoritative domains are added only when their semantics and ownership are explicitly characterized.

## Why the root starts small

Legacy `global` is an implementation object accumulated over the lifetime of Evolve. It mixes simulation state, persistent progression, RNG seeds, lifecycle flags, settings, migration metadata, and UI-facing state.

The M0 authoritative-state policy already proves that the legacy object cannot safely be copied wholesale:

- many roots are real simulation or meta state;
- `settings` is mixed simulation/application state;
- some roots are presentation-only or obsolete migration data;
- additional mutable transients live outside `global` entirely.

M2A therefore defines the laws of new state before defining the full domain tree.

## State value contract

New `GameState` data must be inert deterministic plain data.

Allowed values:

- `null`;
- strings;
- booleans;
- finite numbers;
- normal dense arrays;
- plain objects with `Object.prototype` or `null` prototype.

Rejected values include:

- `undefined`;
- `NaN`, `Infinity`, and `-Infinity`;
- functions;
- symbols;
- bigint values;
- getters/setters;
- non-enumerable state fields;
- symbol-keyed fields;
- sparse arrays;
- arrays with extra state properties;
- class instances, `Date`, `Map`, `Set`, and other exotic prototypes;
- cyclic references;
- objects that cannot be safely inspected.

Validation reads property descriptors rather than invoking ordinary property access at contract boundaries. Accessor-backed or hostile values therefore cannot execute merely because state validation or diagnostics inspect them.

Canonicalization returns detached mutable plain data. M2A deliberately does not freeze live state: mutation authority and store semantics are M2B concerns.

Object keys are emitted in deterministic sorted order. Array order is preserved because ordered state such as queues can be semantically meaningful.

## Legacy observation versus new state rules

The M0 differential oracle can represent legacy oddities such as present-but-`undefined` fields and narrowly characterized non-finite metadata. That capability exists to observe legacy behavior faithfully.

It is not a contract for new engine state.

New `GameState` fails closed on those values. Any future migrated domain that discovers a legacy exception must translate that legacy representation into an explicit clean engine representation rather than silently inheriting the old shape.

## Domain ownership rules

Every future authoritative top-level `GameState` domain must have one explicit engine/domain owner in its design and implementation.

Ownership means responsibility for:

- the domain schema;
- invariants;
- lifecycle/default construction;
- later mutation authority;
- later serialization semantics.

Ownership does **not** mean content-package ownership.

For example, `evolve:resource/food` is a content definition owned by the first-party Evolve package, while the runtime amount/capacity for that resource belongs to the engine resource-state domain for the current game session.

Rules:

1. registries own definitions and identity, never mutable gameplay state;
2. packages own content definitions, not arbitrary session-state mutation rights;
3. future content-backed state uses canonical typed content IDs, not legacy object keys or localized names;
4. state-domain code may not depend on legacy `global`, the legacy bridge, browser APIs, DOM, storage, wall clock, or randomness directly;
5. cross-domain reads eventually go through selectors/queries rather than object reach-through;
6. cross-domain writes eventually go through scoped mutation authority, commands/effects, or domain services;
7. no generic arbitrary-path setter is part of the state architecture;
8. no unrestricted top-level `modData` or package-specific state bucket is introduced in M2A;
9. missing-content/package compatibility policy remains persistence/package-loader work and is not smuggled into the lowest state-value validator.

## Layer separation

M2A establishes these category boundaries:

```text
Definitions
    immutable static content registered by identity

GameState
    authoritative simulation/session/meta state

Application/settings state
    theme, locale, tabs, layout, input preferences, other non-simulation preferences

Transient/derived state
    caches, calculation breakdowns, render helpers, callbacks, diagnostics

Runtime environment
    Clock, RNG, Storage, Logger ports

Persistence
    save envelope, content requirements, migrations, backups
```

M2C will make the settings/transient split concrete. M2A already prohibits those categories from entering `GameState` merely because legacy Evolve persisted or colocated them.

## Legacy-to-target classification guidance

The existing M0 state policy remains the source-backed migration guide, not a schema to copy.

Representative direction:

| Legacy location | Future direction |
| --- | --- |
| `global.resource` | resource state domain |
| `global.tech` | technology/progression state domain |
| `global.city`, `space`, `interstellar`, `galaxy`, `portal`, `eden`, `tauceti` | explicit structure/world/domain state |
| `global.civic` | population/jobs/government/military domains as characterized |
| `global.race` | run/faction/species/challenge/trait domains as characterized |
| `global.stats.achieve` | achievement state domain after characterization |
| other `global.stats` | statistics/meta domains after characterization |
| `global.genes`, `blood`, `prestige`, `pillars` | persistent meta-progression domains |
| `global.settings` | split between simulation state and application settings, never copied wholesale |
| `global.seed`, `warseed` | future serializable simulation RNG state when scheduler/RNG migration requires it |
| `global.lastMsg` | application/transient presentation state, not `GameState` |
| legacy migration markers | importer/migration concern, not `GameState` |

These mappings are architectural guidance only. M2A does not add the target domain fields yet.

## Fields deliberately deferred

The broader architecture sketch lists possible metadata such as engine version, active content, simulation time, and RNG state. M2A does not prematurely encode those representations.

- engine/content identity belongs primarily to the future save envelope and package model;
- active package semantics are not stable before the package-loader milestones;
- authoritative simulation-time semantics arrive with the scheduler;
- the M1 RNG runtime port is a provider contract, not serializable RNG state.

Serializable RNG state may later become part of `GameState`; the runtime RNG provider never does.

## Achievements/statistics caution

Achievements remain a good candidate for the first real state-domain migration, but M2A does not invent their runtime schema.

Legacy achievement state includes rank and universe-specific progress, not merely a boolean unlocked flag. The exact domain shape must therefore be source-characterized in the migration slice before becoming authoritative.

This same rule applies to every domain: characterize semantics first, then add the engine schema.

## Architecture boundary

Production implementation lives under:

```text
src/engine/state/
```

It inherits all existing `src/engine/**` architecture gates:

- no legacy imports/references;
- no legacy bridge dependency;
- no platform dependency;
- no DOM/browser access;
- no direct storage;
- no wall-clock/random access.

Legacy-path classification stays in tests/docs/bridge code, not in engine state modules.

## Tests

M2A covers:

- root schema/version validation;
- unknown/missing-field fail-closed behavior;
- detached mutable canonical output;
- deterministic object key ordering;
- finite-number enforcement;
- hostile getter rejection without invocation;
- exotic prototypes;
- symbols and hidden fields;
- dense-array enforcement;
- cyclic state;
- prototype-pollution-safe `__proto__` handling;
- hostile proxy inspection failures.

Existing M0/M1 architecture, simulation, browser, and build gates remain authoritative regression protection.

## Behavior-neutrality gate

After M2A:

- legacy `global` remains authoritative;
- no gameplay reads `GameState`;
- no gameplay writes `GameState`;
- no `GameState`/`global` synchronization exists;
- save/load/import/export are unchanged;
- reset flows are unchanged;
- simulation loops are unchanged;
- UI behavior is unchanged;
- frozen M0 oracle snapshots must not change.

Any behavioral-oracle change during M2A is a scope failure unless independently proven to be unrelated infrastructure correction.

## Definition of done

M2A is complete when:

1. `GameState` has an explicit independent schema version and closed root;
2. future state domains can rely on a hardened inert plain-data contract;
3. domain ownership and layer boundaries are documented;
4. no legacy state layout has been cloned into the engine;
5. adversarial state validation tests pass;
6. existing M0/M1 architecture/test/build/browser gates remain green;
7. no gameplay source, save format, legacy authority, or oracle baseline changes.

M2B can then add the state store, selectors, snapshots, scoped mutation/transactions, and change diagnostics on top of this contract without first having to unwind legacy object semantics.
