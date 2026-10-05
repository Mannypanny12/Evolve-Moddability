# M3C2 Deep Review and Hardening

## Purpose

This pass reviews the completed M3C2 core resource operation slice before M3C3 introduces the first concrete vanilla EffectPlan evidence.

The review treats EffectPlan construction as a trust boundary. The important questions are not only whether `resource.grant` and `resource.consume` validate correctly, but whether malformed inputs can force unnecessary reflection, whether the declared supported-kind surface can drift from the actual dispatcher, and whether production code can bypass `createEffectPlan()` and consume lower-level parser/normalizer helpers directly.

No vanilla gameplay path is cut over in this hardening pass.

## Review scope

The pass re-read and cross-checked:

- `src/engine/effects/common.mjs`;
- `src/engine/effects/effect-plan.mjs`;
- `src/engine/effects/core-operations.mjs`;
- the hardened M3C1 inert-data and effect architecture boundaries;
- M3C2 resource-operation unit coverage;
- M3A0 payment/effect separation;
- M2 mutation-authority constraints;
- the production import surface around `src/engine/effects/**`.

## Review findings

### 1. Resource operations could force descriptor inspection for thousands of fields that are guaranteed invalid

M3C1 intentionally permits generic effect-data objects up to `MAX_EFFECT_OBJECT_FIELDS = 4096` because future inert effect data may legitimately be wider than today's first operation schema.

M3C2 resource operations are much narrower: every supported operation has exactly three fields:

```text
kind
resourceId
amount
```

The first M3C2 implementation reused the generic 4096-field object-inspection ceiling while discovering an operation. A malformed operation containing hundreds or thousands of fields was therefore fully descriptor-inspected before the closed three-field schema rejected it.

That is unnecessary hostile-input surface.

**Fix:** operation discovery now receives `MAX_CORE_EFFECT_OPERATION_FIELDS = 3`. `inspectPlainInertObject()` already checks the key count before reading field descriptors, so an oversized operation is rejected immediately after key enumeration and before descriptor inspection.

This deliberately changes diagnostic precedence for an operation containing more than three fields: the operation as a whole is rejected for excessive width before a specific fourth field is reported as unknown.

### 2. The exported supported-kind list and the actual dispatcher were independent sources of truth

The initial implementation exported:

```text
CORE_EFFECT_OPERATION_KINDS
```

while a separate `switch` statement independently listed the same two supported kinds.

Both were correct, but a future edit could add a kind to one and not the other. That would create misleading introspection/tests or an undocumented supported operation.

**Fix:** `CORE_EFFECT_OPERATION_KINDS` now directly controls admission. Once a kind passes that closed list, M3C2 applies the shared resource-operation schema. There is one authoritative supported-kind set for this slice.

When future operation families require different schemas, the dispatcher can be expanded deliberately during that reviewed slice rather than carrying duplicate M3C2 metadata now.

### 3. Lower-level effect helpers had no inbound production-consumer guard

M3C1 strongly constrains what effect modules themselves may import, but that is an outbound dependency rule. It did not prevent another production module from importing:

```text
src/engine/effects/common.mjs
src/engine/effects/core-operations.mjs
```

directly.

That matters more in M3C2 because `core-operations.mjs` now exports the raw normalizer used after the operation object has already been safely inspected. A new production caller could otherwise bypass the intended `createEffectPlan()` entry boundary and supply its own field container.

**Fix:** a dedicated M3C2 effect-surface fitness gate now enforces:

- production code outside `src/engine/effects/**` may import only `src/engine/effects/effect-plan.mjs`;
- effect-layer dependencies must use static ESM imports;
- only `effect-plan.mjs` may consume `core-operations.mjs`;
- only `effect-plan.mjs` and `core-operations.mjs` may consume `common.mjs` in the current M3C2 graph;
- path-normalized spellings cannot bypass those rules.

Tests remain free to import internals for adversarial coverage; the rule protects production source.

### 4. Duplicate semantics did not explicitly cover repeated input object identity

M3C2 already preserved duplicate operations by value, but there is an important distinction from generic `canonicalizeEffectData()` alias rules.

Inside one generic effect-data graph, shared object identity is rejected because it makes detached graph semantics ambiguous. At the EffectPlan operation-list level, however, two list positions are two semantic operations even when the caller happens to reuse the same input object reference.

**Fix:** regression coverage now proves:

```js
const op = { kind: 'resource.grant', resourceId: 'evolve:resource/dna', amount: 1 };
createEffectPlan([op, op]);
```

produces two independent frozen normalized operations in the same order. Reusing an input operation object is therefore explicitly valid duplicate intent, not forbidden aliasing.

## Architecture gate

The new first-class gate is:

```text
tests/architecture/m3c2-effect-surface-fitness.cjs
```

with adversarial coverage in:

```text
tests/architecture/m3c2-effect-surface-fitness.test.cjs
```

`npm run test:architecture` runs it after the M3C1 effect-boundary gate.

M3C1 remains responsible for what effect code may depend on. M3C2 now adds the complementary rule describing how production code may enter the effect layer.

## Deliberate non-changes

This review does **not**:

- add an EffectExecutor;
- add resource state reads or writes;
- add Registry lookups;
- define capacity, clamping, underflow or committed-quantity behavior;
- change positive finite amount semantics, including support for fractional amounts;
- turn `resource.consume` into an ordinary payment mechanism;
- add M3D cost/payment behavior;
- create a legacy resource mutation adapter;
- add operation registration or a public mod API;
- create the `evolution.dna` planner;
- cut over vanilla gameplay;
- change shared `EngineContractError` diagnostic-retention policy.

## Exit assessment

M3C2 is ready for M3C3 when the hardening head passes the complete repository test suite, the M3C1 and M3C2 architecture gates, production build/cleanliness checks, and real-browser smoke.

M3C3 can then use `evolution.dna` as the concrete closure proof that the effect side contains only the DNA grant while the RNA price remains outside M3C in M3D territory.
