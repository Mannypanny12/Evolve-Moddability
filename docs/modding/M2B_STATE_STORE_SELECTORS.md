# M2B State Store and Selectors

## Purpose

M2B introduces the first controlled runtime container for engine-owned `GameState` without moving any gameplay authority out of legacy `global` yet.

The slice establishes:

- deeply read-only committed state;
- synchronous selector access;
- explicit scoped mutation authority;
- atomic validated transactions;
- deterministic detached snapshots;
- deterministic revision/change diagnostics;
- rollback and reentrancy rules suitable for later commands/effects/domain services.

M2B deliberately does not add a gameplay domain. The real `GameState` root remains the M2A V1 shape and therefore has no writable gameplay root fields yet.

## Store contract

`createStateStore()` is the generic internal primitive. It receives:

- `initialState`;
- a synchronous `validateState(value)` function;
- the explicit set of top-level fields that may ever be exposed through mutation scopes.

Construction validates and canonicalizes the input, detaches it from the caller, and deeply freezes the committed representation.

The primitive returns two deliberately separate capabilities:

```text
{
    store,
    mutationAuthority,
}
```

The read-side `store` exposes only:

```text
read()
select(selector, ...args)
snapshot()
getRevision()
getLastChange()
```

The separate internal `mutationAuthority` exposes:

```text
createMutationScope({ id, fields })
```

Consumers that only need reads/selectors must receive only `store`. The ability to mint mutation scopes is retained by the composition/domain-bootstrap layer and handed out as already-scoped capabilities to the systems that own those writes.

There is intentionally no generic `set(path, value)`, `patch(object)`, mutable `getState()`, arbitrary diff application API, or write-authority factory on the normal read facade.

## Read-only committed state

`read()` returns the current committed state object.

The returned tree is deeply frozen. Callers therefore cannot mutate authoritative state through a retained object reference.

Object-reference stability is not an engine contract. Consumers must reason about state values and canonical IDs, not JavaScript object identity.

This rule is compatible with future structural-sharing optimizations: M2B defines immutability and atomicity, not a permanent cloning algorithm.

## Selectors

`select(selector, ...args)` invokes a synchronous selector against the frozen committed state.

Selectors:

- may read state;
- may return primitives or derived/view-model data;
- may not mutate committed state;
- may not start a transaction while selection is active;
- may not mint mutation scopes while selection is active;
- must be synchronous.

Declared `async` selectors are rejected before invocation. A synchronous selector that returns a Promise or thenable is rejected as well.

M2B intentionally does not add selector registries, memoization, dependency graphs, or presentation-specific view-model machinery. Those can be layered on only when real consumers justify them.

Cross-domain engine code should increasingly prefer selectors/queries over object reach-through as domains are migrated.

## Mutation scopes

Mutation authority is explicit and top-level scoped.

A store infrastructure instance is configured with a closed list of writable root fields. The retained `mutationAuthority` may then create a named scope containing a subset of those fields:

```js
const { store, mutationAuthority } = createStateStore(...);

const resourcesAuthority = mutationAuthority.createMutationScope({
    id: 'resource-system',
    fields: ['resources'],
});
```

The normal read-side `store` does not expose `createMutationScope()`.

Rules:

1. scope IDs are unique per store infrastructure instance;
2. a scope must contain at least one field;
3. every field must be declared writable by the store configuration;
4. undeclared/reserved roots cannot be acquired merely by naming them;
5. the mutation draft exposes only the roots owned by that scope;
6. multiple explicitly owned roots may be combined in one scope for future atomic cross-domain operations;
7. scopes may not be created while a selector or transaction is active.

This is capability separation, not just naming discipline. Code that receives only the read facade cannot manufacture new write authority later.

The real M2B `GameStateStore` configures **zero writable roots** because M2A V1 contains only `schemaVersion`. `schemaVersion` is not normal mutation state. `createGameStateStore()` returns only the read facade and discards the unused mutation-authority capability.

M2D or a later domain migration will extend the GameState schema and create the first real domain authority in the appropriate composition layer. That authority can then be passed specifically to the owning domain service or command path.

This avoids inventing fake state merely to exercise the store and avoids turning possession of the general store into blanket write permission.

## Transaction model

A scoped transaction follows this lifecycle:

```text
frozen committed state
        |
        v
detached mutable candidate
        |
        v
scope-only draft passed to mutator
        |
        v
full candidate validation/canonicalization
        |
        v
scope-escape verification
        |
        +---- failure -> discard candidate; old state unchanged
        |
        v
deep-freeze canonical candidate
        |
        v
atomic committed-state replacement
```

The mutator must be synchronous and return `undefined`.

Declared `async` mutators are rejected before invocation. A non-async callback that returns any value, including a Promise/thenable, is rejected without commit.

This synchronous callback contract is an API boundary, not a JavaScript sandbox: arbitrary callback code could schedule unrelated future work. Such work does not gain access to committed mutable state through the transaction draft, because the draft is detached and never becomes the committed object.

A transaction that throws, produces invalid state, violates scope, attempts reentrancy, tries to mint authority while active, or otherwise fails leaves:

- committed state unchanged;
- revision unchanged;
- last committed diagnostic unchanged;
- mutation-scope registration unchanged.

The candidate is canonicalized into a new committed tree before publication. Therefore a mutator retaining a draft reference cannot mutate committed state after the transaction finishes.

## Validation remains authoritative

M2B does not duplicate domain invariants inside the transaction layer.

Every candidate must pass the configured state validator before commit. For `GameState`, that means the complete M2A contract remains in force, including rejection of:

- non-finite numbers;
- accessors;
- exotic prototypes;
- sparse/extra arrays;
- cycles;
- repeated/shared object references;
- over-deep state;
- unknown GameState fields and unsupported schema versions.

Validation may canonicalize representation, but it may not use that ability to mutate fields outside the transaction's owned roots. M2B compares the final validated result against the previous committed state and rejects any top-level change outside the scope.

That scope-escape check is important preparation for later domain validators and atomic commands.

## Reentrancy rules

M2B keeps state access deliberately single-phase:

- transactions may not nest;
- transactions may not start while a selector is active;
- selectors may not run while a transaction is active;
- mutation scopes may not be created while a selector or transaction is active;
- selector nesting for read-only composition is permitted.

This avoids stale reads, partially observed candidates, and capability-registration changes escaping a failed transaction before M3 introduces command orchestration.

## Snapshots

`snapshot()` returns a detached, canonical, deeply frozen copy of the current committed state.

A snapshot is:

- deterministic;
- safe to retain for tests/inspection;
- independent of the live committed object;
- governed by the M2A GameState value contract.

A snapshot is **not**:

- a persistence/save envelope;
- a legacy `global` export;
- a state replacement API;
- a patch format.

M7 owns persistence semantics.

The legacy M0 oracle canonicalizer is intentionally not reused for production GameState snapshots. The oracle can represent legacy `undefined`/non-finite oddities for observation, while new GameState rejects those values by contract.

## Revision and change diagnostics

The store starts at revision `0`.

A successful state-changing transaction increments the revision exactly once. A no-op transaction does not increment it.

Successful commits produce an immutable diagnostic containing:

- `committed`;
- `revisionBefore`;
- `revisionAfter`;
- `scopeId`;
- transaction `label`;
- deterministic ordered `changes`.

Each change contains:

```text
path
kind = add | remove | replace
```

Paths use escaped JSON Pointer-style notation so content IDs and other keys containing `/` or `~` remain unambiguous.

These records are diagnostic observations only. They are **not JSON Patch**, are not guaranteed to be a minimal edit script, and must not be replayed to mutate state. Array changes in particular describe deterministic before/after differences, not patch semantics.

M2B intentionally exposes no `applyDiff()` or reverse-patch mechanism, because that would recreate arbitrary-path mutation authority.

The store retains only the most recent committed diagnostic. Long-lived trace/history tooling belongs to later developer-tooling milestones.

No wall-clock timestamp is embedded in change diagnostics; revision/order is deterministic and platform-independent.

## Current implementation strategy and future optimization

M2B uses detached canonical candidates and whole-state validation to make atomicity and rollback simple and explicit.

As real state grows and M4/M5 introduce high-frequency simulation, profiling may justify structural sharing, copy-on-write, domain-local validation, or another optimization.

Any such optimization must preserve the M2B observable contract:

- committed state remains read-only;
- read-side consumers cannot mint write authority;
- failed work cannot leak partial mutation or scope registration;
- scopes cannot write unowned roots;
- snapshots/diagnostics remain deterministic;
- callers receive no promise of stable object identity.

Correctness is the initial priority; the implementation strategy is not frozen as public API.

## GameState integration

`createGameStateStore(initialState)` is the thin M2B integration point.

It uses:

- `validateGameState` as the validator;
- the existing M2A root/schema version;
- no writable gameplay roots yet;
- only the read-side facade from the generic store infrastructure.

Therefore after M2B:

- legacy `global` is still authoritative for all gameplay;
- no gameplay reads from the new store;
- no gameplay writes to the new store;
- GameState consumers cannot mint mutation scopes;
- no `GameState`/`global` synchronization exists;
- save/load/reset flows remain unchanged.

M2D will prove the migration pattern by adding and migrating the first real state domain and deliberately creating its owning mutation authority in the composition layer.

## Architecture boundary

Production implementation remains under:

```text
src/engine/state/
```

It inherits the existing zero-budget engine restrictions:

- no legacy/global dependency;
- no legacy bridge dependency;
- no platform/browser/DOM dependency;
- no direct storage;
- no direct time/random access;
- no first-party content dependency.

M2B introduces no public Mod API promise.

## Tests

M2B regression coverage includes:

- detached/deeply frozen committed state;
- separate read facade and mutation-authority capability;
- real `GameStateStore` exposing no authority factory;
- read-only selector behavior;
- selector/transaction/scope-creation reentrancy rejection;
- declared-async selector/mutator rejection before invocation;
- Promise/thenable selector-result rejection;
- detached deterministic snapshots;
- successful atomic scoped commit;
- deterministic JSON Pointer add/remove/replace ordering and `/`/`~` escaping;
- deterministic array diagnostics;
- no-op revision behavior;
- rollback after thrown mutators;
- rollback after invalid candidate state;
- retained-draft isolation;
- nested transaction rejection;
- duplicate/forbidden mutation scopes;
- no leaked scope IDs from failed/reentrant scope creation;
- validator-induced scope escape rejection;
- prototype-shaped field safety;
- transaction-level rejection of cycles, shared references, accessors, exotic objects, sparse/extra arrays, hostile proxies, non-finite values, and excessive depth;
- real GameState integration with zero premature gameplay authority.

The complete M0/M1/M2A architecture, build, simulation, oracle, and browser safety net remains required.

## Deliberately deferred

M2B does not implement:

- settings/UI/transient-state separation (M2C);
- the first authoritative gameplay-domain migration (M2D);
- the expanded mutation/selector CI architecture gate (M2E);
- commands/conditions/effects/costs (M3);
- subscriptions/domain events;
- selector memoization/view models;
- persistence/save serialization;
- public mod state access;
- long-lived state trace/history;
- optimized high-frequency mutation internals.

## Definition of done

M2B is complete when:

1. committed state cannot be mutated through public read references;
2. synchronous selectors can query state without obtaining or minting write authority;
3. mutation-authority creation is separate from the normal read facade;
4. all writes require an explicit named mutation scope supplied by retained internal authority;
5. transactions are detached, validated, scope-checked, and atomic;
6. failed transactions leave state/revision/diagnostics/scope registration unchanged;
7. snapshots are deterministic, detached, and immutable;
8. state-changing commits produce deterministic observational revision/change diagnostics;
9. nested/async/reentrant mutation and authority-minting paths fail closed;
10. real GameState gains no invented domain or premature gameplay authority;
11. schema version/save/oracle/legacy behavior remains unchanged;
12. dedicated M2B unit/hardening tests and the complete existing CI safety net are green.
