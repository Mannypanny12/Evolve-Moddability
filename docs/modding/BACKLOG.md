# Refactor Backlog

GitHub Issues #2 through #9 track the original M0/M1 implementation work. Post-M0 audit completion work is tracked by M0E (#16) and its bounded slices #17-#21. The roadmap targets a full engine refactor rather than a permanent wrapper around legacy Evolve.

See [ROADMAP.md](ROADMAP.md) for the complete M0-M14 plan.

## M0: Safety and reproducibility

### M0A - Reproducible upstream baseline ([#2](../../issues/2)) - complete

Established exact baseline, locked build, CI, and build-tooling correction.

### M0B - Characterization test harness ([#3](../../issues/3)) - complete

Add a test environment able to control:

- storage/localStorage replacement;
- legacy state loading;
- clock;
- RNG;
- worker/timer behavior;
- minimal DOM shims only where legacy code requires them.

Initial characterization targets should include a resource mutation/cost behavior and one progression behavior.

### M0C - Representative state/save fixtures ([#4](../../issues/4)) - complete

Fixture coverage expands to include:

- evolution;
- early city;
- pre-industrial;
- industrial;
- space;
- interstellar;
- portal/hell;
- late game;
- multiple reset tiers;
- active challenge;
- multiple race/trait profiles;
- queue/power/crafting states.

### M0D - Deterministic differential simulation ([#5](../../issues/5)) - complete

Run controlled legacy loop steps and capture normalized state.

The harness must be capable of comparing a future new-system implementation against legacy behavior.

## M1: Engine kernel and seams

### M1A - Identity and registry kernel ([#6](../../issues/6))

Implement:

- namespaced IDs;
- registry primitive;
- source/package ownership;
- duplicate detection;
- legacy aliases;
- deterministic lookup/iteration;
- validation.

This is an internal engine primitive, not yet a public Mod API.

### M1B - Definition contracts and namespace rules ([#7](../../issues/7))

Define:

- `evolve` namespace reservation;
- content ID grammar;
- immutable identity;
- definition/state separation;
- initial schemas for low-risk content such as achievements/resource metadata/basic technology metadata;
- explicit extension/override policy deferred until needed.

### M1C - Runtime environment ports ([#8](../../issues/8))

Introduce testable interfaces for:

- Clock;
- RNG;
- Storage;
- Logger/diagnostics.

Browser implementations adapt current platform behavior. New engine code uses ports instead of direct globals/platform calls.

### M1D - Legacy bridge and architecture inspector ([#9](../../issues/9))

Provide:

- registry/definition inspection;
- ownership and aliases;
- legacy mapping inspection;
- architecture diagnostics;
- temporary controlled bridge to legacy state where needed.

Document removal rules for every adapter.

## Immediate sequence

```text
M0A complete
   |
M0B harness - complete
   |
M0C fixtures - complete
   |
M0D deterministic differential simulation - complete
   |
M0E refactor safety-net completion - in progress
   |
M0E1 authoritative state/canonical safety - complete
   |
M0E2 inspectable frozen oracle snapshots - current
   |
M0E3 fixture hydration/oracle matrix
   |
M0E4 real-browser smoke
   |
M0E5 architecture/CI guardrails
   |
M1A identity/registry - next after M0E
   |
M1B definition contracts
   |
M1C environment ports
   |
M1D bridge/inspector
   |
M2 explicit GameState
```

Do not jump directly to mod loading, total conversions, or bulk content conversion. Those would lock in legacy assumptions before the engine is ready.

## Later milestones

- M2 explicit state architecture;
- M3 commands/conditions/effects/costs;
- M4 calculation/modifier engine;
- M5 deterministic simulation;
- M6 vanilla migration waves;
- M7 persistence v2;
- M8 UI/application separation;
- M9 legacy decommission + first-party Evolve package;
- M10 package loader + public Mod API;
- M11 Mod Manager/developer tooling;
- M12 authoring tools;
- M13 total-conversion certification;
- M14 Android.

## Definition of done for a migration slice

A subsystem is not considered migrated merely because an adapter exists.

A slice is done when:

1. legacy behavior is characterized;
2. new engine behavior is tested;
3. differential comparison passes;
4. authoritative reads/writes use the new path;
5. save implications are handled;
6. architecture metrics improve or stay within ratchet;
7. the obsolete legacy path or adapter is removed, or a specific next removal slice is recorded.
