# Regression and Characterization Test Strategy

## Purpose

The modding refactor changes architecture, not vanilla game design. Tests therefore need to prove behavioral equivalence across representative game states.

## Test classes

### 1. Build tests
- install dependencies;
- build game bundle;
- build wiki bundle;
- compile LESS;
- fail on syntax/bundle errors.

### 2. Registry/API unit tests
Cover:
- namespaced-ID validation;
- duplicate registration;
- ownership;
- legacy aliases;
- lookup failures;
- deterministic iteration where promised;
- API permission boundaries.

### 3. Save migration tests
For representative historical fixtures:
- load;
- migrate;
- save;
- reload;
- verify invariants.

### 4. Characterization tests
Capture current behavior before modifying the relevant subsystem.

Examples:
- exact resource gain for a controlled worker/building state;
- unlock visibility for a given tech state;
- action affordability and payment;
- achievement unlock;
- prestige result;
- challenge modifier behavior.

### 5. Deterministic simulation tests
Run fixed state + fixed seed + fixed tick count and compare:
- resources;
- population;
- technologies;
- buildings;
- statistics;
- event results where deterministic;
- queues;
- power/production state.

### 6. Golden save tests
Maintain a small curated set of compressed or normalized save fixtures representing progression bands.

Fixtures must record:
- origin/version;
- purpose;
- expected major invariants.

## Equivalence policy

Refactor PRs should state which characterization tests cover the changed behavior.

A changed numeric result is presumed to be a regression unless:
- the change is intentionally designated as gameplay-changing; and
- the expected result is explicitly updated with rationale.

## Floating point

Where exact equality is unsafe, tests use documented tolerances. Tolerances must not be widened merely to make tests pass.

## RNG

Prefer existing seeded RNG pathways. Tests depending on unseeded browser randomness should be redesigned or bounded.

## DOM/UI tests

Do not make full browser UI automation the first dependency. Begin with logic/state characterization, then add targeted browser-level tests for:
- mod manager;
- package import;
- UI extension points;
- load errors.

## First fixture set

Initial target fixtures:
1. fresh evolution;
2. early city;
3. established pre-industrial;
4. industrial;
5. early space;
6. interstellar;
7. late-game/high-complexity;
8. reset-ready;
9. active challenge;
10. at least two materially different racial trait profiles.

## CI target

The long-term required checks for modding PRs:
- build;
- unit tests;
- characterization suite;
- save migration suite;
- package/schema validation tests.
