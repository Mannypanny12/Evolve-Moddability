# M2C3 State-Boundary Closure

## Purpose

M2C3 closes M2C (`Settings and transient-state separation`) without migrating gameplay authority.

M2C1 answered what legacy settings/runtime state exists. M2C2 answered which permanent layer should own each concept, which legacy containers must decompose, and which representations translate or reconstruct. M2C3 makes those decisions architectural debt ratchets so the legacy boundary can only shrink while later milestones migrate domains.

M2C3 remains behavior-neutral. It does not create production settings/UI/transient stores, move any value out of `global.settings`, add a gameplay `GameState` domain, change save/load/reset behavior, or alter simulation/UI behavior.

A post-implementation M2C review hardened this gate further after M2C3 first closed. The review found that top-level settings counts alone were insufficient for M2C2 containers whose nested fields have different target owners. M2C3 now also freezes those ownership-significant nested access paths.

A final adversarial syntax pass then challenged whether equivalent JavaScript spelling could bypass those debt maps. M2C3 therefore also has a fail-closed syntax companion gate around module references, settings access and the inspectable GameState root declaration.

## Architecture gates

The primary debt ratchet lives in:

```text
tests/architecture/m2c-boundary-fitness.cjs
```

The syntax fail-closed perimeter lives in:

```text
tests/architecture/m2c-syntax-hardening.cjs
```

The checked debt is deliberately split across two reviewed baseline files:

```text
tests/architecture/m2c-boundary-baseline.json
tests/architecture/m2c-nested-boundary-baseline.json
```

The first file preserves the original M2C3 top-level settings/runtime snapshot. The second file, added by the integrated M2C review, freezes ownership-significant nested settings debt. The scanner validates both component versions and composes them into the current M2C boundary snapshot. A missing, malformed, or version-drifted component fails closed.

Both M2C gates are part of `npm run test:architecture` alongside the existing M0E5, platform and legacy-bridge gates. Their adversarial unit tests also run under the normal `npm test` suite.

The architecture report exposes the checked M2C debt summary and violations, including nested settings module/reference/path counts.

## Top-level settings-access debt ratchet

M2C3 scans each legacy root JavaScript module under `src/*.js` for direct access to `global.settings`.

It recognizes:

- dot access such as `global.settings.pause`;
- static bracket access such as `global['settings']['pause']`;
- static `hasOwnProperty('pause')` existence checks as access to `pause`;
- dynamic bracket/existence access such as `global.settings[key]` as dynamic debt;
- root/container exposure such as assigning or passing `global.settings` itself.

Comments, string literals, template literal text and regular expressions do not create false settings debt through the shared source masker.

The original baseline stores counts per legacy module and per statically visible top-level setting key. Dynamic and root accesses use explicit pseudo-keys:

```text
$dynamic
$root
```

This is intentionally stricter than a total-reference counter. For directly visible accesses, a legacy module cannot remove one settings dependency and silently replace it with another while keeping the same total. Whole-object and dynamic capability edges are separately frozen so those escape hatches cannot grow unnoticed either.

The rule is downward-only:

- current count greater than baseline: fail because legacy debt increased;
- current count equal to baseline: pass;
- current count lower than baseline: fail until the baseline is ratcheted downward deliberately.

## Ownership-significant nested settings ratchet

M2C2 established that several legacy settings containers are not one semantic state bucket. Their children belong to different target layers or require decomposition/translation. Flattening every access to only the parent key would allow a module to exchange one nested dependency for another while retaining the same top-level count.

M2C3 therefore records a second downward-only debt map for these reviewed containers:

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

The scanner follows the path far enough to preserve the ownership distinction established in M2C2. Examples include:

```text
arpa.arpaTabs
arpa.physics
space.moon
space.$dynamic
msgFilters.$dynamic.unlocked
msgFilters.$dynamic.vis
msgFilters.$dynamic.max
msgFilters.$dynamic.save
keyMap.$dynamic
resBar.$dynamic
```

This matters because, for example, message-filter `unlocked` is progression/capability projection while `vis`, `max`, and `save` are application preferences. A change from `msgFilters[tag].vis` to `msgFilters[tag].unlocked` now changes the nested debt path and fails even if the module still has exactly one top-level `msgFilters` access.

Dynamic computed bracket expressions are represented by `$dynamic`. The parser continues after the matching closing bracket, so an expression such as:

```js
global.settings.msgFilters[getFilter(tags[index])].save
```

is recorded as:

```text
msgFilters.$dynamic.save
```

A direct reference to a mixed container without a sufficiently specific child is recorded with `$root` at the unresolved level. That makes unresolved capability debt visible instead of inventing a semantic classification.

## Whole-settings capability limitation

`$root` is intentionally a capability-level debt marker. When a module exposes the whole settings object, for example through:

```js
const s = global.settings;
```

or a Vue/application data object, downstream property reads can occur without spelling `global.settings` again in JavaScript source.

M2C3 freezes that whole-object exposure as a reviewed root capability edge. It does **not** claim to recover every later property read through arbitrary aliases, templates, framework bindings, closures, or callbacks. Doing so reliably would require whole-program/framework-aware analysis and would add false confidence rather than a useful architecture gate.

The important invariant is therefore:

- direct/static debt is key/path specific;
- dynamic debt is explicit;
- whole-settings-object capability debt is explicit and cannot grow;
- later application/UI migration must remove `$root` capabilities rather than treating them as clean dependencies.

M8 is the natural owner for eliminating the remaining application/UI whole-object exposures as the presentation layer moves to explicit state/commands.

## Runtime/transient consumer ratchet

M2C3 consumes the existing `RUNTIME_STATE_CONTRACT` from M2C2 and reviews consumers of every managed `vars.js` binding except the legacy `global` object itself.

The legacy `global` object is already covered by the broader M0E5 global-dependency ratchet. M2C3 focuses on classified settings/transient/runtime concepts such as:

- derived caches and reporting state;
- simulation/application working maps;
- message presentation state;
- callback/worker/interval services;
- platform storage service state.

For each managed binding, the baseline records the exact set of legacy root modules that import it from `./vars.js`.

Named imports preserve binding-specific visibility. The primary scanner also represents whole-module escape hatches as `$namespace`, including reviewed namespace/default imports, CommonJS `require('./vars')`, and dynamic `import('./vars.js')` forms, so those dependencies remain visible to the boundary model.

The final syntax companion gate makes current policy stricter: production consumers must use the canonical reviewed named-import syntax. A whole-module form, re-export, side-effect import, equivalent alternate relative path, combined import, or parser-ambiguous named import therefore fails before it can silently weaken binding-level visibility. `$namespace` remains defense-in-depth should that policy ever be deliberately relaxed.

A new consumer fails. If a consumer disappears, CI requires the checked baseline to be ratcheted downward.

The baseline binding keyset is also fail-closed against M2C2. A newly classified runtime binding cannot silently skip M2C3 consumer review.

## Syntax fail-closed perimeter

M2C3's debt scanners intentionally stay small and inspectable. The companion gate prevents legal JavaScript syntax from becoming a loophole around that simplicity.

### `vars.js` module references

The companion gate resolves module references using the existing parser-backed architecture tooling. It removes only a narrow canonical named-import grammar, then rejects any remaining module reference that resolves to `src/vars.js`.

This catches forms such as:

```js
import legacyVars, { p_on } from './vars.js';
import * as legacyVars from './vars.js';
export { p_on } from './vars.js';
export * from './vars.js';
const legacyVars = require('./vars');
const legacyVars = import('./vars.js');
import { p_on } from './../src/vars.js';
```

It also rejects named-import syntax whose comments/structure would make the lightweight binding parser ambiguous.

### Settings syntax

The companion gate rejects syntax that can hide settings ownership paths from the reviewed scanner, including:

```js
global?.settings.pause
global.settings?.msgFilters[tag].vis
global.settings.msgFilters?.[tag].unlocked
const { settings } = global;
global[`settings`].pause
const legacyRoot = global;
```

The whole-`global` alias case matters because all later settings accesses through that alias would otherwise be invisible to the direct `global.settings` ratchet.

The rule is deliberately scoped. Unrelated optional access such as `global?.tech` or `global.eden?.mech_station` is not rejected by the M2C settings companion gate.

Existing direct whole-settings exposures remain represented as reviewed `$root` debt; the syntax perimeter prevents different untracked escape mechanisms from being introduced around that debt model.

### GameState root declaration

The companion gate also independently verifies that `GAME_STATE_ROOT_FIELDS` remains an inspectable `Object.freeze([...])` array of plain quoted string literals. Whitespace, comments, commas and a trailing comma are allowed. Expressions, spreads, template literals and escaped/ambiguous string forms fail closed.

This prevents a declaration such as:

```js
const EXTRA_ROOT = 'settings';
const GAME_STATE_ROOT_FIELDS = Object.freeze([
    'schemaVersion',
    EXTRA_ROOT,
]);
```

from being partially inspected as though the non-literal entry did not exist.

## Baseline integrity

The M2C comparison does not assume that a checked JSON file is trustworthy merely because it parses.

The combined baseline validation checks:

- expected composite snapshot version;
- expected component baseline versions;
- settings and nested-settings maps are objects;
- every stored count is a non-negative safe integer;
- runtime consumer maps contain arrays of module-name strings;
- runtime consumer lists contain no duplicates;
- runtime binding keys stay synchronized with the M2C2 contract.

Malformed/version-drifted component files fail before repository debt is accepted.

## Permanent GameState exclusion

M2C3 adds one permanent semantic rule for all later GameState schemas: generic non-authoritative catch-all layers must never become authoritative GameState roots.

The post-implementation hardening widened this from a few exact spellings to normalized conceptual variants. Underscores, hyphens, spaces and casing do not evade the check. Prohibited concepts include generic forms of:

```text
settings / application settings
preferences / application preferences
application control
UI / UI session
derived state
cache / transient state
working / simulation working / application working
runtime / runtime services
platform / platform services
services
temporary state
migration state
debug state
```

The strict declaration check described above complements this semantic list: the boundary refuses an uninspectable root declaration rather than assuming only the literals it happened to extract exist.

This is not a complete future GameState ownership gate. M2E owns detailed authoritative-domain ownership, selector and mutation-boundary enforcement after M2D introduces the first real gameplay domain.

M2C3 only preserves the separation established by M2A-M2C: settings, application/UI control, derived/cache/transient data, working/runtime/platform machinery, migration debris and debug state cannot be smuggled into GameState through a generic root bucket.

The current `GameState` remains exactly:

```js
{
    schemaVersion: 1
}
```

and still has zero writable gameplay roots.

## Why M2C3 does not classify every legacy file by target layer

Large legacy modules remain mixed by design during the strangler migration. Files such as `main.js`, `functions.js`, `actions.js`, and the world-domain modules combine simulation, UI and application behavior.

Attempting to enforce the final M2C2 dependency graph on whole legacy files would either create a large exception list or force actual domain migration into M2C3.

Instead M2C3 freezes the existing mixed dependency debt. Later migration slices remove edges and ratchet the baselines downward.

## Why no new production stores are created

M2C3 deliberately does not add generic containers such as:

```text
PreferencesStore
SettingsStore
UIStore
TransientStore
CacheStore
ApplicationState
```

Creating empty target buckets before real consumers migrate would risk rebuilding `global` under cleaner names. Target capabilities should be introduced with the domain/application migration that actually owns their semantics.

## Relationship to later milestones

### M2D

M2D remains the first real authoritative state-domain migration. It may add the first gameplay domain to GameState and prove the end-to-end migration pattern.

### M2E

M2E expands architecture enforcement around actual GameState domain ownership, mutation authority, selectors and state-layer dependencies. M2C3 does not pre-empt those rules before a real authoritative domain exists.

### M7

M7 owns actual persistence v2, application/game-save serialization boundaries and legacy-save import/cutover.

### M8

M8 owns operational application/UI separation and command-driven presentation migration. It should also remove remaining whole-settings `$root` capability exposures instead of carrying them forward behind new aliases.

## Behavior boundary

M2C3 and its review hardening must not change:

- legacy gameplay behavior;
- `global.settings` authority or representation;
- legacy runtime values;
- GameState schema/version or writable roots;
- save/load/import/export;
- reset behavior;
- simulation loops;
- UI behavior;
- oracle snapshots.

The hardening changes only architecture scanners, syntax guards, checked baselines, tests, reports, command wiring and documentation. The integrated review diff from the pre-review M2C3 head contains no production `src/` change.

## Definition of done

M2C3 is complete and review-hardened when:

1. current direct legacy settings-access debt is frozen per module and per statically visible top-level setting key;
2. dynamic settings access and whole-settings capability exposure are explicit and cannot grow unnoticed;
3. M2C2 mixed/nested containers have a separate ownership-significant path ratchet;
4. changing a nested dependency across target-layer semantics fails even when top-level counts remain unchanged;
5. current consumers of M2C-managed `vars.js` runtime bindings are frozen;
6. named and whole-module runtime import escape hatches are visible to the boundary model;
7. current production consumers are additionally constrained to canonical named `vars.js` imports by the syntax companion gate;
8. new runtime binding classifications cannot bypass the consumer baseline;
9. all debt families are downward-ratcheting;
10. component and composite baselines fail closed on malformed/version-drifted data;
11. normalized generic non-authoritative application/UI/derived/working/runtime/platform/migration/debug buckets are permanently forbidden as GameState roots;
12. `GAME_STATE_ROOT_FIELDS` fails closed if non-literal/uninspectable entries are introduced;
13. optional/destructured/template/whole-global syntax cannot silently bypass settings debt tracking;
14. both M2C gates run in `npm run test:architecture`;
15. the architecture report exposes top-level, nested and runtime M2C debt and violations;
16. adversarial negative controls prove increases, decreases, nested ownership swaps, dynamic bracket parsing, new runtime consumers, module-reference syntax escapes, baseline drift, settings syntax escapes and forbidden/uninspectable GameState roots fail;
17. whole-settings `$root` exposure is explicitly recorded as unresolved capability debt rather than falsely described as per-key coverage;
18. no production state store or migration is introduced;
19. GameState remains `{ schemaVersion: 1 }` with zero writable roots;
20. gameplay/persistence/UI/oracle behavior remains unchanged;
21. the complete existing CI safety net remains green on the exact final hardening head.
