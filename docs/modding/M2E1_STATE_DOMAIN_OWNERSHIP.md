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
- declared symbol names must be JavaScript identifiers;
- duplicate JSON object keys are rejected before normal `JSON.parse()` semantics can silently keep the last value;
- declared module paths may not traverse symbolic links or resolve outside the engine-state layer.

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
3. the validator returns a canonical value rather than `undefined`;
4. the validator's canonical result equals the factory result;
5. `createEmptyGameState()` contains the same domain value;
6. the GameState factory returns a plain object whose root keys exactly match `GAME_STATE_ROOT_FIELDS`;
7. the complete empty GameState passes `validateGameState()` and is already in canonical form.

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

The composition checker additionally requires `game-state.mjs` to statically import both declared symbols from the declared schema module. `createEmptyGameState()` must initialize the root directly through the declared empty-state factory, and `validateGameState()` must call the declared validator. A manifest entry therefore cannot point at an unused decoy module that happens to expose matching names and values.

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

The declared factory must exist and be a function. `game-state.mjs` must statically import it from the declared module and `createGameStateRuntime()` must call it, which binds the manifest surface to the actual composition path without yet inspecting writable-root or scope semantics.

M2E1 does not yet prove which writable roots or mutation scopes feed this service. M2E2 will connect the ownership contract to the actual capability graph.

## Architecture gate

The new first-class gate is:

```text
tests/architecture/m2e1-state-ownership-fitness.cjs
```

`npm run test:architecture` now runs M2E1 after the existing M2D3 authority and M2D4 reader gates.

The checker reuses the strict M2C parser for `GAME_STATE_ROOT_FIELDS`; it does not invent a weaker second parser. If the root declaration becomes non-literal or otherwise uninspectable, ownership checking fails closed.

## Post-implementation review hardening

An adversarial review after the first green M2E1 implementation found several cases where the original checker could report a stronger guarantee than it actually proved.

### Undefined and null default sentinels

The first implementation used `undefined` and `null` as internal control sentinels. That allowed a domain empty factory returning `undefined`, or `createEmptyGameState()` returning `null`, to skip part of the intended validation path. The checker now tracks successful factory execution separately from the returned value, so those values are inspected rather than mistaken for “not executed.”

### Complete GameState default validation

The first implementation compared root keys and domain values but did not run the assembled default through `validateGameState()`. A wrong metadata value such as an invalid `schemaVersion` could therefore escape the ownership-specific checks even though ordinary engine tests would likely catch it elsewhere. M2E1 now independently proves that the complete assembled default is valid and canonical.

### Decoy ownership modules

The manifest originally proved that declared schema/service modules existed and exported the requested symbols, but it did not prove that GameState composition actually used those declared modules. A contract could point at an unused decoy module while `game-state.mjs` continued using another implementation.

M2E1 now parser-checks GameState composition. The declared schema factory/validator and mutation-service factory must be static named imports from the declared module paths, and the relevant composition functions must actually call those imported symbols. The empty-state root initialization is additionally pinned directly to the declared domain factory.

### Duplicate JSON keys

Normal `JSON.parse()` silently keeps the last occurrence of a duplicate object key. That is undesirable for an architecture authority file because a visually duplicated `domains`, `owner`, or nested field could be interpreted differently than a reviewer expects. The contract reader now performs a strict recursive JSON key scan, including escaped key spellings such as `"owner"` versus `"\u006fwner"`, before parsing the document normally.

### Filesystem aliases

Lexical path validation alone did not prevent a reviewed-looking path under `src/engine/state/` from being a symbolic link to another file. The checker now rejects symlink traversal, resolves declared modules to real paths, verifies containment in the real engine-state directory, and ensures schema/selector/service paths resolve to three distinct real files.

These corrections remain architecture-only. No achievement gameplay, compatibility, mutation, save, or persistence behavior changes were needed.

## Adversarial coverage

Dedicated tests prove rejection of:

- unknown top-level contract fields;
- unsupported contract versions;
- duplicate semantic JSON keys, including escaped spellings;
- missing or incorrectly owned `schemaVersion` metadata;
- `schemaVersion` classified as an authoritative domain;
- malformed owner IDs;
- unknown domain fields;
- duplicate schema/selector/service modules;
- path traversal, absolute paths, backslashes, outside-layer modules, wrong extensions, and symlink traversal;
- new unowned GameState roots;
- stale contracted roots;
- duplicate GameState roots;
- uninspectable GameState root declarations;
- missing declared modules;
- missing declared function exports;
- decoy schema modules not wired into GameState composition;
- hard-coded GameState domain defaults that duplicate rather than call the owner factory;
- selector modules with no selector functions;
- non-function mutation-service factories;
- `null` GameState defaults;
- invalid complete GameState metadata/defaults;
- `undefined` domain defaults;
- validators returning `undefined`;
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
- police ordinary selector consumers beyond the existing M2D4 achievement-specific reader guard;
- add integrated GameState ownership data to `inspect:architecture` yet;
- promise a public Mod API.

## Definition of done

M2E1 is complete when:

1. every actual GameState root is explicitly classified as metadata or authoritative domain;
2. `schemaVersion` is metadata owned by `game-state-schema`;
3. `achievements` is an authoritative domain owned by `achievement-state`;
4. the ownership contract is inert, closed, versioned, strict-JSON, and machine-readable;
5. GameState root additions/removals without matching ownership changes fail CI;
6. achievements owns its empty/default state factory and GameState composition directly uses it;
7. the declared empty domain passes its declared validator and matches GameState composition;
8. the complete empty GameState passes `validateGameState()` canonically;
9. declared schema, selector, and mutation-service modules/symbols exist inside the real engine state layer;
10. GameState composition is statically wired to the declared schema and mutation-service surfaces;
11. malformed/stale/escaped/aliased ownership metadata fails closed;
12. M2E1 is part of `npm run test:architecture`;
13. existing M2C/M2D gates remain intact;
14. full tests, architecture gates, production build, generated-output cleanliness, and real-browser smoke remain green;
15. no gameplay/save/compatibility behavior changes.

M2E2 can then use this contract as the authoritative index for proving that writable roots and mutation scopes grant write capability only to each declared state-domain owner.
