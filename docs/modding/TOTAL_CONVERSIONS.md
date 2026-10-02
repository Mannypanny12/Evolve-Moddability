# Total Conversion Requirements

## Definition

A total conversion is a mod/package set that can replace essentially all visible Evolve content and progression while reusing the underlying incremental engine and selected shared services.

The goal is not that every vanilla subsystem must first become generic. Vanilla-only modules may be disabled or omitted by the conversion.

## Required capabilities

A practical total conversion needs control over:
- start state;
- resource set;
- population/factions/races;
- buildings/structures;
- jobs;
- technology/progression graph;
- actions;
- achievements;
- challenges;
- production/capacity/cost modifiers;
- events;
- top-level navigation;
- reset/prestige paths;
- localization and assets;
- save namespace/profile requirements.

## Optional reuse

A conversion may reuse engine services without using corresponding vanilla content.

Examples:
- queues;
- offline progression;
- numeric formatting;
- save compression;
- statistics infrastructure;
- achievement infrastructure;
- modifier engine;
- wiki generation;
- combat framework, if suitable.

## Vanilla module exclusion

Rather than forcing every vanilla subsystem to become generic immediately, total-conversion mode may allow packages to disable content modules such as:
- evolution;
- vanilla city progression;
- vanilla space;
- portal/hell;
- Eden;
- Tau Ceti.

The underlying engine services can remain loaded if reused.

## Content roots

A total conversion manifest should eventually be able to declare its own progression roots, for example:

```json
{
  "type": "total_conversion",
  "baseContent": false,
  "start": "example:start",
  "navigation": ["example:settlement", "example:army", "example:world"]
}
```

Exact schema is deferred until M10.

## Compatibility

A save created under a total conversion records the required conversion package/version constraints.

Loading without the required conversion should fail safely or enter an explicit recovery path. It must not silently reinterpret state as vanilla Evolve.

## Success test

The M10 milestone is complete when a demonstration total conversion can:
1. boot without requiring visible vanilla progression;
2. define its own resources, buildings, jobs, technology graph, and start state;
3. persist and reload;
4. run through the normal tick/offline framework;
5. expose its own top-level UI;
6. use hooks/modifiers without patching vanilla source files;
7. report missing dependencies and incompatible saves clearly.

The demonstration content should be small. The purpose is to prove the architecture, not to build a full game during M10.
