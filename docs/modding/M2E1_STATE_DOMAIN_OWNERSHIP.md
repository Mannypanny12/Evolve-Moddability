# M2E1 State-Domain Ownership

## Purpose

M2E1 turns the M2A GameState ownership law into a machine-checked architecture contract now that M2D has migrated the first real authoritative domain.

M2A states that every authoritative top-level GameState domain must have one explicit engine/domain owner responsible for its schema, invariants, lifecycle/default construction, later mutation authority, and later serialization semantics. M2D proved that pattern with achievements. M2E1 now makes the ownership relationship explicit and fail-closed so later migrations cannot add GameState roots without reviewed ownership.

M2E1 deliberately does not yet police writable-root arrays, mutation-scope IDs, mutation-authority leakage, selector-consumer dependency direction, or integrated architecture reporting. Those belong to M2E2, M2E3, and M2E4 respectively.

## Root metadata versus authoritative domains

Not every GameState root is a gameplay domain.

Current GameState v2 contains:

```text
schemaVersion   GameState root metadata
achievements    authoritative gameplay/meta domain
```

`schemaVersion` is owned by the GameState schema/composition layer and is explicitly classified as metadata. It must not be treated as a normal mutable domain.

`achievements` is the first authoritative domain and is owned by `achievement-state`.

The M2E1 gate requires exact equality between:

```text
actual GAME_STATE_ROOT_FIELDS
        ==
reviewed metadata roots + reviewed authoritative domain roots
```

Therefore a new root cannot appear without a reviewed classification, and a removed root cannot leave stale ownership metadata behind.

## Machine-readable ownership contract

The architecture-owned contract is:

```text
tests/architecture/m2e-state-domain-contract.json
```

It is inert JSON rather than executable production configuration. It is not a public Mod API and is not imported by gameplay code.

Contract version 1 records:

```text
metadataRoots
    schemaVersion
        owner: game-state-schema

domains
    achievements
        owner: achievement-state
        schema module + validator + empty-state factory
        selector module
        mutation-service module + factory
```

The contract is deliberately closed and fail-closed:

- unknown contract fields are rejected;
- malformed owner IDs are rejected;
- `schemaVersion` must remain explicit metadata owned by `game-state-schema`;
- metadata/domain double-classification is rejected;
- module paths must be canonical repository-relative POSIX paths under `src/engine/state/`;
- path traversal, absolute paths, backslashes, outside-layer modules, and non-`.mjs` paths are rejected;
- schema, selector, and mutation-service modules must remain distinct;
- declared symbol names must be JavaScript identifiers.

## Domain-owned defaults

The M2A ownership law includes lifecycle/default construction. Before M2E1, `game-state.mjs` directly constructed the empty achievement value as `{}` even though `achievement-state.mjs` owned the domain schema and invariants.

M2E1 corrects that ownership mismatch by adding:

```js
createEmptyAchievementState()
```

to `achievement-state.mjs`.

`createEmptyGameState()` now assembles the root by calling the domain-owned factory rather than inventing the domain representation itself.

This is behavior-neutral for achievements today, but establishes the scalable rule for later domains:

```text
domain module
    owns schema
    owns validation
    owns empty/default representation

GameState composition
    assembles domains
```

The M2E1 gate executes each declared domain empty factory and proves that:

1. it does not throw;
2. its result passes the declared domain validator;
3. the validator's canonical result equals the factory result;
4. `createEmptyGameState()` contains the same domain value;
5. the GameState factory's root keys exactly match `GAME_STATE_ROOT_FIELDS`.

## Declared domain surfaces

For each authoritative domain, M2E1 records and verifies the existence of three owned surfaces.

### Schema surface

For achievements:

```text
src/engine/state/achievement-state.mjs
    validateAchievementState
    createEmptyAchievementState
```

Both declared exports must exist and be functions.

### Selector surface

For achievements:

```text
src/engine/state/achievement-selectors.mjs
```

The declared selector module must exist and export at least one named function.

M2E1 does not yet enforce that all ordinary readers use this module. M2D4 remains the achievement-specific reader guard, and M2E3 will generalize dependency/read rules.

### Mutation-service surface

For achievements:

```text
src/engine/state/achievement-state-service.mjs
    createAchievementStateService
```

The declared factory must exist and be a function.

M2E1 does not yet prove which writable roots or mutation scopes feed this service. M2E2 will connect the ownership contract to the actual capability graph.

## Architecture gate

The new first-class gate is:

```text
tests/architecture/m2e1-state-ownership-fitness.cjs
```

`npm run test:architecture` now runs M2E1 after the existing M2D3 authority and M2D4 reader gates.

The checker reuses the strict M2C parser for `GAME_STATE_ROOT_FIELDS`; it does not invent a weaker second parser. If the root declaration becomes non-literal or otherwise uninspectable, ownership checking fails closed.

## Adversarial coverage

Dedicated tests prove rejection of:

- unknown top-level contract fields;
- unsupported contract versions;
- missing or incorrectly owned `schemaVersion` metadata;
- `schemaVersion` classified as an authoritative domain;
- malformed owner IDs;
- unknown domain fields;
- duplicate schema/selector/service modules;
- path traversal, absolute paths, backslashes, outside-layer modules, and wrong extensions;
- new unowned GameState roots;
- stale contracted roots;
- duplicate GameState roots;
- uninspectable GameState root declarations;
- missing declared modules;
- missing declared function exports;
- selector modules with no selector functions;
- non-function mutation-service factories;
- domain defaults that violate their validator;
- GameState defaults that diverge from the domain-owned default;
- GameState empty-root drift.

The current repository is also checked through the same complete scanner.

## Non-goals

M2E1 does not:

- migrate another gameplay domain;
- change achievement authority or compatibility behavior;
- change save/load or persistence semantics;
- add serializers or persistence metadata;
- inspect `GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS`;
- inspect mutation-scope IDs or fields;
- expose mutation authority;
- require one owner to own only one root;
- replace M2D3 or M2D4 domain-specific guards;
- add integrated GameState ownership data to `inspect:architecture` yet;
- promise a public Mod API.

## Definition of done

M2E1 is complete when:

1. every actual GameState root is explicitly classified as metadata or authoritative domain;
2. `schemaVersion` is metadata owned by `game-state-schema`;
3. `achievements` is an authoritative domain owned by `achievement-state`;
4. the ownership contract is inert, closed, versioned, and machine-readable;
5. GameState root additions/removals without matching ownership changes fail CI;
6. achievements owns its empty/default state factory;
7. the declared empty domain passes its declared validator and matches GameState composition;
8. declared schema, selector, and mutation-service modules/symbols exist inside the engine state layer;
9. malformed/stale/escaped ownership metadata fails closed;
10. M2E1 is part of `npm run test:architecture`;
11. existing M2C/M2D gates remain intact;
12. full tests, architecture gates, production build, generated-output cleanliness, and real-browser smoke remain green;
13. no gameplay/save/compatibility behavior changes.

M2E2 can then use this contract as the authoritative index for proving that writable roots and mutation scopes grant write capability only to each declared state-domain owner.
