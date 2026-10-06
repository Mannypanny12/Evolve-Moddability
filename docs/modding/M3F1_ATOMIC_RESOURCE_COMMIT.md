# M3F1 Atomic Resource Commit Boundary

## Purpose

M3F1 introduces the first execution-side seam required by the M3F vanilla command cutover without cutting `evolution.dna` over yet.

M3A-M3E deliberately stopped at validated command intent, read-only conditions, inert effect plans, inert payment plans, and inert queue/work-item representation. M3F1 fills the narrow missing responsibility for the first resource-only vertical:

```text
PaymentPlan + EffectPlan
        |
        v
resource commit executor
        |
        v
semantic commit capability
        |
        v
bounded Evolve legacy-resource adapter
```

The command bus still receives no state mutation authority, and the generic engine still does not import or inspect legacy state.

## Generic executor

`src/engine/execution/resource-commit.mjs` exports only:

```text
createResourceCommitExecutor(options)
```

The options object contains one synchronous semantic capability:

```text
commitResourceChanges(changes)
```

`commit(paymentPlan, effectPlan)` accepts the reviewed M3 resource subset only:

```text
payment.resource.debit -> resource.debit
resource.consume       -> resource.debit
resource.grant         -> resource.credit
```

Payment operations are always translated before effect operations. The executor does not net operations together because a later credit must never make an earlier unaffordable debit appear affordable.

Prestige and special-payment execution remain deliberately unsupported in this bounded slice. Their inert M3D representation is unchanged.

## Capability result

The commit capability returns one closed structured result:

```js
{ status: 'committed', reason: null }
```

or:

```js
{
    status: 'rejected',
    reason: {
        code: 'stable_machine_code',
        details: null | { primitive diagnostic fields }
    }
}
```

Expected current-state refusal is data. Malformed plans, malformed state, unsupported mappings, broken capability wiring, async leakage, or other contract failures remain `EngineContractError`s.

The executor canonicalizes capability diagnostics, rejects Promise/thenable leakage, invokes the capability without an implicit `this`, and uses a module-wide reentrancy lock.

## Bounded Evolve legacy adapter

`src/legacy/bridge/evolve-resource-commit-adapter.mjs` exports only:

```text
createEvolveLegacyResourceCommitCapability(options)
```

M3F1 deliberately supports only the already-reviewed mappings required by the first command vertical:

```text
evolve:resource/rna -> global.resource.RNA
evolve:resource/dna -> global.resource.DNA
```

The adapter receives `readLegacyRoot` at composition time. It does not import `vars.js`, `functions.js`, `actions.js`, or any other legacy gameplay module, and no raw legacy object crosses into engine code.

The removal milestone remains M6B, where resource authority is migrated out of the legacy root.

## Atomicity model

One commit captures one legacy root and performs a complete preflight before the first write.

For every referenced resource the adapter validates:

- reviewed canonical mapping;
- plain resource record;
- finite non-negative current amount;
- `max` equal to `-1` or a finite non-negative capacity;
- writable own data-field mutation target.

It then simulates the ordered batch against projected values.

A debit that cannot currently be paid returns `insufficient_resource`.

A credit whose resource is already at bounded capacity returns `resource_at_capacity`.

Neither refusal mutates state.

Credits that begin below capacity preserve the legacy `modRes(..., true)` behavior relevant to the DNA vertical: the final amount is clamped to capacity rather than exceeding it.

Only after every operation and every resource record has passed preflight are projected amounts written. Unexpected write failure triggers rollback of already-applied amounts before an engine contract failure is raised.

## Why operations are not netted

This is invalid for authorization:

```text
RNA current = 2
payment: RNA -3
effect:  RNA +2
net:     RNA -1
```

A net-delta implementation could incorrectly allow the transaction because the final amount would be non-negative. M3F1 instead preserves semantic order, so the payment fails before the effect is considered executable.

This law matters later for commands whose payment and effects touch the same source.

## Deliberate non-goals

M3F1 does not:

- register or dispatch the DNA command;
- modify `actions.js`;
- execute prestige payments;
- execute special payments such as Knowledge, Species or Supply;
- create a general EffectExecutor or PaymentExecutor;
- add queue execution or scheduling;
- migrate resource authority into GameState;
- add arbitrary legacy path mutation;
- import `modRes()` or `payCosts()` into the new path;
- change save/persistence behavior.

The next M3F slice owns the concrete `evolve:command/evolution/dna` registration and composes the already-built M3 condition/payment/effect contracts with this commit boundary.

## Architecture enforcement

`tests/architecture/m3f1-resource-commit-fitness.cjs` pins the new boundary:

- `src/engine/execution/**` contains exactly the reviewed resource commit module at this slice;
- the generic executor imports only engine identity and inert-data contracts;
- engine execution code contains no first-party Evolve knowledge, legacy state, DOM/UI, raw GameState mutation authority, platform services, queue authority, or persistence authority;
- the bounded adapter imports only engine contracts plus the reviewed mapping catalog;
- the adapter is limited to RNA/DNA mappings and does not call legacy gameplay helpers;
- no production consumer may use the new commit authority before the reviewed DNA cutover changes that rule.

## Definition of done

M3F1 is complete when:

1. resource-only PaymentPlan and EffectPlan operations can be translated into one ordered frozen commit batch;
2. payment operations always precede effect operations;
3. no net-delta shortcut can bypass an unaffordable debit;
4. the bounded Evolve adapter supports only reviewed RNA/DNA mappings;
5. all resource/state/write prerequisites are preflighted before mutation;
6. current-state payment/capacity refusal leaves every resource unchanged;
7. malformed later state cannot leave an earlier payment partially applied;
8. below-capacity grants retain the relevant legacy capacity-clamping behavior;
9. unexpected write failure attempts rollback before failing closed;
10. commit capability outcomes are synchronous, structured, detached and immutable;
11. nested resource commits are prohibited and the lock recovers after failure;
12. prestige/special payment execution remains outside the slice;
13. no vanilla gameplay path consumes the capability yet;
14. M3F1 architecture fitness is cumulative in `npm run test:architecture`;
15. the full test, architecture, build, generated-output and browser safety net remains green.
