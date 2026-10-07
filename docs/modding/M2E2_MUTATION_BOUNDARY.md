# M2E2 Mutation-Boundary Enforcement

## Purpose

M2E2 turns the M2B mutation-capability model and the M2E1 state-domain ownership contract into a generic, fail-closed architecture rule.

M2B already provides the runtime lock: a state store is configured with a closed set of writable top-level roots; retained mutation authority can mint named scopes only over those roots; transactions receive only the owned roots; and a committed candidate is rejected if it changes an unowned root.

M2E2 does not reimplement those transaction semantics. It proves that production composition grants those capabilities only to the reviewed GameState domain owners declared by M2E1.

The central question is:

```text
Does the actual GameState capability graph give write authority only to the reviewed domain owner?
```

## Single source of truth

M2E2 deliberately does not add a second mutation manifest or duplicate scope/root metadata.

The existing M2E1 contract already provides the required facts:

```text
domain root       -> owned writable root and runtime property
owner id          -> mutation scope id
mutation service  -> reviewed recipient factory
```

For the current achievement domain this derives:

```text
root              achievements
owner / scope id  achievement-state
factory           createAchievementStateService
service module    src/engine/state/achievement-state-service.mjs
```

Therefore the reviewed capability is derived as:

```text
id: achievement-state
fields: [achievements]
```

This avoids a shadow configuration in which ownership, writable roots, and scope fields could drift independently.

## Current capability graph

The only reviewed writable GameState path is:

```text
createGameStateRuntime()
        |
        v
createGameStateInfrastructure(
    writableFields = ['achievements']
)
        |
        v
createStateStore()
        |
        +--> read-side store
        |
        +--> mutationAuthority
                  |
                  v
        createMutationScope({
            id: 'achievement-state',
            fields: ['achievements']
        })
                  |
                  v
        createAchievementStateService({ mutationScope })
                  |
                  v
runtime.achievements
```

The ordinary `createGameStateStore()` path remains zero-write:

```text
GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS = []
```

and returns only the read facade.

## Static architecture laws

The M2E2 fitness gate enforces the following rules.

### Writable-root accounting

`GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS` and `GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS` must remain inspectable `Object.freeze([...])` arrays of plain string literals.

The read-only list must be empty.

The runtime writable-root set must equal the authoritative domains in the M2E1 ownership contract exactly. Metadata roots such as `schemaVersion` may not be writable.

A new writable root therefore requires a reviewed authoritative domain rather than a local edit to a capability list.

### Store composition boundary

`createGameStateInfrastructure()` must pass the exact supplied `writableFields` capability directly to `createStateStore()` together with `initialState` and `validateGameState`.

It may not widen, clone, merge, compute, or otherwise transform the writable-root capability before store construction.

Only two GameState composition paths may call the infrastructure helper:

```text
createGameStateStore()
createGameStateRuntime()
```

The read constructor must use the zero-write list. The runtime constructor must use the reviewed runtime-write list.

### State-store consumer boundary

`src/engine/state/game-state.mjs` is the only production module allowed to consume `state-store.mjs` directly.

This rule is parser-backed and path-normalized, so alternate spellings such as `./state/bridge/../state-store.mjs` do not create another unreviewed composition path.

Tests may continue to import the low-level primitive directly.

### Raw authority confinement

The raw identifiers:

```text
mutationAuthority
createMutationScope
```

are reserved to:

```text
src/engine/state/state-store.mjs
src/engine/state/game-state.mjs
```

inside production engine code.

Domain services receive an already-scoped transaction capability; they do not receive the authority that can mint additional scopes.

### Scope derivation

Each authoritative domain must receive exactly one inspectable single-root scope:

```text
scope id     == M2E1 owner id
scope fields == [domain root]
```

This is intentionally stricter than the generic M2B store, which can technically create multi-root scopes. M2 keeps domain mutation ownership single-root and least-privilege. Future cross-domain atomic command capability belongs to a later reviewed command/effect architecture rather than being smuggled into a domain service.

Dynamic scope IDs, computed field lists, widened field lists, duplicate scopes, and unreviewed scopes fail closed.

### Scope consumption

A raw scope may be used only twice in `createGameStateRuntime()`:

1. its declaration;
2. the direct call to its declared mutation-service factory.

It may not be aliased, returned, stored, reused by another service, or otherwise escape composition.

Likewise, `mutationAuthority` may only be captured from the reviewed runtime infrastructure and used to mint the reviewed scopes.

### Mutation-service consumer boundary

The declared mutation-service module for a GameState domain may be constructed only by GameState composition in production source.

The scope must flow directly into the declared factory as:

```text
factory({ mutationScope })
```

The resulting semantic service is the value exposed under the domain root on the frozen runtime object.

For the current state, the runtime public surface is therefore exactly:

```text
store
achievements
```

Raw authority, raw scopes, and raw transaction functions are not runtime properties.

## Runtime capability probes

The M2E2 gate also performs generic runtime probes rather than relying only on source inspection.

It verifies that `createStateStore()` still returns exactly:

```text
store
mutationAuthority
```

and that the mutation authority exposes only:

```text
createMutationScope
```

A minted scope must be frozen and expose exactly:

```text
id
fields
transaction
```

The GameState runtime must be frozen and expose only the read store plus one semantic service per reviewed domain.

For each declared mutation-service factory, M2E2 supplies a counterfeit structural capability with the reviewed owner/root shape and proves that:

1. construction accepts the reviewed shape;
2. construction does not execute the transaction closure;
3. the semantic service is frozen;
4. the raw transaction closure is not returned directly;
5. raw capability names are not exposed publicly;
6. wrong owner IDs are rejected;
7. wrong roots are rejected;
8. widened root lists are rejected;
9. missing transaction capability is rejected;
10. extra raw capability data is rejected.

This structural probe is not capability authentication. The actual authority remains the private transaction closure minted by `createStateStore()`. The probe verifies that the domain service continues to enforce its least-privilege boundary around that capability.

## Architecture gate

The first-class gate is:

```text
tests/architecture/m2e2-mutation-boundary-fitness.cjs
```

with dedicated adversarial coverage in:

```text
tests/architecture/m2e2-mutation-boundary-fitness.test.cjs
```

`npm run test:architecture` runs M2E2 after M2E1.

M2E1 remains responsible for root classification, domain ownership, schema/default ownership, and declared selector/mutation-service surfaces. M2E2 consumes that reviewed ownership model and proves the write-capability graph.

## Adversarial coverage

The dedicated tests reject at least:

- a non-literal or duplicate writable-root declaration;
- writable roots on the read-only constructor;
- runtime writable-root widening;
- `schemaVersion` made writable;
- transformed or merged `writableFields` at store construction;
- an extra caller of `createGameStateInfrastructure()`;
- wrong scope owner IDs;
- dynamic scope IDs;
- multi-root/widened scopes;
- extra scopes;
- scope aliasing;
- scope reuse after service construction;
- raw `mutationAuthority` returned from the runtime;
- a domain runtime property wired to the wrong value;
- a scope passed under the wrong service capability expression;
- alternate production consumers of `state-store.mjs`;
- alternate production consumers of a domain mutation-service factory;
- raw authority identifiers introduced elsewhere in the engine.

The complete scanner also runs against the current repository, including the runtime capability probes.

## Non-goals

M2E2 does not:

- change GameState schema or gameplay state;
- migrate another domain;
- change achievement mutation semantics;
- change legacy achievement compatibility or projection behavior;
- introduce commands, effects, or a command bus;
- introduce cross-domain mutation scopes;
- enforce selector consumers or read dependency direction;
- change persistence or serialization;
- expose a public mutation API;
- add integrated state information to `inspect:architecture` yet.

Selector/read dependency enforcement belongs to M2E3. Integrated state architecture reporting and closure belong to M2E4.

## Definition of done

M2E2 is complete when:

1. writable-root declarations are literal, closed, and machine-inspectable;
2. the ordinary GameState store path has zero writable roots;
3. runtime writable roots exactly equal reviewed authoritative domain roots;
4. metadata roots cannot become writable;
5. GameState composition is the only production consumer of `createStateStore()`;
6. raw mutation authority cannot appear elsewhere in engine production code;
7. each domain receives exactly one scope whose ID is its owner and whose only field is its root;
8. no raw scope or raw mutation authority escapes runtime composition;
9. each scope flows directly into the mutation-service factory declared by M2E1;
10. the runtime exposes only the read store and reviewed semantic domain services;
11. generic runtime probes confirm the narrow state-store, scope, and service capability surfaces;
12. malformed or widened service capabilities fail closed;
13. M2E2 is part of the architecture CI chain after M2E1;
14. the full test suite, architecture gates, production build, generated-output cleanliness, and real-browser smoke remain green;
15. no production gameplay/save/compatibility behavior changes are required.

After M2E2, M2E3 can enforce the complementary read side: which layers may read authoritative state directly and which cross-domain consumers must use selectors/queries.
