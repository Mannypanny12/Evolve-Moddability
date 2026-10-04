# M2C Integrated Review and Hardening

## Scope

This review was performed after M2C1, M2C2 and M2C3 had all been implemented. Its purpose was not to redesign M2C, but to challenge the combined result as one architecture boundary before M2D begins the first authoritative gameplay-state migration.

The review covered:

- M2C1 classification completeness and fail-closed source ratchets;
- M2C2 target ownership, lifecycle, persistence, simulation role, migration disposition and reset semantics;
- mixed nested settings containers and their leaf ownership;
- `vars.js` runtime/working/service classifications and actual consumers;
- M2C3 scanner assumptions, baseline integrity and negative controls;
- the permanent exclusion of non-authoritative catch-all roots from `GameState`;
- behavior-neutrality of the complete M2C sequence.

## Review result

M2C1 and M2C2 had already received dedicated hardening passes and their principal semantic decisions still hold under this integrated review. No production-state ownership decision needed to be reversed.

The material weakness was in M2C3 enforcement rather than M2C2 design: the original boundary scanner froze top-level settings keys, but several M2C2 containers deliberately contain children with different target owners. That meant the architecture contract was more precise than the debt ratchet enforcing it.

The review therefore hardened M2C3 so enforcement now preserves the ownership distinctions already established by M2C2.

## Finding 1: top-level-only ratcheting flattened mixed ownership

### Problem

The original M2C3 scanner counted accesses such as:

```js
global.settings.msgFilters[tag].vis
global.settings.msgFilters[tag].unlocked
```

as the same top-level dependency:

```text
msgFilters
```

M2C2 does not consider those equivalent:

- `unlocked` is a progression/capability projection;
- `vis`, `max` and `save` are application preferences.

A module could therefore have exchanged one nested semantic dependency for another while preserving its top-level `msgFilters` count.

The same enforcement weakness applied, with different semantics, to the reviewed mixed/nested containers:

```text
arpa
space
portal
eden
tau
msgFilters
keyMap
resBar
```

### Hardening

M2C3 now builds a second checked debt map for ownership-significant nested paths. The scanner follows each reviewed container to the depth needed by its M2C2 contract and records static, dynamic and unresolved path segments separately.

Examples:

```text
arpa.arpaTabs
arpa.physics
space.moon
space.$dynamic
msgFilters.$dynamic.unlocked
msgFilters.$dynamic.vis
keyMap.$dynamic
resBar.$dynamic
```

The nested debt is downward-only, just like the original top-level ratchet.

An adversarial test now proves that replacing `msgFilters.$dynamic.vis` with `msgFilters.$dynamic.unlocked` fails even when the top-level `msgFilters` count remains exactly unchanged.

## Finding 2: computed bracket parsing could lose later ownership information

### Problem

A naive property scanner can stop at a dynamic bracket expression and lose a statically visible suffix:

```js
global.settings.msgFilters[getFilter(tags[index])].save
```

The important M2C2 ownership information is the final `.save` field.

### Hardening

The scanner now finds the matching closing bracket and continues parsing. The example above is recorded as:

```text
msgFilters.$dynamic.save
```

A negative-control test covers nested computed brackets as well.

## Finding 3: runtime whole-module imports needed an explicit escape-hatch class

### Problem

Named imports from `./vars.js` provide binding-specific consumer visibility. Whole-module access can bypass that granularity.

### Hardening

M2C3 already had `$namespace` debt for namespace imports. The review broadened that escape-hatch detection to cover reviewed forms of:

- namespace imports;
- default imports;
- `require('./vars')`;
- dynamic `import('./vars.js')`.

Introducing one of these forms therefore creates explicit `$namespace` debt instead of silently bypassing the named-binding ratchet.

## Finding 4: baseline files themselves needed stronger fail-closed handling

### Problem

A debt ratchet is only as strong as the checked baseline it trusts. A malformed or version-mismatched baseline should not degrade into partial comparison behavior.

### Hardening

The original M2C3 baseline is retained unchanged as provenance for top-level settings/runtime debt:

```text
tests/architecture/m2c-boundary-baseline.json
```

The review adds a separate nested baseline:

```text
tests/architecture/m2c-nested-boundary-baseline.json
```

The scanner validates the component versions and composes them into boundary snapshot version 2. The composite validator also checks count-map shapes, non-negative safe integer counts, runtime consumer array types and duplicate consumers.

Tests prove component version drift fails closed.

## Finding 5: GameState catch-all protection was too spelling-specific

### Problem

The original M2C3 prohibition rejected a useful set of exact generic root names, but equivalent names could be introduced with a different spelling such as `derived_state` or `applicationWorking`.

### Hardening

The guard now normalizes case, underscores, hyphens and spaces and rejects generic variants representing:

- settings/preferences/application control;
- UI/session state;
- derived/cache/transient state;
- simulation/application working state;
- runtime/platform/service machinery;
- temporary/migration/debug state.

The guard remains deliberately semantic rather than a claim to enumerate every future bad domain name. M2E will provide broader ownership enforcement after M2D introduces real authoritative domains.

## Finding 6: whole-settings aliases remain capability debt, not per-key proof

### Review conclusion

The review traced current `$root` sites. Legacy code sometimes exposes `global.settings` as a whole object, including ordinary JavaScript aliases and application/Vue data bindings.

Once the whole object crosses such a boundary, a lightweight static scanner cannot reliably reconstruct every downstream property access through arbitrary aliases, templates, closures and framework bindings.

Trying to report those sites as per-key coverage would be false confidence.

M2C3 therefore keeps the conservative rule:

- direct/static accesses are key/path specific;
- computed accesses are `$dynamic` debt;
- whole-object exposures are `$root` capability debt;
- all three are frozen and may only shrink.

M8 should eliminate the remaining application/UI `$root` capabilities as presentation code migrates to explicit state and commands.

## Rechecked M2C2 semantic decisions

The integrated review did not find evidence requiring an M2C2 ownership reversal.

In particular:

- `pause` remains application/scheduler control rather than authoritative gameplay state;
- `disableReset` remains an application/UI safety latch;
- reviewed `show*` fields remain derived progression/UI projections;
- persisted region flags remain migration evidence that must translate into future world/progression authority before UI availability becomes derived;
- ARPA navigation remains distinct from ARPA progression availability;
- message-filter capability remains distinct from filter preferences;
- key mappings and resource-bar choices remain application preferences;
- `message_logs` selected view remains distinct from reconstructed presentation buffers;
- mutable `vars.js` working maps remain non-persistent/reconstructible where classified as such;
- executable/platform objects remain services rather than GameState.

`active_rituals` was specifically rechecked against current source. It is reconstructed from authoritative legacy casting state and maintained as runtime working data during the loop, so its simulation-working/reconstruct classification remains appropriate.

## Behavior boundary

This review/hardening changes only:

- architecture scanning;
- checked debt baselines;
- architecture tests/report assertions;
- documentation.

It does not change:

- gameplay behavior;
- legacy settings values or authority;
- save/load/import/export;
- reset semantics;
- simulation cadence;
- UI behavior;
- oracle snapshots;
- `GameState` schema/version;
- writable GameState roots.

`GameState` therefore still contains only:

```js
{ schemaVersion: 1 }
```

and M2D remains the first actual authoritative gameplay-state migration.

## Review closure criteria

The integrated M2C review is closed when:

1. ownership-significant nested settings debt is frozen separately from the original M2C3 baseline;
2. nested target-layer swaps fail even if top-level counts are unchanged;
3. dynamic bracket paths preserve statically visible suffix ownership;
4. runtime whole-module escape hatches are visible as `$namespace` debt;
5. component/composite baselines fail closed on version or shape errors;
6. generic GameState catch-all variants cannot evade the guard by spelling changes;
7. architecture reporting exposes nested debt;
8. the temporary snapshot bootstrap is removed;
9. no production source changes are present;
10. the complete CI safety net passes on the exact final review head.
