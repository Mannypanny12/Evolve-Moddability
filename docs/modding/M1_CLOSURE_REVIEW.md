# M1 Closure Review

## Scope

This review audits M1A through M1D as one architectural unit before M2 begins.

The review checks:

- implementation against `ROADMAP.md`, `ARCHITECTURE.md`, and the individual M1 design notes;
- cross-slice consistency between identity, definitions, runtime ports, inspection, and the legacy bridge;
- hostile/adversarial contract inputs;
- one-way dependency enforcement;
- temporary-bridge lifecycle guarantees;
- source-backed assumptions used by transitional mappings.

The review deliberately does **not** introduce M2 state architecture, migrate gameplay behavior, change saves, rebaseline simulation oracles, or expose a public Mod API.

## M1A: identity and registry kernel

### What was already solid

M1A already provided:

- strict canonical IDs;
- typed registries;
- deterministic iteration;
- explicit direct legacy aliases;
- append-only registration;
- atomic validation before mutation;
- immutable identity/owner/tag/alias metadata;
- structured engine contract errors;
- zero-legacy engine architecture enforcement.

### Closure hardening

The closure audit found that some outer registry/identity metadata was still read using ordinary JavaScript property access or iteration. A hostile accessor could therefore execute while an otherwise data-only contract was being validated.

Hardening now makes those boundaries inert:

- `formatContentId()` reads components through property descriptors and rejects accessor-backed components;
- registry options and registration metadata are descriptor-read rather than getter-read;
- owner metadata must use own enumerable data fields;
- tag/alias arrays must be dense data arrays and may not use accessor-backed items or extra/symbol fields;
- `EngineContractError` diagnostic details are snapshotted without invoking accessors;
- diagnostic function-name formatting is fail-safe.

The original M1A design note also contained stale wording saying namespace/owner equality was still deferred. M1B had already closed that deferral, so the M1A design authority now reflects the current contract.

## M1B: definition contracts

### What was already solid

M1B was the strongest pre-existing M1 slice and required no production-schema redesign.

The audit confirmed:

- closed definition contracts;
- no mutable runtime/save state in definitions;
- descriptor-based hostile-object rejection;
- deep detached immutable canonical output;
- schema-version checks;
- atomic registry integration;
- source-backed vanilla characterization;
- technology progression coordinates kept separate from aliases.

### Closure hardening

The main M1B issue was documentation semantics rather than behavior. Namespace equality had been described too strongly as if it reserved/authenticated a package namespace.

The design authority now states the precise boundary:

```text
canonical namespace == declared owner.packageId
```

is a record-consistency rule only. Real package authentication, namespace reservation, trust, dependencies, and extension policy remain later package-loader work.

Registry-side hostile metadata hardening from the M1A closure also strengthens M1B because every family registry passes through the same metadata boundary before definition validation.

## M1C: runtime environment ports

### Audit result

M1C did not require production changes in this closure pass.

The audit confirmed the engine-side runtime contracts remain deliberately narrow and validated:

- Clock returns a finite number;
- RNG returns a finite value in `[0, 1)`;
- Storage is string-only and async at the contract boundary;
- Logger validates level/message shape;
- composed runtime environments are explicit and frozen;
- browser primitives live outside `src/engine/**`;
- deterministic test adapters exist;
- engine code is guarded from direct clock/random/storage/console/timer/platform access.

Browser adapters remain platform adapters, not engine contracts. Their current injection/fallback behavior is appropriate for M1 and does not justify pulling M2-style state or application configuration into the engine.

### Closure hardening

No runtime-port API was expanded. Instead, the architecture tests now explicitly pin an important cross-M1 invariant:

- engine cannot import the legacy bridge;
- platform cannot import the legacy bridge.

This turns an implied consequence of existing scanners into a named regression test.

## M1D: architecture inspector and legacy bridge

### Findings

The deepest remaining hardening work was in M1D.

The audit found:

1. bridge documentation said imports were limited to bridge/engine, but the gate allowed bare/package imports;
2. mapping lifecycle fields were syntactically validated but could point backwards or beyond the M9C bridge-deletion milestone;
3. a `direct` mapping could still carry contextual keys;
4. context keys were not required to be explicit legacy state paths;
5. accessor-backed mapping arrays could execute during validation;
6. two records could independently claim the same legacy path;
7. mapping lookup IDs were not validated at the API boundary;
8. registry/error inspection still had several hostile-value cases where diagnostic code could throw;
9. the seeded `primitive` mapping contained `kindling_kindred`, which affects Wooden Tools presentation but does not resolve which definition writes the shared progression level.

### Closure hardening

The bridge is now materially stricter:

- every import must be relative and resolve inside `src/legacy/bridge/**` or `src/engine/**`;
- bare/package imports, including renamed UI packages and Node built-ins, fail architecture fitness;
- direct mappings must target exactly one canonical ID and have no context keys;
- contextual/composite mappings require explicit `global.*` context paths;
- mapping arrays must be dense data arrays and cannot execute accessors;
- `removeBy` must be later than `introducedIn`;
- `removeBy` cannot exceed M9C;
- only one mapping record may own a legacy path;
- mapping lookup IDs are validated;
- registry/error inspection uses descriptor-based fail-safe projection for hostile values;
- explicit negative controls pin engine -> bridge and platform -> bridge rejection.

The `global.tech.primitive` mapping is now pinned to the real legacy resolution inputs:

```text
global.race.evil
global.race.gravity_well
global.race.soul_eater
global.tech.transport
```

A source-backed characterization test reads the actual `bone_tools`, `wooden_tools`, and `sundial` conditions in `src/tech.js`. If those conditions drift, the transitional mapping metadata must be reviewed rather than silently becoming stale.

## Cross-M1 invariants after closure

After this hardening pass, M1 establishes these invariants for M2 to build upon:

1. engine content identity is canonical, typed, deterministic, and independent of legacy identifiers;
2. direct aliases remain one-to-one identity translation only;
3. validated definitions are detached immutable static data, not runtime state;
4. engine runtime dependencies are explicit Clock/RNG/Storage/Logger ports;
5. browser implementations stay outside the engine;
6. `src/engine/**` remains a zero-legacy, zero-platform dependency zone;
7. the legacy bridge is outside the engine and cannot pull in legacy gameplay, platform dependencies, arbitrary packages, or cycles;
8. engine/platform cannot depend back on the bridge;
9. transitional legacy mappings are observable, validated, source-backed where seeded, and carry enforceable deletion deadlines;
10. no M1 primitive owns authoritative mutable gameplay state.

## Deliberately deferred

The audit does not pull later work forward.

Still deferred as designed:

- explicit `GameState`, ownership, selectors, and mutation authority: M2;
- command/condition/effect/cost execution: M3;
- calculation/modifier engine: M4;
- deterministic new-system simulation scheduling: M5;
- domain/content migration and authoritative cutovers: M6;
- new persistence format: M7;
- UI/application separation: M8;
- bridge deletion and legacy decommission: M9;
- package identity/authentication/dependencies and public Mod API: M10.

## M1 closure gate

M1 is considered closed when the hardened branch proves all of the following together:

- complete Node test suite passes;
- M0E5 engine/legacy architecture gate passes;
- M1C platform/runtime architecture gate passes;
- M1D bridge architecture gate passes;
- adversarial M1 closure tests pass;
- source-backed primitive mapping characterization passes;
- production game/wiki build passes;
- generated-output guard passes;
- browser startup-failure negative control passes;
- real-browser smoke passes;
- no gameplay source, save format, authoritative state, or oracle baseline was changed by the closure pass.

Once those gates are green, M2A can begin from a materially cleaner boundary rather than carrying M1 contract debt forward.
