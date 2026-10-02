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

The materializer deep-merges `patch` onto a fresh clone of the canonical legacy base.

Arrays and primitive values replace the base value. Plain objects merge recursively.

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
- at least three species profiles.

## Invariants

Each fixture defines facts that make the scenario meaningful.

Examples:

- a space fixture must actually have the expected `tech.space` level and space structures;
- the Truepath fixture must have `race.truepath`;
- queue fixtures must contain queue entries;
- a challenge fixture must have its challenge flag;
- reset-ready fixtures must contain their reset-specific landmarks.

M0D can add more exact loop-output expectations without changing the fixture format.

## Normalization policy

The current fixture system does not strip fields from the materialized state.

For fingerprints only, object keys are sorted recursively before JSON serialization. Array order is preserved because queue/grid ordering can be behaviorally significant.

Future normalization for differential output must be explicit and documented. Volatile fields should never simply be ignored because they are inconvenient.

## Updating fixtures

A fixture change should state why the represented scenario changed.

Changing `legacy-base.json`'s fingerprint requires explicit review because it means the deterministic initialized legacy state changed.

Do not update the fingerprint merely to silence a failing test.
