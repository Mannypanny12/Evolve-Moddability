# M2D2b1 Achievement Runtime Capability

## Purpose

M2D2b1 wires the first real writable GameState domain without yet implementing achievement mutations or changing legacy authority.

The slice proves the composition/capability boundary required by M2B:

- the ordinary `createGameStateStore()` path remains read-only both at its public facade and in its underlying writable-root configuration;
- a new `createGameStateRuntime()` composition point opts into the `achievements` writable root;
- that runtime retains the generic mutation authority only long enough to mint one dedicated achievement scope;
- the scope owns only the `achievements` root;
- an achievement-domain service receives that already-scoped capability;
- neither the read store nor the domain service exposes raw transaction or scope-minting authority.

M2D2b1 deliberately does not implement an achievement mutation operation. That begins in M2D2b2.

## Composition

There are now two deliberately different internal store configurations.

`createGameStateStore(initialState)` uses:

```text
writableFields = []
```

and returns only the M2B read facade:

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

Keeping the underlying compatibility/read path at zero writable roots is intentional least privilege. It means the old convenience constructor does not merely discard a capable mutation authority; its store infrastructure cannot mint a gameplay mutation scope in the first place.

The new composition point is:

```text
createGameStateRuntime(initialState)
```

It alone uses:

```text
writableFields = ['achievements']
```

and mints exactly one scope:

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

The factory accepts a closed plain options object and verifies that the supplied scope shape:

- is a plain object with only `id`, `fields`, and `transaction` data fields;
- uses scope ID `achievement-state`;
- owns exactly one root, `achievements`;
- represents its field list as inert state data;
- provides a transaction function.

Accessor-backed option/scope fields are rejected without invoking the accessor. Extra string or symbol fields and exotic prototypes are rejected. Throwing proxy inspection fails closed with the domain capability error.

The validation is structural, not a cryptographic/authentication mechanism. The actual authority is the transaction closure minted by `createStateStore()`: a counterfeit object can imitate the shape but cannot thereby gain access to a real GameState transaction. Runtime composition supplies the real scope and never exposes it afterward.

The returned service intentionally exposes no methods in M2D2b1.

This means the generic store transaction capability cannot leak merely because the first writable GameState runtime now exists. M2D2b2 can add only achievement-specific operations while keeping the raw scope private.

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
10. initial revision remains zero and committed state remains deeply frozen;
11. malformed service options fail with the domain error rather than native destructuring errors;
12. option/scope accessors are rejected without getter execution;
13. extra fields, symbol fields, exotic prototypes, malformed field arrays, and throwing proxies fail closed;
14. service construction never executes the supplied transaction function.

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

1. the ordinary `createGameStateStore()` path has zero writable roots and remains API-compatible;
2. `createGameStateRuntime()` is the only GameState composition path that opts into the `achievements` writable root;
3. the runtime mints the single dedicated achievement scope;
4. the achievement service validates a closed dedicated capability shape without invoking accessor-backed fields;
5. no generic write authority escapes the composition boundary;
6. malformed/fake capability shapes cannot escalate authority and fail closed where inspection is unsafe;
7. no legacy production file changes;
8. dedicated tests and the complete CI regression stack are green.
