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

- RNG seeds;
- resources, including amount, max, diff, delta, rate and container/storage metadata;
- population/civics/jobs;
- city, space, interstellar, galaxy, Portal, Eden, Tau Ceti and star-dock structures;
- technologies;
- race/trait state;
- build and research queues;
- power and support ordering;
- statistics;
- normal and major event state;
- prestige;
- genes and blood state;
- simulation-relevant settings;
- transient power/support activation maps and accelerated-time tracking.

Object keys are recursively sorted for stable hashing. Array order is preserved because queue and grid ordering can affect behavior.

## Explicit volatile exclusions

The normalizer currently excludes only:

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
