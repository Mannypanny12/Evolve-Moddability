# M3C1 Deep Review and Hardening

## Purpose

This pass reviews the completed M3C1 effect-plan foundation before M3C2 introduces the first real semantic operation kinds.

The review treats M3C1 as a future trust boundary between command logic and authoritative mutation. The target is therefore stricter than “an empty plan can be created”: malformed or hostile inputs must fail closed, effect data must remain bounded inert data, and the effect layer must have no path to state/runtime authority.

No vanilla gameplay path is cut over in this hardening pass.

## Review scope

The pass re-read and cross-checked:

- `src/engine/contracts/inert-data.mjs`;
- `src/engine/effects/common.mjs`;
- `src/engine/effects/effect-plan.mjs`;
- the M3A/M3B callers affected by the shared inert-data extraction;
- the M3C1 architecture fitness gate;
- the M3A0 effect/mutation-boundary rules;
- M2E mutation-boundary ownership rules;
- the M3C1 unit and architecture tests.

The review deliberately did not add M3C2 resource semantics or any executor.

## Review findings

### 1. Missing planner output could silently become a legitimate empty plan

`createEffectPlan()` originally used a default `operations = []` argument.

That is convenient in isolation but unsafe in the later command pipeline: an omitted or accidentally `undefined` planner result would silently become a valid no-op EffectPlan. A missing effect computation should be a contract failure, not an implicit success.

**Fix:** `createEffectPlan(operations)` now requires an explicit operation array. `createEffectPlan([])` remains the deliberate no-op form; omitted, `undefined`, `null`, and non-array inputs fail with `INVALID_EFFECT_PLAN`.

### 2. Shared dense-array inspection had widened hostile proxy exposure

Before M3C1 extracted the generic inert-data inspector, command and condition array readers rejected a non-array immediately after `Array.isArray()`.

The first shared implementation performed prototype/key/length reflection before applying the `!array` rejection. For ordinary values this was equivalent, but for a proxy wrapping a non-array it could execute additional traps that the previous boundary never touched.

The same ordering issue existed in the plain-object inspector for array inputs: deeper reflection could occur even though the container type was already known to be invalid.

**Fix:** shared container inspection is now fail-fast:

- determine array identity defensively first;
- reject the wrong container type immediately;
- inspect prototype only after the type is accepted;
- inspect own keys/descriptors only after the prototype is accepted.

Focused regression tests prove wrong-container proxies are rejected without invoking prototype/key/descriptor traps.

### 3. Array size ceilings were checked after own-key enumeration

The first shared array reader called `Reflect.ownKeys()` before applying an optional `maxLength` ceiling.

For M3B/M3C data, a very large dense array could therefore force expensive key enumeration before the boundary rejected it for being too long. That undermines the purpose of the collection limit.

**Fix:** array inspection now reads and validates the `length` data descriptor first, applies `maxLength`, and only then enumerates own keys and element descriptors. A regression test uses a proxy whose `ownKeys` trap throws and proves an over-limit array is rejected without invoking the trap.

### 4. Local width limits did not bound total effect-data size

M3C1 already limited:

- nesting depth;
- each array length;
- each object field count.

Those limits still permit a multiplicative tree where every individual node is below its local ceiling but the complete graph contains a pathological number of values.

**Fix:** effect-data canonicalization now also enforces `MAX_EFFECT_DATA_NODE_COUNT = 16384` across the complete detached tree. The budget counts containers and scalar leaves and fails deterministically at the first value beyond the ceiling.

The limit is intentionally far above realistic operation data while preventing combinatorial input amplification.

### 5. The dedicated architecture gate had dynamic-loading/code-generation escape shapes

The first M3C1 guard rejected literal dynamic imports and direct `eval(...)` / `Function(...)` calls, but that leaves avoidable spellings such as:

- `import(variable)` where the dependency graph cannot resolve a literal target;
- aliasing `require` before use;
- indirect `(0, eval)(...)`;
- taking a reference to `Function` before calling it;
- WebAssembly execution.

**Fix:** the M3C1 source guard now rejects the capabilities themselves:

- any dynamic `import(...)` syntax;
- any `require` reference;
- any non-static-ESM module reference kind;
- any `eval`, `Function`, or `WebAssembly` reference outside comments/strings/regex literals.

This is intentionally stricter than ordinary application code because effect planning has no legitimate need for runtime code or module loading.

### 6. Sibling effect imports could target unscanned non-JavaScript files

The first boundary allowed any normalized path under `src/engine/effects/**`, while the source scanner itself only inspects JavaScript extensions.

That creates a mismatch: a sibling JSON/WASM/other file could be imported while living outside the code scanner's inspected source set.

**Fix:** sibling effect imports must resolve to `.js`, `.mjs`, or `.cjs` source. External packages remain forbidden.

### 7. Boundary roots needed explicit filesystem-shape checks

Nested effect-source symlinks were already rejected, but the effect root itself and the shared inert-data contract path were not explicitly verified as non-symlink regular filesystem objects.

**Fix:** repository fitness now requires:

- `src/engine/effects` to be a real directory, not a symbolic link;
- the inert-data contract to be a regular file, not a symbolic link;
- nested effect source symlinks to remain forbidden.

This keeps the static boundary scanner attached to the source tree it claims to inspect.

### 8. Diagnostic retention was reviewed and intentionally left unchanged

`EngineContractError` owns a repository-wide shallow diagnostic-detail policy. Some generic contract errors may retain a raw value reference inside their frozen top-level detail object.

Changing that policy only for M3C1 would create inconsistent error semantics across identity, command, condition, and effect contracts. The M3C1 effect canonicalizer itself does not use unsafe value formatting for hostile composite data, and no M3C1 result/persistence surface exposes these errors as authoritative gameplay data.

**Decision:** no M3C1-local diagnostic fork was introduced. If diagnostic deep sanitization is changed, it should be reviewed at the shared `EngineContractError` boundary rather than patched piecemeal in effects.

## Tests added or strengthened

The hardening suite now covers:

- omitted/`undefined`/`null` EffectPlan operation input;
- explicit empty-plan creation;
- fail-fast non-array proxy rejection without reflective traps;
- fail-fast array-as-object proxy rejection without reflective traps;
- over-limit array rejection before own-key enumeration;
- total effect-data node-budget exhaustion using individually valid arrays;
- literal and computed dynamic import attempts;
- direct and aliased `require` attempts;
- direct and indirect `eval` use;
- `Function` aliasing;
- WebAssembly use;
- non-JavaScript sibling effect imports;
- masking of forbidden words inside strings/comments;
- the live repository satisfying the strengthened M3C1 fitness scan.

Existing M3A and M3B suites remain the regression authority for the shared inert-data extraction.

## Deliberate non-changes

This review does **not**:

- add `resource.grant` or `resource.consume`;
- define payment/cost semantics;
- add an EffectExecutor;
- add GameState readers or writers;
- add mutation scopes, transactions, or domain mutation services;
- add conditions inside effect operations;
- add queues or persistence;
- add presentation/UI reactions;
- add mod-facing registration;
- cut over `evolution.dna` or any other vanilla action.

Those boundaries remain exactly where the M3 roadmap places them.

## Exit assessment

The hardened M3C1 boundary is ready to host M3C2's first closed semantic resource operations once the full repository test, architecture, build, and browser-smoke gates are green on the hardening head.
