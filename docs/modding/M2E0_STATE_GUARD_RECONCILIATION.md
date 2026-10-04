# M2E0 State-Guard Reconciliation

## Purpose

M2E0 reconciles the final M2C architecture hardening into the completed M2D4 lineage before M2E begins adding broader GameState ownership, mutation-boundary, selector, and state-layer dependency enforcement.

The M2C hardening branch and the later M2D implementation branch had diverged from a shared ancestor. M2D4 therefore contained the completed achievement authority/read migration but an older M2C boundary gate. M2E0 restores the final M2C protections without reverting any architecture improvements earned by M2D.

## Restored M2C protections

M2E0 restores:

- the M2C boundary scanner v2;
- ownership-significant nested `global.settings` path ratchets;
- the dedicated nested-boundary baseline;
- fail-closed baseline validation;
- normalized generic non-authoritative GameState-root rejection;
- the M2C syntax-hardening perimeter;
- canonical named `vars.js` import enforcement;
- settings syntax escape detection;
- strict inspectable `GAME_STATE_ROOT_FIELDS` syntax checks;
- adversarial tests for those boundaries;
- architecture-report assertions for the hardened M2C summary.

## Preserved M2D state

M2E0 deliberately keeps the M2D4 branch as its base. It does not replace or rewind:

- `GameState` schema version 2;
- the authoritative `GameState.achievements` domain;
- the achievement mutation service and scoped write capability;
- the M2D3 legacy compatibility projection;
- the M2D4 selector-backed reader facade;
- the M2D3/M2D4 architecture gates;
- the lower post-M2D legacy architecture budgets;
- the game and wiki browser smoke coverage added by M2D4.

The legacy architecture baseline therefore remains the newer M2D-ratcheted baseline rather than restoring the older M2C counts.

## Architecture command

`npm run test:architecture` now runs the reconciled sequence:

1. M0E5 architecture fitness;
2. platform fitness;
3. legacy-bridge fitness;
4. M2C boundary fitness;
5. M2C syntax hardening;
6. M2D3 achievement-authority fitness;
7. M2D4 achievement-reader fitness.

This makes the final M2C perimeter and the proven M2D domain-specific boundaries cumulative rather than alternative branch histories.

## Post-reconciliation review hardening

A separate adversarial review was performed after the initial reconciliation was green. It found four real ways in which the documented boundary was stronger than the machine enforcement.

### Mixed `global` import alias

The reviewed named `vars.js` import syntax allowed aliases. That was correct for ordinary managed runtime bindings because the consumer scanner records the original imported binding, but `global` is intentionally excluded from that per-binding runtime contract because it is a mixed legacy container.

An import such as:

```js
import { global as legacyRoot } from './vars.js';
```

could therefore make later `legacyRoot.settings.*` access invisible to the direct `global.settings` debt scanner.

The syntax perimeter now forbids aliasing the exported mixed `global` binding while continuing to allow reviewed aliases for ordinary managed runtime bindings.

### Parenthesized and computed global/settings syntax

The review also challenged equivalent JavaScript spelling around the legacy root. Parenthesized whole-root aliases such as `const root = (global)` and parenthesized access such as `(global).settings` could evade the existing direct-root syntax check.

Those forms are now rejected. Template-literal first-level access that cannot be statically proven safe, including interpolated forms capable of constructing `settings`, also fails closed rather than bypassing the settings-path ratchet.

### Adapter consumer path spelling

M2D3 documented the achievement adapter consumer list as locked, but the fitness gate discovered consumers through raw source-string matching. An equivalent resolved import path such as:

```js
./legacy/bridge/../bridge/achievement-state-adapter.mjs
```

could therefore bypass the allowlist.

M2D3 consumer discovery now reuses the parser-backed M0E5 module-reference extractor and resolves local paths before comparing them with the adapter file. Static imports, dynamic imports, re-exports, and equivalent relative spellings therefore cannot create an unreviewed adapter consumer merely by changing path syntax.

### Export-surface widening

The M2D3 adapter and M2D4 reader facade both claimed closed export surfaces, but their checks enumerated only `export function` declarations. A future `export const`, `export default`, class export, or re-export could have widened the authority/read surface without changing the reviewed function list.

Both gates now fail closed unless every executable `export` declaration is one of the exact reviewed named function exports. M2D4 additionally requires exactly one canonical module reference from the reader facade to the achievement adapter, preventing a second alternate or dynamic adapter reference from hiding beside the reviewed read-only import.

## Deliberately deferred to M2E

The review identified two broader concerns that should not be solved with more M2D achievement-specific checks:

- M2C's historical settings/runtime debt baselines are intentionally scoped to top-level legacy `src/*.js` modules. M2E3 should introduce generic state-layer dependency enforcement across the broader target architecture, including nested legacy/application surfaces, instead of retrofitting a second ad-hoc recursive M2C baseline.
- `inspect:architecture` exposes the M2C debt summary but does not yet aggregate the M2C syntax gate and M2D3/M2D4 domain-specific gate results. M2E4 should replace this fragmented reporting with the generic GameState ownership/mutation/selector/state-layer report planned for M2 closure.

Neither limitation permits the already-migrated achievement authority to widen through the reviewed adapter/read surfaces after the hardening above. They are scope for the generic M2E architecture rather than blockers for M2E0.

## Verification

The reconciliation and subsequent hardening passed the complete `Baseline build` workflow on Node 20, including:

- locked dependency installation;
- full Node test suite, including the new adversarial syntax cases;
- combined architecture fitness gate;
- production game/wiki build;
- generated-output cleanliness check;
- real-browser startup-failure negative control;
- normal real-browser game/wiki smoke tests.

No production gameplay/state implementation file changed in M2E0 or its review hardening.

## Closure

M2E0 is complete when the final M2C perimeter, the proven M2D boundaries, and the post-reconciliation adversarial corrections coexist on one green branch head. That condition is satisfied.

M2E1 can now introduce the generic machine-readable GameState domain-ownership contract on top of the reviewed state-boundary baseline.
