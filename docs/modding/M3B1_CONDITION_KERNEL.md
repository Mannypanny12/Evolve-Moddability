# M3B1 Condition Contract and Evaluator

## Purpose

M3B1 introduces the production condition kernel required by the M3 command architecture without yet migrating any vanilla requirement family.

The slice establishes:

- inert machine-readable condition descriptions;
- deterministic synchronous evaluation;
- structured satisfied/failed outcomes;
- machine-readable failure reasons compatible with M3A1 command rejections;
- built-in `all`, `any`, and `not` composition;
- fixed internal primitive registrations for later M3B2 requirement kinds;
- hostile-input and async/thenable hardening;
- an architecture boundary that keeps condition evaluation independent from legacy state, GameState infrastructure, commands, UI/platform code, and the definition Registry.

M3B1 deliberately does **not** add technology, resource, structure, or trait primitives. Those belong to M3B2 once their read-capability contracts are explicit.

## Condition model

Primitive conditions are inert data:

```js
{
    kind: 'some.condition.kind',
    params: {
        // inert data only
    }
}
```

The condition description contains no executable callback, DOM object, legacy action object, writable state object, localization string, or hidden application preference.

Primitive implementations are fixed runtime registrations supplied when constructing the internal evaluator:

```js
{
    kind,
    validateParams,
    evaluate
}
```

This is an engine-composition mechanism, not a public mod registration API. Public custom-condition/package behavior remains deferred to M10.

Registrations are immutable after evaluator construction, must have unique non-reserved kinds, and expose no lookup or mutation surface. The evaluator exposes only:

```text
evaluate
has
kinds
```

## Inert parameter contract

Condition parameters use the same defensive philosophy as the M3A1 command boundary.

Accepted values are limited to:

- null;
- finite numbers;
- strings;
- booleans;
- normal dense arrays;
- plain or null-prototype data objects.

The condition data canonicalizer rejects:

- functions;
- undefined;
- bigint and symbol values;
- NaN and infinity;
- accessors;
- hidden or symbol-keyed fields;
- exotic object prototypes;
- sparse or extended arrays;
- cyclic references;
- repeated object identity inside one data tree;
- excessive nesting;
- unsafe/hostile inspection failures.

Input data is detached, normalized, and deeply frozen before primitive parameter validation. Validator output is canonicalized and frozen again before evaluation. Primitive implementations therefore do not receive the caller-owned mutable parameter object.

## Result contract

Condition evaluation never communicates ordinary failure through booleans or localized text.

A satisfied condition returns:

```js
{
    status: 'satisfied',
    reasons: []
}
```

A failed condition returns:

```js
{
    status: 'failed',
    reasons: [
        {
            code: 'condition.some.stable_code',
            details: { /* inert machine-readable data */ }
        }
    ]
}
```

A failed result requires at least one reason. A satisfied result may not contain reasons.

Reason codes use the same lowercase stable-code grammar as M3A1 command rejection reasons. `details` is either null or an inert plain data object. Localized messages are explicitly excluded from this layer.

This allows a later command handler to translate a failed execution-condition result into an M3A1 rejected command outcome without inventing a second diagnostic vocabulary.

## Compound conditions

M3B1 reserves three built-in kinds:

```text
all
any
not
```

They cannot be replaced by primitive registrations.

### `all`

Shape:

```js
{
    kind: 'all',
    conditions: [ ... ]
}
```

The list must be non-empty.

All children are evaluated. If every child is satisfied, the result is satisfied. Otherwise the result is failed and contains all child failure reasons in declaration order.

Evaluating every child is intentional: an `all` result can explain every currently failed prerequisite rather than only the first one.

### `any`

Shape:

```js
{
    kind: 'any',
    conditions: [ ... ]
}
```

The list must be non-empty.

Evaluation stops when one branch succeeds. If every branch fails, M3B1 emits one wrapper reason:

```text
condition.any.failed
```

Its details retain the failed alternatives and their reason lists by branch index.

The wrapper is important because flattening alternative failures would make `A OR B` look like `A AND B` to later UI/developer tooling.

### `not`

Shape:

```js
{
    kind: 'not',
    condition: { ... }
}
```

If the child fails, `not` is satisfied. If the child succeeds, `not` fails with:

```text
condition.not.failed
```

The child's failure reasons are not promoted as top-level requirements when the negation itself succeeds.

## Synchronous fail-closed execution

M3B1 condition validation/evaluation is synchronous.

Declared async validators/evaluators are rejected during registration. Runtime Promise/thenable results are rejected. Thenable inspection uses descriptors rather than invoking a possible `then` getter.

Primitive validators and evaluators are invoked context-free; no registration object is supplied through `this`.

Malformed conditions, malformed primitive results, unknown kinds, bad registrations, async leakage, and other contract defects throw `EngineContractError`. An ordinary unmet gameplay condition is data with `status: 'failed'`.

## State and dependency boundary

M3B1 does not read authoritative state itself.

In particular, condition modules do not import or access:

- legacy `global` or `src/vars.js` state;
- `actions.js` or legacy action objects;
- GameState composition, StateStore, selectors, or mutation services;
- raw mutation authority;
- the M1 inert definition Registry;
- the M3 command bus;
- DOM, jQuery, Vue, browser/platform services, or local storage;
- external packages or dynamic imports.

M3B2 primitive implementations will receive only the narrow semantic read capabilities they actually require. Those capabilities may temporarily be backed by legacy adapters for a bounded migration vertical, then later be backed by authoritative GameState domains without changing the condition description contract.

This preserves the M2 rule that no new subsystem becomes a back door to raw state.

## Semantic boundary

M3B1 intentionally does not collapse the four M3A0 eligibility questions.

The condition kernel answers only:

> Does this explicitly described predicate hold against the supplied semantic read capability?

Higher-level definitions/orchestration decide whether a condition belongs to:

- availability;
- execution requirements;
- another explicitly named condition set.

Affordability remains M3D. Queue/capacity prediction policy remains M3E.

For example, a future resource-threshold primitive may be a valid non-consumptive execution condition. That does not make it the payment check for a resource cost.

## Architecture enforcement

`tests/architecture/m3b1-condition-boundary-fitness.cjs` protects `src/engine/conditions/**`.

It rejects condition-kernel imports or references that would introduce:

- GameState/state infrastructure;
- command execution modules;
- the definition Registry;
- legacy/platform adapters;
- external packages;
- dynamic imports;
- raw mutation-authority identifiers;
- legacy globals or DOM/UI/platform globals.

The gate is part of cumulative `npm run test:architecture`.

## Production impact

M3B1 adds a real production engine primitive but does not route any vanilla gameplay through it.

It does not modify:

- `src/actions.js`;
- `src/functions.js`;
- `src/main.js`;
- GameState schema or ownership;
- legacy bridges;
- costs/payment;
- queues;
- persistence;
- UI behavior;
- simulation or oracle snapshots.

## Deliberate deferrals

M3B1 does not implement:

- technology requirement primitives -> M3B2;
- resource requirement primitives -> M3B2;
- structure requirement primitives -> M3B2;
- trait requirement primitives -> M3B2;
- representative legacy/differential evidence and final M3B closure hardening -> M3B3;
- affordability/payment -> M3D;
- queue/prediction eligibility -> M3E;
- the `evolution.dna` vanilla cutover -> M3F;
- bulk technology/progression migration -> M6E;
- public third-party/custom-code condition registration -> M10.

## Definition of done

M3B1 is complete when:

1. condition descriptions are inert closed data rather than executable content callbacks;
2. primitive registrations are fixed, synchronous, unique, and immutable after construction;
3. condition parameters are detached, canonicalized, frozen, and hostile-input hardened;
4. primitive validators and evaluators receive no implicit `this` context;
5. ordinary unmet conditions return structured failed outcomes rather than booleans/exceptions;
6. failure reasons use stable machine-readable `{ code, details }` records with no localized strings;
7. condition results are deeply frozen and directly compatible with later M3A1 rejection plumbing;
8. `all` aggregates failed prerequisites deterministically;
9. `any` preserves alternative-branch meaning rather than flattening failures;
10. `not` provides explicit negation semantics;
11. malformed definitions/results and async/thenable leakage fail closed with `EngineContractError`;
12. the kernel has no direct state, legacy, command, Registry, UI, platform, external-package, or mutation-authority dependency;
13. the M3B1 architecture guard is cumulative in `npm run test:architecture`;
14. no GameState root, vanilla action path, persistence path, queue, payment, or UI behavior is changed;
15. the full existing test/build/browser safety net remains green;
16. M3B2 core requirement primitives are the next implementation slice.
