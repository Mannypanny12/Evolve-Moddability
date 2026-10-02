# Full Refactor Code Audit

## Purpose

This audit re-baselines the project around a stronger goal than the original moddability plan:

> Refactor Evolve into a clean modular incremental-game engine, migrate vanilla Evolve onto that engine, remove the legacy architecture, and then expose the proven engine contracts to mods and total conversions.

The audit was performed against the exact upstream source baseline recorded by M0A:

`3436358dcd03d9f9e071d51ea071e0a78c0322e4`

The fork's gameplay source is still equivalent to that baseline at the time of this audit.

## Quantitative snapshot

The 24 non-wiki JavaScript modules under `src/` contain approximately:

- 102,081 lines;
- 21,638 direct `global.*` references;
- 3,390 direct jQuery/DOM/window references.

These counts are simple source-pattern measurements. They are useful as architectural indicators, not as semantic complexity scores.

Largest direct `global.*` concentrations:

| Module | Lines | Direct global refs | DOM/window refs |
| --- | ---: | ---: | ---: |
| `main.js` | 12,996 | 4,773 | 166 |
| `actions.js` | 9,745 | 2,660 | 336 |
| `portal.js` | 9,112 | 2,013 | 282 |
| `space.js` | 8,654 | 1,617 | 428 |
| `truepath.js` | 6,432 | 1,397 | 291 |
| `vars.js` | 2,443 | 1,099 | 35 |
| `races.js` | 9,534 | 1,014 | 51 |
| `tech.js` | 15,726 | 875 | 719 |
| `resources.js` | 3,310 | 782 | 178 |
| `civics.js` | 2,498 | 667 | 114 |

## Import graph

Twenty core gameplay modules form one strongly connected component. In practical terms, most of the gameplay layer participates in circular imports.

The most connected modules are:

| Module | Incoming core imports | Outgoing core imports |
| --- | ---: | ---: |
| `actions.js` | 18 | 19 |
| `races.js` | 21 | 16 |
| `functions.js` | 21 | 15 |
| `portal.js` | 14 | 17 |
| `space.js` | 14 | 15 |
| `governor.js` | 16 | 12 |
| `civics.js` | 16 | 11 |
| `jobs.js` | 15 | 12 |
| `resources.js` | 14 | 11 |

This makes a file-by-file rewrite unsafe. Migration must create new dependency directions and move capabilities across those seams.

## State architecture findings

`vars.js` is much more than a variable module. It currently contains or participates in:

- the mutable `global` root state;
- direct localStorage loading at module initialization;
- seeded and unseeded random helpers;
- approximately 90 historical version migration checks;
- state initialization;
- soft/hard reset behavior;
- UI resize behavior;
- formatting helpers;
- worker/timer state;
- message state;
- transient calculation state.

The serialized save is effectively the implementation object:

`JSON.stringify(global)`

That couples save compatibility to internal object layout.

Whole state domains are also reassigned during reset flows, including `city`, `tech`, `race`, `resource`, `civic`, `space`, `interstellar`, `portal`, `eden`, `tauceti`, queues, settings, prestige-related state, and others.

### Implication

The refactor needs an explicit state model with owned domains and a serializer boundary. Merely hiding `global` behind getters would preserve the core coupling.

## Simulation findings

The worker in `evolve/evolve.js` is primarily a low-drift timer. Actual simulation remains on the main thread.

`main.js` orchestrates three loop frequencies through `execGameLoops()`:

- `fastLoop()`;
- `midLoop()`;
- `longLoop()`.

Approximate source characteristics:

| Loop | Approx. lines | Direct global refs | DOM refs | `production()` calls | `modRes()` calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| fast | 7,252 | 2,362 | 82 | 208 | 211 |
| mid | 3,399 | 1,398 | 34 | 0 | 2 |
| long | 1,335 | 697 | 9 | 0 | 0 |

The loops combine:

- domain simulation;
- caps;
- production;
- resource mutation;
- events;
- deaths;
- markets;
- challenge effects;
- achievements/statistics;
- UI refresh decisions;
- persistence;
- real-clock behavior.

### Implication

The new engine needs a simulation scheduler made of ordered systems. The fast/mid/long cadence may be preserved as compatibility phases initially, but individual systems must become independently testable and must not render UI.

## Production findings

`prod.js` contains a `production(id, val, wiki)` switch with about 87 case labels. The cases are hard-coded vanilla identifiers and some identifiers occur in different contextual branches.

Production is not isolated there, however. `fastLoop()` also performs hundreds of resource calculations and mutations directly.

### Implication

Replacing only `prod.js` would not create a production engine. Production migration must cover:

1. source contributions;
2. consumption;
3. caps;
4. global and contextual multipliers;
5. job/building contributions;
6. race/challenge/government effects;
7. explainable modifier attribution;
8. application of final resource deltas.

## Content definition findings

Evolve is already strongly data-shaped in places, but definitions and runtime behavior are intertwined.

### Technologies

`tech.js` contains roughly 700 entries with recurring fields such as:

- `id`;
- `cost`;
- `reqs`;
- `grant`;
- `effect`;
- category/era metadata.

Many entries also contain executable `condition()`, `action()`, `post()`, or dynamic text functions that directly inspect or mutate `global` and sometimes trigger rendering.

This is a good migration target because the declarative shape already exists, but the callbacks must be replaced by engine conditions/effects/commands.

### Actions and structures

`actions.js` combines:

- content definitions;
- affordability;
- payment;
- structure initialization;
- technology grants;
- queues;
- rendering;
- post-build callbacks;
- progression checks.

Representative action definitions invoke `payCosts($(this)[0])`, mutate `global`, and trigger redraws.

### Resources

`defineResources()` is a recognizable content list, but `loadResource()` is approximately 282 lines and combines:

- state creation;
- defaults;
- race-specific rules;
- presentation;
- DOM/Vue binding.

### Jobs

`defineJobs()` lists jobs cleanly, while `loadJob()` is approximately 194 lines and mixes state initialization, rules, naming, and DOM construction.

### Races and traits

Races, genus definitions, and traits are among the better existing content registries. Traits often expose parameter functions such as `vars()`, but actual trait behavior is scattered throughout every other subsystem as direct conditionals.

### Achievements

Achievement metadata is comparatively clean and can be migrated early. Achievement checking/unlocking behavior is still coupled to global statistics and other systems.

### Events

Events have recognizable `reqs`, `condition`, `type`, and `effect` shapes, but effects mutate state directly and use unseeded random behavior in places.

## Commands and effects findings

Current action execution has no single mutation authority.

For example:

- `payCosts()` directly modifies resources, prestige currencies, supply, population, and job counts;
- `gainTech()` mutates technology and immediately redraws multiple UI regions;
- `postBuild()` mixes grants, UI state, callbacks, and descriptions;
- reset functions award achievements, calculate prestige, rewrite state domains, save, terminate workers, and reload the page.

### Implication

The engine needs:

- commands;
- validation/conditions;
- cost quotes;
- atomic payment;
- effects;
- domain events;
- UI reactions outside the command handler.

## Persistence findings

Persistence is distributed.

Examples include:

- autosave in the long loop;
- direct saves from settings changes;
- direct saves from reset flows;
- import/export in `functions.js`;
- direct load/migrations in `vars.js`.

Import/export and historical migrations operate directly on the legacy object shape.

### Implication

Create a persistence service with:

- save envelope version;
- engine/content identity;
- explicit serializers;
- deterministic migrations;
- legacy Evolve importer;
- backup/recovery;
- mod/content requirements.

Do not delete legacy migration knowledge until historical saves are covered by fixtures.

## Time and randomness findings

The code uses several time/random paths:

- `Date.now()`;
- `new Date()`;
- `performance.now()` in the timer worker;
- seeded `seededRandom()`;
- unseeded `Math.random()` / `Math.rand()`.

### Implication

Simulation code must receive explicit Clock and RNG services. Calendar/seasonal real-world behavior should be modeled as an explicit environment input rather than hidden wall-clock access.

## UI findings

Direct DOM/Vue/jQuery work appears throughout gameplay modules, with especially high concentrations in `tech.js`, `space.js`, `actions.js`, `truepath.js`, and `portal.js`.

The UI often determines or mutates game behavior rather than only presenting state.

### Implication

The target separation is:

```text
UI -> commands -> engine state
UI <- selectors/view models <- engine state
```

Rendering must eventually be replaceable without changing simulation.

## Refactor strategy derived from the audit

### Do not migrate by file

The legacy modules are too cyclic. Instead migrate these architectural capabilities:

1. identity and registries;
2. environment ports;
3. explicit state domains;
4. commands/conditions/effects/costs;
5. calculations/modifiers;
6. deterministic simulation systems;
7. vanilla content families;
8. persistence;
9. UI/application layer;
10. packages and public mod API.

### Use adapters only as temporary scaffolding

A legacy bridge is allowed only when it has:

- a named owner;
- tests;
- a removal milestone;
- no use by third-party mods;
- no expansion after its target domain is migrated.

### Ratchet the legacy architecture downward

CI should eventually enforce declining budgets for:

- direct `global.*` references;
- direct DOM access outside UI/adapters;
- imports from engine into vanilla content/UI;
- circular dependencies;
- direct localStorage access;
- direct wall-clock/random access in simulation.

The goal is zero legacy references in the new engine, followed by deletion of the legacy bridge itself.

## Definition of refactor completion

The core refactor is not complete merely because mods can call an API.

It is complete when:

- vanilla Evolve runs through the new engine contracts;
- `global` is no longer the authoritative game-state model;
- simulation systems do not render UI;
- engine code does not import vanilla content;
- content definitions do not directly mutate state;
- persistence no longer serializes arbitrary runtime implementation state;
- direct localStorage/time/random access is behind ports;
- migrated calculations are explainable;
- the 20-module legacy dependency knot is dismantled;
- old adapters and migrated legacy code paths are deleted.

Only then is the public mod API considered proven by vanilla usage.
