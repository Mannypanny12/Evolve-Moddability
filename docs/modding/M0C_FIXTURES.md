# M0C Representative Fixture Set

## Purpose

M0C freezes representative legacy Evolve states before the architectural migration begins.

The fixtures are designed for:

- characterization tests;
- state-domain migration tests;
- persistence migration work;
- M0D legacy-vs-new differential simulation.

## Why overlays instead of full save dumps

A fully initialized Evolve save contains a large amount of UI/settings/default state that is irrelevant to most scenarios and produces noisy diffs.

M0C therefore uses:

1. one deterministic canonical initialized legacy base;
2. compact scenario overlays;
3. explicit machine-checked invariants.

This keeps scenario intent reviewable while still materializing a complete legacy state object.

## Canonical base

`tests/fixtures/legacy-base.json` records:

- upstream repository;
- exact upstream commit;
- application version;
- frozen wall clock;
- deterministic RNG seed;
- empty in-memory storage;
- SHA-256 fingerprint of the canonical initialized state.

The fingerprint uses recursively sorted object keys before hashing.

If startup/default-state behavior changes, the fingerprint test fails. Scenario fixtures therefore cannot silently drift just because the legacy initializer changed.

## Scenario schema

Each file under `tests/fixtures/scenarios/` records:

```json
{
  "schema": 1,
  "id": "example",
  "source": {
    "commit": "...",
    "version": "..."
  },
  "origin": "synthetic-overlay",
  "purpose": "...",
  "coverage": ["..."],
  "patch": {},
  "invariants": []
}
```

The persisted-state materializer, `materializePersistedFixture()`, deep-merges `patch` onto a fresh clone of the canonical legacy base.

Arrays and primitive values replace the base value. Plain objects merge recursively.

The result is a **persisted fixture input**, not the live simulation object. M0E3 installs a separate structured clone into the legacy runtime before hydration, so startup or simulation mutations cannot leak back into the fixture object.

## Why synthetic fixtures

These are intentionally synthetic rather than personal exported saves.

Benefits:

- no personal/user-specific data;
- exact scenario intent;
- deterministic values;
- small, reviewable diffs;
- easier boundary testing;
- no accidental dependency on one player's historical settings.

They are source-anchored to the exact M0A baseline and should be treated as representative test states, not claims that every value was reached through manual gameplay.

## Catalog

| Fixture | Primary purpose |
| --- | --- |
| `fresh-evolution` | pre-civilization RNA/DNA and event-ready state |
| `early-civilization-human` | early city, jobs and population |
| `preindustrial-orc` | distinct Orc traits, smelting, crafting and trade |
| `industrial-human-queues` | industrial production, power and both queues |
| `early-space-human` | local-space infrastructure and support |
| `interstellar-human` | Alpha/interstellar progression and graphene |
| `portal-hell-balorg` | demonic race profile, Hell and fortress combat |
| `late-eden-human` | high-complexity late game and Eden |
| `truepath-tauceti-human` | alternate Truepath/Tau Ceti progression |
| `challenge-steelen-run` | active challenge/resource pressure |
| `reset-ready-mad` | MAD reset context |
| `reset-ready-bioseed` | Bioseed reset context |

## Coverage guarantees

Automated tests require the catalog to cover:

- evolution;
- early civilization;
- pre-industrial;
- industrial;
- space;
- interstellar;
- portal/Hell;
- late game;
- Truepath/Tau Ceti;
- challenge state;
- reset-ready state;
- active build queue;
- active research queue;
- power ordering;
- support ordering;
- crafting;
- trade;
- event-ready state;
- at least two reset-ready contexts, including MAD and Bioseed;
- at least three species profiles.

## Invariants

Each fixture defines facts that make the scenario meaningful.

The fixture loader now validates invariant syntax fail-closed. Every invariant must have a non-empty `path`, at least one supported operator (`exists`, `equals`, `min`, `includes`, or `lengthMin`), and no unknown operator names. This prevents misspellings such as `equlas` from silently turning a claimed invariant into a no-op.

Fixture filenames must also exactly match their declared IDs (`<id>.json`), coverage tags must be unique valid slugs, and malformed catalog metadata fails before materialization.

Examples:

- a space fixture must actually have the expected `tech.space` level and space structures;
- the Truepath fixture must have `race.truepath`;
- queue fixtures must contain queue entries;
- a challenge fixture must have its challenge flag;
- reset-ready fixtures must contain their reset-specific landmarks.

M0D can add more exact loop-output expectations without changing the fixture format.

Generic load/startup defaults do not belong in scenario patches merely to make the real loop run. For example, default government tax state and missing garrison bookkeeping are supplied by the real legacy hydration path. Scenario-specific gameplay choices such as worker assignments, active structures, power/support priority, ARPA progress, Hell observation history, spire/mechbay state, and Truepath rival governments remain persisted fixture intent.

## Fixture lifecycle

M0E3 formalizes the lifecycle as:

```text
canonical base
   -> persisted scenario overlay
   -> materialized persisted fixture
   -> cloned live legacy state
   -> legacy-compatible hydration
   -> runtime simulation state
```

The persisted fixture object is immutable input after materialization. The legacy adapter clones it at installation, performs the small generic government/garrison setup that normal startup expects, and then imports Evolve's real `main.js` startup so the game itself reconstructs runtime/transient state.

Hydration must not invent scenario-specific gameplay state to conceal an incomplete fixture.

## Normalization policy

The current fixture system does not strip fields from the materialized state.

For fingerprints only, object keys are sorted recursively before JSON serialization. Array order is preserved because queue/grid ordering can be behaviorally significant.

Future normalization for differential output must be explicit and documented. Volatile fields should never simply be ignored because they are inconvenient.

## Updating fixtures

A fixture change should state why the represented scenario changed.

Changing `legacy-base.json`'s fingerprint requires explicit review because it means the deterministic initialized legacy state changed.

Do not update the fingerprint merely to silence a failing test.
