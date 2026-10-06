# M3A1 Command Contract and Bus

## Purpose

M3A1 introduces the first production command primitive while preserving the M3A0 and M2 architecture laws.

It establishes a sealed synchronous dispatch boundary with canonical command IDs, inert payloads, command-specific validation, structured success/rejection results, deterministic contract diagnostics, and a strict reentrancy policy.

M3A1 deliberately did **not** implement conditions, costs, effects, queues, a resource adapter, a GameState schema change, or a vanilla gameplay cutover.

M3E1 later ratchets this same command boundary forward with a non-executing `prepare()` method. That method shares dispatch's validation path and exists so inert queued work can be validated without executing a command. It does not weaken any M3A1 restrictions.

## Command identity

Commands reuse the M1 canonical content-ID grammar and must use content type `command`:

```text
evolve:command/evolution/dna
```

A canonical non-command content ID is still invalid as a command ID.

No second identity grammar is introduced.

## Command envelope

Every preparation or dispatch uses exactly:

```text
{
  id,
  payload
}
```

Both fields are required. Even argument-free commands use an explicit empty payload object.

The envelope is closed. Extra fields, accessors, symbols, exotic objects, and missing required fields fail closed.

## Payload contract

Payloads are inert plain data trees. They may contain only:

- null;
- finite numbers;
- strings;
- booleans;
- normal dense arrays;
- plain data objects.

They reject:

- functions;
- undefined;
- bigint/symbol values;
- NaN/infinity;
- accessors;
- hidden/symbol object fields;
- exotic prototypes;
- sparse/extended arrays;
- cycles;
- shared object identity;
- excessive nesting.

The bus canonicalizes and freezes the caller payload before command-specific validation, then canonicalizes and freezes validator output again before either returning a prepared command or executing it. Neither `prepare()` nor command handlers receive/store the caller's original mutable payload tree.

Diagnostic paths use dot notation for ordinary field names and quoted bracket notation for unusual names, so fields containing dots or similar punctuation remain unambiguous.

## Registration model

M3A1 uses fixed runtime registrations supplied when constructing the bus:

```text
{
  id,
  validatePayload,
  execute
}
```

Registrations are closed and command IDs must be unique.

The existing M1 `Registry` is not used as an executable handler container. That registry is intentionally an inert definition registry, while command handlers are runtime capabilities.

Validators and handlers are invoked context-free. They receive their payload argument but no implicit registration object through `this`.

After the M3E1 ratchet, the bus exposes only:

```text
prepare
dispatch
has
ids
```

It exposes no public `register`, `remove`, handler lookup, mutable registration map, or dynamic package-loading surface. Public/package registration remains deferred to M10.

## Preparation lifecycle

M3E1 extracts the preparation stages that were already embedded in dispatch into one shared internal path:

```text
reentrancy check
  -> envelope validation
  -> canonical command ID
  -> registration lookup
  -> payload detachment/canonicalization
  -> command-specific payload validation
  -> validator-output canonicalization
  -> frozen prepared command
```

`prepare(rawCommand)` returns exactly:

```text
{
  id,
  payload
}
```

and does not call the registered `execute` handler.

## Dispatch lifecycle

Dispatch remains synchronous and now reuses the exact preparation path:

```text
reentrancy check
  -> shared preparation path
  -> handler execution
  -> result normalization
```

The handler executes exactly once for a valid dispatch.

Declared async validators/handlers are rejected during registration. Promise/thenable validator or handler results are rejected at runtime. Thenable detection inspects property descriptors rather than reading `value.then`, so an accessor-based `then` property is rejected without invoking its getter.

## Reentrancy

Nested command operations are prohibited during payload validation and handler execution. The lock is module-wide, so a second command-bus instance cannot be used to bypass it.

Both nested `dispatch()` and nested `prepare()` attempts are rejected. The established contract code remains:

```text
COMMAND_DISPATCH_REENTRANCY
```

Cause-phase diagnostics identify whether the nested attempt was preparation or dispatch.

The active command-operation lock is always cleared in `finally`, including after validator, handler, result, or preparation failures.

Command composition is therefore not invented implicitly. A future reviewed slice may introduce a safe composition model if real gameplay requires one.

## Result contract

Legacy callback booleans/numbers are not command results.

A handler must return either a success outcome:

```text
{
  status: 'succeeded',
  data
}
```

or a rejection outcome:

```text
{
  status: 'rejected',
  reasons: [ ... ]
}
```

The bus normalizes that to one frozen public result shape:

```text
{
  commandId,
  status,
  data,
  reasons
}
```

Success has `reasons: []`.

Rejection has `data: null` and at least one machine-readable reason.

A reason contains only:

```text
{
  code,
  details
}
```

where `code` is a stable lowercase machine code and `details` is null or an inert plain data object. Localized presentation strings are not part of the engine result contract.

Result normalization independently validates that `commandId` is a canonical command ID, even when the result helper is called outside the bus.

M3B may produce richer structured condition details without redesigning the command result envelope.

## Rejection versus contract failure

Expected gameplay refusal is data:

```text
status: rejected
```

Broken engine contracts are exceptions:

- malformed command envelope;
- invalid command ID;
- unknown command ID;
- malformed payload;
- broken validator;
- broken handler;
- async/thenable leakage;
- malformed handler result.

These throw `EngineContractError`.

Contract failures are enriched with deterministic command/phase context where a command ID has already been resolved. Existing structured diagnostic fields such as `path`, `field`, or rule metadata are preserved rather than discarded. When an inner command failure already carries a phase or command ID, the outer command context is recorded while the inner values remain available as cause context.

## Mutation and atomicity boundary

The command bus does not receive or expose GameState mutation authority, mutation scopes, writable drafts, or arbitrary state setters.

It does not import StateStore or GameState composition.

The permanent direction remains:

```text
command bus
  -> command handler
  -> semantic capability/domain service
  -> owned mutation scope
```

not:

```text
command bus
  -> generic GameState transaction
```

M3A1 establishes one synchronous dispatch boundary, but does not claim unrestricted cross-domain rollback. Atomic domain/capability operations remain owned by their semantic services. Cross-domain coordination is introduced only when a real migrated command requires it.

## Architecture enforcement

`tests/architecture/m3a1-command-boundary-fitness.cjs` enforces that command modules:

- do not import GameState/state infrastructure;
- do not use the inert definition `Registry` as handler storage;
- do not import external packages;
- do not use dynamic imports;
- do not reference raw GameState mutation-authority identifiers;
- import only `identity.mjs`, the inert-data contract, or sibling command modules.

The existing M0/M1/M2 architecture gates remain cumulative and continue to prohibit legacy globals, DOM/UI/platform access and raw mutation authority throughout `src/engine/**`.

M3E1 adds a separate queue-package boundary gate. The queue package consumes `prepare()` as a runtime capability rather than importing `commands/common.mjs` or command registrations.

## Review hardening

The post-implementation M3A1 review tightened five areas before closure:

- enriched `EngineContractError` diagnostics retain underlying structured fields instead of replacing them with only command/phase metadata;
- validators and handlers are invoked with no implicit `this` context;
- thenable detection does not invoke a potentially hostile `then` getter;
- result normalization itself requires a canonical command ID, rather than relying solely on the bus caller;
- the command-operation lock is module-wide, so multiple bus instances cannot bypass the no-nested-command rule.

Adversarial coverage includes null-prototype data, hidden/symbol fields, array subclasses, shared array identity, excessive nesting, hostile inspection failures, unusual diagnostic paths, registration accessors, preserved cause diagnostics, accessor-based thenables, same-bus reentrancy cause phases, and cross-bus reentrancy.

M3E1 adds direct coverage proving that preparation does not execute handlers, returns detached/frozen canonical data, rejects malformed command-specific payloads through the same validator path, and cannot be nested to evade the command-operation lock.

## Production impact

At M3A1 closure no vanilla action was routed through the command bus.

M3E1 adds the inert WorkItem foundation but still does not route the legacy build/research queues through the bus.

Neither slice modifies:

- `src/actions.js`;
- `src/main.js`;
- `src/functions.js`;
- GameState schema/composition;
- legacy bridges;
- legacy queue execution;
- save/persistence;
- UI behavior;
- oracle snapshots.

The first real vanilla command cutover remains M3F.

## Definition of done

The M3A1 contract, including the M3E1 surface ratchet, is maintained when:

1. canonical command IDs reuse the M1 identity grammar and require type `command`;
2. command envelopes are closed `{ id, payload }` data;
3. payloads are detached, canonical, inert and deeply frozen before preparation/execution;
4. each command has one synchronous validator and one synchronous handler;
5. fixed registration is immutable after bus construction;
6. duplicate/malformed registrations fail closed;
7. public bus surface is only `prepare`, `dispatch`, `has`, and `ids`;
8. `prepare()` shares dispatch's validation path and never executes the handler;
9. dispatch is synchronous and handlers execute once without an implicit `this` context;
10. nested preparation/dispatch is forbidden across all bus instances and the lock always recovers after failure;
11. Promise/thenable validators and handlers fail closed without invoking then accessors;
12. success and rejection use one frozen structured result contract;
13. rejected results contain machine-readable reasons rather than localized messages;
14. legacy `false`/`0`/truthy callback semantics are not accepted as command results;
15. expected gameplay rejection remains distinct from `EngineContractError`;
16. enriched command errors preserve useful underlying diagnostic fields;
17. command modules cannot access raw GameState write authority or state composition;
18. the M1 definition Registry is not repurposed as executable handler storage;
19. M3A1 architecture fitness remains part of the cumulative architecture CI chain;
20. all unit, architecture, build, generated-output and browser smoke gates remain green;
21. no vanilla gameplay path is cut over by this foundation work.
