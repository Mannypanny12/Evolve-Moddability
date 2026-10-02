# Target Engine Architecture

## Architectural intent

The project is a full refactor, not a permanent compatibility shell around legacy Evolve.

The migration strategy is **strangler-style**:

```text
legacy implementation
        |
temporary adapter
        |
new engine capability
        |
vanilla migrated to new capability
        |
adapter deleted
        |
legacy implementation deleted
```

Adapters are acceptable only while a subsystem is being migrated.

## Dependency rule

The intended dependency direction is:

```text
Platform adapters
      |
Application / UI
      |
Public Mod API        first-party Evolve content       external content
          \                 |                           /
           \                v                          /
            +---------- Engine contracts -------------+
                         |
                         v
                  Engine implementation
                         |
                         v
                  State / persistence
```

More concretely:

- `src/engine/**` is the protected platform-independent engine boundary;
- browser/platform adapters live outside `src/engine/**` and depend inward on engine contracts;
- engine core may not import vanilla content;
- engine core may not access DOM/jQuery/Vue;
- engine simulation may not access localStorage directly;
- engine simulation may not read wall-clock time or random sources directly;
- content definitions may describe rules but may not mutate state directly;
- UI issues commands and reads selectors/view models;
- persistence serializes explicit state, not arbitrary live objects.

## Engine kernel

The kernel owns concepts that are independent of Evolve-specific content:

- namespaced IDs;
- registries;
- package/content ownership;
- runtime environment ports;
- state store;
- commands;
- conditions;
- effects;
- costs;
- modifiers/calculations;
- domain events;
- simulation systems;
- serialization/migrations;
- diagnostics.

## Identity

All engine-visible content uses stable namespaced IDs.

Examples:

```text
evolve:resource/food
evolve:structure/farm
evolve:technology/agriculture
warcraft:resource/gold
warcraft:unit/footman
```

Legacy IDs such as `Food`, `farm`, or `primitive` are migration aliases only.

Identity must not depend on localized names, DOM IDs, object keys, or file location.

## Definitions versus state

A central design rule is that content definition and save state are different things.

Example:

```text
StructureDefinition
- id
- costs
- requirements
- effects
- tags
- presentation metadata

StructureState
- count
- active
- powered
- local runtime values
```

Definitions are owned by content packages. State belongs to the game session/save.

The same split applies to:

- resources;
- jobs;
- technologies;
- races/factions;
- traits;
- achievements;
- events;
- challenges;
- structures;
- queues;
- combat entities.

## State model

The eventual authoritative state is an explicit `GameState`, not the legacy `global` object.

Candidate domains:

```text
GameState
|-- meta
|   |-- schemaVersion
|   |-- engineVersion
|   |-- activeContent
|   |-- simulationTime
|   +-- RNG state
|-- run
|   |-- world/environment
|   |-- faction/species
|   |-- challenges
|   +-- progression mode
|-- resources
|-- population
|-- jobs
|-- structures
|-- technologies
|-- queues
|-- power/support
|-- crafting/trade
|-- combat
|-- events
|-- achievements
|-- statistics
|-- prestige
+-- modData
```

User preferences and UI layout belong in a separate settings/application model unless they materially affect simulation.

Derived caches and transient render state must not be persisted as authoritative data.

## State mutation

State is read through selectors/queries and changed through commands/effects or tightly scoped domain services.

Avoid a generic public `set(path, value)` mechanism.

Example:

```text
BuildStructureCommand
      |
validate conditions
      |
quote + pay costs atomically
      |
apply structure state change
      |
emit StructureBuilt
      |
statistics/achievements/UI react
```

This replaces today's mixture of action callbacks, payment helpers, direct mutation, redraw calls, and post callbacks.

## Runtime environment ports

Simulation receives explicit interfaces for environmental dependencies:

- `Clock`;
- `Rng`;
- `Storage`;
- `Logger`;
- optional analytics/telemetry;
- platform file/import services.

Tests provide deterministic implementations.

Real-world seasonal/calendar content receives explicit calendar/environment context rather than calling `new Date()` throughout domain logic.

## Registries

Registries own definitions and identity, not mutable gameplay state.

Initial registry families:

- resources;
- structures;
- technologies;
- jobs;
- factions/races;
- traits;
- achievements;
- events;
- challenges;
- actions/commands where content-defined;
- reset/prestige definitions;
- navigation/UI descriptors later.

A registry entry records:

- public ID;
- owner/package;
- schema version;
- tags;
- optional legacy aliases;
- definition.

Silent replacement is forbidden.

## Conditions

Common predicates become reusable condition definitions:

- technology level;
- structure count;
- resource threshold;
- active trait/tag;
- faction/species;
- universe/world property;
- challenge active;
- achievement/perk state;
- compound all/any/not.

Conditions return structured failure reasons so the UI and developer tools can answer:

> Why is this locked?

Custom code conditions remain possible for exceptional mechanics.

## Effects

Common mutations become effects:

- add/spend resource;
- unlock/reveal;
- grant technology/progression level;
- construct/remove structure;
- assign job;
- apply timed state;
- add achievement/statistic;
- enqueue work;
- apply modifier;
- emit domain event.

Effects execute through engine mutation authority and are testable independently.

## Cost engine

Costs are first-class quotes rather than arbitrary functions hidden inside UI action objects.

A cost quote should support:

- current cost;
- scaling/offset;
- affordability;
- capacity/max-affordability;
- atomic payment;
- special currencies;
- explanatory breakdown.

Legacy `payCosts()`, `checkCosts()`, and queue cost behavior migrate into this engine.

## Calculation and modifier engine

The calculation engine owns numeric composition.

Targets include:

- production;
- consumption;
- storage/capacity;
- cost;
- job output;
- population;
- combat;
- research;
- crafting;
- trade;
- morale;
- power/support;
- prestige.

Each result can expose a trace:

```text
base lumber                    10
evolve:tech/steel_axes       x1.20
evolve:trait/strong          x1.10
evolve:biome/forest         x1.15
---------------------------------
final                         15.18
```

Hard-coded condition chains are migrated into contributors/modifiers where that improves composability. Bespoke algorithms can remain named calculations.

## Simulation

The new simulation is an ordered system scheduler.

Compatibility phases may initially mirror legacy cadence:

```text
fast
mid
long
```

but each phase contains independent systems, for example:

```text
fast
|-- derive production context
|-- production systems
|-- consumption
|-- resource application
|-- queue progress
+-- transient effect decay

mid
|-- capacities
|-- population/job reconciliation
|-- power/support reconciliation
+-- progression maintenance

long
|-- events
|-- world/calendar
|-- combat/world periodic systems
|-- statistics checkpoints
+-- autosave request
```

UI rendering is not a simulation system.

Offline progression invokes the same deterministic systems with controlled elapsed-time policy rather than maintaining separate game logic.

## Domain events and hooks

Internal domain events are part of the engine before public hooks.

Examples:

- `ResourceChanged`;
- `TechnologyGranted`;
- `StructureBuilt`;
- `JobAssigned`;
- `AchievementUnlocked`;
- `ResetCompleted`;
- `CombatResolved`.

Public mod hooks are later projections of stable domain events. This prevents the mod API from exposing temporary legacy call structure.

## Persistence

Target save envelope:

```json
{
  "format": 2,
  "engine": { "version": "..." },
  "content": {
    "base": "evolve",
    "packages": []
  },
  "state": {},
  "mods": {}
}
```

Persistence owns:

- serialization;
- deserialization;
- validation;
- migrations;
- backups;
- legacy import;
- required package metadata.

Historical raw-`global` saves are imported through a compatibility layer and migrated into explicit state.

## First-party vanilla content

Vanilla Evolve becomes a first-party content package architecturally.

It does not need to be distributed as an archive, but it must use:

- registries;
- definitions;
- commands/effects;
- calculations/modifiers;
- simulation systems;
- persistence contracts.

Engine code may not special-case an `evolve:` ID merely because it is vanilla.

## UI/application layer

The existing UI can be migrated incrementally, but the destination is:

```text
UI -> command/application service -> engine
UI <- selector/view model --------- engine
```

UI components do not:

- calculate authoritative production;
- mutate state directly;
- own unlock logic;
- perform save serialization;
- define simulation cadence.

## Legacy bridge

During migration, a dedicated legacy bridge may expose controlled translation between `GameState` and `global`.

Rules:

1. never part of the public Mod API;
2. never imported by new engine core;
3. covered by differential tests;
4. usage is measured in CI;
5. each adapter has a removal milestone;
6. no new feature may depend on the bridge once the relevant domain is migrated.

## Architecture fitness rules

CI should grow these checks over time:

- forbidden import directions;
- cycle detection;
- `global.*` reference budget;
- DOM reference budget outside UI;
- direct localStorage usage budget;
- direct random/time access budget;
- registry ownership validation;
- content schema validation.

Budgets only move downward.

## Completion gate

The engine refactor is complete only after the legacy bridge and authoritative `global` state can be deleted.

External mod stability starts after that internal architecture has been proven by vanilla migration.
