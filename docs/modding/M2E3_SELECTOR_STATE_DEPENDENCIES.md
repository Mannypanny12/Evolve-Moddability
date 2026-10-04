# M2E3 Selector and State-Layer Dependency Enforcement

## Purpose

M2E3 closes the read-side and dependency-graph half of the M2 state boundary.

M2E1 established machine-readable ownership for every authoritative GameState domain. M2E2 proved that write capabilities are minted only by reviewed composition and flow only into their owning semantic mutation services. M2E3 now enforces the corresponding read architecture:

- authoritative domain reads are exposed through reviewed semantic selectors;
- selector modules may inspect only their own GameState root;
- selector export surfaces are closed and machine-reviewed;
- schema, selector, mutation-service, store, and composition modules obey an explicit acyclic dependency direction;
- ordinary production code cannot construct or import raw GameState composition directly;
- the existing legacy achievement adapter remains a narrow, explicit migration/projection exception until the bridge is retired.

M2E3 does not migrate another gameplay domain and does not change gameplay, persistence, save compatibility, or runtime behavior.

## Selector surface contract

The machine-readable selector API review lives in:

```text
tests/architecture/m2e3-selector-surface-contract.json
```

Its domain set must exactly match the authoritative domains declared by:

```text
tests/architecture/m2e-state-domain-contract.json
```

For the current achievement domain the reviewed selector surface is:

```text
achievementLevel
achievementRank
achievementTotalRank
achievementUniverseLevel
achievementUniverseRank
hasAchievement
hasAchievementUniverseRank
```

Adding or removing a selector therefore requires an explicit architecture-contract change rather than silently widening the read API.

The selector contract is parsed through the strict JSON parser established in M2E1, so duplicate semantic object keys and trailing JSON content fail closed.

## Selector-module rules

Each authoritative domain has exactly one selector module declared by M2E1.

A selector module:

- exports only reviewed named functions;
- exposes no default export, wildcard export, re-export, class, constant, or raw state object;
- takes `gameState` as the first parameter of each reviewed selector;
- may statically import only engine identity helpers, shared state primitives, and its own domain schema;
- may not dynamically load dependencies;
- may not depend on state-store infrastructure, GameState composition, mutation services, legacy bridge code, runtime/platform services, or another domain implementation;
- may directly inspect only its own authoritative GameState root;
- may not read GameState metadata such as `schemaVersion` as domain data;
- may not choose a GameState root dynamically;
- may not alias or destructure the whole `gameState` object before property access.

These constraints make a selector a semantic query over already-supplied authoritative state rather than a second hidden orchestration layer.

## State-layer dependency DAG

M2E3 derives state-module roles from the M2E1 ownership contract and enforces the following direction:

```text
identity / shared state primitives
        |
        +--> domain schema
        |       |\
        |       | \
        |       v  v
        |   selectors   mutation service
        |                   |
        +--> state store     |
                 \           /
                  \         /
                   v       v
                 GameState composition
```

The detailed rules are:

### Shared state primitives

`common.mjs` is a bottom-layer primitive and may not depend upward on domain/state composition modules.

### State store

`state-store.mjs` may depend on shared state primitives but remains domain-neutral.

### Domain schema

A schema may depend on shared state primitives but not on selectors, mutation services, GameState composition, the store, or another domain implementation.

### Domain selectors

Selectors may depend only on shared state primitives and their own schema.

### Domain mutation services

Mutation services may depend only on shared state primitives and their own schema. They may not depend on selectors, GameState composition, store infrastructure, or another domain implementation.

### GameState composition

`game-state.mjs` may depend on shared state primitives, the generic store, domain schemas, and domain mutation services. It may not depend on selector modules.

This prevents the new engine state layer from growing a cyclic dependency knot while legacy cycles are being dismantled.

## Cross-domain reads

M2E3 deliberately keeps domain-local selectors domain-local.

A selector for one domain may not directly read another authoritative GameState root or import another domain's selector/schema/service implementation. Future legitimate cross-domain queries should live in an explicit query/read-model or orchestration layer rather than turning domain selectors into a sideways dependency graph.

M2E3 does not invent that future layer prematurely.

## Raw GameState read/composition boundary

M2B deliberately keeps `read()`, `select()`, and `snapshot()` on the read-side store facade. M2E3 therefore does not globally ban raw read methods.

Instead, it prevents ordinary production modules from importing GameState composition directly.

The only current production exception is:

```text
src/legacy/bridge/achievement-state-adapter.mjs
```

That adapter may import only:

```text
GAME_STATE_SCHEMA_VERSION
createGameStateRuntime
```

from `game-state.mjs`.

The exception exists for the already-reviewed compatibility responsibilities of:

- legacy save hydration after historical migrations;
- synchronous one-way compatibility projection back to `global.stats.achieve`;
- mutation projection/rollback orchestration.

It is not a general gameplay read API. M2D4 remains cumulative and continues to force ordinary achievement gameplay/wiki consumers through the semantic achievement reader facade and `store.select()`.

## Current production impact

The current production graph already satisfies the intended M2E3 architecture:

- `achievement-selectors.mjs` reads only `GameState.achievements` and imports only its own schema/shared primitives;
- `achievement-state-service.mjs` depends only on its own schema/shared primitives;
- `state-store.mjs` is domain-neutral;
- `game-state.mjs` composes schema/store/mutation service and imports no selectors;
- ordinary achievement consumers already use the M2D4 read facade;
- raw GameState composition is confined to the legacy achievement adapter.

Therefore M2E3 is an architecture/tests/docs slice and requires no gameplay production refactor.

## Adversarial coverage

The M2E3 tests cover at minimum:

- stale or incomplete selector-domain contracts;
- nondeterministic/duplicate/invalid selector declarations;
- extra selector-module exports;
- cross-domain GameState root reads;
- metadata-root reads from domain selectors;
- bracket and optional-chain root syntax;
- dynamic GameState root selection;
- simple whole-state aliasing and destructuring;
- comments/string decoys;
- cross-domain selector dependencies;
- selector-to-mutation-service dependencies;
- actual repository compliance.

The production fitness gate additionally validates real module paths, rejects selector-module symlink traversal, restricts selector dependencies to static imports, and preserves the narrow GameState composition exception.

## Deliberately deferred

M2E3 does not implement:

- cross-domain query/read-model architecture;
- selector memoization;
- presentation view models;
- public mod selector APIs;
- persistence serialization or M7 save envelopes;
- M8 UI projection architecture;
- M11 whole-state inspection/debug tooling;
- integrated M2 architecture reporting and closure review, which belongs to M2E4.

## Definition of done

M2E3 is complete when:

1. every M2E1 authoritative domain appears exactly once in the selector-surface contract;
2. every selector module exposes exactly its reviewed semantic selector functions;
3. selector modules use only static imports of identity/shared primitives and their own schema;
4. selectors may directly inspect only their own authoritative GameState root;
5. dynamic, metadata, aliased, or cross-domain GameState-root reach-through fails closed;
6. schema, selector, mutation-service, store, shared-state, and composition modules obey the reviewed state-layer dependency DAG;
7. the generic state store remains domain-neutral;
8. GameState composition remains selector-free;
9. ordinary production modules cannot import raw GameState composition;
10. the achievement adapter remains the sole reviewed transitional composition exception and cannot widen to `createGameStateStore()`;
11. M2D3/M2D4 and all M2E1/M2E2 gates remain cumulative;
12. no gameplay/save/persistence/oracle behavior changes are required;
13. the complete unit, architecture, build, generated-output, and real-browser CI safety net remains green.
