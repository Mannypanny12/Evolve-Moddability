# M3D2 Affordability and Queue-Payment Feasibility

## Purpose

M3D2 adds the read-only assessment layer above the M3D1 `PaymentQuote` foundation.

It answers two deliberately different questions:

```text
Can this resolved payment be made from current state now?

Is this resolved payment feasible from the payment/capacity side if it is allowed to wait?
```

The second question is **not** a generic queue-eligibility decision. M3E still owns queue work items, scheduling, prerequisite prediction, and enqueue policy. M3D2 only answers the payment-side feasibility question.

M3D2 adds no PaymentPlan, payment execution, mutation capability, queue implementation, cost modifier pipeline, or vanilla command cutover.

## Public production surface

The reviewed production factory is:

```js
createPaymentAssessor(paymentReadCapabilities)
```

It returns a frozen facade exposing exactly the semantic operations used by this slice:

```text
assessCurrentAffordability(paymentQuote)
assessQueuePaymentFeasibility(paymentQuote)
```

The assessor validates and captures its provider functions at construction. Each assessment validates/detaches the supplied quote again rather than trusting caller provenance.

## Read capability

M3D2 uses an independent payment read capability. It follows the hardened capability pattern established by M3B but does not import or depend on the condition engine.

The resource capability is exactly:

```text
resource.amount(resourceId)
resource.available(resourceId)
resource.capacity(resourceId)
```

Rules:

- resource IDs must use the canonical typed M1 identity grammar;
- `amount` returns a finite number; negative finite observations are permitted and simply make positive payments unaffordable;
- `available` returns a boolean;
- `capacity` returns either a non-negative finite number or `null` for unbounded capacity;
- provider calls are synchronous in effect: Promise/thenable results fail closed;
- provider failures are wrapped as deterministic engine contract failures without retaining hostile thrown objects.

Capability members must be callable at construction. D2 deliberately does not inspect callable source text with dynamic-code primitives merely to pre-classify async/generator/class functions. If such a callable is unsuitable, invocation fails closed through the normal Promise/result/failure contract.

## Current affordability

For each distinct resource, current affordability compares the cumulative payment requirement against:

```text
current amount
bounded capacity, when capacity is not null
```

Current affordability deliberately does **not** read resource availability/display state.

This preserves characterized legacy behavior: a hidden ordinary resource may still be currently payable if amount and capacity permit it.

Failure reasons are machine-readable, including:

```text
payment.current.resource.amount_insufficient
payment.current.resource.capacity_insufficient
```

Each reason identifies the quote line where the cumulative requirement first crossed the relevant threshold.

## Queue-payment feasibility

Queue-payment feasibility compares the cumulative requirement against:

```text
resource availability/display state
bounded capacity, when capacity is not null
```

It deliberately does **not** read current amount.

Failure reasons include:

```text
payment.queue.resource.unavailable
payment.queue.resource.capacity_insufficient
```

A satisfied queue-payment-feasibility result means only that payment storage/availability does not make waiting impossible. It does not imply that the command is otherwise queueable.

## Duplicate-line semantics

M3D1 preserves quote order and duplicate lines. M3D2 therefore evaluates cumulative requirements without rewriting the quote.

Example:

```text
RNA 2
RNA 2
RNA 2
```

with `RNA = 5` fails at the third line with cumulative requirement `6`.

The assessor records one failure per resource/dimension at the first threshold crossing while preserving deterministic quote-order reason ordering.

## Assessment-local observations

Within one assessment, the relevant facts for each distinct resource are read once and cached.

Current assessment reads:

```text
amount
capacity
```

Queue-payment feasibility reads:

```text
available
capacity
```

This prevents duplicate quote lines from observing inconsistent provider values inside one assessment and makes provider call count independent of quote fragmentation.

The two assessment modes intentionally use separate observations. M3D2 does not claim an atomic cross-call GameState snapshot because resources are still on the temporary legacy compatibility boundary.

## Empty quote

The M3D1 empty quote remains the canonical free quote.

Both assessments return satisfied immediately and perform zero resource reads.

## Numeric hardening

Each M3D1 quote line already requires a positive finite amount. D2 additionally checks cumulative addition.

If individually finite lines overflow to a non-finite cumulative requirement, assessment throws:

```text
PAYMENT_REQUIREMENT_OVERFLOW
```

The diagnostic identifies the resource, quote line, previous finite cumulative amount, and current line amount.

D2 introduces no epsilon/decimal arithmetic policy. Ordinary deterministic JavaScript Number arithmetic remains in force until the broader calculation architecture has evidence requiring a different rule.

## Structured results

Successful assessment:

```js
{
    assessment: 'current-affordability',
    status: 'satisfied',
    reasons: [],
}
```

Failed assessment:

```js
{
    assessment: 'current-affordability',
    status: 'failed',
    reasons: [
        {
            code: 'payment.current.resource.amount_insufficient',
            details: {
                lineIndex: 2,
                resourceId: 'namespace:resource/id',
                requiredAmount: 6,
                availableAmount: 5,
            },
        },
    ],
}
```

Results, reason arrays, reasons and detail records are frozen. They contain no localized presentation strings.

## Legacy evidence added by D2

D2 pins three ordinary-resource rules that were previously source-backed but not isolated by characterization:

1. current affordability ignores `display`, while legacy max/capacity feasibility requires display;
2. current affordability can fail solely because bounded capacity is below the payment even when current amount is high enough;
3. legacy `max = -1` represents unbounded ordinary-resource capacity.

The temporary legacy adapter normalizes that sentinel to:

```text
-1 -> null
```

Generic engine code never learns the legacy sentinel.

## Temporary RNA compatibility bridge

Resources are not yet an authoritative GameState domain, so M3D2 adds:

```text
src/legacy/bridge/evolve-payment-read-adapter.mjs
```

The adapter is intentionally first-party/internal and currently supports exactly:

```text
evolve:resource/rna
```

through the existing legacy mapping catalog entry for `global.resource.RNA`.

It exposes only read facts required by D2, imports no vanilla action/helper module, receives legacy state through an injected root reader, and remains read-only.

The compatibility removal target remains M6B.

Differential tests compare a resolved `2 RNA` quote against legacy current/max affordability across:

- insufficient current RNA but sufficient capacity;
- exact current affordability;
- insufficient capacity despite high current holdings;
- hidden RNA that remains currently payable but is not queue-payment feasible;
- unbounded legacy capacity.

## Architecture boundary

Generic `src/engine/costs/**` remains prohibited from importing or accessing:

- legacy state/adapters;
- GameState/state infrastructure;
- commands;
- conditions;
- effects;
- runtime/platform services;
- DOM/jQuery/Vue/browser APIs;
- raw mutation/transaction authority;
- `modRes`, `setGlobal` or `payCosts`;
- first-party canonical `evolve:` content knowledge;
- dynamic module loading or runtime code generation.

D2 specifically prohibits drift into:

- PaymentPlan/payment execution;
- debit/credit mutation semantics;
- the M4 modifier/calculation pipeline;
- queue scheduling/work-item implementation.

Outside the cost package, production code may enter only through the reviewed static ESM entries:

```text
payment-quote.mjs
payment-assessor.mjs
```

The legacy payment adapter is separately constrained to identity/inert-data helpers plus the legacy mapping catalog and may not acquire mutation authority.

## Deliberate non-goals

M3D2 does not:

- construct a PaymentPlan;
- debit or credit resources;
- execute payments or effects;
- provide atomic payment/effect commit;
- resolve prestige or special payment sources;
- implement antimatter Plasmid remapping;
- implement Knowledge, Supply or Species payment semantics;
- evaluate pseudo-cost requirements such as Bool, Morale, Army, HellArmy, Troops, Structs or Custom;
- evaluate declared cost functions or reproduce `adjustCosts()`;
- add M4 calculation/modifier architecture;
- predict future resource production;
- decide general queue eligibility;
- create queue work items;
- cut over `evolution.dna` or any other vanilla action.

## Definition of done

M3D2 is complete when:

1. `PaymentQuote` remains the immutable D1 input language;
2. a single reviewed PaymentAssessor factory exists;
3. current affordability and queue-payment feasibility are separately named and separately implemented;
4. current affordability reads only amount + capacity;
5. queue-payment feasibility reads only availability + capacity;
6. duplicate lines are cumulatively accounted for without changing quote structure;
7. distinct resource observations are cached within each assessment;
8. unbounded capacity uses engine `null`, not legacy `-1`;
9. empty quotes succeed without reads;
10. cumulative overflow fails closed;
11. outcomes are deterministic frozen machine-readable data;
12. malformed/hostile quotes, providers, return values, thenables and thrown values fail closed;
13. assessment reentrancy is rejected and the lock recovers after failure;
14. the temporary compatibility bridge supports only RNA and remains read-only;
15. RNA differential evidence matches the characterized legacy current/max questions;
16. the D1 quote boundary remains intact;
17. a cumulative D2 architecture gate is wired into `npm run test:architecture`;
18. no state mutation, PaymentPlan, queue implementation, modifier pipeline, persistence or UI authority is added;
19. the complete repository tests/build/browser safety checks remain green.
