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

The frozen matrix now protects representative cadence boundaries as well as full p20 runs:

- `p1`: fast-loop only;
- `p3`: representative multi-period worker catch-up batch;
- `p4`: first mid-loop boundary;
- `p20`: first long-loop boundary, containing 20 fast and 5 mid loops.

The frozen main period and mid/long ratios live in the canonical `legacy-base.json` runtime contract. The legacy adapter verifies the imported production defaults match that contract before resetting test state, and the cadence scenario boundaries derive from the same metadata.

The p3 case is linked to the worker characterization that proves 500 ms of scheduling jitter at the frozen 250 ms worker period emits `{ periods: 3 }`. The oracle then protects the real `execGameLoops(3)` result without duplicating worker scheduling logic.

M0E3 also protects cadence continuity across repeated worker messages. Split-call runs `[2,3]` and `[18,3]` must exactly match single-call totals `[5]` and `[21]`, respectively, so a future candidate cannot reset its mid/long phase on every worker message.

## Process isolation

Every oracle execution runs in a fresh Node child process.

This is required because the legacy runtime has mutable module-level state that is not contained in the serialized save object, including loop counters, first-run flags, caches, callbacks, and other transients.

Reusing one imported legacy module graph for multiple oracle runs would risk state leaking between tests. The legacy adapter enforces this limitation after hydration: once `main.js` has been hydrated for a fixture, installing another fixture in that process is rejected.

Each child process:

1. loads the M0B browser/test shim;
2. freezes wall clock time;
3. controls unseeded randomness;
4. materializes one persisted M0C fixture;
5. clones that persisted input into the live legacy runtime;
6. explicitly hydrates generic government/garrison defaults and imports the real simulation graph;
7. verifies hydration did not mutate the persisted fixture object;
8. captures normalized state before the run;
9. runs `execGameLoops()`;
10. captures normalized state after the run;
11. verifies simulation did not mutate the persisted fixture object;
12. emits the result and exits immediately.

The immediate exit is intentional. Browser-oriented legacy code may leave housekeeping timers alive that should not control test-process lifetime.

## Frozen environment

The frozen source/environment contract is centralized in `tests/simulation/oracle-contract.cjs` and derives source, wall clock, and unseeded RNG seed from the canonical `tests/fixtures/legacy-base.json` metadata.

Current oracle environment:

```text
Wall clock: 2026-01-01T12:00:00.000Z
Unseeded RNG seed: 1
Scenario periods: 1, 3, 4, or 20
```

The manifest must match that canonical source/environment contract and its `runtimeContractSchema`. Every child-process result is also validated before it reaches hashing or snapshot comparison: result schema, fixture ID, period count, wall clock, RNG seed, and presence of before/after state must all match the requested frozen contract.

Legacy seeded RNG state is part of each materialized game state and is included in normalized output.

## Oracle matrix

The frozen matrix covers:

| Scenario | Main coverage |
| --- | --- |
| `fresh-evolution-p20` | evolution/event state through the full cadence |
| `early-civilization-human-p1` | fast-only boundary |
| `early-civilization-human-p3` | representative worker catch-up batch |
| `early-civilization-human-p4` | first mid-loop boundary |
| `early-civilization-human-p20` | early city through the first long-loop boundary |
| `preindustrial-orc-p20` | distinct Orc traits, crafting/trade, and full-loop race coverage |
| `industrial-human-queues-p20` | industrial resources, powered structures, ARPA/build queue, research queue |
| `early-space-human-p20` | local space and support |
| `interstellar-human-p20` | Alpha/interstellar systems |
| `portal-hell-balorg-p20` | Hell, fortress and combat-related state |
| `late-eden-human-p20` | deep Hell/spire plus Eden |
| `truepath-tauceti-human-p20` | Truepath and Tau Ceti |
| `challenge-steelen-run-p20` | challenge-specific state |
| `reset-ready-mad-p20` | MAD/reset-relevant state |
| `reset-ready-bioseed-p20` | Bioseed/reset-relevant state |

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

## Frozen oracle snapshots

M0E2 stores the full canonical normalized post-simulation state for every frozen scenario under:

`tests/simulation/oracle-snapshots/`

`tests/simulation/oracle-baselines.json` is the manifest. Each scenario entry records:

- fixture ID;
- period count;
- snapshot path;
- SHA-256 fingerprint of the same canonical normalized state.

Scenario identity includes the period count (for example `fresh-evolution-p20`) so later cadence coverage can add other period counts without changing the manifest model.

The committed JSON snapshot is the review surface. The hash remains an integrity guard, not the only golden. The test suite also requires the snapshot directory to contain only the manifest-declared top-level JSON files; nested or unrelated files fail the catalog check.

A frozen scenario passes only when:

1. the committed snapshot hashes to the manifest SHA-256;
2. independent simulation run A hashes to that SHA-256;
3. independent simulation run B hashes to that SHA-256.

This preserves the exact protection of the original hash-only oracle while making failures inspectable.

### Exact frozen comparison versus migration tolerance

Frozen historical goldens are exact, including numeric values.

The `1e-10` absolute/relative tolerance in the general differential comparator remains for temporary legacy-versus-candidate migration comparisons. It is deliberately **not** used to decide whether a frozen historical golden still matches.

If a frozen run changes, the test compares it structurally against the committed snapshot using zero numeric tolerance and reports bounded path-by-path differences. Large values are truncated in diagnostics, and large diff sets explicitly report that additional differences were omitted.

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

M0E3 classifies those findings by ownership. Generic load/startup defaults belong to explicit hydration; scenario-specific persisted gameplay state remains in the fixture overlays. The adapter does not manufacture powered structures, power/support priority, ARPA progress, Hell observation history, spire/mechbay progress, or Truepath rival state.

No gameplay source is modified.

M0E3A initially treated every existing p20 hash as immutable while the lifecycle was formalized. M0E3B's p1 cadence case then exposed that partial synthetic garrison overlays were missing fields from Evolve's own default garrison shape. Correcting that generic hydration intentionally changed five previously frozen p20 scenarios after exact structural review: `early-civilization-human`, `industrial-human-queues`, `portal-hell-balorg`, `challenge-steelen-run`, and `reset-ready-mad`. The other six existing p20 goldens remained unchanged.

The reviewed diffs add the missing default garrison fields and, where the previously undefined garrison capacity had affected early fast-loop morale, the corresponding downstream resource/homeless state. These are fixture/harness corrections, not gameplay-source changes.

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

Normal tests never rewrite oracle snapshots.

To regenerate a snapshot while requiring behavior to remain identical to the currently frozen SHA-256:

```bash
npm run oracle:update -- fresh-evolution-p20
```

Regenerate all current snapshots without permitting behavioral drift:

```bash
npm run oracle:update -- --all
```

Both commands fail if the current simulation fingerprint differs from the frozen manifest.

Only after a behavioral change has been independently identified, reviewed and intentionally approved may the stored golden be changed:

```bash
npm run oracle:update -- fresh-evolution-p20 --accept
```

or, when an intentionally reviewed change affects the entire matrix:

```bash
npm run oracle:update -- --all --accept
```

With `--accept`, the updater:

1. runs every selected scenario twice in independent child processes;
2. requires both runs to produce the same exact canonical SHA-256 before a new golden can be accepted;
3. validates every selected scenario before writing any snapshot or manifest file;
4. reports bounded structural differences against an existing snapshot;
5. rewrites canonical pretty JSON with deterministic key ordering;
6. updates the corresponding manifest SHA-256.

Without `--accept`, a behavioral mismatch is refused and its structural diff is printed immediately when a committed snapshot is available.

The test suite also enforces that the scenario list, manifest entries and committed snapshot files remain in exact catalog sync, and that every committed snapshot is already in canonical byte form. Review the JSON diff, not only the new fingerprint.

Never use `--accept` merely to make CI green. During architecture-only migration, the normal expected result is **no frozen oracle change**.
