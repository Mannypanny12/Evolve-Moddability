# M3B2 Core Requirement Primitives

## Purpose

M3B2 builds the first real gameplay-facing requirement vocabulary on top of the hardened M3B1 condition kernel.

The slice adds:

- a closed semantic read-capability contract for technology, resource, structure and trait state;
- canonical typed-subject validation without a definition-Registry dependency;
- reusable technology acquired/not-acquired predicates;
- reusable resource availability, amount-threshold and current-capacity predicates;
- reusable structure total-count and active-count predicates;
- reusable trait present/absent predicates;
- machine-readable subject-specific failure reasons;
- defensive validation for read-capability construction and read results;
- composition coverage through the existing M3B1 `all`, `any`, and `not` operators.

M3B2 does not route vanilla gameplay through these conditions. Representative legacy adapters/differential evidence and final M3B closure belong to M3B3.

## Read-capability boundary

Condition primitives do not receive `GameState`, legacy `global`, selectors, registries, writable drafts, or generic context objects.

`createConditionReadCapabilities()` accepts exactly four semantic reader groups:

```text
technology
  has(technologyId) -> boolean

resource
  amount(resourceId) -> finite number
  available(resourceId) -> boolean
  capacity(resourceId) -> null | non-negative finite number

structure
  count(structureId) -> non-negative safe integer
  activeCount(structureId) -> non-negative safe integer

trait
  has(traitId) -> boolean
```

`capacity === null` means semantically unbounded capacity.

The capability object is closed. Extra fields, including mutation-like methods, fail construction. Reader functions are captured at construction and the returned facade is frozen, so replacing methods on the caller-owned object after composition does not change evaluator behavior.

Readers are synchronous, receiver-independent functions. Declared async functions, generators and class constructors fail construction. Runtime Promise/thenable leakage and malformed return values fail closed with `EngineContractError`.

A reader throwing unexpectedly is a contract failure, not an unmet gameplay condition.

## Canonical subject identity

Every primitive uses the existing M1 canonical content-ID grammar and requires the expected content type:

```text
technology.* -> :technology/
resource.*   -> :resource/
structure.*  -> :structure/
trait.*      -> :trait/
```

M3B2 uses `parseContentId()` for identity/type validation but does not query the inert definition Registry.

This is intentional. The condition layer answers predicates about canonical semantic subjects. Whether a package definition reference resolves is a separate assembled-content validation concern.

A valid canonical ID may therefore evaluate as absent/zero when the supplied semantic reader reports that state.

## Technology semantics

M3B2 deliberately does not expose legacy `global.tech` progression keys as canonical technology identities.

Legacy keys such as `primitive` may represent contextual progression tracks shared by multiple actual technologies. Existing M1 legacy mapping evidence already proves this for the primitive progression family.

The new predicates therefore operate on actual canonical technology identities:

```text
technology.acquired
technology.not_acquired
```

Failure reasons:

```text
condition.technology.not_acquired
condition.technology.forbidden_acquired
```

M3B3/M6E compatibility/migration logic is responsible for translating legacy progression state into those canonical semantic answers.

## Resource semantics

M3B2 keeps three independent current-state questions:

```text
resource.available
resource.amount.at_least
resource.below_capacity
```

They must not be collapsed.

`resource.available` means the semantic resource concept is currently available/unlocked according to the supplied reader.

`resource.amount.at_least` is a reusable non-consumptive threshold predicate. It is not a cost or affordability check. M3D remains responsible for quote/payment semantics.

`resource.below_capacity` asks only whether the current amount is below the current bound. `null` capacity is unbounded and satisfies this predicate. This is a current execution/availability predicate, not M3E queue/capacity prediction.

Failure reasons:

```text
condition.resource.unavailable
condition.resource.amount_insufficient
condition.resource.at_capacity
```

Amount failure details include required and actual amounts. Capacity failures include actual amount and current capacity.

## Structure semantics

Legacy `Structs` pseudo-cost behavior includes both total-count and active/on-count requirements. M3B2 represents those explicitly rather than hiding the metric behind a string flag:

```text
structure.count.at_least
structure.active_count.at_least
```

Counts are non-negative safe integers.

Failure reasons:

```text
condition.structure.count_insufficient
condition.structure.active_count_insufficient
```

## Trait semantics

Positive and negative trait requirements receive explicit subject-specific predicates:

```text
trait.present
trait.absent
```

Although generic M3B1 `not` can negate arbitrary conditions, explicit absence predicates preserve useful diagnostics for common requirement families.

Failure reasons:

```text
condition.trait.missing
condition.trait.forbidden_present
```

Genes remain a separate legacy concept and are not silently reclassified as traits in this slice.

## Declarative bypasses instead of `skipRequirement()`

Legacy special cases such as a trait bypassing a technology requirement must not be embedded into primitive evaluators.

A rule conceptually equivalent to:

```text
technology cement acquired OR trait flier present
```

is represented through M3B1 composition:

```text
any
  technology.acquired(cement)
  trait.present(flier)
```

This keeps exceptions inspectable, explainable and package-authorable instead of rebuilding a hidden imperative `skipRequirement()` switch.

## Contract failures versus gameplay failures

Ordinary unmet requirements return normal frozen M3B1 failed outcomes.

Malformed condition parameters, wrong canonical content types, invalid reader configuration, reader exceptions, Promise/thenable leakage, NaN/infinity, negative/invalid counts and malformed capacities throw `EngineContractError`.

The M3B1 evaluator then enriches read failures with condition kind/path/phase context.

## Architecture boundary

M3B2 remains under the cumulative M3B1 condition-boundary fitness gate.

The new modules still cannot import or directly access:

- legacy state or action modules;
- GameState/state infrastructure;
- mutation authority or mutation services;
- the definition Registry;
- command execution modules;
- UI/DOM/browser/platform APIs;
- runtime clocks/random sources;
- dynamic imports or external packages.

The semantic readers are injected first-party/internal composition capabilities. M3B2 creates no public custom-condition/read-provider API.

## Production impact

M3B2 adds production engine primitives but no gameplay cutover.

It does not change:

- `src/actions.js` or legacy requirement helpers;
- authoritative GameState roots;
- resource/technology/structure/trait ownership;
- legacy persistence;
- cost/payment behavior;
- queues;
- UI behavior;
- oracle/simulation outputs.

## Deliberate deferrals

M3B2 does not implement:

- legacy requirement adapters and differential closure -> M3B3;
- genes/blood/general arbitrary legacy condition callbacks -> later reviewed condition/content migration slices;
- affordability/payment -> M3D;
- future queue/capacity prediction -> M3E;
- first vanilla command cutover -> M3F;
- authoritative resource migration -> M6B;
- authoritative trait/race migration -> M6D;
- bulk technology/progression migration -> M6E;
- structure/action migration -> M6F;
- public custom condition/provider APIs -> M10.

## Definition of done

M3B2 is complete when:

1. semantic reader capabilities are closed, snapshotted, frozen and synchronous;
2. malformed capability objects and mutation-like extra fields fail closed;
3. reader outputs are type/range validated and async leakage is rejected;
4. technology conditions use canonical technology identity rather than legacy progression keys;
5. resource availability, amount threshold and current-capacity predicates remain semantically separate;
6. total and active structure count are separate predicates;
7. trait presence and absence have explicit subject-specific diagnostics;
8. condition subject IDs require the correct canonical content type without Registry lookup;
9. ordinary unmet predicates return structured reasons, while reader/contract faults throw `EngineContractError`;
10. core predicates compose correctly under M3B1 `all`, `any`, and `not`;
11. no payment, queue prediction, mutation, legacy adapter or vanilla cutover enters the slice;
12. the cumulative architecture gate still covers every new condition module;
13. the full test/build/browser safety net remains green;
14. M3B3 legacy/differential evidence and M3B closure are the next condition-engine slice.
