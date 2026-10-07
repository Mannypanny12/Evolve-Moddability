# M3D4C Review and Hardening

## Purpose

This document records the second independent review of the M3D4C special-payment/Supply foundation after the initial implementation and the first architecture-ratchet repair were already green.

The review deliberately re-checked the slice rather than treating a green workflow as proof of closure. It covered:

- the generic quote, assessment, and PaymentPlan contracts;
- interaction with M3D3 and the hardened M3D4B prestige family;
- legacy Supply current/max behavior;
- the first-party Supply source resolver and purifier pool reader;
- malformed and hostile inputs;
- cumulative accounting and overflow;
- architecture negative controls and comment-decoy resistance;
- differential boundary cases;
- design-document completeness.

M3D4C remains read-only/inert after this pass. No settlement executor or mutation authority is introduced.

## Review conclusion

The central M3D4C model is sound:

- generic special lines keep semantic `paymentId` separate from actual `poolId`;
- only pool-backed special sources are admitted;
- current assessment uses pool presence plus current amount;
- queue feasibility uses pool presence plus capacity;
- requirements sharing an actual pool accumulate regardless of payment ID;
- planning emits one inert `payment.special.settle` per quote line;
- first-party Supply/purifier knowledge stays outside the generic engine;
- Knowledge, Species, M4 adjustment logic, queue scheduling, and payment execution remain outside this slice.

The second review found one production diagnostic defect, two architecture-ratchet weaknesses, several worthwhile adversarial coverage gaps, and missing M3D4C design authority.

## Finding 1: hostile special-source kind could escape through diagnostics

`normalizeSpecialSource()` correctly rejected any source kind other than `pool`, but its failure details included the raw caller-owned `kind` value.

That is safe for ordinary strings but not for arbitrary data-field values. A caller could provide a revoked or otherwise hostile Proxy as `source.kind`. The comparison itself is harmless, but the resulting `EngineContractError.details` retained that Proxy. Downstream diagnostic handling such as `JSON.stringify(error.details)` could then throw.

This violated the diagnostic hardening already established in earlier M3D slices.

The failure now records only inert scalar metadata:

```text
path
kindType
kind, only when the value is already a string
```

A regression test uses a revoked Proxy and proves the hostile value is absent from error details and those details remain JSON-safe.

## Finding 2: the purifier mapping ratchet still allowed a comment decoy

The first M3D4C boundary repair made the quote/plan contract checks comment-safe, but the purifier adapter's exact supported-mapping regex still inspected raw source.

That meant a widened live list could theoretically be accompanied by a comment containing the old exact declaration and satisfy the mapping ratchet.

A new review-hardening architecture gate parses the source through esbuild with comments removed before inspecting first-party scope.

It independently pins:

```text
evolve.payment_pool.purifier_supply_state
```

as the only first-party payment-pool mapping visible in the adapter.

Negative controls prove that:

- a widened live mapping list fails even when an exact old declaration appears in a comment;
- a second live first-party payment-pool mapping literal fails;
- a comment-only future mapping does not create false positives.

## Finding 3: resolver scope was runtime-tested but not architecture-ratcheted

Runtime tests already proved that the first-party source resolver accepts only:

```text
evolve:payment/supply
```

and resolves it to:

```text
evolve:payment-pool/purifier_supply
```

However, the architecture gate did not independently prevent a later accidental second first-party payment identity or pool identity from being added while keeping the same export/dependency shape.

The review-hardening gate now pins the live first-party resolver vocabulary to exactly those two canonical identities and verifies the fail-closed Supply guard and pool-backed result shape remain present.

This keeps future Knowledge/Species work from quietly entering M3D4C through the compatibility resolver.

## Finding 4: adversarial and boundary coverage could be stronger

The original M3D4C suite covered the main Supply split, missing purifier behavior, malformed numeric state, same-named ordinary-resource isolation, cumulative shared-pool assessment, and inert planning.

The hardening pass adds targeted regressions for:

- non-boolean `pool.present()` results in both assessment modes;
- special-only quotes never consulting ordinary resource readers;
- cumulative finite-number overflow for special requirements;
- exact current-amount equality;
- exact capacity equality;
- one-unit threshold crossings on each side of the current/queue split;
- compatibility-reader root replacement rather than stale snapshot retention;
- accessor-backed `portal`, `purifier`, `supply`, and `sup_max` without getter invocation;
- throwing root providers normalized to bridge-specific contract errors;
- accessor-based root thenables rejected without invoking `then`.

These do not change intended semantics. They make the existing contract harder to accidentally weaken.

## Finding 5: M3D4C had no durable design/review documents

Earlier M3D slices have explicit foundation and review-hardening documents. M3D4C had implementation/tests but no equivalent design authority.

That was a real maintainability gap because future M3D4D work would otherwise have to infer important distinctions from source code, especially:

- `paymentId` versus actual `poolId`;
- current amount versus queue capacity;
- accumulation by actual pool source;
- deliberate malformed-state hardening;
- the fact that `payment.special.settle` is inert intent, not execution;
- exactly where first-party Supply knowledge may live.

`M3D4C_SPECIAL_SUPPLY_FOUNDATION.md` now records that contract, and this document records the closure review.

## Generic engine audit

### Quote contract

The reviewed quote union is exactly:

```text
resource
prestige
special
```

M3D4C special lines are closed and require:

```text
paymentId : canonical payment ID
source.kind : pool
source.poolId : canonical payment-pool ID
amount : positive finite number
```

No first-party payment name is embedded in generic cost code.

### Assessment

The assessor keys cumulative requirements by actual payment family plus actual source identity.

For special pool lines:

```text
current -> present + amount
queue   -> present + capacity
```

Facts are cached per source for the duration of one assessment. Duplicate quote lines therefore do not repeatedly query the same semantic fact.

A missing pool produces one ordered missing-source reason for that source. A present malformed reader result is a contract error rather than an affordability result.

### Planning

Special quote lines remain one-to-one inert operations:

```text
special quote -> payment.special.settle
```

The planner does not aggregate, read state, test affordability, execute settlement, or own mutation authority.

## Compatibility audit

The reviewed first-party surface is exactly:

```text
payment:      evolve:payment/supply
pool:         evolve:payment-pool/purifier_supply
mapping:      evolve.payment_pool.purifier_supply_state
legacy path:  global.portal.purifier
state fields: supply, sup_max
```

`global.resource.Supply` is deliberately irrelevant even if it exists with ample holdings.

The mapping removal target remains M6K, matching the portal-domain migration wave.

## Read-consistency review

The audit examined whether `present(poolId)` followed by `amount(poolId)` or `capacity(poolId)` could observe different roots if an injected `readLegacyRoot()` provider deliberately changes identity between calls.

That possibility exists, but it is not an M3D4C-only defect. The established M3D2 resource bridge already reacquires the live root for separate semantic reads such as amount and capacity.

Introducing a special-only snapshot API here would create a second read model and prematurely widen the generic capability contract.

The decision for M3D4C is therefore:

- retain fresh-root compatibility-reader semantics;
- explicitly test that replacement roots are followed rather than cached forever;
- keep per-assessment semantic-fact caching in the generic assessor;
- defer any atomic cross-read snapshot contract to a whole-M3D review where resource, prestige, and special families can be solved consistently.

This is an explicit reviewed boundary, not an unnoticed gap.

## Boundary status after hardening

M3D4C still guarantees:

1. no first-party Supply/purifier knowledge in generic cost code;
2. no special source kind other than pool;
3. no first-party special resolver identity other than Supply;
4. no first-party pool mapping other than purifier supply;
5. no purifier state reads beyond `supply` and `sup_max`;
6. no Knowledge or Species semantics;
7. no payment execution or mutation authority;
8. no M4 modifier/calculation ownership;
9. no queue work-item or scheduler ownership;
10. no EffectPlan coupling;
11. no vanilla action cutover;
12. no hostile caller object retained by the special-source-kind diagnostic.

## Closure criterion

M3D4C is ready to close only when the hardened branch head passes:

- the complete repository test suite;
- the cumulative architecture chain including the new review-hardening gate;
- build and generated-output integrity checks;
- the negative browser startup control;
- the real game and wiki browser smoke tests.

The next special-payment implementation slice can then build on this boundary without reopening Supply semantics.
