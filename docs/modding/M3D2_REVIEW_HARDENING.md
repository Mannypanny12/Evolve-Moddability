# M3D2 Review and Hardening

## Scope

This review re-audits the complete M3D2 affordability and queue-payment-feasibility slice after its first implementation.

The review is deliberately adversarial. It re-checks:

- ordinary-resource parity against the legacy current/max questions;
- the separation between current affordability and payment-side queue feasibility;
- cumulative duplicate-line handling;
- deterministic reason ordering;
- assessment-local resource observations;
- malformed and hostile quote/provider inputs;
- error-detail ownership;
- reentrancy and lock recovery;
- temporary RNA compatibility behavior;
- complete-state non-mutation;
- public/internal surface boundaries;
- synchronous execution constraints;
- architecture-gate coverage;
- the forward boundary to M3D3/M3D4.

This review does **not** begin M3D3. It adds no `PaymentPlan`, debit/credit operation, payment execution, mutation authority, queue work item, cost modifier pipeline, special payment family, or vanilla action cutover.

## Result

The underlying M3D2 semantic split was sound.

No ordinary-resource legacy parity defect was found. For the RNA evidence vertical, the new engine still answers the same two legacy questions while keeping them explicitly separate:

```text
current affordability
    = current amount is sufficient
      AND bounded capacity is sufficient

queue-payment feasibility
    = resource is currently available/displayed
      AND bounded capacity is sufficient
```

The review did find several hardening gaps around hostile diagnostics, naming clarity, reentrancy evidence, synchronous architecture enforcement, and the temporary bridge scope. Those gaps are closed below.

## Findings closed

### 1. Malformed payment-read capability containers could escape through diagnostics

The first implementation delegated capability-object shape checking directly to the shared inert-data object inspector.

That helper is appropriate for structural validation, but some wrong-container failures can include the rejected object itself in `EngineContractError.details`. A hostile caller-owned Proxy could therefore survive the failed call and be touched later by logging or serialization.

Hardening:

- M3D2 now performs a safe plain-record preflight for the root payment-read capability object and its `resource` group;
- wrong primitive, array, exotic-object, hostile-Proxy, and revoked/throwing-prototype shapes fail with engine-owned scalar metadata only;
- hostile rejected containers are not retained in error details;
- tests verify that resulting diagnostic details remain safely serializable.

### 2. The assessor's top-level quote revalidation had the same ownership gap

M3D2 correctly revalidates arbitrary caller quote objects instead of trusting D1 provenance, but the first top-level `paymentQuote` inspection also delegated directly to the shared inert-data object reader.

That meant an exotic rejected quote container could likewise be retained in diagnostic details.

Hardening:

- the assessor now performs a safe top-level plain-record preflight before inert field inspection;
- hostile quote wrappers cannot escape through error details;
- D1 still owns validation of the quote line array and line records themselves.

### 3. Legacy adapter options and direct subject IDs could retain hostile caller objects

The temporary RNA compatibility bridge had two related problems:

1. malformed adapter option containers could be retained by shared inert-object diagnostics;
2. an unsupported direct `resourceId` was inserted into the bridge error details before the bridge had independently validated that it was a canonical resource ID.

The second issue is normally hidden when the bridge is used through `PaymentAssessor`, because the generic read capability canonicalizes IDs before invoking the adapter. The bridge is nevertheless an exported first-party compatibility surface and must fail safely on direct misuse too.

Hardening:

- bridge options now receive the same safe plain-record preflight;
- direct bridge subject IDs are independently parsed and type-checked;
- malformed IDs produce `INVALID_LEGACY_PAYMENT_SUBJECT_ID` using only safe type metadata;
- only a validated canonical resource ID may reach the unsupported-subject diagnostic;
- hostile subject objects are never retained.

### 4. Current-holdings diagnostics used the ambiguous field name `availableAmount`

The first D2 result shape used:

```text
availableAmount
```

for the current resource quantity on an `amount_insufficient` reason.

That became ambiguous because `resource.available(...)` has a distinct meaning in the same subsystem: it represents current display/payment availability for queue-payment feasibility.

Hardening:

- the final reviewed detail field is now:

```text
currentAmount
```

- `available` remains reserved for the availability/display concept;
- reason codes themselves are unchanged.

This review document is the final authority for that detail-field name where the initial M3D2 design document still shows the pre-review wording.

### 5. The exact assessor facade was implemented but not contract-pinned

The factory already returned only:

```text
assessCurrentAffordability
assessQueuePaymentFeasibility
```

but no runtime contract test would fail if an accidental third operation were later exposed.

Hardening:

- tests now pin the facade as frozen;
- tests pin its enumerable surface to exactly those two reviewed operations.

### 6. Reentrancy evidence covered only the simplest same-mode nesting case

A single assessor-wide lock is intentional. A payment read must not recursively launch either assessment mode on the same assessor while an assessment is active.

The first tests did not fully distinguish that rule from an accidental global/process-wide lock.

Hardening now proves:

- current -> queue nesting on the **same assessor** is rejected with `PAYMENT_ASSESSMENT_REENTRANCY`;
- the lock recovers after the rejected nested attempt;
- separate assessor instances may be nested synchronously;
- the lock also recovers after top-level quote-validation failures;
- the lock recovers after provider-read failures.

The reentrancy boundary is therefore instance-local and failure-safe.

### 7. Multi-resource reason ordering was not explicitly pinned

Single-resource duplicate tests already proved first-threshold-crossing behavior, but they did not prove deterministic ordering when resource lines are interleaved.

Hardening:

- interleaved resource tests now prove that reasons are emitted in the order their first relevant threshold crossing occurs in quote order;
- duplicate-line accumulation still does not rewrite or merge the quote;
- within a line, the existing dimension order remains deterministic.

### 8. Synchronous execution was behaviorally enforced but architecture enforcement was incomplete

The public factory regex rejected an `export async function`, and reader results rejected thenables, but ordinary source inside `src/engine/costs/**` could still have introduced hidden `async`, `await`, `Promise.resolve`, `new Promise`, or generator control flow without tripping the D2 architecture gate.

Hardening:

- the D2 cost-source fitness gate now rejects async/await control flow;
- direct Promise construction/static Promise use is rejected;
- generator-function control flow is rejected;
- the existing thenable-result defense remains runtime protection for injected capability providers.

M3D2 remains a synchronous engine contract by both behavior and architecture.

### 9. Legacy helper vocabulary could drift back into the generic cost layer

M3D2 intentionally replaces misleading legacy helper semantics with explicitly named engine questions.

The first cumulative D2 guard prevented legacy imports and mutation authority, but a future source edit could still reintroduce helper entry-point names such as `checkCosts` or `checkAffordable` inside the generic engine.

Hardening:

- the D2 fitness gate now rejects legacy cost-helper entry-point vocabulary including `checkCosts`, `checkAffordable`, `checkMaxCosts`, `payCosts`, and `adjustCosts` in executable cost-layer code;
- M4's calculation/modifier boundary remains untouched.

### 10. The temporary RNA bridge scope was tested but not architecture-pinned

Runtime tests proved that DNA was unsupported, but the architecture gate did not prevent a future edit from silently adding another legacy resource mapping or another adapter export.

Hardening:

- the bridge is pinned to exactly one synchronous one-argument export:
  `createEvolveLegacyPaymentReadProvider(rawOptions)`;
- the bridge's reviewed mapping list is pinned to exactly `evolve.resource.rna_state` for D2;
- widening this compatibility scope now requires a conscious architecture-guard transition in a later reviewed slice.

### 11. The RNA differential matrix was narrower than the generic contract

The initial matrix covered the principal current/max distinctions, but the generic contract also permits negative finite current observations and the adapter deliberately accepts numeric legacy display markers.

Hardening adds differential evidence for:

- exact capacity equality;
- numeric display marker `1`;
- negative current holdings with otherwise feasible capacity;
- the original insufficient-current, insufficient-capacity, hidden-resource, and unbounded-capacity cases.

All continue to agree with the corresponding legacy current/max answers.

### 12. Read-only behavior is now proven through the full RNA assessment path

The bridge already had direct read-only tests. The review adds complete-state evidence around the composed path:

```text
legacy state
    -> RNA compatibility provider
    -> PaymentAssessor
    -> current + queue-payment assessments
```

The serialized legacy state is identical before and after both assessments.

M3D2 therefore remains observational for the first real compatibility vertical.

## Reviewed contract after hardening

### Current affordability

For each ordinary resource, in quote order:

```text
cumulative required amount <= current amount
AND
cumulative required amount <= capacity when capacity is bounded
```

It reads exactly the payment facts relevant to this question:

```text
resource.amount(resourceId)
resource.capacity(resourceId)
```

It does not read `resource.available(...)`.

Current amount failure:

```js
{
    code: 'payment.current.resource.amount_insufficient',
    details: {
        lineIndex,
        resourceId,
        requiredAmount,
        currentAmount,
    },
}
```

### Queue-payment feasibility

For each ordinary resource, in quote order:

```text
resource is currently available/displayed
AND
cumulative required amount <= capacity when capacity is bounded
```

It reads:

```text
resource.available(resourceId)
resource.capacity(resourceId)
```

It does not read current amount.

This remains only **payment-side feasibility**. It is not M3E queue eligibility and does not predict future production or future prerequisite changes.

### Observation rule

Within one assessment, the relevant facts for each canonical resource are read once and cached.

The payment-read capability is an observational capability contract. M3D2 itself has no mutation authority, and first-party adapters supplied here must remain read-only.

Different top-level assessments intentionally do not claim a shared atomic snapshot while the resource domain still lives behind legacy compatibility state.

### Duplicate/resource identity rule

D2 accumulates by the current resolved quote `resourceId` while preserving line order and duplicate line identity.

This is sufficient for the ordinary-resource D2 slice.

A later payment-source remapping rule must happen at the correct semantic boundary before relying on affordability for a remapped source. In particular, future special behavior such as legacy Plasmid -> AntiPlasmid payment-source resolution may **not** assume that D2's pre-remap `resourceId` grouping already represents the eventual payment source.

That forward concern belongs to the later special-payment/source-resolution slice, not to D2.

## Deliberate non-goals preserved

The review adds no:

- `PaymentPlan`;
- payment debit/credit operation;
- payment execution;
- effect execution;
- generic transaction authority;
- GameState resource migration;
- prestige payment family;
- Knowledge/Supply/Species payment family;
- Plasmid/AntiPlasmid source remapping;
- pseudo-cost evaluation;
- declared-cost evaluation;
- `adjustCosts()` replacement;
- M4 modifier/calculation pipeline;
- future resource-production prediction;
- M3E queue work item;
- DNA command cutover.

## Handoff to M3D3

M3D3 can now treat D2 as a hardened read-only decision layer.

The next slice should add the inert semantic language for **what would be paid**, not payment execution itself.

Key constraints carried forward:

1. `PaymentQuote` remains the resolved price input language.
2. D2 remains observational and does not become the payment executor.
3. `PaymentPlan` must be distinct from M3C `resource.consume` effects.
4. Plan construction must not mutate either authoritative or legacy state.
5. Ordinary payment operations should preserve enough source/line identity for deterministic diagnostics and later atomic commit.
6. Special source remapping and compound legacy payment families must not be hidden in a generic ordinary-resource debit.
7. M4 still owns the general price calculation/modifier pipeline.
8. The DNA evidence target remains a semantic plan representing payment of exactly `2 RNA`, while M3C separately represents the `+1 DNA` effect.

## Closure status

No remaining M3D2 design blocker was found after this hardening pass.

M3D2 should be considered closed only at a hardening head where the complete repository test suite, explicit architecture fitness gate, production build/output checks, browser-startup negative control, and real-browser smoke test are all green.
