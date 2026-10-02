# M0D Deterministic Differential Simulation Oracle

## Purpose

M0D turns the legacy Evolve simulation into a deterministic behavioral oracle for the full refactor.

For a fixed:

- M0C fixture;
- wall clock;
- unseeded RNG seed;
- seeded legacy RNG state;
- number of loop periods;

the same normalized state must be produced every time.

The harness also provides a structural reference-versus-candidate comparison API that future engine slices can use while legacy and refactored implementations coexist temporarily.

## Real legacy simulation entry point

M0D runs Evolve's actual exported:

```js
execGameLoops(periods)
```

from `src/main.js`.

It does not reproduce the loop in test code.

For the frozen oracle scenarios, `periods = 20`. With the current legacy cadence this executes:

- 20 fast-loop periods;
- 5 mid-loop periods;
- 1 long-loop period.

This deliberately crosses all three major legacy simulation phases.

## Process isolation

Every oracle execution runs in a fresh Node child process.

This is required because the legacy runtime has mutable module-level state that is not contained in the serialized save object, including loop counters, first-run flags, caches, callbacks, and other transients.

Reusing one imported legacy module graph for multiple oracle runs would risk state leaking between tests.

Each child process:

1. loads the M0B browser/test shim;
2. freezes wall clock time;
3. controls unseeded randomness;
4. materializes one M0C fixture;
5. initializes required legacy runtime state;
6. imports the real simulation graph;
7. captures normalized state before the run;
8. runs `execGameLoops()`;
9. captures normalized state after the run;
10. emits the result and exits immediately.

The immediate exit is intentional. Browser-oriented legacy code may leave housekeeping timers alive that should not control test-process lifetime.

## Frozen environment

Current oracle environment:

```text
Wall clock: 2026-01-01T12:00:00.000Z
Unseeded RNG seed: 1
Periods: 20
```

Legacy seeded RNG state is part of each materialized game state and is included in normalized output.

## Oracle matrix

The frozen matrix covers:

| Fixture | Main coverage |
| --- | --- |
| `fresh-evolution` | evolution and event state |
| `early-civilization-human` | early resources, jobs and city |
| `industrial-human-queues` | industrial resources, powered structures, ARPA/build queue, research queue |
| `early-space-human` | local space and support |
| `interstellar-human` | Alpha/interstellar systems |
| `portal-hell-balorg` | Hell, fortress and combat-related state |
| `late-eden-human` | deep Hell/spire plus Eden |
| `truepath-tauceti-human` | Truepath and Tau Ceti |
| `challenge-steelen-run` | challenge-specific state |
| `reset-ready-mad` | MAD/reset-relevant state |
| `reset-ready-bioseed` | Bioseed/reset-relevant state |

Every matrix entry must both:

- produce exactly the same normalized result in two independent child processes;
- change at least one normalized state path from its pre-run snapshot, proving the loop execution was not a no-op.

## Normalized state

`tests/simulation/normalize-simulation.cjs` projects the legacy runtime into a deterministic comparison surface.

It includes:

- save metadata: `version` and legacy `new` lifecycle state;
- RNG seeds;
- resources using a fail-closed field policy: all present resource fields are observed by default, while only explicitly classified presentation fields are excluded;
- evolution progression;
- population/civics/jobs;
- city, space, interstellar, galaxy, Portal, Eden, Tau Ceti and star-dock structures;
- technologies;
- ARPA project progress/ranks;
- race/trait state;
- custom/hybrid race definitions;
- pillar progression;
- governor/candidate/policy state;
- seasonal/special progression flags;
- build and research queues;
- power and support ordering;
- statistics;
- normal and major event state;
- prestige;
- genes and blood state;
- the simulation-relevant subset of settings;
- transient power/support activation maps and accelerated-time tracking.

Object keys are recursively sorted for stable hashing. Array order is preserved because queue and grid ordering can affect behavior.

## Top-level legacy state coverage policy

M0E1 makes top-level state coverage fail closed. `tests/simulation/legacy-state-policy.cjs` classifies every known current legacy root.

| Root(s) | Policy | Reason |
| --- | --- | --- |
| `seed`, `warseed` | include | authoritative RNG state |
| `resource`, `evolution`, `tech`, `city`, `space`, `interstellar`, `galaxy`, `portal`, `eden`, `tauceti`, `starDock`, `civic`, `race` | include | primary run/gameplay state |
| `genes`, `blood`, `stats`, `prestige`, `pillars` | include | persistent/meta progression |
| `event`, `m_event`, `special` | include | event and special-progression state |
| `queue`, `r_queue`, `power`, `support`, `arpa`, `govern` | include | queues, projects, priority and automation state |
| `custom` | include | custom/hybrid race data used by gameplay |
| `version`, `new` | include | save/lifecycle metadata |
| `settings` | mixed | only behavior-affecting fields are part of the simulation oracle |
| `lastMsg` | exclude | message history/presentation only |
| `sim` | exclude | temporary simulation/debug flag, not normal authoritative save state |
| `revision`, `beta` | exclude | obsolete migration markers deleted at the current version |

If a future/current legacy state presents a top-level root not in that policy, normalization fails with an `Unclassified legacy top-level state root` error. New state cannot silently disappear from the oracle.

### Resource field policy

Resource entries are fail-closed at the field level as well as at the top level. All present resource fields are included by default.

The current explicit resource-field exclusions are:

- `name`: localized presentation label;
- `bar`: resource-bar display preference.

This means newly introduced resource mechanics cannot silently disappear from the oracle simply because they were not added to a positive field whitelist.

For legacy `resource.*.value` metadata, `NaN` is only accepted when the resource is non-tradable, represented by the absence of the legacy `trade` field. Tradable resources must have a finite base market value.

### Mixed settings policy

The passive simulation oracle currently records these settings:

- `pause`;
- `at` (accelerated-time state);
- `boring` (changes seasonal/event behavior);
- `qAny` (used by governor queue automation).

Presentation/input settings such as themes, visible tabs, labels, message filters and key mappings are intentionally not part of passive simulation output. If later migration work proves another setting changes authoritative simulation behavior, it must be added explicitly rather than captured accidentally.

## Canonical value safety

M0E1 hardens state transport before JSON is involved.

- present-but-`undefined` object properties are encoded with an explicit tagged sentinel, so they remain distinct from missing properties;
- `Infinity` and `-Infinity` are always rejected;
- `NaN` is rejected by default with its exact state path;
- the verified legacy exception is non-tradable resource `value` metadata, for which upstream can legitimately produce `NaN` because no market `resource_values` entry exists. The normalizer only permits that tag when the legacy resource has no `trade` field; a tradable resource with `NaN` value fails.

Any new non-finite state location is therefore a test failure until its source is understood.

## Explicit volatile exclusions

Within included state, the normalizer excludes only:

- `stats.start`;
- `stats.current`.

Those are wall-clock bookkeeping fields rather than the simulation outcomes M0D is intended to compare.

Do not add fields to the exclusion list merely because they are inconvenient or unstable. A newly unstable field should first be understood and controlled at its source.

## Frozen oracle fingerprints

`tests/simulation/oracle-baselines.json` stores a SHA-256 fingerprint of each normalized post-simulation snapshot.

This catches a failure mode that repeatability alone cannot:

> A code change can be perfectly deterministic and still change legacy behavior.

Therefore M0D checks both:

1. run A equals independent run B;
2. the resulting normalized state matches the frozen legacy oracle fingerprint.

A fingerprint update is a behavioral-baseline change and requires explicit review.

Never recapture fingerprints merely to make CI green.

## Structural differential comparison

`tests/simulation/differential-harness.cjs` exposes recursive comparison for future migration work.

It reports exact state paths, for example:

```text
resources.DNA.amount:
expected=7.25
actual=7.75
delta=0.5
```

The test suite deliberately mutates DNA after a reference run and verifies that the comparator identifies `resources.DNA.amount`.

This is the interface future refactored systems should use:

```text
same fixture/environment
        |
        +--> legacy runner ----+
        |                      |
        +--> candidate runner --+--> normalized structural diff
```

The candidate runner does not exist yet. M0D establishes its contract.

## Numeric tolerances

Default structural comparison tolerances are deliberately narrow:

- absolute: `1e-10`;
- relative: `1e-10`.

Exact equality is still used automatically where numbers are identical.

Tolerance must not be widened to conceal real production drift.

## Source-mapped failures

Child processes run with Node source maps enabled.

Legacy simulation errors therefore point back to original Evolve files and line numbers rather than only to the generated test bundle.

This was used while building M0D to identify real fixture hydration requirements in:

- powered city structures;
- ARPA queue state;
- garrison/government state;
- support-grid membership;
- Hell observation state;
- spire/mechbay state;
- Truepath foreign-government state.

Those fixes were made in the synthetic M0C fixture overlays using Evolve's own runtime/save shapes. No gameplay source was modified.

## Commands

Run all tests:

```bash
npm test
```

Run only M0D simulation/differential tests:

```bash
npm run test:simulation
```

## What M0D does not do

M0D does not:

- make the legacy simulation pure;
- remove `global`;
- move simulation off the main thread;
- replace fast/mid/long loops;
- promise that every possible Evolve state is represented;
- implement the candidate/refactored engine.

It creates the behavioral safety oracle needed to begin that work.

## Updating the oracle

A legitimate oracle update should document why behavior changed.

Recommended process:

1. identify the exact normalized paths that changed;
2. determine whether the change is intentional;
3. update characterization/differential expectations where appropriate;
4. recapture affected hashes only;
5. record the behavioral reason in the PR.

During architecture-only migration, the expected outcome is normally **no oracle change**.
