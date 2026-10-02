# Evolve Engine Refactor and Modding Project

This directory is the design authority for the Evolve Moddability fork.

## Goal

Refactor Evolve completely into a clean, modular incremental-game engine while preserving vanilla behavior during migration.

Vanilla Evolve will be migrated onto the same engine capabilities later exposed to mods. Legacy adapters are temporary scaffolding, not the final architecture.

The end state is:

```text
platform/browser
      |
application + UI
      |
engine
|-- state
|-- commands
|-- conditions/effects
|-- calculations/modifiers
|-- simulation
|-- events
|-- persistence
|-- registries
      |
      +-- first-party Evolve content
      +-- external content/mods
      +-- total conversions
```

## Core rules

1. Preserve vanilla behavior unless a change is explicitly designated as gameplay-changing.
2. New engine code must not depend on legacy `global`, DOM structure, or vanilla content IDs.
3. Vanilla must eventually use the same content/engine mechanisms available to mods.
4. Adapters must have explicit deletion milestones.
5. Do not freeze a public Mod API until vanilla has exercised the internal engine contracts.
6. Every migrated slice ends by deleting or shrinking the old path.
7. Keep the game buildable and preferably playable throughout migration.

## Documents

- [FULL_REFACTOR_AUDIT.md](FULL_REFACTOR_AUDIT.md): code-driven architectural audit and migration implications.
- [ARCHITECTURE.md](ARCHITECTURE.md): target engine architecture and dependency rules.
- [ROADMAP.md](ROADMAP.md): staged full-refactor roadmap.
- [TEST_STRATEGY.md](TEST_STRATEGY.md): regression, differential, architecture, and migration testing.
- [MOD_API.md](MOD_API.md): public API direction after internal contracts are proven.
- [MOD_FORMAT.md](MOD_FORMAT.md): package, manifest, dependency, and storage format.
- [TOTAL_CONVERSIONS.md](TOTAL_CONVERSIONS.md): total-conversion certification requirements.
- [BACKLOG.md](BACKLOG.md): current implementation sequence and issue mapping.
- [BASELINE.md](BASELINE.md): reproducible M0A baseline.

## Non-goals for early milestones

Early milestones do not:

- redesign vanilla balance;
- bulk-convert every definition to JSON;
- replace the UI framework in one shot;
- expose raw `global` to mods;
- promise long-term compatibility for internal migration adapters;
- package Android before persistence/package semantics stabilize;
- perform a big-bang rewrite.

The refactor is incremental, but the destination is not incremental: the legacy architecture is intended to be removed.
