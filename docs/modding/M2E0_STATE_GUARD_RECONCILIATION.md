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

## Verification

The reconciliation push passed the complete `Baseline build` workflow on Node 20, including:

- locked dependency installation;
- full Node test suite;
- combined architecture fitness gate;
- production game/wiki build;
- generated-output cleanliness check;
- real-browser startup-failure negative control;
- normal real-browser game/wiki smoke tests.

No production gameplay/state implementation file changed in M2E0.

## Closure

M2E0 is complete when the reconciled hardening and M2D gates coexist on one green branch head. That condition is satisfied.

M2E1 can now introduce the generic machine-readable GameState domain-ownership contract on top of the strongest available state-boundary baseline.
