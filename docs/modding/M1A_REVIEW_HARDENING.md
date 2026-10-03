# M1A Post-Merge Review Hardening

This note records the focused hardening pass performed after the post-merge M1A code/legacy audit.

## Validation hardening

M1A contract failures must remain `EngineContractError` failures even when callers provide unusual JavaScript values. Diagnostic rendering therefore uses a fail-safe formatter rather than calling `JSON.stringify()` directly in error paths.

The identity formatter and registry constructor also validate their option containers before destructuring them, so `null`, arrays, and other wrong shapes cannot escape as native destructuring errors.

Registry tag and alias validation uses dense iteration. Sparse arrays are rejected rather than allowing holes to bypass validation and later appear as `undefined` entries.

## Legacy alias boundary

M1A aliases are intentionally limited to **direct, context-free, one-to-one** legacy identifiers.

Examples that fit the alias mechanism include a legacy resource key such as `Food` mapping directly to `evolve:resource/food`.

Not every legacy Evolve reference has that shape. Some legacy identity/state relationships are contextual or composite. Examples include runtime-selected resource keys such as the current species and technology definitions that map into shared progression state keys such as `primitive` at different levels.

Those cases must **not** be forced into M1A aliases. They belong to the explicit legacy-to-engine mapping/bridge work in M1D, where the mapping can include the context and state semantics required for an unambiguous migration.

This preserves a simple invariant for M1A:

> a legacy alias is only valid when one exact legacy string unambiguously identifies one canonical definition within that registry.

## Added regression coverage

The hardening tests cover:

- BigInt and circular invalid values without leaking native serialization errors;
- invalid formatter/registry option container shapes;
- invalid BigInt schema versions and aliases;
- sparse tag arrays;
- sparse alias arrays;
- preservation of atomic failed registration.

No gameplay behavior, definition contract, package policy, or legacy migration behavior is introduced by this follow-up.
