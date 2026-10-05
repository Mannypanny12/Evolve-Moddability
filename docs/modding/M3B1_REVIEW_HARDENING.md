# M3B1 Deep Review and Hardening

## Purpose

This pass reviews the completed M3B1 condition kernel before M3B2 adds real technology/resource/structure/trait primitives.

The review treats M3B1 as infrastructure that will eventually sit underneath first-party content and a public mod API, so the target is not merely "the happy-path tests pass". The target is a fail-closed, deterministic, inspectable boundary that is at least as defensive as the M3A1 command boundary and the M2 state architecture.

No vanilla gameplay path is cut over in this hardening pass.

## Review findings

### 1. Error enrichment was less hostile-input-safe than M3A1

`enrichConditionError()` read `error.code`, `error.message`, and `error.details` through ordinary property access and copied details with object spread.

A forged/subclassed `EngineContractError` could therefore expose accessors or proxy-backed details that execute or throw while the kernel is trying to report a different contract failure.

**Fix:** condition diagnostics now inspect own data-property descriptors only, never invoke diagnostic accessors, safely degrade uninspectable detail objects, preserve nested cause metadata, and distinguish validator/evaluator/result-normalization phases.

### 2. Dense-array checks could leak a raw TypeError

`readDenseConditionArray()` called `Array.isArray()` outside a defensive `try` block. A revoked proxy can make `Array.isArray(proxy)` throw a raw `TypeError`, bypassing `EngineContractError` normalization.

**Fix:** array identity inspection is now fail-closed and converted to the caller-selected condition contract error code.

### 3. The complete raw condition graph was not detached as one snapshot

Primitive params were detached, but the complete compound condition definition was structurally walked directly from caller-owned objects.

That left weaker behavior for:

- cycles in the condition graph;
- repeated/shared object identity across branches;
- hostile proxies that report different descriptors across separate inspections;
- caller-owned compound arrays/objects that were not first normalized into one inert snapshot.

**Fix:** every public `evaluate()` first canonicalizes and freezes the complete condition definition graph before structural normalization. Cycles and shared object identity are rejected deterministically, and the structural pass operates only on detached plain data.

A separate definition-data depth allowance preserves the existing semantic condition-depth limit while still allowing a maximally nested condition to contain maximally nested params.

### 4. Width was unbounded

Depth limits existed, but a malformed definition could still provide extremely wide arrays/objects and force very large loops/allocations.

**Fix:** the kernel now has explicit high safety ceilings for inert-data collection length and object field count, plus a tighter compound-condition fan-out ceiling. The limits are intentionally far above plausible Evolve requirement sets, but prevent pathological input from turning validation into an unbounded traversal.

### 5. Nested evaluator calls could hide executable condition composition

A primitive validator/evaluator could capture the evaluator and call `evaluate()` recursively. That creates condition structure in executable callback code rather than in the inert `all`/`any`/`not` tree, and can also create recursion hazards.

**Fix:** condition evaluation is now non-reentrant across evaluator instances. Compound recursion continues through the kernel's private normalized evaluator, while public nested `evaluate()` calls fail with `CONDITION_EVALUATION_REENTRANCY`. The lock is always released through `finally`.

### 6. Some non-callable-in-contract function shapes failed only at runtime

Declared async functions were rejected, but generator functions and class constructors could pass registration validation and fail later when invoked or normalized.

**Fix:** registration validation now rejects declared async functions, generators, and class constructors up front. Runtime Promise/thenable checks remain as the second line of defense for bound/proxied/otherwise opaque callables.

### 7. Invalid validator return data lost condition-phase context

A validator could return malformed inert data; the second canonicalization then failed outside the validator error-enrichment block.

**Fix:** validator invocation, thenable inspection, and canonicalization of the validated result are now one guarded validation phase. Contract failures preserve their original code while gaining `conditionKind`, `conditionPath`, `conditionPhase`, and `causeCode` context.

### 8. The dedicated architecture gate had avoidable escape hatches

The general M0E5 engine gate already covered several runtime globals, but the M3B1-specific guard did not independently forbid a broader set of platform/runtime escape hatches.

**Fix:** the M3B1 guard now also rejects common direct access to:

- `globalThis`/`self` and browser UI globals;
- browser storage/network APIs;
- Node globals such as `process`/`Buffer`;
- direct clock/random platform sources;
- timer/microtask scheduling;
- `eval`/`Function` dynamic code construction;
- non-JavaScript sibling imports;
- symbolic-link source entries under the condition kernel.

The guard still allows only `identity.mjs` plus sibling JavaScript condition modules.

## Tests added

The hardening suite adds focused negative controls for:

- cyclic and shared condition-definition identity;
- revoked-proxy array inspection;
- bounded collection/object/compound widths;
- generator/class registration rejection;
- nested evaluation and lock recovery;
- validator-return diagnostic context;
- hostile `EngineContractError` accessors;
- revoked/uninspectable diagnostic details;
- platform/runtime/dynamic-code architecture escape attempts;
- non-JavaScript condition imports;
- masking of forbidden names inside comments/strings/regex literals.

The pre-existing M3B1 behavior tests remain authoritative for primitive result semantics and `all`/`any`/`not` behavior.

## Deliberate non-changes

This review does **not**:

- add technology/resource/structure/trait primitives;
- introduce GameState/state selector dependencies;
- add cost/payment semantics;
- add queue/prediction semantics;
- expose third-party condition registration;
- cut over a vanilla action;
- change persistence or UI behavior.

Those boundaries remain exactly where the M3 roadmap places them.

## Exit assessment

After this pass, M3B1 is a stronger base for M3B2: input is snapshotted as inert data, traversal is bounded in both depth and width, nested executable composition is blocked, diagnostic handling is hostile-input-safe, and the dedicated architecture guard more closely matches the written condition-kernel boundary.
