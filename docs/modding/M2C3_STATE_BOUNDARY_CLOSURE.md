# M2C3 State-Boundary Closure

## Purpose

M2C3 closes M2 (`Settings and transient-state separation`) without migrating gameplay authority.

M2C1 answered what legacy settings/runtime state exists. M2C2 answered which permanent layer should own each concept, which legacy containers must decompose, and which representations translate or reconstruct. M2C3 makes those decisions architectural debt ratchets so the legacy boundary can only shrink while later milestones migrate domains.

M2C3 remains behavior-neutral. It does not create production settings/UI/transient stores, move any value out of `global.settings`, add a gameplay `GameState` domain, change save/load/reset behavior, or alter simulation/UI behavior.

## Architecture gate

The gate lives in:

```text
tests/architecture/m2c-boundary-fitness.cjs
```

with its reviewed baseline in:

```text
tests/architecture/m2c-boundary-baseline.json
```

It is part of `npm run test:architecture` alongside the existing M0E5, platform and legacy-bridge gates.

The architecture report also exposes the M2C boundary summary and violations.

## Settings-access debt ratchet

M2C3 scans each legacy root JavaScript module under `src/*.js` for direct access to `global.settings`.

It recognizes:

- dot access such as `global.settings.pause`;
- static bracket access such as `global['settings']['pause']`;
- static `hasOwnProperty('pause')` existence checks as access to `pause`;
- dynamic bracket/existence access such as `global.settings[key]` as dynamic debt;
- root/container exposure such as assigning or passing `global.settings` itself.

Comments, string literals, template literal text and regular expressions do not create false settings debt through the shared source masker.

The baseline stores counts per legacy module and per statically visible top-level setting key. Dynamic and root accesses use explicit pseudo-keys:

```text
$dynamic
$root
```

`$root` is intentionally a capability-level debt marker. When a module exposes the whole settings object, for example through a Vue data object or another alias, downstream property reads can occur without spelling `global.settings` again in JavaScript source. M2C3 therefore freezes that whole-object exposure as one reviewed root capability edge; it does not claim to recover every later property read through arbitrary aliases, templates, framework bindings, or callbacks.

Likewise, the per-setting counters cover accesses whose top-level key is statically visible at the `global.settings` access site. Unknown computed keys remain `$dynamic` rather than being guessed into a target contract.

This is intentionally stricter than a total-reference counter. For directly visible accesses, a legacy module cannot remove one settings dependency and silently replace it with another while keeping the same total. Whole-object and dynamic capability edges are separately frozen so those escape hatches cannot grow unnoticed either.

The rule is downward-only:

- current count greater than baseline: fail because legacy debt increased;
- current count equal to baseline: pass;
- current count lower than baseline: fail until the baseline is ratcheted downward deliberately.

## Runtime/transient consumer ratchet

M2C3 consumes the existing `RUNTIME_STATE_CONTRACT` from M2C2 and reviews consumers of every managed `vars.js` binding except the legacy `global` object itself.

The legacy `global` object is already covered by the broader M0E5 global-dependency ratchet. M2C3 focuses on classified settings/transient/runtime concepts such as:

- derived caches and reporting state;
- simulation/application working maps;
- message presentation state;
- callback/worker/interval services;
- platform storage service state.

For each managed binding, the baseline records the exact set of legacy root modules that import it from `./vars.js`. Namespace imports are recorded separately as `$namespace` because they bypass named-binding visibility.

A new consumer fails. If a consumer disappears, CI requires the checked baseline to be ratcheted downward.

The baseline binding keyset is also fail-closed against M2C2. A newly classified runtime binding cannot silently skip M2C3 consumer review.

## Permanent GameState exclusion

M2C3 adds one permanent semantic rule for all later GameState schemas: generic non-authoritative catch-all layers must never become authoritative GameState roots.

The gate rejects root fields named:

```text
settings
preferences
ui
uiState
cache
caches
transient
transients
runtime
tmp
tmp_vars
migration
debug
```

This is not a complete future GameState ownership gate. M2E owns detailed authoritative-domain ownership, selector and mutation-boundary enforcement after M2D introduces the first real gameplay domain.

M2C3 only preserves the separation established by M2A-M2C: settings, UI state, caches/transients, runtime machinery, migration debris and debug state cannot be smuggled into GameState through a generic root bucket.

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

Instead M2C3 freezes the existing mixed dependency debt. Later migration slices remove edges and ratchet the baseline downward.

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

M8 owns operational application/UI separation and command-driven presentation migration.

## Behavior boundary

M2C3 must not change:

- legacy gameplay behavior;
- `global.settings` authority or representation;
- legacy runtime values;
- GameState schema/version or writable roots;
- save/load/import/export;
- reset behavior;
- simulation loops;
- UI behavior;
- oracle snapshots.

The only production-adjacent change is the package script that makes the M2C3 scanner a first-class architecture gate.

## Definition of done

M2C3 is complete when:

1. current direct legacy settings-access debt is frozen per module and per statically visible top-level setting key;
2. dynamic settings access and whole-settings capability exposure are explicit and cannot grow unnoticed;
3. current consumers of M2C-managed `vars.js` runtime bindings are frozen;
4. new runtime binding classifications cannot bypass the consumer baseline;
5. all debt families are downward-ratcheting;
6. generic non-authoritative settings/UI/transient/runtime/migration/debug buckets are permanently forbidden as GameState roots;
7. the M2C3 gate runs in `npm run test:architecture`;
8. the architecture report exposes M2C3 debt and violations;
9. adversarial negative controls prove increases, decreases, new consumers, baseline-key drift and forbidden GameState roots fail;
10. no production state store or migration is introduced;
11. GameState remains `{ schemaVersion: 1 }` with zero writable roots;
12. gameplay/persistence/UI/oracle behavior remains unchanged;
13. the complete existing CI safety net remains green.
