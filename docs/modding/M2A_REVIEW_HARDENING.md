# M2A Review Hardening

## Purpose

This document records the deep-dive review performed after M2A was merged and the bounded hardening completed before M2B begins.

The review re-checked the merged implementation against:

- `M2A_GAME_STATE_SCHEMA.md`;
- the broader engine architecture;
- M0E5 engine architecture gates;
- M1 definition/state separation;
- M2B's upcoming requirements for deterministic snapshots, selectors, mutation authority, and diagnostics.

No gameplay domain or persistence authority is moved by this hardening pass.

## Findings closed

### 1. Shared references could silently change identity semantics

Original M2A rejected cycles but allowed the same object or array instance to appear at multiple state paths. Canonicalization would then create separate detached copies, silently changing object identity relationships.

That ambiguity is now removed.

`GameState` is explicitly a tree:

- cycles are rejected;
- repeated/shared object references are rejected;
- repeated/shared array references are rejected;
- two independent objects with equal values remain valid.

This prevents object identity from becoming hidden gameplay state and makes future M2B snapshots semantically safe.

### 2. Traversal bookkeeping was exposed in the public canonicalizer signature

The original public helper accepted the recursion `WeakSet` as a third argument. That was an implementation detail callers should never control.

The public API is now only:

```js
canonicalizeStateValue(value, path = '<root>')
```

Cycle/reference bookkeeping lives in a private recursive helper using an internal active `WeakSet` and seen-path `WeakMap`.

### 3. GameState schema-version bump policy was underspecified

The design authority now defines when `GAME_STATE_SCHEMA_VERSION` changes.

Incompatible structural or semantic GameState changes require a new version. Store/selectors/diagnostics around an unchanged state representation do not automatically require a bump.

This keeps M2B mechanics separate from state-format evolution and gives M2D/later domain migrations an explicit rule.

### 4. Proxy safety wording overstated what JavaScript reflection can guarantee

Descriptor-based inspection prevents property getters/setters from being invoked, but JavaScript Proxy reflection traps may execute during operations such as own-key or descriptor inspection.

The documentation now states this explicitly. Proxy/reflection failures are converted into structured contract errors, but GameState validation is not presented as a sandbox for untrusted executable Proxy objects.

### 5. Pathologically deep state could escape as a native stack error

M2A now defines:

```js
MAX_GAME_STATE_NESTING_DEPTH = 256
```

Object/array state deeper than that fails as `INVALID_STATE_VALUE` before recursive validation reaches native call-stack exhaustion. The limit is intentionally far beyond any expected gameplay state hierarchy.

### 6. Determinism coverage was narrower than the stated contract

Tests now prove equivalent objects with different insertion order produce identical canonical key order and identical JSON representation, including nested objects inside arrays.

## Additional adversarial coverage

The hardened test suite now covers:

- object and array shared-reference rejection;
- first-path diagnostics for cycles/shared references;
- caller inability to inject traversal bookkeeping;
- explicit nesting-limit failure;
- deterministic canonical output independent of insertion order;
- Proxy reflection execution semantics as distinct from accessor execution;
- existing getter, exotic object, sparse array, hidden field, symbol, non-finite, prototype pollution, hostile Proxy, and revoked Proxy cases.

## Maintainability observation intentionally not refactored

M1 definition validation and M2 state validation contain related descriptor-inspection patterns. The review considered extracting a generic engine plain-data inspection utility.

That refactor is intentionally **not** part of this corrective slice:

- the M1 code is already proven and closed;
- definition semantics and mutable state semantics are not identical;
- only two implementations currently exist;
- refactoring M1 solely for deduplication would enlarge the regression surface without fixing a correctness issue.

If a third contract family needs materially similar reflection logic, extraction should be reconsidered then.

## Behavior boundary

This hardening remains M2A-only:

- no legacy gameplay file changes;
- no `global` synchronization;
- no state store or selector layer;
- no gameplay-domain migration;
- no save-format changes;
- no oracle rebaseline;
- no public Mod API.

## Closure criterion

M2A is ready for M2B once the hardened final head passes the complete existing CI safety net:

- full Node test suite;
- architecture fitness gate;
- production game/wiki build;
- generated-output guard;
- real-browser startup-failure negative control;
- real-browser smoke test.
