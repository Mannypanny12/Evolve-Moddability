# M1C Runtime Environment Ports

## Purpose

M1C establishes the platform boundary for all newly written engine code.

The engine must be able to run without implicit access to browser globals, wall-clock time, unseeded randomness, browser storage, or console diagnostics. M1C therefore introduces four small runtime ports:

- `Clock`;
- `Rng`;
- `Storage`;
- `Logger`.

This is an internal engine seam. It is not a public Mod API and it does not migrate legacy gameplay behavior.

## Dependency direction

The M1C boundary is:

```text
browser / future native platform / tests
                 |
                 v
          platform adapters
                 |
                 v
       engine runtime contracts
                 |
                 v
            engine systems
```

Engine contracts live under:

```text
src/engine/runtime/**
```

Browser adapters live outside the protected engine tree:

```text
src/platform/browser/**
```

`src/engine/**` continues to have a hard zero budget for direct browser, storage, wall-clock, and random-source access.

M1C adds a second architecture fitness gate for `src/platform/**`. Platform adapters may depend inward on `src/engine/**` and on other platform modules, but they may not import legacy gameplay modules from the top-level `src/*.js` architecture or directly access the legacy `global` state object.

## Runtime environment

`createRuntimeEnvironment(...)` composes the four ports into a frozen capability object:

```js
const environment = createRuntimeEnvironment({
    clock,
    rng,
    storage,
    logger,
});
```

This is deliberately not a global singleton or service locator. Future engine services receive only the environment or individual capabilities they actually need.

Existing pure engine primitives such as identity parsing, registries, and definition validation do not receive a runtime environment merely because M1C exists.

## Clock

Engine contract:

```js
clock.now() -> finite number
```

The number is wall-clock Unix epoch time in milliseconds.

Clock does not own:

- simulation time;
- worker cadence;
- monotonic scheduling time;
- calendar/season domain state;
- timers or animation frames.

Those concepts remain separate so deterministic simulation cannot accidentally become coupled to real-world date or scheduler behavior.

The browser adapter delegates to `Date.now()` only when `clock.now()` is called.

## RNG

Engine contract:

```js
rng.next() -> number in [0, 1)
```

The browser adapter delegates to `Math.random()`.

The deterministic test adapter accepts an exact sequence and throws when the sequence is exhausted. It intentionally does not cycle. An unexpected extra random draw is therefore observable as a test failure.

M1C does not replace legacy `seededRandom()`, `global.seed`, or `global.warseed`. Those are persisted gameplay RNG streams and must be migrated with explicit state/simulation ownership rather than folded into the unseeded browser RNG seam.

## Storage

Engine contract:

```js
await storage.read(key)          // string | null
await storage.write(key, value)  // string value only
await storage.remove(key)
```

Storage is asynchronous from M1C onward even though the initial browser implementation adapts synchronous Web Storage. This prevents future engine callers from being coupled to synchronous `localStorage` semantics and leaves room for IndexedDB, filesystem/native, or other persistence backends.

Storage owns raw string transport only. It does not own:

- JSON serialization;
- save envelopes;
- compression;
- save-schema migration;
- backups;
- legacy-save import.

Those remain persistence-layer responsibilities for later milestones.

There is intentionally no general `clear()` capability in the engine storage port.

The browser storage adapter is lazy. Importing or creating it does not access `localStorage`; the platform storage object is resolved only when a storage operation is performed. Tests may inject a Web-Storage-compatible object directly.

## Logger

Engine contract:

```js
logger.debug(message, details?)
logger.info(message, details?)
logger.warn(message, details?)
logger.error(message, details?)
```

The browser adapter delegates to the corresponding console method while preserving its receiver.

The logger does not inject timestamps. Engine code that needs a timestamp must request it explicitly through `Clock`, keeping deterministic diagnostics free of hidden wall-clock reads.

Logger details are diagnostic payloads rather than gameplay state.

## Contract validation

Runtime ports are wrapped by engine-owned validation facades.

M1C rejects malformed ports before use and validates environmental results at the boundary:

- clock values must be finite numbers;
- RNG values must be finite numbers in `[0, 1)`;
- storage keys must be non-empty strings;
- storage writes accept strings only;
- storage reads must resolve to `string | null`;
- log messages must be non-empty strings.

Malformed or uninspectable port shapes fail with structured `EngineContractError` codes. Exceptions raised by real adapter operations, such as storage quota/security failures, propagate rather than being silently converted into successful operations.

Current M1C contract codes are:

- `INVALID_RUNTIME_PORT`;
- `INVALID_RUNTIME_PORT_METHOD`;
- `INVALID_RUNTIME_ENVIRONMENT`;
- `INVALID_CLOCK_VALUE`;
- `INVALID_RNG_VALUE`;
- `INVALID_STORAGE_KEY`;
- `INVALID_STORAGE_VALUE`;
- `INVALID_LOG_MESSAGE`.

## Deterministic test adapters

Reusable M1C test support provides:

- mutable deterministic clock;
- strict sequence RNG;
- isolated in-memory storage;
- capture logger.

These live under `tests/support/` rather than production engine code.

They replace global monkey-patching for new engine tests. The M0 legacy harness continues to patch `Date`, `Math.random`, and `localStorage` because legacy code still depends on those globals. M1C does not rewrite the legacy harness.

## Browser adapters

Browser adapters exist for all four ports and can receive injected browser primitives in tests.

The browser runtime factory composes them without creating shared singleton state. Multiple runtime environments can coexist with independent clock, RNG, storage, and logger implementations.

## Architecture fitness

M0E5 continues to protect `src/engine/**` and the downward-only legacy architecture budgets.

M1C adds `tests/architecture/platform-fitness.cjs`, chained into `npm run test:architecture`.

The platform gate proves:

- platform code may import engine contracts;
- platform code may not import legacy top-level gameplay modules;
- platform code may not use the legacy `global` state object;
- CommonJS `require()` is not an escape hatch in the new platform layer;
- platform-local dependency cycles are rejected.

## Explicitly deferred legacy work

M1C does not mass-edit existing Evolve source and does not change gameplay.

The following remain legacy until their later migration slices:

- `window.localStorage` and the exported legacy `save` object;
- raw save loading during `vars.js` module initialization;
- `Date.now()` / `new Date()` usage in legacy modules;
- worker `performance.now()` timing;
- `Math.random()` / `Math.rand()` use in legacy gameplay;
- persisted `global.seed` / `global.warseed` and `seededRandom()`;
- autosave and save serialization;
- seasonal/calendar behavior;
- fast/mid/long simulation cadence.

M1C creates the replacement seam. Later M2-M7 migration work routes authoritative engine behavior through it as each subsystem moves.

## Acceptance gate

M1C is ready to merge when:

1. runtime-port unit tests pass;
2. deterministic adapter tests pass;
3. browser adapter tests pass;
4. the existing complete M0/M1 test suite remains green;
5. the M0E5 architecture gate remains green;
6. the new platform architecture gate remains green;
7. production build and real-browser smoke remain green;
8. no frozen gameplay oracle snapshot changes.

No gameplay-source change or oracle rebaseline is expected for M1C.
