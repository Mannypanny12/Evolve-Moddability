# Evolve Moddability Project

This directory is the design authority for the Evolve Moddability fork.

## Goal

Make Evolve highly moddable without requiring a rewrite and without changing vanilla Evolve behavior unless a change is explicitly designated as a gameplay change.

The target is not a completely game-agnostic engine. The target is an Evolve-derived incremental engine in which a mod author can replace essentially all visible content and progression while reusing the mature simulation, persistence, and incremental-game infrastructure.

## Core rule

> Every architectural refactor must preserve vanilla Evolve behavior unless the change is explicitly designated as a gameplay change.

## Architecture direction

The project moves gradually from direct content-to-global-state coupling toward:

```text
content definitions
      |
      v
content registries
      |
      v
stable mod API
      |
      +-- modifiers
      +-- hooks/events
      +-- declarative effects/conditions
      +-- UI extensions
      +-- namespaced mod storage
      |
      v
Evolve engine/services
```

Vanilla Evolve remains playable throughout the migration.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md): target architecture and boundaries.
- [ROADMAP.md](ROADMAP.md): staged implementation plan.
- [TEST_STRATEGY.md](TEST_STRATEGY.md): regression and characterization testing strategy.
- [MOD_API.md](MOD_API.md): initial public API concepts.
- [MOD_FORMAT.md](MOD_FORMAT.md): package, manifest, dependency, and storage format.
- [TOTAL_CONVERSIONS.md](TOTAL_CONVERSIONS.md): requirements for full content replacement.

## Non-goals for early milestones

Early milestones do not:
- rewrite vanilla content into JSON;
- replace the current UI framework;
- redesign Evolve balance;
- generalize every late-game subsystem immediately;
- expose raw `global` as the public mod API;
- require Android support.

Those can be tackled only after the core registry/API boundary is stable.
