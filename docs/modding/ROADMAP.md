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

### M3A1 Command contract and bus

Create command execution with:

- typed command ID/payload;
- validation;
- structured success/rejection results;
- atomic mutation boundary;
- diagnostic context.

Legacy callback return values such as `false`, `0`, and arbitrary truthy values must not become the new command result contract.

### M3B Condition engine

Implement reusable conditions and machine-readable failure reasons.

Keep availability, execution conditions, affordability, and queue/prediction eligibility semantically distinct even when they reuse lower-level condition primitives.

Start with technology/resource/structure/trait requirements.

### M3C Effect/operation planning

Implement reusable state effects/operations and separate gameplay mutation from presentation reactions.

Effects must plan or describe authoritative state changes without importing DOM/UI behavior into the engine.

### M3D Quote/cost/payment engine

Migrate affordability and payment semantics from helpers such as:

- `checkCosts`;
- `checkAffordable`;
- `payCosts`;
- max-affordable/queue quoting.

Support prestige/special currencies explicitly rather than hidden branches. Keep current affordability distinct from queue/capacity feasibility. M4 remains responsible for the general calculation/modifier pipeline.

### M3E Queue work-item model

Represent queued work as commands/work items independent of DOM action objects and overloaded action callback returns.

### M3F First real vanilla cutover

Cut over one bounded vanilla action end to end through the new command architecture. `evolution.dna` is the first selected evidence vertical because its mutation is small while its legacy availability, execution, affordability, capacity, and return-value semantics are usefully distinct.

The cutover must validate, quote/pay where applicable, mutate authoritative state, and return structured results without making UI code the gameplay authority.

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
