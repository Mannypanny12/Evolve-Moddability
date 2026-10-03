# M1D Architecture Inspector and Legacy Bridge

## Purpose

M1D makes the transitional architecture observable without turning compatibility scaffolding into a permanent API.

It adds three internal capabilities:

1. read-only registry/definition inspection;
2. an explicit catalog for legacy-to-engine mappings that cannot be represented by M1A aliases;
3. an architecture report and bridge-specific CI gate.

M1D does **not** introduce `GameState`, does not switch any authoritative gameplay path, and does not expose a public Mod API. Explicit state ownership begins in M2.

## Registry inspector

`src/engine/inspection/registry-inspector.mjs` provides:

- `inspectRegistry(registry)`;
- `inspectRegistries(registries)`;
- `inspectContractError(error)`.

The inspector is read-only. It uses the existing M1A/M1B registry contracts rather than adding diagnostic state or a registry singleton.

Registry snapshots show:

- definition family/type;
- canonical IDs;
- package/source ownership;
- schema version;
- tags;
- legacy aliases;
- definition data.

Snapshots are deterministic and frozen. Diagnostic value projection is fail-safe: opaque definitions and error details are inspected through property descriptors, accessors are not executed, circular references are represented explicitly, and unusual primitive values cannot mask the original diagnostic.

`inspectContractError()` turns `EngineContractError` into a structured diagnostic containing the error code, message, and safe details projection. Ordinary errors are identified as non-contract errors rather than being silently reclassified.

## Alias boundary remains unchanged

M1A aliases remain direct, context-free, one-to-one identity mappings.

For example:

```text
Food -> evolve:resource/food
```

M1D does not broaden aliases to cover state coordinates or context-dependent relationships.

The legacy technology key:

```text
global.tech.primitive
```

is a progression-state coordinate, not a technology identity. Multiple definitions write levels into it:

```text
club          -> primitive 1
bone_tools    -> primitive 2
wooden_tools  -> primitive 2
sundial       -> primitive 3
```

The level-2 definition is context-dependent. Therefore `primitive` must never become a registry alias for one technology.

## Legacy mapping catalog

Temporary mapping metadata lives under:

```text
src/legacy/bridge/**
```

It intentionally lives outside `src/engine/**`.

`LegacyMappingCatalog` validates records with:

- stable internal mapping ID;
- domain;
- engine definition family;
- mapping mode: `direct`, `contextual`, or `composite`;
- explicit legacy state path;
- one or more canonical engine IDs;
- context keys when resolution is contextual/composite;
- owner/package and provenance;
- introduction milestone;
- mandatory removal milestone;
- state-semantics explanation;
- source locations.

Registration is atomic. Malformed records, wrong-family canonical targets, duplicate values, unknown fields, sparse arrays, invalid lifecycle metadata, and duplicate mapping IDs fail before the mapping is committed.

The catalog stores metadata only. It does not read or mutate legacy state.

## Seeded mappings

M1D deliberately seeds only representative mappings rather than bulk-converting content.

### Food runtime-state bucket

```text
mapping:       evolve.resource.food_state
legacy path:   global.resource.Food
canonical ID:  evolve:resource/food
mode:          direct
remove by:     M6B
```

This describes the temporary relationship between the legacy runtime-state bucket and the canonical resource definition. It does not replace the existing direct `Food` registry alias.

### Primitive technology progression

```text
mapping:       evolve.technology.primitive_progression
legacy path:   global.tech.primitive
canonical IDs: club, bone_tools, wooden_tools, sundial
mode:          contextual
remove by:     M6E
```

The mapping explicitly records relevant context keys and is source-backed by characterization coverage against the current legacy technology definitions.

## Bridge quarantine

`tests/architecture/legacy-bridge-fitness.cjs` establishes a dedicated M1D architecture boundary.

Bridge code may depend only on:

```text
src/legacy/bridge/**
src/engine/**
```

Bridge code may not directly use:

- legacy `global`;
- top-level legacy gameplay modules such as `vars.js`, `tech.js`, or `main.js`;
- DOM/window/navigator/jQuery/Vue;
- localStorage or legacy save transport;
- wall-clock APIs;
- random sources;
- console diagnostics;
- timers/schedulers;
- CommonJS escape hatches.

Bridge-local cycles are rejected.

Existing M0E5/M1C rules already enforce the other direction:

- `src/engine/**` cannot import the bridge because engine imports may not escape the protected engine tree;
- `src/platform/**` may depend only on platform/engine layers and therefore cannot import the bridge.

The bridge stores legacy paths as inert metadata. Future M2/M6 adapters must receive legacy state/context explicitly rather than importing the legacy singleton into the bridge.

## Removal rules

Every bridge mapping must declare a concrete `removeBy` milestone.

Rules:

1. the bridge is internal migration scaffolding, never public Mod API;
2. no mapping exists without source/provenance and removal metadata;
3. characterization or differential coverage must exist before a mapping participates in behavior migration;
4. once a domain becomes authoritative in the new engine, new features may not add dependencies on its legacy mapping;
5. the domain migration slice deletes obsolete mappings/adapters as part of its completion gate;
6. M9C is the hard backstop: the legacy bridge must be deleted.

Current seeded removal targets are:

```text
Food state mapping             -> M6B resources/crafting/trade
primitive progression mapping  -> M6E technologies/progression graph
```

## Architecture report

Run:

```text
npm run inspect:architecture
```

The report reuses the existing M0E5 and M1C scanners rather than implementing competing source metrics.

It shows:

- current legacy architecture counters;
- legacy module count;
- largest strongly connected component and its members;
- protected engine/platform/bridge file counts;
- seeded legacy mappings and removal milestones;
- any architecture-gate violations.

The existing M0E5 baseline remains the single authority for downward-ratcheting legacy counters.

## Tests

M1D coverage includes:

- deterministic registry inspection;
- ownership, family, alias, tag, schema and definition visibility;
- frozen inspector output;
- safe opaque/accessor definition inspection without executing getters;
- structured contract-error diagnostics with circular/unusual values;
- mapping contract validation;
- family mismatch rejection;
- contextual mapping requirements;
- duplicate mapping rejection and atomicity;
- seeded lifecycle/removal metadata;
- source-backed characterization of the `primitive` technology progression relationship;
- bridge import-direction negative controls;
- direct legacy/platform dependency negative controls;
- bridge cycle rejection;
- current-repository bridge fitness.

`npm run test:architecture` now runs the M0E5 engine/legacy gate, the M1C platform gate, and the M1D bridge gate.

## Explicit non-goals

M1D does not:

- create `GameState`;
- create selectors or mutation authority;
- read/write `global` through a generic path API;
- translate complete legacy state into engine state;
- change save format;
- migrate technology/resource runtime behavior;
- bulk-register vanilla content;
- introduce package loading;
- expose public mod diagnostics;
- reduce or rebaseline gameplay oracle snapshots.

Actual state translation begins only after M2 establishes explicit state ownership. Domain-specific bridge behavior is then temporary and deleted during its migration wave.

## Acceptance gate

M1D is complete when:

1. registered definitions, owners, aliases and family information can be inspected without mutating registries;
2. contract failures have a safe structured diagnostic projection;
3. contextual legacy relationships are explicit catalog records rather than magical aliases;
4. every bridge mapping has owner/provenance/removal metadata;
5. architecture counters are inspectable through the existing authoritative scanners;
6. engine and platform code cannot import the bridge;
7. bridge code cannot import/access legacy gameplay or platform state directly;
8. bridge cycles fail CI;
9. source-backed characterization proves the representative contextual mapping;
10. no gameplay source, save format, authoritative state path, or oracle baseline changes.
