# M2E3 Review Hardening

## Purpose

This note records the adversarial review performed after the first green M2E3 selector/state-dependency implementation.

The review did not uncover a production gameplay defect. It uncovered two false positives in the first checker implementation and several architecture-gate escape routes that were worth closing before M2E3 could be considered complete.

No production engine, legacy gameplay, save, persistence, or UI behavior changed during the review.

## 1. Import-parser boundary correction

### Problem

The first compatibility-adapter named-import check used a multiline regular expression whose capture could begin at an earlier unrelated `import { ... }` declaration and continue until the GameState import.

That made the checker report unrelated identity imports as though they were imported from `game-state.mjs`.

### Correction

M2E3 now parses each static named import as one closed import declaration, then resolves its individual module specifier before comparing bindings.

The reviewed achievement adapter GameState import remains exactly:

```text
GAME_STATE_SCHEMA_VERSION
createGameStateRuntime
```

Aliases, extra bindings, dynamic references, query/fragment spellings, and noncanonical module references fail closed.

An adversarial regression test places an unrelated named import immediately before the GameState import and proves it cannot be swallowed into the same declaration.

## 2. Whole-state alias false-positive correction

### Problem

The first alias detector treated a legal owned-root read such as:

```text
const record = gameState.achievements[id]
```

as though it were:

```text
const state = gameState
```

because it matched only the `= gameState` prefix.

### Correction

The base gate now distinguishes immediate property access from a bare whole-state assignment.

Regression coverage proves that direct owned-root reads remain legal while bare and parenthesized whole-state aliases remain forbidden.

## 3. Query/fragment module disguises

Relative module references are canonicalized for architecture matching with query and fragment suffixes removed.

This prevents references such as:

```text
./achievement-state.mjs?raw
../../engine/state/game-state.mjs#alias
```

from evading dependency classification.

Selector modules and the reviewed compatibility GameState import must use canonical specifiers without such suffixes.

## 4. Realpath and symlink dependency resolution

### Problem

A lexical dependency graph can be fooled when a harmless-looking path is a filesystem alias for a forbidden module.

For example, a composition module could import:

```text
./selector-alias.mjs
```

where that path is a symbolic link to an owned selector module.

### Correction

The M2E3 review-hardening gate resolves local module references to their real files and maps those files back to their declared architecture roles.

The DAG is therefore enforced against both lexical paths and real filesystem identity.

The same rule protects the raw GameState composition boundary. Ordinary production source cannot reach `game-state.mjs` through a symlink or equivalent local filesystem alias.

The achievement compatibility adapter must use the canonical GameState path.

## 5. Exact dependency allowlists for every state role

### Problem

Checking only dependencies between already-known state roles leaves an indirect tunnel:

```text
schema -> unclassified helper -> selector
```

or:

```text
schema -> unrelated engine runtime service
```

The first edge does not point directly at a known forbidden role, so a role-to-role-only graph is insufficient.

### Correction

Every reviewed state role now has a complete dependency allowlist:

```text
common
    -> engine identity

state store
    -> engine identity
    -> state common

domain schema
    -> engine identity
    -> state common

domain selectors
    -> engine identity
    -> state common
    -> own domain schema

domain mutation service
    -> engine identity
    -> state common
    -> own domain schema

GameState composition
    -> engine identity/shared state primitives
    -> state store
    -> declared domain schemas
    -> declared domain mutation services
```

References must be static imports with canonical specifiers. Bare packages, dynamic imports, query/fragment aliases, hidden engine modules, and other unreviewed dependencies fail closed.

## 6. No unclassified production state modules

Every JavaScript module under:

```text
src/engine/state/**
```

must now correspond to a reviewed state-layer role derived from the M2E ownership contract plus the explicit shared/store/composition modules.

This prevents a new helper module from becoming an undeclared routing layer around selector or mutation boundaries.

When a genuinely new shared state role is needed later, its architecture meaning must be added deliberately rather than appearing silently.

## 7. Whole-GameState forwarding through local helpers

### Problem

Direct root scanning alone can be bypassed by renaming a helper parameter:

```text
function leak(state) {
    return state.resources;
}

export function achievementQuery(gameState) {
    return leak(gameState);
}
```

The cross-domain access no longer contains the identifier `gameState` at the point of property access.

### Correction

M2E3 now treats possession of the whole `gameState` value as a reviewed flow.

A selector may:

- receive `gameState` as the first parameter of a named selector/helper function;
- immediately inspect an owned property on that value;
- pass it as the first argument to a locally declared named helper whose own first parameter is also `gameState`.

It may not:

- return the whole state;
- store it in another variable/object/array;
- forward it into a renamed helper parameter;
- forward it as a later argument;
- pass it to an opaque/imported/arrow-function consumer.

This keeps the own-root analysis inspectable without building a full JavaScript data-flow compiler into the architecture gate.

## 8. Raw achievement snapshot escape hatch

The legacy achievement adapter still exports `achievementStateSnapshot()` for reviewed compatibility/test responsibilities.

M2E3 now explicitly forbids production adapter consumers from using that raw snapshot escape hatch. Ordinary achievement reads continue through the semantic reader facade and `store.select()` as required by M2D4.

This rule is cumulative with M2D3's closed adapter-consumer set and M2D4's closed reader facade.

## 9. Hydration bind result must remain ignored

`bindLegacyAchievementState(...)` returns a snapshot for compatibility/testing, but production `vars.js` must not turn that return value into a new raw GameState read path.

M2E3 therefore requires the current production hydration/rebind calls to remain standalone calls:

```text
bindLegacyAchievementState(global);
bindLegacyAchievementState(gameState);
```

Assigning or returning the bind result fails the architecture gate.

## Final review result

After hardening, M2E3 enforces all of the following cumulatively:

1. authoritative domains and selector modules come from the M2E1 ownership contract;
2. selector surfaces are explicit, closed, deterministic, and strict-JSON backed;
3. selector modules read only their own GameState root;
4. whole-state forwarding cannot hide cross-domain reads behind renamed local helpers;
5. state-role dependencies use exact canonical allowlists;
6. filesystem aliases are resolved to real architecture roles;
7. every production state module has a reviewed role;
8. raw GameState composition remains confined to the reviewed compatibility adapter;
9. the compatibility adapter cannot be used as a raw snapshot read API by production consumers;
10. legacy hydration cannot expose its returned snapshot as normal runtime state;
11. M2D3, M2D4, M2E1, and M2E2 remain cumulative;
12. no production behavior or persistence semantics changed.

M2E4 remains responsible for integrating the M2C/M2D/M2E architecture checks into the final architecture report and performing the complete M2 closure audit.
