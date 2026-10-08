# Refactor Backlog

GitHub Issues #2 through #9 track the original M0/M1 implementation work. Post-M0 audit completion work is tracked by M0E (#16) and its bounded slices #17-#21. The roadmap targets a full engine refactor rather than a permanent wrapper around legacy Evolve.

See [ROADMAP.md](ROADMAP.md) for the complete M0-M14 plan and [EXECUTION_PROTOCOL.md](EXECUTION_PROTOCOL.md) for the bounded review/implementation/closure workflow used by future slices.

## M0: Safety and reproducibility

### M0A - Reproducible upstream baseline ([#2](../../issues/2)) - complete

Established exact baseline, locked build, CI, and build-tooling correction.

### M0B - Characterization test harness ([#3](../../issues/3)) - complete

Add a test environment able to control:

- storage/localStorage replacement;
- legacy state loading;
- clock;
- RNG;
- worker/timer behavior;
- minimal DOM shims only where legacy code requires them.

Initial characterization targets should include a resource mutation/cost behavior and one progression behavior.

### M0C - Representative state/save fixtures ([#4](../../issues/4)) - complete

Fixture coverage expands to include:

- evolution;
- early city;
- pre-industrial;
- industrial;
- space;
- interstellar;
- portal/hell;
- late game;
- multiple reset tiers;
- active challenge;
- multiple race/trait profiles;
- queue/power/crafting states.

### M0D - Deterministic differential simulation ([#5](../../issues/5)) - complete

Run controlled legacy loop steps and capture normalized state.

The harness must be capable of comparing a future new-system implementation against legacy behavior.

## M1: Engine kernel and seams

### M1A - Identity and registry kernel ([#6](../../issues/6)) - complete

Implement:

- namespaced IDs;
- registry primitive;
- source/package ownership;
- duplicate detection;
- legacy aliases;
- deterministic lookup/iteration;
- validation.

This is an internal engine primitive, not yet a public Mod API.

### M1B - Definition contracts and namespace rules ([#7](../../issues/7)) - complete

Define:

- `evolve` namespace reservation;
- content ID grammar;
- immutable identity;
- definition/state separation;
- initial schemas for low-risk content such as achievements/resource metadata/basic technology metadata;
- explicit extension/override policy deferred until needed.

### M1C - Runtime environment ports ([#8](../../issues/8)) - complete

Introduce testable interfaces for:

- Clock;
- RNG;
- Storage;
- Logger/diagnostics.

Browser implementations adapt current platform behavior. New engine code uses ports instead of direct globals/platform calls.

### M1D - Legacy bridge and architecture inspector ([#9](../../issues/9)) - complete

Established:

- deterministic read-only registry/definition inspection;
- ownership, aliases, definition-family and structured contract-error diagnostics;
- explicit validated legacy mapping/lifecycle metadata for relationships that cannot be direct aliases;
- representative direct Food-state and contextual `primitive` technology mappings;
- source-backed characterization for the contextual technology mapping;
- an inspectable architecture report reusing the M0E5/M1C scanners;
- a dedicated bridge quarantine gate preventing direct legacy/platform access or forbidden imports;
- mandatory adapter/mapping removal milestones, with M9C as the hard bridge-deletion backstop.

M1D deliberately does not create `GameState` or switch authoritative state. Those begin in M2.

## M2: Explicit state architecture - complete

### M2A - GameState schema - complete

Established:

- an independent `GameState` schema version and explicit minimal root;
- hardened inert plain-data canonicalization for future state domains;
- fail-closed rejection of accessors, exotic objects, sparse/extra arrays, non-finite values, cycles, and hostile inspection failures;
- documented domain ownership and separation between definitions, authoritative state, settings, transients, runtime ports, and persistence;
- an explicit rule not to clone legacy `global` into the new engine;
- behavior-neutral regression coverage with legacy gameplay/save authority unchanged.

See [M2A_GAME_STATE_SCHEMA.md](M2A_GAME_STATE_SCHEMA.md) for the design authority.

### M2B - State store and selectors - complete

Established:

- deeply frozen committed state and detached deterministic snapshots;
- synchronous selectors over a read-only store facade;
- a separate retained mutation-authority capability so read-side consumers cannot mint write scopes;
- explicit named top-level mutation scopes instead of generic path setters;
- detached mutable transaction drafts with full validation before atomic commit;
- rollback on thrown/invalid/reentrant/async mutation attempts;
- rejection of scope creation during selectors/transactions so failed work cannot leak scope registration;
- post-validation scope-escape detection;
- deterministic observational revisions and JSON Pointer-style change diagnostics;
- transaction-level hardening against hostile/invalid M2A state shapes;
- a thin `GameStateStore` integration with zero premature gameplay mutation roots and no authority factory exposed.

M2B does not migrate gameplay authority, modify persistence, or synchronize with legacy `global`. `GAME_STATE_SCHEMA_VERSION` remains 1 at the M2B slice boundary.

See [M2B_STATE_STORE_SELECTORS.md](M2B_STATE_STORE_SELECTORS.md) for the design authority.

### M2C - Settings and transient-state separation - complete

#### M2C1 - Legacy state classification - complete after hardening

Established a fail-closed migration catalog for the mixed legacy settings/runtime surfaces without moving authority:

- every M0-classified top-level `global.settings` member has one explicit M2 target classification;
- the actual initialized legacy settings surface is independently cross-checked so M0/M2 cannot silently omit a current top-level setting together;
- every exported mutable `var`/`let` binding in `src/vars.js` has one explicit target classification;
- new exported `const` containers in `vars.js` are ratcheted so they cannot bypass the mutable-state review;
- M0 observation semantics remain distinct from target ownership;
- queue/input behavior preferences are recorded as future application/command concerns rather than hidden GameState;
- derived caches, deterministic runtime working state, executable/runtime services, platform dependencies, migration debris, and semantic debt are distinguished;
- `directMigration` is an explicit per-entry decision with no implicit default;
- no gameplay, persistence, `GameState`, oracle, reset, or UI behavior changes.

See [M2C1_LEGACY_STATE_CLASSIFICATION.md](M2C1_LEGACY_STATE_CLASSIFICATION.md).

#### M2C2 - State-layer ownership/lifecycle contract - complete

Established the permanent target contract without migrating production authority:

- closed target layers for GameState, application preferences/control, UI session state, derived state, simulation/application working state, runtime/platform services, migration and debug concerns;
- mixed legacy parents use an explicit no-target decomposition contract instead of being assigned a fake permanent migration owner;
- orthogonal lifecycle, persistence, simulation-role, migration-disposition and gameplay-reset vocabularies;
- legal layer combinations are machine-checked;
- every M2C1 top-level setting/runtime entry normalizes into one legal target contract or reviewed no-target decomposition source;
- behavior-affecting application preferences cross the future engine boundary only as explicit command inputs;
- `pause` is application/scheduler control and `disableReset` is a temporary UI safety latch, with reset-to-default semantics proven against `clearStates()`;
- `show*` projection flags are explicit fail-closed derived projections rather than name-prefix guesses;
- space/Portal/Eden/Tau parent containers are decomposed, while each persisted region flag is conservatively translated into future authoritative world/progression information before UI visibility is derived;
- every current region flag is listed in a fail-closed replacement map so legacy unlock evidence cannot be silently discarded;
- ARPA navigation is separated from progression-driven ARPA availability;
- message-filter unlock availability is separated from user visibility/limit/retention preferences;
- `message_logs` selected view is separated from reconstructed presentation buffers;
- keyboard mappings and per-resource bar choices remain application-profile preferences;
- legacy runtime working maps remain reconstructible non-persistent operation context;
- executable/platform machinery maps to services rather than state;
- no generic PreferencesStore/UIStore/TransientState/CacheStore was created;
- no gameplay, persistence, GameState, oracle, reset or UI implementation behavior changed.

See [M2C2_STATE_LAYER_CONTRACT.md](M2C2_STATE_LAYER_CONTRACT.md).

#### M2C3 - State-boundary closure - complete

Closed the M2C boundary without migrating production authority:

- direct legacy `global.settings` access is frozen by module and statically visible top-level key in a checked downward-only baseline;
- dynamic settings access and whole-settings-object exposure are explicit debt classes rather than invisible escape hatches;
- statically visible `hasOwnProperty()` existence checks are attributed to the setting they inspect;
- consumer edges for every M2C-managed `vars.js` runtime binding are frozen and can only shrink;
- the runtime-consumer baseline keyset is fail-closed against the M2C2 contract, including explicit namespace-import debt;
- generic settings/UI/cache/transient/runtime/migration/debug catch-all roots are permanently prohibited from becoming authoritative `GameState` domains;
- the M2C gate is a first-class `npm run test:architecture` gate and appears in the architecture report;
- adversarial tests prove debt increases, unratcheted improvements, new runtime consumers, binding-key drift, scanner edge cases and forbidden GameState roots fail closed;
- no production settings/UI/transient store was created, no gameplay state was migrated, and `GameState` remained `{ schemaVersion: 1 }` with zero writable roots at M2C closure.

See [M2C3_STATE_BOUNDARY_CLOSURE.md](M2C3_STATE_BOUNDARY_CLOSURE.md).

### M2D - First authoritative state-domain migration - complete

Achievements now prove the migration pattern end to end:

- legacy rank/universe semantics were characterized before migration;
- `GameState.achievements` became schema-version-2 authoritative state;
- persistent writes use the achievement mutation service;
- ordinary reads use the semantic read facade backed by `store.select()`;
- `global.stats.achieve` remains only as a synchronous compatibility/save projection and for historical pre-hydration migrations;
- architecture gates prevent ordinary readers or writers from reclaiming the legacy ledger as authority.

See [M2D3_ACHIEVEMENT_AUTHORITY_CUTOVER.md](M2D3_ACHIEVEMENT_AUTHORITY_CUTOVER.md) and [M2D4_ACHIEVEMENT_READER_CUTOVER.md](M2D4_ACHIEVEMENT_READER_CUTOVER.md).

### M2E - State architecture guard expansion - complete

The M2 state laws are now machine-enforced cumulatively:

- M2E1 classifies every GameState root and pins one explicit owner/schema/selector/mutation-service set per authoritative domain;
- M2E2 confines writable roots, raw mutation authority and domain scopes to reviewed composition and closed semantic mutation surfaces;
- M2E3 closes semantic selector surfaces and enforces the state-layer dependency DAG;
- M2E4 integrates M2C/M2D/M2E into a versioned architecture report, cross-checks their contracts and provides the whole-M2 closure gate.

See [M2_CLOSURE_REVIEW.md](M2_CLOSURE_REVIEW.md) for the M2 exit authority.

## M3: Commands, conditions, effects, and costs - complete

### M3A0 - Legacy command behavior and architecture contract - complete

Established the pre-implementation evidence and design authority for M3:

- source-backed immediate, queued, post-build, grant and callback lifecycle evidence;
- explicit characterization of overloaded legacy action return values;
- separation of availability, execution conditions, current affordability and queue/capacity feasibility;
- special legacy payment semantics for prestige currencies, antimatter Plasmid, Supply, Species and Knowledge;
- representative numeric and resource-substitution cost-adjustment evidence;
- explicit M3 quote/payment versus M4 calculation/modifier boundary;
- separation of authoritative semantic effects from legacy presentation `effect`, callbacks and redraws;
- queue preferences retained as application settings that cross the future engine boundary only as explicit command/enqueue inputs;
- first vanilla vertical evidence for `evolution.dna`, including qualification/execution differences;
- preservation of M2 mutation authority: commands may orchestrate semantic services but may not acquire generic GameState write authority;
- a narrow temporary resource compatibility boundary with M6B as the removal target;
- no production command engine, GameState schema change, persistence change or gameplay cutover.

See [M3A0_COMMAND_BEHAVIOR_CONTRACT.md](M3A0_COMMAND_BEHAVIOR_CONTRACT.md).

### M3A1 - Command contract and bus - complete

Established the first production command primitive from the M3A0 laws:

- canonical command IDs reuse the M1 content-ID grammar with required type `command`;
- dispatch envelopes are closed `{ id, payload }` data;
- payloads are detached, canonicalized, deeply frozen and hostile-input hardened before validation/execution;
- each registration has one synchronous payload validator and one synchronous handler;
- registrations are fixed at construction and duplicate/malformed registrations fail closed;
- the public bus exposes only `prepare`, `dispatch`, `has`, and deterministic `ids`;
- success/rejection results are normalized into one frozen structured result contract;
- rejected results use machine-readable reason codes/details rather than localized strings;
- legacy `false`/`0`/truthy callback results are rejected as invalid command results;
- nested dispatch is prohibited through validation and execution, with lock recovery guaranteed through `finally`;
- declared async functions and runtime Promise/thenable leakage fail closed;
- contract failures carry deterministic command/phase context where possible;
- the bus does not import GameState/state infrastructure and receives no raw mutation authority;
- the inert M1 definition `Registry` is not repurposed as executable handler storage;
- a dedicated M3A1 architecture gate is cumulative in `npm run test:architecture`;
- no vanilla action, GameState schema, queue, persistence or UI path is cut over in this slice.

See [M3A1_COMMAND_BUS.md](M3A1_COMMAND_BUS.md).

### M3B - Condition engine - complete

Established the reusable condition layer and closed it against legacy drift:

- inert, canonical, deeply frozen condition data with hostile-input hardening;
- reusable technology, resource, structure and trait predicates;
- explicit separation between availability/execution conditions and affordability/payment;
- read-only legacy compatibility providers where current authoritative state has not yet migrated;
- differential evidence against representative legacy qualification behavior, including DNA resource predicates;
- cumulative architecture closure preventing condition evaluation from acquiring mutation/payment authority.

M3B does not cut over vanilla actions and does not own payment semantics.

### M3C - Effect/operation planning - complete

Closed the effect-planning layer after implementation and hardening:

- explicit inert `EffectPlan` data with no execution or mutation authority;
- first generic operations `resource.grant` and `resource.consume` with canonical typed IDs and positive finite amounts;
- exact operation order/duplicate preservation and fail-closed hostile-input handling;
- cumulative architecture guards keeping M3C state-free, mutation-free, payment-free, presentation-free and free of first-party Evolve namespace knowledge;
- DNA differential closure proving the complete successful legacy mutation is `RNA -2` plus `DNA +1`, while the M3C representation contains only `resource.grant(evolve:resource/dna, 1)`;
- review hardening proving failed direct execution is complete non-mutation and presentation qualification remains separate from effect planning.

M3C does not execute effects or cut over vanilla gameplay. RNA payment remains reserved for M3D.

### M3D - Quote/cost/payment engine - complete

The quote/payment milestone is complete: deterministic quotes, current-affordability assessment, inert payment plans, explicit special/prestige payment families, and closure hardening are in place. Quotes/plans remain contextual rather than durable authorization.

### M3E - Queue work-item model - complete

The generic queue package is complete through prepared commands, inert WorkItems, pure WorkQueue operations, transient readiness/selection, legacy queue evidence, and cumulative architecture closure. It remains deliberately free of scheduler/execution/persistence authority.

### M3F - First real vanilla cutover - complete

- M3F1 atomic resource commit - complete;
- M3F2 `evolve:command/evolution/dna` - complete;
- M3F3 live `actions.evolution.dna.action()` cutover - complete;
- M3F4 cutover proof and M3F closure - complete;

The live DNA callback delegates gameplay authority through the command/condition/payment/effect/atomic-settlement path while retaining its historical legacy return protocol. The full vertical is closed by the cumulative production/browser proof. See [M3F4_CUTOVER_CLOSURE.md](M3F4_CUTOVER_CLOSURE.md).

### M3G - Whole-M3 hardening and closure - complete

The complete M3 command/condition/effect/payment/queue/cutover architecture is now audited as one milestone. M3G adds cumulative cross-layer ownership enforcement, command-architecture reporting and adversarial production-path proof for stale-state settlement, partial-write rollback and hard rollback failure. See [M3_CLOSURE_REVIEW.md](M3_CLOSURE_REVIEW.md).

## M4: Calculation and modifier engine

### M4A - Calculation context and trace - complete

Established the generic calculation foundation:

- canonical namespaced `calculation` identities;
- closed explicit inert calculation contexts;
- fixed synchronous input-validation/base-calculation registrations;
- finite numerical outputs with negative-zero canonicalization;
- shared `calculate()` / `explain()` execution with opt-in base tracing;
- hostile-input, thenable, reentrancy and deterministic diagnostic hardening;
- a state-free/legacy-free/first-party-neutral calculation architecture gate;
- zero production consumers before the reviewed M4D cutover.

No vanilla production behavior is migrated by M4A. See [M4A_CALCULATION_CONTEXT_TRACE.md](M4A_CALCULATION_CONTEXT_TRACE.md).

### M4B - Modifier pipeline - complete

Completed the generic numeric contribution layer on top of M4A:

- canonical modifier IDs and cross-namespace targeting;
- fixed engine-construction registrations;
- add/multiply/explicit override/cap/floor semantics;
- strict conditional contribution and skipped-operand short-circuiting;
- deterministic `(order, modifierId)` ordering;
- target-owned override permission;
- calculate/explain parity with applied and skipped trace attribution;
- hardened trace continuity, uniqueness, ordering and arithmetic validation;
- hostile-input/thenable/reentrancy diagnostics with modifier attribution;
- cumulative architecture guards for fixed registration authority and zero production consumers.

No vanilla production or cost path is migrated by M4B. See [M4B_MODIFIER_PIPELINE.md](M4B_MODIFIER_PIPELINE.md).

### M4C - Resource calculation primitives - next

Define production, consumption, capacity, storage and resource-delta primitives on the hardened M4A/M4B calculation/modifier foundation. M4C must not silently begin the M4D vanilla production cutover.

M4D-M4E remain as defined in [ROADMAP.md](ROADMAP.md).

## Immediate sequence

```text
M0A-M0E safety foundation - complete
   |
M1A-M1D engine kernel and seams - complete
   |
M2A-M2E explicit state architecture - complete
   |
M3A0-M3E command/condition/effect/payment/queue foundations - complete
   |
M3F1-M3F4 first DNA vertical - complete
   |
M3G whole-M3 hardening and closure - complete
   |
M4A calculation context and trace - complete
   |
M4B modifier pipeline - complete
   |
M4C resource calculation primitives - next
```

Do not jump directly to mod loading, total conversions, bulk content conversion, a vanilla production cutover, or later simulation work. Those would lock in assumptions before their owning slices are reviewed.

## Later milestones

- M4C-M4E calculation/modifier engine;
- M5 deterministic simulation;
- M6 vanilla migration waves;
- M7 persistence v2;
- M8 UI/application separation;
- M9 legacy decommission + first-party Evolve package;
- M10 package loader + public Mod API;
- M11 Mod Manager/developer tooling;
- M12 authoring tools;
- M13 total-conversion certification;
- M14 Android.

## Definition of done for a migration slice

A subsystem is not considered migrated merely because an adapter exists.

A slice is done when:

1. legacy behavior is characterized;
2. new engine behavior is tested;
3. differential comparison passes;
4. authoritative reads/writes use the new path;
5. save implications are handled;
6. architecture metrics improve or stay within ratchet;
7. the obsolete legacy path or adapter is removed, or a specific next removal slice is recorded.
