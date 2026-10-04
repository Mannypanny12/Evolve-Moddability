# M2D2b1 Review and Hardening

## Purpose

This pass reviews the M2D2b1 achievement runtime/capability composition before any real achievement mutation methods are added in M2D2b2.

The review remains inside the D2b1 boundary:

- no achievement `advance()` operation;
- no universe-rank removal operation;
- no legacy hydration or projection;
- no `src/achieve.js`, `src/vars.js`, `src/main.js`, or `src/resets.js` changes;
- no production achievement authority cutover.

The goal is to make the capability wiring itself strong enough that D2b2 can safely place real writes behind it.

## Review result

The original D2b1 architecture was directionally correct. The read store did not expose write authority, the runtime minted a scope owning only `achievements`, and the service exposed no raw scope.

Two hardening gaps were found.

### 1. Service capability validation was accessor-permissive

The original `createAchievementStateService()` destructured its options and then inspected `mutationScope.id`, `.fields`, and `.transaction` through ordinary property access.

That meant a malformed caller could supply accessor-backed properties whose getters executed during validation. It also accepted extra own fields and exotic object prototypes as long as the expected properties looked right.

This did not grant GameState write authority, because a real transaction closure was still required to mutate a real store, but it was weaker than the inert/fail-closed contract already established elsewhere in the engine.

The service boundary now:

- accepts a closed plain options object containing only `mutationScope`;
- reads fields through property descriptors rather than ordinary property access;
- requires enumerable data fields;
- rejects extra string and symbol fields;
- rejects exotic prototypes;
- canonicalizes the scope's `fields` list through the M2 state-data rules;
- wraps malformed field-list state as the domain capability error;
- fails closed when proxy inspection throws;
- never executes the supplied transaction function merely to validate it.

Accessor getters are therefore rejected without being invoked.

### 2. The compatibility/read-only constructor had unnecessary latent writable configuration

The initial D2b1 implementation reused one GameState infrastructure configuration with:

```text
writableFields = ['achievements']
```

for both `createGameStateStore()` and `createGameStateRuntime()`.

`createGameStateStore()` returned only the read facade, so no authority escaped. This was safe under the M2B capability model, but it was not minimum authority: the discarded internal mutation authority would still have been capable of minting an achievement scope while the constructor was executing.

The hardened composition now has two explicit configurations:

```text
createGameStateStore():
    writableFields = []

createGameStateRuntime():
    writableFields = ['achievements']
```

Only the runtime path opts into gameplay write authority.

This reduces the blast radius of future refactors and makes the compatibility/read constructor genuinely read-only beneath the facade as well as at the facade.

## Capability authenticity

The service validates the scope structurally. This is deliberate.

A caller can construct a counterfeit object with the same visible shape, but that does not mint authority over a GameState store. The real authority is the private transaction closure created by `createStateStore()` and handed through `createGameStateRuntime()`.

Therefore D2b1 does not add global branding, tokens, or a generic exported mutation-scope authenticator to `state-store.mjs`. Doing so would enlarge the generic state-store API without solving an actual authority-escalation path.

If a future public/plugin boundary needs to authenticate internal capabilities, that requirement should be introduced with an explicit threat model rather than pre-emptively expanding M2B.

## Hardening tests

New tests cover:

- undefined/null/primitive/array service options;
- exotic option objects;
- extra and symbol option fields;
- accessor-backed `mutationScope` without getter execution;
- accessor-backed scope `id`, `fields`, and `transaction` without getter execution;
- extra/symbol scope fields;
- exotic scope prototypes;
- accessor-backed field-list entries without getter execution;
- field arrays with extra properties;
- validation that does not call the transaction function;
- throwing proxy inspection translated into the achievement capability error.

Existing D2b1 tests continue to prove:

- runtime/store surfaces remain closed;
- the service exposes no raw transaction/scope authority;
- wrong scope IDs/root ownership fail;
- independent runtimes remain isolated;
- selectors/read state continue to work normally.

## D2b2 handoff

D2b2 can now assume:

1. only `createGameStateRuntime()` owns an achievement-writable GameState infrastructure instance;
2. the achievement service receives a scope structurally constrained to `achievement-state` / `achievements`;
3. service construction itself cannot trigger accessor-backed caller code;
4. the raw scope remains private;
5. the service can add specific domain operations without exposing generic `transaction()` or `createMutationScope()`.

D2b2 should still retain the scope only inside closures for its specific methods. It must not place the raw scope, transaction function, or mutation authority onto the returned service object.

## Closure criteria

M2D2b1 review is closed when:

1. the two gaps above are hardened;
2. original D2b1 capability tests remain green;
3. adversarial capability-construction tests are green;
4. architecture fitness remains green;
5. build/output checks remain green;
6. browser negative-control and real-browser smoke remain green;
7. no legacy production behavior changes.
