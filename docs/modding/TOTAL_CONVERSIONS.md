# Total Conversion Requirements

## Definition

A total conversion replaces the normal visible game content/progression while reusing the refactored engine and selected generic services.

Under the full-refactor architecture, total conversion support is not achieved by placing a shell around hard-coded vanilla systems. It is achieved because vanilla itself has already been moved out of the engine core.

## Architectural prerequisite

Before total-conversion certification:

- engine core must not import vanilla Evolve content;
- content identity must be namespaced;
- start state must be content-defined;
- navigation must be content/application-defined;
- persistence must record active content/packages;
- simulation/calculation systems must not assume specific Evolve IDs;
- vanilla must load through the same registration/engine boundaries available to other content.

The first-party Evolve package is therefore the primary proof that the engine/content split works.

## Required conversion control

A total conversion needs control over:

- start state;
- resources/currencies;
- population/factions/races;
- jobs/units;
- structures;
- technology/progression graph;
- commands/actions;
- achievements;
- challenges;
- calculations/modifiers;
- events;
- top-level navigation;
- reset/prestige paths;
- localization;
- assets;
- package-specific save data.

## Engine services a conversion may reuse

Examples:

- state store;
- command bus;
- conditions/effects;
- cost engine;
- queues;
- simulation scheduler;
- offline progression;
- modifier/calculation engine;
- event bus;
- statistics;
- achievements;
- persistence;
- localization;
- numeric formatting;
- generic combat services where suitable.

A conversion should not be forced to load a vanilla content module merely to obtain a generic service.

## First-party modules

Vanilla Evolve may be internally organized into optional content modules such as:

- evolution;
- civilization;
- space/interstellar;
- portal/hell;
- Eden;
- Tau Ceti/Truepath.

A conversion with no vanilla base simply does not register those modules.

This is different from disabling hard-coded engine branches after startup.

## Manifest direction

Example concept:

```json
{
  "id": "example",
  "type": "total_conversion",
  "base": null,
  "start": "example:start/default",
  "navigation": [
    "example:view/settlement",
    "example:view/army",
    "example:view/world"
  ]
}
```

Exact schema waits for M10+ package work.

## Save compatibility

A total-conversion save records:

- conversion/package identity;
- package versions or compatibility constraints;
- engine/save schema;
- required dependencies.

Loading without required content must fail safely or enter explicit recovery tooling. It must never reinterpret a conversion save as vanilla.

## Certification scenario

M13 should use a deliberately small test conversion.

Suggested scope:

- two resources;
- one population type;
- three or four structures;
- one job/unit production path;
- a short technology graph;
- one event;
- one modifier;
- one reset/progression step;
- custom navigation.

It must:

1. boot without visible vanilla progression;
2. run normal simulation/offline progression;
3. save and reload;
4. expose its own content/navigation;
5. use only public content/engine APIs;
6. require no edits to first-party Evolve source;
7. report missing/incompatible dependencies clearly.

The point is architectural proof, not building a second full game during certification.
