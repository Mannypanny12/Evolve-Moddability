# Full Refactor Roadmap

Every milestone must keep vanilla behavior protected by tests. The roadmap deliberately builds internal engine contracts before promising external Mod API stability.

## M0: Safety and reproducibility

### M0A Reproducible baseline - complete

- exact upstream source baseline recorded;
- clean locked install/build established;
- CI build gate established;
- inherited Node runtime-shadowing issue corrected.

### M0B Characterization harness - complete

Build a test environment that can execute legacy logic with controlled:

- storage;
- state;
- DOM shims only where unavoidable;
- clock;
- RNG;
- worker/timer behavior.

Add first behavior characterizations before modifying their code.

### M0C Representative legacy fixtures - complete

Cover at minimum:

- fresh evolution;
- early civilization;
- pre-industrial;
- industrial;
- early space;
- interstellar;
- portal/hell;
- Eden;
- Tau Ceti/Truepath where practical;
- late/high-complexity;
- reset-ready states for multiple reset tiers;
- challenge state;
- materially different race/trait combinations;
- queues/power/crafting/trade states.

Record source version, purpose, invariants, and normalization rules.

### M0D Deterministic differential simulation - complete

Create a harness around `execGameLoops()` or equivalent legacy entry points.

Verify fixed state + fixed RNG/environment + fixed loop counts.

Capture at least:

- resources/deltas/caps;
- population/jobs;
- structures;
- technologies;
- queues;
- power/support;
- statistics;
- event state;
- prestige/reset-relevant state.

Exit: we can refactor a subsystem and compare old versus new behavior meaningfully.

### M0E Refactor safety-net completion - complete

The post-M0 audit added five bounded corrective slices before M1:

- M0E1 authoritative-state normalization and canonical safety;
- M0E2 inspectable frozen oracle snapshots and path-by-path diffs;
- M0E3 fixture hydration and oracle-matrix hardening;
- M0E4 real-browser bootstrap/UI smoke with a startup-failure negative control;
- M0E5 architecture/CI guardrails.

M0E5 establishes `src/engine/**` as a zero-legacy dependency zone, freezes downward-only legacy architecture ratchets, prevents the 20-module legacy cycle from gaining members, and future-proofs milestone-branch CI.

Exit: the safety foundation is complete and M1 can create new engine code behind machine-enforced architecture boundaries.

---

## M1: Engine kernel and architectural seams

M1 creates primitives, not a public Mod API.

### M1A Identity and registry kernel - complete

Implement:

- namespaced ID type/parser;
- typed registry primitive;
- ownership/package metadata;
- duplicate detection;
- aliases for legacy IDs;
- deterministic iteration;
- validation.

No registry may own mutable save state.

### M1B Definition contracts - complete

Create initial definition contracts for low-risk families:

- achievement;
- resource metadata;
- basic technology metadata.

Separate:

- identity;
- presentation metadata;
- static definition;
- runtime state.

Do not bulk-convert content.

### M1C Runtime environment ports - complete

Introduce explicit engine interfaces for:

- Clock;
- RNG;
- Storage;
- Logger/diagnostics.

Provide browser adapters and deterministic test adapters.

Begin routing newly written engine code through them. Legacy code may continue using old access temporarily.

### M1D Architecture inspector and legacy bridge - complete

Create developer tooling that can show:

- registered definitions;
- aliases/ownership;
- legacy-to-engine mappings;
- direct-legacy usage counters where practical.

Define the temporary bridge between new engine concepts and legacy `global`.

Exit: new engine modules exist with one-way dependency rules, tests, and no dependency on DOM or vanilla content.

The full M1 closure audit is recorded in `M1_CLOSURE_REVIEW.md`. It hardens M1A-D as one unit without beginning M2 state ownership or gameplay migration.

---

## M2: Explicit state architecture - complete

### M2A GameState schema - complete

Define the first explicit state root and domain ownership rules.

M2A provides an independent `GameState` root, a hardened inert plain-data state-value contract, fail-closed validation, and explicit ownership/layer rules without cloning legacy `global`. See `M2A_GAME_STATE_SCHEMA.md`.

### M2B State store and selectors - complete

Provide:

- read-only state access;
- selectors;
- scoped mutation authority/transactions;
- deterministic snapshots;
- change diagnostics.

M2B separates the read-side store facade from the retained mutation-authority capability, so consumers that can query state cannot manufacture new write scopes. Transactions use detached validated drafts, rollback failed work atomically, and emit deterministic observational diagnostics. See `M2B_STATE_STORE_SELECTORS.md`.

No generic public arbitrary-path setter.

### M2C Settings and transient-state separation - complete

Separated and machine-classified:

- simulation state;
- user preferences;
- application control;
- UI-session state;
- derived/transient caches;
- simulation/application working state;
- runtime/platform services;
- migration/debug concerns.

Legacy settings/runtime debt is ratcheted downward, and generic settings/UI/cache/transient/runtime/migration/debug catch-all roots are prohibited from becoming authoritative GameState domains. See `M2C3_STATE_BOUNDARY_CLOSURE.md`.

### M2D First state-domain migration - complete

Achievements are the first real domain migrated end to end.

`GameState.achievements` is authoritative after hydration. Ordinary persistent writes use the semantic achievement mutation service; ordinary reads use the semantic facade backed by `store.select()`. `global.stats.achieve` remains only as historical pre-hydration migration state and a synchronous compatibility/save projection until persistence v2. See `M2D3_ACHIEVEMENT_AUTHORITY_CUTOVER.md` and `M2D4_ACHIEVEMENT_READER_CUTOVER.md`.

### M2E State architecture guard expansion - complete

The M0E5 architecture gate is extended with explicit GameState ownership, mutation-boundary, selector, state-layer dependency, and whole-M2 closure rules.

M2E1 pins domain ownership and composition. M2E2 confines write capabilities and semantic mutation surfaces. M2E3 confines semantic reads and the state-layer dependency DAG. M2E4 integrates the M2C/M2D/M2E guards into a versioned JSON architecture report and cross-checks the complete state architecture as one closure gate.

The full M2 exit audit is recorded in `M2_CLOSURE_REVIEW.md`.

Exit achieved: `GameState` is authoritative for one real domain, the migration pattern is proven, and CI enforces the new state boundary.

---

## M3: Commands, conditions, effects, and costs

M3 is deliberately split into small slices so legacy command semantics are characterized before new execution authority is introduced.

### M3A0 Command behavior contract - complete

Freeze the legacy action lifecycle, requirement categories, cost/payment semantics, queue distinctions, and first vanilla evidence before implementing production command code.

M3A0 is an evidence/design-authority slice only. It does not add the command bus, condition engine, effect engine, cost engine, queue engine, a new GameState domain, or a public Mod API. See `M3A0_COMMAND_BEHAVIOR_CONTRACT.md`.

### M3A1 Command contract and bus - complete

The first production command primitive now provides:

- canonical namespaced `command` IDs using the M1 identity grammar;
- closed inert `{ id, payload }` command envelopes;
- detached/canonical/frozen payload validation;
- fixed synchronous runtime registrations;
- a shared non-executing `prepare()` path for validated command intent;
- structured success/rejection results instead of overloaded legacy callback values;
- deterministic command/phase contract diagnostics;
- fail-closed async/thenable and reentrancy handling;
- a sealed bus surface (`prepare`, `dispatch`, `has`, `ids`);
- architecture enforcement preventing GameState/state-infrastructure imports, raw mutation authority, dynamic loading, or use of the inert M1 Registry as executable handler storage.

M3A1 does not cut over vanilla gameplay and does not implement conditions, costs, effects or queues. Atomic gameplay mutation remains owned by semantic capabilities/domain services rather than the bus. See `M3A1_COMMAND_BUS.md`.

### M3B Condition engine - complete

M3B now provides reusable machine-readable conditions while preserving the M3A0 distinction between availability, execution conditions, affordability and queue/prediction eligibility.

The completed condition milestone includes:

- a hardened inert condition contract/evaluator foundation;
- reusable technology, resource, structure and trait requirement primitives;
- read-only legacy compatibility providers where authoritative state is not yet migrated;
- representative differential evidence against legacy behavior, including DNA resource qualification;
- cumulative architecture closure preventing conditions from acquiring mutation or payment authority.

M3B does not cut over vanilla gameplay and does not own affordability/payment semantics.

### M3C Effect/operation planning - complete

M3C now provides inert semantic effect planning without execution or mutation authority.

The completed effect milestone includes:

- the hardened explicit `EffectPlan` foundation;
- closed `resource.grant` and `resource.consume` operations with canonical typed resource IDs and positive finite amounts;
- exact operation-order and duplicate preservation;
- cumulative architecture guards keeping the generic effect layer state-free, mutation-free, payment-free, presentation-free and free of first-party Evolve namespace knowledge;
- DNA closure evidence proving the complete successful legacy mutation is `RNA -2` plus `DNA +1`, while the M3C representation is exactly one `resource.grant(evolve:resource/dna, 1)` operation;
- post-implementation hardening proving failed direct execution is complete non-mutation and presentation qualification remains separate from effect planning.

M3C deliberately adds no EffectExecutor and does not cut over vanilla gameplay. DNA's `2 RNA` payment remains M3D responsibility.

### M3D Quote/cost/payment engine - complete

M3D now owns the inert quote/assessment/payment-plan architecture needed to separate current affordability from durable command intent.

The completed payment milestone covers:

- deterministic payment quotes and affordability assessment;
- fresh inert payment plans rather than stored authorization tokens;
- queue-feasibility support that remains payment-side only;
- explicit special/prestige payment families rather than hidden generic branches;
- cumulative boundary hardening and closure evidence.

Payment quotes and plans are contextual and must be recomputed when execution conditions change. M4 remains responsible for the broader calculation/modifier pipeline.

### M3E Queue work-item model - complete

Represent queued work as commands/work items independent of DOM action objects and overloaded action callback returns.

#### M3E1 Prepared command + WorkItem foundation - complete

Adds non-executing `CommandBus.prepare()` and one closed inert `{ command, remaining, unitsPerSlot }` WorkItem contract. No queue list behavior, readiness, scheduling, persistence, or vanilla cutover is introduced. See `M3E1_WORK_ITEM_FOUNDATION.md`.

#### M3E2 Pure WorkQueue/list operations - complete

Adds the frozen dense WorkQueue representation, safe slot accounting, explicit `never` / `adjacent` / `matching` merge policies, post-merge capacity checks, explicit normalization, whole-record and slot-chunk removal, pure reordering, and prefix-preserving capacity trimming. Review hardening pins the WorkQueue dependency closure, keeps the shared WorkItem contract queue-internal, and adds adversarial/result-shape/overflow coverage. No scheduler, readiness, payment, execution, persistence, or vanilla cutover authority is introduced. See `M3E2_WORK_QUEUE.md`.

#### M3E3 Readiness and selection - complete

Adds the frozen `createWorkQueueSelector()` readiness/selection boundary with transient `ready` / `waiting` / `bypass` results, explicit `ordered` / `first-ready` policies, deterministic short-circuit evaluation traces, synchronous evaluator hardening and a closed dependency set. Review hardening adds prototype-safe readiness-detail canonicalization, hostile-diagnostic sanitization, shared-identity/cycle rejection and adversarial tests. No readiness state is cached on WorkItems or WorkQueues, and no scheduler, prediction, payment, condition, execution, persistence or vanilla-cutover authority is introduced. See `M3E3_READINESS_SELECTION.md` and `M3E3_REVIEW_HARDENING.md`.

#### M3E4 Evidence, hardening and closure - complete

Closes M3E with executable legacy build/research queue evidence, a zero-execution `prepare -> WorkItem -> WorkQueue -> selection` integration proof, and a cumulative architecture gate that pins the four-file generic queue package, keeps it first-party-neutral, and prevents any production consumer before reviewed cutover. Command-specific admission, execution progress, reconciliation, prediction, scheduling and persistence remain deferred to their owning later milestones. See `M3E4_QUEUE_CLOSURE.md`.

M3E is closed without modifying vanilla build/research gameplay. M3F is the active milestone.

### M3F First real vanilla cutover

Cut over one bounded vanilla action end to end through the new command architecture. `evolution.dna` is the first selected evidence vertical because its mutation is small while its legacy availability, execution, affordability, capacity, and return-value semantics are usefully distinct.

The cutover must validate, quote/pay where applicable, mutate authoritative state, and return structured results without making UI code the gameplay authority.

#### M3F1 Atomic resource commit - complete

Adds the narrow synchronous resource-plan commit executor and bounded Evolve legacy resource write capability needed to settle reviewed resource payment/effect plans atomically while resource authority remains temporarily in legacy state. The boundary is semantic rather than an arbitrary legacy-state writer and retains M6B as its removal target. See `M3F1_ATOMIC_RESOURCE_COMMIT.md`.

#### M3F2 DNA command - complete

Adds `evolve:command/evolution/dna` as the first first-party command registration. It preserves the DNA execution/presentation distinction, represents the 2 RNA payment through M3D, represents the 1 DNA grant through M3C, and delegates the combined mutation to M3F1 atomic resource settlement. The registration remains independent of `global`, DOM/UI, queue authority and raw mutation. See `M3F2_DNA_COMMAND.md` and `M3F2_REVIEW_HARDENING.md`.

#### M3F3 Vanilla DNA live cutover - complete

Cuts the real `actions.evolution.dna.action()` callback over to the reviewed command path through a tiny application composition root. The legacy callback no longer owns RNA/DNA checks or mutation; it only dispatches the command and preserves the historical `false` return expected by legacy control flow. Differential coverage retains a frozen pre-cutover oracle, production composition follows live `setGlobal()` rebinding, and architecture fitness prevents direct mutation or swallowed contract failures from returning to the shim. See `M3F3_DNA_LIVE_CUTOVER.md`.

#### M3F4 Cutover proof and closure - next

Reconcile the first live cutover as a complete vertical: confirm downward architecture ratchets, run the complete CI/build/browser proof on the final M3F head, close any integration-only gaps exposed by production composition, and record M3F closure without broadening into M3G's whole-milestone audit.

### M3G Hardening and closure

Audit the complete M3 path for atomicity, failure semantics, boundary ownership, diagnostics, legacy compatibility, and architecture regressions. Extend CI/fitness guards where needed and record the M3 closure review.

Exit: at least one real vanilla action can validate, quote, pay, mutate, and emit results through the new engine without using a DOM element as gameplay authority or directly mutating legacy state.

---

## M4: Calculation and modifier engine

### M4A Calculation context and trace

Define named calculations with explicit inputs and traceable outputs.

### M4B Modifier pipeline

Support operations such as:

- add;
- multiply;
- override where explicitly allowed;
- cap/floor;
- conditional contribution.

Define deterministic ordering and ownership.

### M4C Resource calculation primitives

Model:

- production;
- consumption;
- capacity;
- storage;
- resource delta application.

### M4D Migrate one production vertical

Pick a controlled resource path and produce exact legacy-equivalent results through the new pipeline.

### M4E Expand across `prod.js`

Systematically remove hard-coded production switch cases as their logic moves to definitions/calculations.

Important: completion requires migrating related calculations currently embedded in `fastLoop()`, not merely emptying `prod.js`.

Exit: a meaningful set of vanilla resource calculations is explainable and no longer depends on the legacy production switch.

---

## M5: Deterministic simulation architecture

### M5A Scheduler and phases

Introduce engine systems and explicit ordering.

Initially mirror legacy fast/mid/long cadence to reduce behavior risk.

### M5B Clock/RNG integration

Remove direct time/random access from migrated systems.

### M5C Resource/production system migration

Move migrated production/cap/consumption application out of `main.js`.

### M5D Population/jobs/queues/power systems

Extract reconciliation systems from loops.

### M5E Periodic world/event systems

Extract appropriate long-loop behavior.

### M5F Offline/catch-up simulation

Use the same system scheduler for catch-up, with explicit safety limits and elapsed-time policy.

### M5G Worker/platform timing boundary

Keep timing/platform scheduling separate from simulation. The worker can schedule steps without owning domain rules.

Exit: substantial gameplay progresses through deterministic engine systems, and migrated simulation no longer renders UI.

---

## M6: Vanilla content and domain migration waves

This is intentionally a long milestone family. Each slice follows:

1. characterize legacy behavior;
2. define engine schema/API needed;
3. migrate vanilla content/state;
4. differential-test;
5. switch authoritative path;
6. delete old path/adapter for that slice.

### M6A Achievements, feats, statistics

A comparatively clean starting content family. M2 already proved authoritative achievement-state migration; M6A expands the broader achievement/feat/statistics content family onto the later command/calculation/simulation contracts rather than repeating the M2 state-foundation work.

### M6B Resources, crafting, trade

Separate resource definitions from state/rendering and migrate crafting/trade metadata and calculations.

### M6C Jobs and population

Move job definitions, assignment rules, output calculations, and population reconciliation.

### M6D Races, genus, traits, biomes, world traits

Migrate definitions first, then replace scattered trait checks with conditions/modifiers/capabilities where appropriate.

### M6E Technologies and progression graph

Convert existing `reqs/cost/grant/effect` shapes to engine definitions.

Replace executable action callbacks with commands/effects where possible.

### M6F Evolution, city structures, and general actions

Migrate action/structure definitions and build behavior.

### M6G ARPA, industry, power, support, queues

Migrate infrastructure and project systems.

### M6H Civics, government, governor, diplomacy

Separate simulation rules from rendering/automation UI.

### M6I Events and seasons

Migrate event requirements/effects and explicit environment/time inputs.

### M6J Space and interstellar

Migrate content and systems in bounded region slices rather than rewriting the entire file at once.

### M6K Portal/Hell/mechs

Migrate combat/exploration/mech systems behind engine services.

### M6L Eden and Tau Ceti/Truepath

Migrate late alternate progression domains.

### M6M Challenges, prestige, reset flows

Model reset/prestige as explicit transactions:

- calculate rewards;
- preserve declared meta state;
- construct new run state;
- emit reset event;
- persist through service.

No page reload should be required for engine correctness.

Exit: vanilla gameplay domains run on new engine contracts. Remaining legacy code is primarily presentation/compatibility, not authoritative simulation.

---

## M7: Persistence v2 and legacy-save compatibility

Some persistence primitives may appear earlier, but M7 is the cutover milestone.

### M7A Explicit save envelope

Store engine/content/save-format identity.

### M7B Domain serializers

Serialize authoritative state only.

### M7C Deterministic migrations

Version save schema independently from game content version.

### M7D Legacy Evolve importer

Use the historical migration knowledge currently embedded in `vars.js` to import old raw-`global` saves.

Golden fixtures cover representative historical formats.

### M7E Backup/recovery and incompatible-content handling

Fail safely when required content is unavailable.

### M7F Remove raw-global persistence

Delete direct `JSON.stringify(global)` save paths from normal operation.

Exit: new saves no longer serialize the implementation object.

---

## M8: Application and UI separation

### M8A View models/selectors

Expose presentation-ready data without DOM access in engine code.

### M8B Command-driven UI

Buttons/forms issue commands rather than mutating state or invoking action objects through `this`.

### M8C Rendering migration by surface

Migrate progressively:

- resources;
- city/actions;
- research;
- jobs/civics;
- space;
- portal;
- late-game surfaces.

The framework may remain Vue 2/jQuery initially. Architectural separation matters before framework replacement.

### M8D Navigation descriptor model

Prepare top-level and regional navigation for first-party/mod content.

### M8E Wiki/knowledge projection

Generate wiki-facing information from content definitions/calculation metadata where practical, reducing duplicate rule logic.

Exit: engine/simulation contains no DOM rendering responsibilities.

---

## M9: Legacy decommission and first-party package boundary

### M9A Vanilla content package boundary

Organize vanilla registration/bootstrap as first-party `evolve` content.

It need not be a ZIP file, but architecturally it loads through package/content registration.

### M9B Break the legacy dependency knot

Enforce acyclic layer dependencies and shrink/remove the old 20-module strongly connected component.

### M9C Delete legacy bridge

Remove migrated `global` adapters.

### M9D Delete obsolete production/action/save paths

Remove dead legacy code rather than retaining permanent parallel systems.

### M9E Architecture completion audit

Required gates:

- engine does not import vanilla content;
- engine has no DOM access;
- simulation has no direct storage/wall-clock/random access;
- content definitions do not directly mutate state;
- `global` is no longer authoritative and can be removed.

Exit: full internal refactor is complete.

---

## M10: Package loader and public Mod API

Only now stabilize third-party-facing contracts.

### M10A Package manifest/dependencies

Implement package identity, versions, dependencies, load order, ownership, validation.

### M10B Data-only content packages

Allow safe declarative additions.

### M10C Trusted code packages

Expose controlled code entry points without raw state access.

### M10D Public API facade

Expose stable subsets of the proven internal engine:

- queries/selectors;
- registries;
- commands;
- conditions/effects;
- modifiers;
- domain-event hooks;
- storage;
- diagnostics.

### M10E API versioning/compatibility tests

Vanilla first-party content is the reference consumer; example mods are secondary contract consumers.

Exit: meaningful mods load without legacy access or monkey-patching.

---

## M11: Mod Manager and developer tooling

- install/import;
- enable/disable;
- dependency diagnostics;
- profiles;
- save-required-content diagnostics;
- per-mod settings;
- registry inspector;
- calculation/modifier trace;
- unlock reason inspector;
- event trace;
- command trace;
- state diff tools.

---

## M12: Authoring tools

Start with schemas/CLI and progress to graphical tools.

- validators;
- package builder;
- live reload;
- definition editors;
- technology/progression graph editor;
- conditions/effects editor;
- localization/assets;
- package dependency visualization.

Keep advanced code escape hatches for mechanics that do not fit declarative schemas.

---

## M13: Total-conversion certification

A small demonstration conversion proves:

- replacement start state;
- no required visible vanilla progression;
- custom resources;
- structures;
- jobs/units;
- technologies/progression;
- faction/race content;
- events/challenges where relevant;
- reset path;
- navigation;
- persistence;
- offline simulation.

A total conversion must not require editing first-party Evolve source.

---

## M14: Android packaging

After package/save semantics are stable:

- Capacitor/native wrapper;
- local `.evolvemod` import;
- file picker/share integration;
- offline operation;
- lifecycle/save tests;
- mod profile management appropriate for mobile.

Android packages the engine. It must not become a separate gameplay implementation.

---

## Cross-cutting migration rules

### No permanent dual systems

A temporary dual path is acceptable only for differential verification. Once a migrated path is authoritative and proven, delete the old path.

### Characterize before migrate

Every migrated behavior needs coverage first.

### Public stability comes late

Internal APIs may evolve aggressively through M1-M9. Third-party compatibility promises begin at M10.

### Architecture budgets ratchet downward

Track direct:

- `global`;
- DOM;
- storage;
- wall-clock/random;
- forbidden imports;
- dependency cycles.

New engine code starts at zero and stays at zero.

### Upstream changes

Because the repository is now standalone and the architecture will diverge, upstream integration changes from "keep every refactor easy to merge" to:

- periodically compare upstream;
- port bug fixes/content intentionally;
- retain upstream provenance;
- avoid unnecessary behavior divergence.

Behavioral compatibility is more important than preserving legacy file structure.
