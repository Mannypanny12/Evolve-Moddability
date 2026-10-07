# M3D4 Closure Review

## Scope

M3D4 closes the explicit prestige/special-payment foundation required by M3D without introducing payment execution or mutation authority.

The sequence is:

- M3D4A: legacy evidence and corrected payment taxonomy;
- M3D4B: prestige payment family and contextual Plasmid -> AntiPlasmid source resolution;
- M3D4C: generic special payment family, pool source, and Supply;
- M3D4D: resource-backed special sources, Knowledge, Species, and closure hardening.

## Final quote taxonomy

The generic `PaymentQuote` supports exactly three top-level families:

```text
resource
prestige
special
```

A special line has a canonical semantic `paymentId`, a positive finite amount, and exactly one explicit source from:

```text
resource:<canonical-resource-id>
pool:<canonical-payment-pool-id>
```

There are no generic Knowledge or Species quote kinds and no executable special-payment escape hatch.

## Final assessment model

Assessment is source-oriented.

Current affordability and queue-payment feasibility remain distinct questions. Requirements are accumulated by the actual resolved source, so independently declared lines cannot overdraw a shared source merely because they carry different quote/payment identities.

The complete reviewed source families are:

```text
ordinary resource / resource-backed special -> resource reads
prestige                                   -> prestige holdings
pool-backed special                        -> pool reads
```

The generic payment-read capability therefore remains:

```text
resource: amount / available / capacity
prestige: optional amount
pool: optional present / amount / capacity
```

No first-party Knowledge/Species read family exists.

## First-party compatibility semantics

### Prestige

Plasmid remains Plasmid outside antimatter and resolves to AntiPlasmid in antimatter. Direct AntiPlasmid remains AntiPlasmid without requiring universe context.

Resolved prestige requirements accumulate by actual prestige source. The characterized legacy converging-source overdraw bug is deliberately rejected.

### Supply

Supply resolves to the purifier supply pool rather than a same-named ordinary resource.

Current affordability uses purifier `supply`; queue feasibility uses purifier `sup_max`. Missing purifier state is ordinary failed pool assessment, while malformed present numeric state fails closed.

### Knowledge

Knowledge is semantically special but resource-backed:

```text
evolve:payment/knowledge
    -> evolve:resource/knowledge
    -> legacy global.resource.Knowledge
```

Its inert `payment.special.settle` operation preserves the semantic identity required by later atomic settlement to also update cumulative Knowledge spending.

### Species

Species is semantically special but resource-backed by the active population resource:

```text
evolve:payment/species
    -> evolve:resource/<active-reviewed-species>
```

The compatibility layer uses a reviewed species catalog tied to the live vanilla race keys and rejects arbitrary first-party identity synthesis. Resource reads verify that the active species still matches the resolved source and fail closed on context drift or missing/malformed population state.

The plan deliberately does not store current default-job identity or worker state. Those are commit-time semantics.

## PaymentPlan closure

The inert `PaymentPlan` operation set remains exactly:

```text
payment.resource.debit
payment.prestige.debit
payment.special.settle
```

Every quote line remains represented one-to-one and in order. Planning does not aggregate operations, assess affordability, execute payment, mutate state, invoke legacy `payCosts`, or acquire transaction authority.

## Intentional hardening versus legacy

M3D4 preserves valid legacy behavior but rejects several malformed-state hazards:

- resolved prestige sources cannot silently fall through to a different payment family;
- Plasmid and direct AntiPlasmid requirements cannot independently approve and then overdraw one resolved AntiPlasmid source;
- malformed prestige and pool numeric state cannot poison holdings with `NaN`;
- missing active Species population becomes a deterministic contract/read failure rather than an uncontrolled crash;
- arbitrary species strings cannot be promoted into the reserved first-party namespace;
- Species source-context drift fails closed;
- Knowledge missing-counter `NaN` poisoning is not target behavior;
- Species partial population mutation before a missing-default-job failure is not target behavior.

The last two behaviors are settlement concerns and remain characterized requirements for the future atomic transaction layer rather than being implemented in M3D4.

## Architecture closure

M3D4 architecture gates enforce cumulatively that:

- generic payment code contains no first-party Evolve payment semantics;
- family classification is explicit rather than discovered from runtime bucket presence;
- special sources remain a closed inert union;
- compatibility bridges remain read-only and statically imported;
- Supply pool compatibility remains purifier-only;
- static resource-payment compatibility remains deliberately bounded;
- Species compatibility is bounded by the reviewed live first-party race catalog;
- no default-job, worker, cumulative Knowledge-stat, callback, mutation, queue, M4 modifier, or EffectPlan semantics enter the generic payment layer;
- payment execution remains deferred.

## Remaining boundary after M3D4

M3D4 has completed payment representation, source resolution, affordability assessment and inert payment planning for the reviewed resource, prestige and special-payment evidence.

It has deliberately not completed:

- payment execution;
- atomic settlement transactions;
- queue work-item representation;
- general price/modifier calculations;
- authoritative resource/prestige/pool state migration;
- pseudo-cost migration;
- vanilla action cutover.

The later M3 execution/cutover path must use these contracts to preflight and commit complete payments atomically together with semantic effects. M4 remains responsible for the general calculation/modifier pipeline.

## Closure criterion

M3D4 is closed when the final M3D4D branch passes:

1. the complete repository test suite;
2. the cumulative architecture gate including `m3d4d-special-payment-closure`;
3. the production game/wiki build and generated-output cleanliness check;
4. the real-browser startup negative control and smoke test.

Only a green full pipeline satisfies this closure review.
