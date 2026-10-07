# M2E2 Review Hardening

## Purpose

This pass adversarially reviews the M2E2 mutation-boundary gate after its initial implementation. The goal is not to restate M2B runtime transaction safety. It is to close ways that production source could keep architecture CI green while widening, disguising, or leaking mutation authority.

The original M2E2 gate remains in place. Review hardening is layered after it so the base capability-graph checks and the adversarial checks must both pass.

## Findings closed by this pass

### Executable declaration authenticity

The initial frozen-array parser inspected raw source text. A stale safe writable-root declaration placed inside a comment or string could therefore satisfy the parser while the executable declaration used a computed or widened value.

The review gate now requires exactly one **executable** frozen literal declaration for both writable-root arrays. Comment and string decoys do not count.

### Low-level composition aliasing

Counting direct calls is insufficient when a privileged primitive can be aliased first.

The review gate now budgets identifiers for:

- `createGameStateInfrastructure`, which may appear only in its declaration and the two reviewed direct callers;
- `createStateStore`, which may appear in GameState composition only in its static import and single reviewed direct infrastructure call.

This rejects patterns such as:

```js
const hidden = createGameStateInfrastructure;
const makeStore = createStateStore;
```

before either alias can become an alternate capability path.

### Reviewed semantic service surfaces

The initial M2E2 gate verified that the runtime service surface matched whatever the declared factory returned. That did not independently define which mutation operations were reviewed.

`tests/architecture/m2e2-mutation-surface-contract.json` now declares the approved public mutation methods for each M2E1 ownership domain.

For achievements the reviewed surface is exactly:

```text
advance
removeUniverseRank
```

The surface contract must exactly cover the M2E1 authoritative-domain set, use unique identifier method names, and contain no extra fields. Adding a new mutation operation therefore requires an explicit architecture-contract change.

### Symbol, accessor, and prototype hiding

Checking string-valued own keys alone leaves several hiding places for capability data:

- symbol properties;
- accessor-backed fields;
- inherited properties on an exotic prototype;
- custom properties attached to semantic method functions;
- extra values attached to a method function's prototype object.

Review hardening now requires capability surfaces to remain closed enumerable data surfaces with no symbol keys. Capability objects must have `Object.prototype` or `null` as their prototype. Reviewed semantic mutation methods may not carry custom or symbol properties, raw transaction references, or additional prototype payloads.

These checks apply to the low-level infrastructure, read store, mutation authority, mutation scopes, GameState runtime, and domain mutation services.

### Canonical import identity

Lexical import comparison can be evaded when the same file is referenced through another spelling.

The canonical consumer scan now:

- strips query strings and URL fragments from relative module specifiers;
- resolves filesystem real paths;
- follows source-file symlink aliases;
- rejects production source-directory symlinks that could hide unscanned consumers.

As a result, imports such as these are treated as the same privileged module:

```text
./state-store.mjs
./state-store.mjs?probe
./state-store.mjs#probe
./store-alias.mjs -> state-store.mjs
```

Only the reviewed GameState composition module may resolve to `state-store.mjs` or a declared mutation-service module.

### Dynamic module-loader escape

A computed dynamic import can avoid every literal module-reference check:

```js
const specifier = buildSpecifier();
const module = await import(specifier);
```

The engine currently has no legitimate need for dynamic module loading. M2E2 therefore fails closed on production `src/engine/**` use of either:

```text
import(...)
require(...)
```

Comments and strings do not trigger this rule.

If dynamic loading becomes architecturally necessary later, it must be introduced as an explicit reviewed architecture change rather than silently bypassing the capability graph.

### Hostile service capability shapes

The generic M2E2 runtime probe now also verifies that every declared mutation-service factory rejects hostile capability/options shapes, including:

- wrong owner ID;
- wrong root;
- widened root list;
- missing transaction;
- extra scope fields;
- symbol-backed scope fields;
- exotic scope prototypes;
- accessor-backed scope fields;
- extra option fields;
- symbol-backed options;
- exotic option prototypes;
- accessor-backed options.

Service construction must not execute the supplied transaction closure.

## Resulting capability law

For every authoritative M2E1 domain, M2E2 now machine-proves the following chain:

```text
reviewed ownership root
        |
        v
reviewed writable root
        |
        v
reviewed owner/scope id
        |
        v
single literal scope minted in GameState composition
        |
        v
declared mutation-service factory
        |
        v
exact reviewed semantic method surface
        |
        v
frozen plain service exposed under the matching runtime root
```

The raw paths below remain confined to the state-store implementation and reviewed GameState composition:

```text
createStateStore
mutationAuthority
createMutationScope
raw transaction
```

## Deliberate non-goals

This hardening does not attempt to turn JavaScript into a security sandbox. A reviewed semantic method could still be deliberately implemented incorrectly; domain behavior tests remain responsible for operation semantics.

This pass also does not implement:

- cross-domain command scopes;
- command/effect orchestration;
- selector-consumer enforcement;
- persistence authority;
- integrated architecture reporting.

Those remain assigned to later roadmap slices, especially M2E3/M2E4 and M3.

## Architecture gates

M2E2 is now enforced by four cumulative architecture gates:

```text
m2e2-mutation-boundary-fitness.cjs
m2e2-mutation-boundary-review-hardening.cjs
m2e2-capability-surface-hardening.cjs
m2e2-dynamic-loader-hardening.cjs
```

The dedicated adversarial test files execute under the normal Node test suite as well.

## Closure criterion

M2E2 can be considered closed when the full Node suite, all architecture gates, production build, generated-output cleanliness checks, browser startup negative control, and real-browser smoke test pass from the final hardened branch head, with no production `src/` changes introduced by the review pass.
