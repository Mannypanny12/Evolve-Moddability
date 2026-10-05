# M3D3 PaymentPlan Review and Hardening

## Purpose

This document records the adversarial post-implementation review of the M3D3 ordinary-resource `PaymentPlan` foundation.

The review treated the initial M3D3 implementation as untrusted and re-checked:

- quote-to-plan semantic derivation;
- order and duplicate preservation;
- hostile caller input handling;
- shared PaymentQuote wrapper normalization;
- public and internal module surfaces;
- operation-kind ownership;
- state-read and mutation boundaries;
- future quote-family widening hazards;
- M3D4/M3F handoff assumptions.

The review found no fundamental flaw in the M3D3 model. `PaymentPlan` remains inert semantic intent derived from a validated `PaymentQuote`; it is not affordability evidence and it has no execution authority.

## Findings and hardening

### 1. Shared quote-input architecture ratchet was too permissive

M3D3 extracted `payment-quote-input.mjs` so PaymentAssessor and PaymentPlan share one hardened arbitrary-quote validation boundary.

The implementation itself was narrow, but the initial architecture gate constrained mainly its imports. It did not mechanically prevent the shared helper from later growing:

- extra exports;
- affordability/capacity reads;
- special-payment semantics;
- first-party Evolve knowledge;
- modifier/queue behavior;
- payment-operation construction.

Because both D2 and D3 trust this helper, that was too broad a future drift surface.

Hardening now pins the helper to exactly one synchronous one-argument export:

```text
normalizePaymentQuoteInput(rawQuote)
```

and rejects state-read semantics, special-payment semantics, first-party IDs, modifier/queue scope, mutation/payment authority, payment-operation construction, runtime/platform access, hidden async control flow, and dependencies outside identity/inert-data/PaymentQuote validation.

### 2. PaymentPlan operation-kind guard proved presence, not exclusivity

The initial D3 gate required the reviewed string:

```text
payment.resource.debit
```

to appear in `payment-plan.mjs`, but that alone did not prove it was the only operation kind constructed.

A future edit could theoretically retain the reviewed string while adding another `kind` construction or routing the actual kind through a variable.

The hardening gate now pins the current D3 module to exactly one operation-kind construction and requires that exact source property to use the literal:

```text
payment.resource.debit
```

Additional `kind` construction, variable/computed kind routing, or another `payment.*` operation kind requires a conscious architecture change.

This is intentionally strict because M3D3 supports exactly one operation family.

### 3. Shared wrapper diagnostic paths could be ambiguous

For a malformed quote wrapper with an exotic unsupported key such as:

```text
x.y
```

the initial shared normalizer could report a diagnostic path resembling:

```text
paymentQuote.x.y
```

which falsely looks like nested structure.

The helper now uses the engine's existing `inertDataPath()` escaping rules so unusual keys are represented unambiguously, for example:

```text
paymentQuote["x.y"]
```

The hardening suite covers punctuation/newline-containing keys and verifies diagnostic details remain serializable.

### 4. PaymentPlan hostile/structural coverage was narrower than the shared boundary

The initial M3D3 tests already covered hostile and revoked top-level proxies, malformed wrappers, detachment, freezing, ordering and duplicates.

The review added direct PaymentPlan evidence for:

- null-prototype quote wrappers producing normal frozen plan records;
- top-level accessors being rejected without getter invocation;
- hidden and symbol-keyed wrapper fields;
- exotic diagnostic-path escaping;
- repeated caller line object identity producing distinct detached operations;
- mutation of caller data after planning not affecting the plan;
- individually valid extremely large duplicate lines remaining separate rather than being aggregated during planning.

### 5. Future PaymentQuote-family widening could otherwise silently change plan meaning

Today `PaymentQuote` admits only the ordinary `resource` family. Therefore the current one-to-one planner can safely derive one `payment.resource.debit` operation per quote line.

A future M3D slice will intentionally widen quote/payment-family semantics. Without a D3-specific ratchet, widening the quote contract could accidentally make the existing planner receive a new family and incorrectly treat it as an ordinary resource debit.

The hardening suite now explicitly requires a representative future family such as `prestige` to remain rejected by `createPaymentPlan()` under the D3 contract.

This test is expected to fail intentionally when M3D4 widens the relevant quote family. M3D4 must then update PaymentQuote, assessment/source resolution, and PaymentPlan semantics together rather than changing only the quote parser.

## Confirmed semantic invariants

### Planning is not authorization

No affordability result is required to build a PaymentPlan.

The review confirms this remains correct. A plan describes intended semantic payment, not permission to mutate state. State may change between assessment and execution, so an earlier successful assessment must never become a mutation authorization token.

### Planning does not aggregate duplicates

M3D3 preserves quote structure one-to-one:

```text
quote line N -> plan operation N
```

Two individually valid finite lines may have a mathematical aggregate that overflows JavaScript's finite numeric range. Planning still preserves those two lines because aggregation is not a D3 responsibility.

M3D2 current/queue assessment already fails closed when cumulative ordinary-resource requirements overflow. Any later executor/atomic commit path must independently protect cumulative debit accounting as well, especially after payment-source remapping can make multiple semantic lines converge on one actual source.

### PaymentPlan is distinct from EffectPlan

The review found no effect-layer coupling. `payment.resource.debit` remains separate from M3C `resource.consume`.

A command price and a gameplay resource-loss effect remain different semantic languages even when both ultimately decrease a numeric resource.

### No execution authority exists

M3D3 still contains no:

- state read capability;
- mutation capability;
- transaction coordinator;
- payment executor;
- `modRes()` / `payCosts()` access;
- GameState authority;
- legacy adapter;
- effect execution;
- queue scheduling.

`createPaymentPlan()` remains a pure synchronous derivation over validated inert data.

## M3D4 handoff rule

M3D4 must not widen PaymentQuote in isolation.

When prestige/special payment families and source resolution are introduced, the change must consider as one reviewed semantic set:

```text
payment-family/source resolution
    -> resolved PaymentQuote
    -> affordability / queue-payment feasibility
    -> PaymentPlan derivation
```

In particular, payment-source remapping such as Plasmid -> AntiPlasmid must be resolved before an affordability answer is treated as meaningful for the eventual debit source.

## M3F handoff rule

The eventual payment/effect commit path must not trust a PaymentPlan merely because it is a plain frozen-looking object or because an earlier assessment succeeded.

M3F must define a reviewed input-validation/authority boundary and must:

1. revalidate the semantic payment it is about to apply;
2. account cumulatively for operations that debit the same actual resolved source;
3. fail closed on cumulative numeric overflow;
4. re-check state facts required for safe payment at commit time;
5. apply payment and gameplay effects atomically;
6. leave complete authoritative state unchanged on failure.

These requirements prevent PaymentPlan from drifting from inert intent into an implicit authorization token.

## Review conclusion

M3D3's architectural model survives the review.

The hardening pass strengthens future drift protection and hostile diagnostics without adding later-slice behavior. It does not introduce special payment families, payment execution, mutation authority, queue behavior, M4 modifiers, or a vanilla gameplay cutover.

M3D3 may be treated as closed once the final hardening head passes the repository test suite, explicit architecture fitness gate, build/output checks, startup-failure negative control, and real-browser smoke test.
