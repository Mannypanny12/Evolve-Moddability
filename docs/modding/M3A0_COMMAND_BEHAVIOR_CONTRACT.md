# M3A0 Command Behavior Contract

## Purpose

M3A0 freezes the legacy execution semantics that M3 must replace and turns the M2 state/layer laws into explicit command-architecture rules before production command code exists.

M3A0 is deliberately an evidence and design-authority slice. It does **not** implement the command bus, condition engine, effect engine, cost engine, queue engine, a new GameState domain, or a public Mod API.

The target M3 sequence after this slice is:

```text
M3A0 evidence + architecture contract
  -> M3A1 command contract/bus
  -> M3B condition engine
  -> M3C effect/operation planning
  -> M3D quote/cost/payment engine
  -> M3E queue work-item model
  -> M3F first real vanilla cutover
  -> M3G hardening/closure
```

## Why M3A0 exists

Legacy Evolve does not have one clean action-execution contract. `actions.js` and `functions.js` combine:

- presentation qualification;
- progression requirements;
- current affordability;
- capacity/max-affordability checks;
- payment;
- gameplay mutation;
- grants;
- queue fallback;
- queue prediction;
- post callbacks;
- messages;
- UI redraws;
- application preferences.

Several legacy return values are also overloaded as control signals. Recreating those shapes directly in new engine code would preserve the old architecture with new names.

M3A0 therefore records outcomes that must remain compatible while explicitly rejecting accidental structural preservation of the legacy implementation.

---

## Legacy execution lifecycle

The current immediate action path is broadly:

```text
UI/setAction
  -> qualification/requirements
  -> affordability classes
  -> runAction
  -> action({isQueue:false})
  -> success OR queue fallback
  -> postBuild/grant/post callback
  -> redraw/description update
```

Queued work later resolves the stored legacy action/type pair back to an executable action object and invokes `action({isQueue:true})`.

There is no single legacy success contract:

- the default immediate path distinguishes `0` from other false-ish outcomes when deciding whether queue fallback is allowed;
- build-queue execution treats any result other than literal `false` as success;
- research-queue execution uses a truthy test;
- some actions, including `evolution.dna`, mutate successfully and still return `false`.

### Target rule

M3 command execution must not preserve overloaded callback return values.

Expected gameplay refusal becomes a structured rejected command result. Contract/configuration failure remains an `EngineContractError`. Queueing is an explicit operation/policy decision rather than a hidden interpretation of `true`, `false`, `0`, or arbitrary truthy values.

---

## Requirement taxonomy

Legacy action eligibility is spread across several mechanisms:

```text
reqs
condition()
trait / not_trait
gene / not_gene
not_tech
path
already-granted checks
skipRequirement()
structure checks
resource affordability
queue prerequisite prediction
```

M3 must separate these into four concepts.

### Availability

Whether the command/action concept belongs in the current progression context. Availability may later inform UI presentation but is not itself a payment or mutation rule.

### Execution condition

A state predicate that must be true when the command executes.

### Affordability

Whether the resolved consumptive payment can be made from current authoritative state.

### Queue/prediction eligibility

Whether a work item may legally wait for future state or predicted prerequisites.

These concepts may share lower-level condition primitives, but their meanings must remain distinct.

### Structured failure reasons

M3B conditions must return machine-readable reasons, not localized strings. A reason should identify the failed condition kind, subject, expected value/rank/amount where applicable, actual value where available, and a stable reason code.

Localization belongs outside the engine.

---

## First vanilla evidence: `evolution.dna`

`evolution.dna` is the first selected M3 vertical because its execution mutation is intentionally small:

```text
cost: 2 RNA
execution guard: RNA >= 2 AND DNA < DNA.max
effect: RNA -2, DNA +1
legacy callback result: false
```

Its legacy `condition()` is different from its execution guard. It requires:

- DNA exists;
- DNA is displayed;
- DNA is below capacity;
- the evolution final menu is not active.

It does **not** check RNA affordability. Conversely the direct `action()` callback does not check DNA display or the final-menu presentation state.

Characterization therefore proves all of the following:

- qualification can be true while execution cannot pay;
- qualification can be false while direct execution still mutates;
- DNA capacity is both a qualification and execution constraint;
- a successful mutation can still return legacy `false`;
- current affordability and max/capacity feasibility can disagree.

This evidence is the reason M3 must not collapse visibility, execution requirements, affordability, and queue feasibility into one boolean.

---

## Legacy cost taxonomy

Legacy cost objects contain both real payments and non-consumptive gates.

### Consumptive payments

Ordinary resources ultimately deduct from `global.resource`.

Special legacy payment semantics include:

- `Knowledge`: deduct resource and increase cumulative `global.stats.know` spending;
- prestige currencies: deduct from `global.prestige`;
- `Plasmid` in antimatter: resolve payment to `AntiPlasmid`;
- `Supply`: deduct `global.portal.purifier.supply`;
- `Species`: deduct species population and also reduce workers in the default job.

These are semantic payment operations, not merely `amount -= cost`.

### Non-consumptive pseudo-costs

The following currently participate in affordability but are excluded from `payCosts()` consumption:

```text
Custom
Structs
Bool
Morale
Army
HellArmy
Troops
```

Target architecture treats these as requirements/conditions or capability checks rather than ordinary payment lines.

---

## Current affordability versus legacy max affordability

`checkCosts()` and `checkMaxCosts()` answer materially different questions.

For an ordinary resource:

```text
current affordability:
  required <= current amount
  AND required <= max where bounded

legacy max check:
  resource is displayed
  AND required <= capacity where bounded
```

For `Supply`, current affordability uses current `supply`, while the max check uses `sup_max`.

Prestige resources are different again: the legacy max path still compares current holdings rather than a storage capacity.

Pseudo-cost requirements such as morale/army/Bool remain current-state checks.

### Target rule

M3 must not preserve the misleading name `maxAffordable` as a generic concept.

The target design separates current affordability from queue/capacity feasibility. M3D may choose the final API name, but the contract must describe the semantic question being asked rather than exposing the historical helper name.

---

## Price calculation and M4 boundary

`adjustCosts()` is already a modifier pipeline in disguise. It applies contextual transforms for traits, challenges, governments, progression and other rules.

Some transforms only change numeric amounts. Others substitute the payment resource itself, for example converting a Lumber cost to Chrysotile for smoldering rules.

Target conceptual pipeline:

```text
declared cost
  -> contextual calculation/transformation
  -> resolved quote
  -> affordability
  -> semantic payment
```

M3 owns the quote, affordability and payment contracts.

M4 owns the general calculation/modifier architecture. M3 may use a bounded resolver seam so the first command vertical can work before M4, but M3 must not prematurely reproduce the full legacy `adjustCosts()` pipeline as the permanent modifier engine.

---

## Effect taxonomy

The legacy field named `effect` is commonly presentation text used in action descriptions. It is **not** the target engine effect contract.

Actual legacy mutation semantics are spread across:

```text
action()
payCosts()
gainTech()
postBuild()
post()
callback_queue
helper calls made from action callbacks
```

M3C must separate:

### Authoritative semantic operations

Examples:

```text
resource.consume
resource.grant
technology.grant
structure.increment
population.change
achievement.advance
```

### Domain events/results

Machine-readable facts emitted after successful execution for other systems/application layers to observe.

### Application/UI reactions

Messages, sounds, redraws, navigation, descriptions and localization are outside authoritative mutation.

### Legacy runtime callbacks

Executable references in `callback_queue` are migration debt. New engine effect plans may not contain arbitrary executable callbacks.

---

## Command contract rules for M3A1

M3A1 must build on these rules.

### Identity

Commands use the existing canonical content-ID grammar, for example:

```text
evolve:command/evolution/dna
```

No second ID grammar is introduced.

### Payload

Command payloads are closed, validated, inert plain data. They may not contain:

- DOM nodes;
- jQuery/Vue objects;
- legacy action objects;
- functions;
- implicit application preferences.

### Dispatch

Initial dispatch is synchronous. Reentrant command dispatch is prohibited unless a later reviewed slice explicitly introduces a safe composition model.

### Result

Expected gameplay rejection returns a structured command result. Malformed command data, corrupt definitions or engine contract violations throw `EngineContractError`.

### Diagnostics

Command results/diagnostics must be deterministic engine data and must not contain localized presentation strings.

---

## M2 mutation-boundary preservation

M3 must not become a new generic GameState writer.

The command bus, condition engine, effect planner and cost engine may **not** receive or expose raw `mutationAuthority`, generic mutation scopes, arbitrary state setters, or writable GameState drafts.

Commands orchestrate semantic capabilities/domain services. Domain owners remain responsible for their own mutation scopes and invariants.

This preserves the M2 rule:

```text
command -> semantic capability/service -> owned mutation scope
```

not:

```text
command -> generic state transaction -> arbitrary roots
```

### Atomicity scope

A migrated command must apply its complete payment + semantic effect plan atomically for the capabilities involved in that command.

M3A0 does **not** claim that unrestricted cross-domain GameState transaction composition has already been solved. Multi-domain coordination is introduced only when a real migrated command requires it and must preserve existing domain ownership.

---

## Temporary resource compatibility boundary

Resources are not yet an authoritative GameState domain. The first M3 vanilla vertical therefore requires a narrow compatibility capability rather than prematurely migrating all resources.

Conceptually the temporary boundary must support only the queries/mutations required by the migrated command, such as:

```text
query current amount
query capacity/availability
apply validated resource exchange atomically
```

Exact method names are deferred to implementation review.

Rules:

- implementation lives outside `src/engine/**` if it touches legacy `global`;
- no raw legacy object crosses into engine code;
- adapter has explicit tests;
- adapter is first-party/internal only;
- adapter removal target is M6B resources/crafting/trade migration;
- third-party mods never depend on this bridge.

---

## Queue contract evidence for M3E

Legacy queues currently store fields such as:

```text
id
action
type
label
cna
time
q
qs
t_max
bres
req
qa
```

This mixes authoritative work identity, cached estimates and presentation metadata.

Legacy queue behavior also directly reads application preferences including:

```text
qKey
q_merge
qAny
qAny_res
```

M2C already classifies these as application preferences that may affect simulation only through explicit command/input data.

M3E therefore must represent queued work primarily as a canonical command ID plus validated command payload and authoritative work progress/quantity data. Localized labels, DOM/action objects and executable callbacks are excluded.

Merge/ordering/skip policies derived from user preferences cross the application boundary explicitly when enqueueing or scheduling work. Engine queue code may not read hidden application settings.

M3A0 characterizes these laws but does not implement the queue model.

---

## Architecture prohibitions for M3

New M3 engine code must not introduce any of the following paths:

```text
command handler -> global.*
command handler -> DOM/jQuery/Vue
command handler -> raw mutationAuthority
condition -> state mutation
effect plan -> arbitrary executable callback
cost engine -> global.settings
queue work item -> DOM/action object
engine -> vanilla actions.js
```

Temporary legacy adapters are quarantined outside the engine and have explicit removal milestones.

---

## Deliberate deferrals

M3A0 does not solve:

- general calculation/modifier ordering -> M4;
- production/cap simulation -> M4/M5;
- broad resource authority migration -> M6B;
- bulk technology conversion -> M6E;
- bulk evolution/city/action conversion -> M6F;
- queue scheduling implementation -> M3E/M5;
- persistence of commands/work items -> M7;
- command-driven UI migration -> M8;
- public third-party command API -> M10.

---

## M3A0 implementation evidence

The slice adds test-only legacy harness accessors for:

- current and max affordability;
- raw and adjusted action costs;
- synthetic adjusted costs;
- direct action execution with explicit `isQueue` input.

These hooks exist only under `tests/legacy` and do not create a production legacy API.

Characterization coverage records:

- DNA qualification/execution/affordability differences;
- DNA successful mutation returning `false`;
- ordinary-resource current vs capacity feasibility;
- `Supply` current vs capacity semantics;
- prestige max-check semantics;
- antimatter Plasmid payment-source remapping;
- compound Species payment;
- Knowledge spending side effect;
- non-consumptive Bool gating;
- numeric cost adjustment;
- resource-substitution adjustment;
- immediate vs queued legacy return-value tests;
- queue record/action-object coupling;
- queue application-preference dependencies;
- `postBuild()` progression/callback/UI coupling;
- legacy `effect` presentation usage.

---

## Definition of done

M3A0 is complete when:

1. the legacy immediate/queued/post-build lifecycle is source-backed and documented;
2. overloaded action return semantics are characterized;
3. requirement mechanisms are classified into availability, execution, affordability and queue/prediction concerns;
4. special cost/payment kinds are characterized;
5. consumptive payments are distinguished from pseudo-cost requirements;
6. current affordability and capacity/queue feasibility are characterized separately;
7. representative numeric and resource-substitution cost adjustments are executable evidence;
8. the M3/M4 quote-versus-modifier boundary is explicit;
9. authoritative effects are separated from presentation text, callbacks and UI reactions;
10. queue preferences obey the M2C explicit-command-input rule;
11. `evolution.dna` has boundary-level characterization proving qualification and execution are different contracts;
12. the command/result/condition/cost/effect laws are written before production M3 code;
13. M3 is explicitly prohibited from obtaining generic GameState mutation authority;
14. the temporary resource compatibility boundary has M6B as its removal target;
15. no production command/condition/effect/cost/queue engine is implemented in this slice;
16. `GameState` schema and writable roots do not change;
17. gameplay, persistence, reset and UI behavior do not change;
18. existing M0-M2 architecture gates and safety tests remain authoritative;
19. no oracle snapshot is rebaselined merely to accommodate M3A0;
20. the next production slice is M3A1 command contract/bus.
