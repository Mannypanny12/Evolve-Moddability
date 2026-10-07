# M2C Integrated Review and Hardening

## Scope

This review was performed after M2C1, M2C2 and M2C3 had all been implemented. Its purpose was not to redesign M2C, but to challenge the combined result as one architecture boundary before M2D begins the first authoritative gameplay-state migration.

The review covered:

- M2C1 classification completeness and fail-closed source ratchets;
- M2C2 target ownership, lifecycle, persistence, simulation role, migration disposition and reset semantics;
- mixed nested settings containers and their leaf ownership;
- `vars.js` runtime/working/service classifications and actual consumers;
- M2C3 scanner assumptions, baseline integrity and negative controls;
- syntax-level escape hatches around the M2C3 scanners;
- the permanent exclusion of non-authoritative catch-all roots from `GameState`;
- behavior-neutrality of the complete M2C sequence.

## Review result

M2C1 and M2C2 had already received dedicated hardening passes and their principal semantic decisions still hold under this integrated review. No production-state ownership decision needed to be reversed.

The principal material weakness was in M2C3 enforcement rather than M2C2 design: the original boundary scanner froze top-level settings keys, but several M2C2 containers deliberately contain children with different target owners. That meant the architecture contract was more precise than the debt ratchet enforcing it.

A second adversarial pass then challenged the scanner itself with equivalent JavaScript syntax. That exposed several routes by which a regex-oriented boundary check could lose dependency visibility even though the underlying code still referenced the same legacy capability.

The review therefore hardened M2C3 at both levels:

1. preserve the ownership distinctions already established by M2C2;
2. fail closed when syntax would make that dependency evidence ambiguous or invisible.

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

An adversarial test proves that replacing `msgFilters.$dynamic.vis` with `msgFilters.$dynamic.unlocked` fails even when the top-level `msgFilters` count remains exactly unchanged.

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

M2C3 retains `$namespace` debt for whole-module access and recognizes reviewed forms of:

- namespace imports;
- default imports;
- `require('./vars')`;
- dynamic `import('./vars.js')`.

The final syntax companion gate is stricter still: current production consumers must use the canonical reviewed named-import form. `$namespace` remains defense-in-depth and preserves visibility should the policy be deliberately changed later; it is not permission for an unreviewed consumer to introduce a whole-module capability today.

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
- whole-settings-object exposures are `$root` capability debt;
- all three are frozen and may only shrink.

M8 should eliminate the remaining application/UI `$root` capabilities as presentation code migrates to explicit state and commands.

## Finding 7: equivalent `vars.js` module syntax could escape binding-level visibility

### Problem

The binding consumer ratchet intentionally reasons about canonical named imports. Equivalent JavaScript syntax can represent the same module dependency while defeating a narrow import regex. Relevant adversarial forms include:

```js
import legacyVars, { p_on } from './vars.js';
import * as legacyVars from './vars.js';
export { p_on } from './vars.js';
export * from './vars.js';
const legacyVars = require('./vars');
const legacyVars = import('./vars.js');
import { p_on } from './../src/vars.js';
import { p_on /* hidden from a simplistic binding parser */ } from './vars.js';
```

The last examples are important because the module identity is unchanged even though textual spelling or binding syntax changes.

### Hardening

A companion architecture gate now uses the existing parser-backed module-reference extraction to resolve actual module targets. Only a deliberately narrow canonical named-import grammar is removed before that check. Any remaining reference that resolves to `src/vars.js` is rejected.

This gives the existing binding-level debt map a fail-closed syntax perimeter instead of asking its small binding parser to understand every legal ECMAScript import/re-export form.

Regression tests cover default, namespace, combined, CommonJS, dynamic import, re-export, side-effect import, equivalent relative path, and parser-ambiguous commented named imports.

## Finding 8: settings syntax variants could hide path-specific debt

### Problem

The direct settings scanner is intentionally lightweight. Several legal syntax forms can obscure the property path it is supposed to ratchet:

```js
global?.settings.pause
global.settings?.msgFilters[tag].vis
global.settings.msgFilters?.[tag].unlocked
const { settings } = global;
global[`settings`].pause
const legacyRoot = global;
```

The final example is broader than a settings alias: once the entire legacy root is aliased, future settings access can occur without another textual `global.settings` edge at all.

### Hardening

The syntax companion gate now rejects:

- optional chaining anywhere inside a direct `global.settings` property chain when it would bypass path-specific debt tracking;
- destructuring `settings` from the legacy root;
- static template-literal access to the settings property;
- simple whole-`global` aliases/assignments that could hide all later settings access.

The guard is scoped to the M2C boundary rather than banning modern syntax generally. Existing unrelated patterns such as `global?.tech` or `global.eden?.mech_station` remain legal and are covered by a negative-control test.

Existing direct whole-settings exposures remain governed by the reviewed `$root` policy from Finding 6; this hardening prevents new *different* escape mechanisms from bypassing that visible debt class.

## Finding 9: GameState root inspection could silently ignore non-literal entries

### Problem

The original GameState root guard located the `GAME_STATE_ROOT_FIELDS` array and extracted quoted entries. An expression mixed into the array could therefore be invisible to the extracted list:

```js
const EXTRA_ROOT = 'settings';
const GAME_STATE_ROOT_FIELDS = Object.freeze([
    'schemaVersion',
    EXTRA_ROOT,
]);
```

A fail-closed architecture boundary must not treat an uninspectable declaration as equivalent to a literal-only reviewed declaration.

### Hardening

The companion gate independently parses the declaration using a deliberately strict grammar. The array may contain plain quoted string literals, whitespace, comments, commas and a trailing comma. Expressions, spreads, template literals and escaped/ambiguous string forms fail the gate rather than being skipped.

An adversarial test proves that a non-literal entry hidden among valid literals is rejected.

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
- syntax-level boundary guards;
- checked debt baselines;
- architecture tests/report assertions;
- architecture-test wiring;
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

The complete diff from the pre-review M2C3 head contains no production `src/` change.

`GameState` therefore still contains only:

```js
{ schemaVersion: 1 }
```

and M2D remains the first actual authoritative gameplay-state migration.

## Enforcement entry points

The primary M2C3 ratchet remains:

```text
tests/architecture/m2c-boundary-fitness.cjs
```

The syntax fail-closed perimeter is:

```text
tests/architecture/m2c-syntax-hardening.cjs
```

Both are part of `npm run test:architecture`, while their adversarial regression tests also run under the normal `npm test` suite. CI therefore cannot pass merely because only one of the two M2C enforcement layers was exercised.

## Review closure criteria

The integrated M2C review is closed when:

1. ownership-significant nested settings debt is frozen separately from the original M2C3 baseline;
2. nested target-layer swaps fail even if top-level counts are unchanged;
3. dynamic bracket paths preserve statically visible suffix ownership;
4. runtime whole-module escape hatches are visible to the M2C boundary;
5. component/composite baselines fail closed on version or shape errors;
6. generic GameState catch-all variants cannot evade the guard by spelling changes;
7. architecture reporting exposes nested debt;
8. the temporary snapshot bootstrap is removed;
9. non-canonical `vars.js` module-reference syntax cannot bypass binding-level consumer visibility;
10. optional/destructured/template/whole-global syntax cannot silently bypass settings debt tracking;
11. `GAME_STATE_ROOT_FIELDS` fails closed if its declaration contains non-literal entries;
12. no production source changes are present;
13. both M2C architecture gates are wired into the standard architecture command;
14. the complete CI safety net passes on the exact final review head.
