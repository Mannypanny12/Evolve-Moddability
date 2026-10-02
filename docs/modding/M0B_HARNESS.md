# M0B Characterization Harness

## Why this harness exists

The legacy Evolve source is written as browser-oriented ES modules with extensive circular imports and module-load assumptions.

M0B needs to execute real legacy behavior without first refactoring those modules.

The harness therefore uses:

- Node.js 20's built-in `node:test` runner;
- the project's existing esbuild dependency;
- a bundled legacy test entry;
- a small browser compatibility shim;
- in-memory localStorage;
- explicit state replacement through the existing `setGlobal()` seam.

No additional test framework dependency is introduced.

## Commands

Run all tests:

```bash
npm test
```

Run only characterization tests:

```bash
npm run test:characterization
```

The CI baseline workflow runs `npm test` before the production build.

## Structure

```text
tests/
|-- run-tests.cjs
|-- legacy/
|   |-- browser-shim.cjs
|   +-- legacy-api.js
+-- characterization/
    +-- core-behavior.test.cjs
```

`tests/generated/` is created temporarily by the test runner and is not committed.

## Browser shim boundary

The shim exists only to let legacy modules load in Node.

It provides:

- isolated in-memory localStorage;
- minimal window/document objects;
- inert jQuery-style chains;
- empty localization JSON responses;
- lightweight Vue/Buefy/Popper globals;
- minimal LZString/CryptoJS stand-ins.

It is **not** intended to emulate a browser accurately.

If a characterization requires real DOM behavior, that should be added deliberately rather than making the shim silently smarter.

## Legacy API boundary

`tests/legacy/legacy-api.js` is a test-only adapter around selected existing exports.

It currently exposes characterization seams for:

- replacing legacy global state;
- resource mutation through `modRes()`;
- affordability and payment;
- technology requirements;
- technology qualification.

This is not production architecture and must never become the public Mod API.

## Current characterization coverage

M0B begins with exact legacy behavior for:

1. resource gain capped at max;
2. resource overspend floored at zero with failure result;
3. cost affordability and payment;
4. technology requirement readiness;
5. technology condition/trait qualification.

These are intentionally small but real seams.

## Determinism and isolation

Each test installs a fresh state object.

The bundle sees an empty in-memory storage instance during module initialization, so the test process never reads or writes the user's real browser save.

The current M0B tests do not require real time or randomness. The harness is structured so controlled Clock/RNG seams can be added as later characterization reaches those behaviors.

M0D will extend this foundation to deterministic loop-level and legacy-vs-new differential simulation.

## What M0B does not do

M0B does not:

- refactor `global`;
- run the full fast/mid/long simulation;
- claim the browser shim is a UI test environment;
- introduce a public engine API;
- add gameplay changes.

Its purpose is to make the first safe cuts possible.
