# M2D2b1 Achievement Runtime Capability

## Purpose

M2D2b1 wires the first real writable GameState domain without yet implementing achievement mutations or changing legacy authority.

The slice proves the composition/capability boundary required by M2B:

- `achievements` becomes an internally writable GameState root;
- `createGameStateStore()` remains the same read-only facade;
- a new `createGameStateRuntime()` composition point retains the generic mutation authority only long enough to mint one dedicated achievement scope;
- the scope owns only the `achievements` root;
- an achievement-domain service receives that already-scoped capability;
- neither the read store nor the domain service exposes raw transaction or scope-minting authority.

M2D2b1 deliberately does not implement an achievement mutation operation. That begins in M2D2b2.

## Composition

The GameState store infrastructure is now configured with:

```text
writableFields = ['achievements']
```

This does not make normal store consumers writable.

`createGameStateStore(initialState)` still returns only the M2B read facade:

```text
read
select
snapshot
getRevision
getLastChange
```

It does not expose:

```text
mutationAuthority
createMutationScope
transaction
set
patch
```

The new composition point is:

```text
createGameStateRuntime(initialState)
```

It creates the same store infrastructure, retains the internal `mutationAuthority`, and mints exactly one scope:

```text
id: achievement-state
fields: ['achievements']
```

That scope is immediately handed to `createAchievementStateService()`.

The runtime exposes only:

```text
{
    store,
    achievements,
}
```

Both the runtime and the returned achievement service are frozen.

## Achievement service shell

`src/engine/state/achievement-state-service.mjs` is introduced in this slice as a capability boundary, not yet as a mutation API.

The factory verifies that the supplied scope:

- uses scope ID `achievement-state`;
- owns exactly one root, `achievements`;
- provides a transaction function.

The returned service intentionally exposes no methods in M2D2b1.

This means the generic store transaction capability cannot leak merely because the first writable GameState root now exists. M2D2b2 can add only achievement-specific operations such as advancement/removal while keeping the raw scope private.

## Authority status

M2D2b1 does **not** change production gameplay authority.

Legacy remains authoritative for achievements:

```text
src/achieve.js
src/vars.js
```

No hydration, projection, dual write, legacy-affix translation, `unlockAchieve()` replacement, aggregate reconciliation, save migration, or gameplay-reader migration is part of this slice.

The new runtime is currently isolated engine infrastructure only.

## Tests

Dedicated M2D2b1 coverage proves:

1. `createGameStateStore()` preserves its read-only surface;
2. `createGameStateRuntime()` returns only `store` and `achievements`;
3. the runtime's store exposes no mutation authority, scope factory, or raw transaction;
4. the achievement service is frozen and exposes no raw mutation primitive;
5. the achievement service rejects a scope with the wrong ID;
6. the achievement service rejects scopes owning roots beyond `achievements`;
7. the achievement service rejects a capability without a transaction function;
8. independent runtimes own independent stores/services;
9. selectors continue to operate normally through the runtime store;
10. initial revision remains zero and committed state remains deeply frozen.

The existing M0/M1/M2 safety net remains required.

## Deferred to M2D2b2

M2D2b2 will add the actual domain mutations behind the already-established boundary:

- monotonic base-rank advancement;
- monotonic universe-rank advancement;
- zero-valued record/track creation semantics;
- explicit universe-rank removal;
- rich frozen mutation results;
- one transaction/revision for combined base + universe changes;
- no-op and rollback semantics.

The raw mutation scope must remain private when those methods are added.

## Definition of done

M2D2b1 is complete when:

1. `achievements` is writable only in the internal GameState infrastructure configuration;
2. `createGameStateStore()` remains read-only and API-compatible;
3. `createGameStateRuntime()` mints the single dedicated achievement scope;
4. the achievement service accepts only that capability shape;
5. no generic write authority escapes the composition boundary;
6. no legacy production file changes;
7. dedicated tests and the complete CI regression stack are green.
