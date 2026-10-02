# M1A Identity and Registry Kernel

## Purpose

M1A creates the first protected engine primitive: stable content identity and a deterministic registry for static definitions.

It does **not** migrate gameplay content, create runtime state, expose a public Mod API, or change vanilla behavior.

## Canonical identity

Engine-visible content uses:

```text
namespace:type/local_id
```

Examples:

```text
evolve:resource/food
evolve:technology/agriculture
warcraft:unit/footman
evolve:structure/space/mars/mining_outpost
```

The local portion may contain slash-separated path segments so later content families are not forced into a flat namespace.

### Grammar

- namespace: `[a-z][a-z0-9_-]*`
- type: `[a-z][a-z0-9_-]*`
- each local-ID segment: `[a-z0-9][a-z0-9_-]*`

Parsing is strict. Identity code does not trim, lowercase, rewrite, or otherwise normalize input.

Consequently, strings such as `Evolve:resource/food`, `evolve:resource/Food`, or strings with surrounding whitespace are invalid rather than silently corrected.

Canonical identity remains a string. `parseContentId()` returns an immutable descriptor containing the canonical string and its namespace, type, and local ID.

## Registry contract

A registry is created for exactly one content family:

```js
const resources = new Registry({ type: 'resource' });
```

It may register only canonical IDs whose type component is `resource`.

A registry entry contains:

```text
id
owner
schemaVersion
tags
aliases
definition
```

### Ownership

M1A records:

- `owner.packageId`
- `owner.source`

The package ID uses namespace syntax. M1A deliberately does not yet enforce that the canonical ID namespace equals the owner package ID. Cross-package ownership and extension policy belongs to later package/content-contract work.

### Schema version

`schemaVersion` must be a positive safe integer.

M1A stores the version but does not interpret the definition schema. M1B owns definition-family validation.

### Definition

The definition is opaque to M1A.

The registry does not inspect it and M1A does not deep-freeze it. This avoids accidentally defining M1B's definition lifecycle early.

### Immutable identity metadata

The registered entry, owner metadata, tag list, and alias list are frozen copies. Callers cannot mutate canonical identity or ownership after registration.

This immutability applies to registry/identity metadata, not to gameplay state.

## No mutable gameplay state

Registries own static content definitions and identity only.

They must not contain session/save values such as:

- resource amount or capacity;
- structure count;
- technology owned level;
- achievement unlocked state;
- queue progress;
- transient calculations.

Those values belong to the explicit state architecture introduced in M2.

The registry is therefore not a replacement wrapper around legacy `global`.

## Duplicate policy

Canonical registration is append-only in M1A.

A second registration of the same canonical ID fails with `DUPLICATE_CONTENT_ID`.

There is no registry `replace`, `delete`, or `clear` operation. Future extension/override semantics must be explicit rather than emerging from silent replacement.

Registration validates the complete record before mutating registry maps, so validation or alias-collision failure cannot leave a partial registration behind.

## Legacy aliases

Legacy identifiers exist only as migration aliases.

Representative current forms include:

```text
Food
Helium_3
tech-agriculture
mass_extinction
```

These conventions are inconsistent across legacy families, so aliases are scoped to an individual registry rather than stored in one global alias table.

Normal canonical lookup never resolves aliases:

```js
resources.get('evolve:resource/food'); // canonical lookup
resources.get('Food');                 // invalid content ID
```

Legacy translation must be explicit:

```js
resources.resolveAlias('Food'); // -> evolve:resource/food
```

This makes every legacy-boundary crossing visible in code.

Alias rules:

- non-empty exact strings only;
- no trimming or normalization;
- a canonical content ID cannot be registered as a legacy alias;
- duplicate aliases inside one registration fail;
- one registry cannot map the same alias to two canonical IDs;
- separate registries may independently use the same legacy string.

## Lookup behavior

For canonical lookup:

- malformed IDs are validation errors;
- IDs of the wrong content family are type errors;
- a valid but unregistered ID returns `undefined` from `get()`;
- `require()` converts the valid-but-missing case into `UNKNOWN_CONTENT_ID`.

This keeps malformed identity separate from ordinary absence.

## Deterministic iteration

Registry iteration is sorted by canonical ID using code-unit string ordering.

It does not depend on JavaScript `Map` insertion order or package registration order.

The following are deterministic:

- `ids()`;
- `entries()`;
- the registry iterator.

This is important for reproducible tests, diagnostics, validation, and later package loading.

## Structured errors

Engine contract failures use `EngineContractError` with stable error codes.

Current M1A codes include:

- `INVALID_CONTENT_ID`
- `INVALID_NAMESPACE`
- `INVALID_CONTENT_TYPE`
- `INVALID_LOCAL_ID`
- `INVALID_REGISTRY_ENTRY`
- `REGISTRY_TYPE_MISMATCH`
- `DUPLICATE_CONTENT_ID`
- `INVALID_OWNER`
- `INVALID_SCHEMA_VERSION`
- `INVALID_TAG`
- `INVALID_LEGACY_ALIAS`
- `DUPLICATE_LEGACY_ALIAS`
- `UNKNOWN_CONTENT_ID`

Human-readable messages remain diagnostic, while tools can rely on the code.

## Module boundary

M1A engine code lives in:

```text
src/engine/identity.mjs
src/engine/registry.mjs
```

The dependency direction is:

```text
identity.mjs
     ^
     |
registry.mjs
```

There are no engine cycles.

The `.mjs` extension lets the new engine use native ESM in Node tests without changing the legacy repository-wide CommonJS package configuration.

## Architecture constraints

The existing M0E5 fitness gate applies to these files.

M1A engine code therefore has zero direct dependency on:

- legacy `global`;
- DOM, window, jQuery, Vue, or browser globals;
- localStorage or legacy save storage;
- wall-clock time;
- random sources;
- first-party vanilla source outside `src/engine/**`;
- CommonJS `require()`.

M1A is not imported into the running game yet, so it has no gameplay effect.

## Tests

M1A unit coverage verifies:

- valid canonical parsing and formatting;
- nested local paths;
- no identity normalization;
- malformed-ID rejection;
- immutable parsed descriptors;
- typed registry enforcement;
- immutable registry metadata;
- duplicate canonical rejection;
- owner/schema/tag validation;
- explicit legacy alias resolution;
- alias collision handling and transactional failure;
- registry-scoped aliases;
- canonical IDs forbidden as aliases;
- valid-missing versus malformed lookup behavior;
- deterministic iteration independent of registration order;
- absence of silent replacement/removal operations.

The normal repository test suite discovers these tests, and M0E5 independently enforces the engine dependency and cycle rules.

## Explicit non-goals

M1A does not:

- convert any vanilla resource, technology, achievement, or other content;
- define resource/achievement/technology schemas;
- create `GameState`;
- store mutable save state;
- create Clock/RNG/Storage/Logger ports;
- create the legacy bridge;
- create package manifests/dependency resolution;
- define cross-package overrides/extensions;
- expose a public Mod API;
- alter saves or gameplay.

Those responsibilities remain in their later milestones.
