# Refactor Backlog

GitHub Issues #2 through #9 track the original M0/M1 implementation work. Post-M0 audit completion work is tracked by M0E (#16) and its bounded slices #17-#21. The roadmap targets a full engine refactor rather than a permanent wrapper around legacy Evolve.

See [ROADMAP.md](ROADMAP.md) for the complete M0-M14 plan.

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

## M3: Commands, conditions, effects, and costs

### M3A0 - Legacy command behavior and architecture contract - complete

Established the pre-implementation evidence and design authority for M3:

- source-backed immediate, queued, post-build, grant and callback lifecycle evidence;
- explicit characterization of overloaded legacy action return values;
- separation of availability, execution conditions, current affordability and queue/capacity feasibility;
- special legacy payment semantics for prestige currencies, antimatter Plasmid, Supply, Species and Knowledge;
- separation of consumptive payments from pseudo-cost requirements such as `Bool`, `Structs`, morale and army gates;
- representative numeric and resource-substitution cost-adjustment evidence;
- explicit M3 quote/payment versus M4 calculation/modifier boundary;
- separation of authoritative semantic effects from legacy presentation `effect`, callbacks and redraws;
- queue preferences retained as application settings that cross the future engine boundary only as explicit command/enqueue inputs;
- first vanilla vertical evidence for `evolution.dna`, including qualification/execution differences;
- preservation of M2 mutation authority: commands may orchestrate semantic services but may not acquire generic GameState write authority;
- a narrow temporary resource compatibility boundary with M6B as the removal target;
- no production command engine, GameState schema change, persistence change or gameplay cutover.

See [M3A0_COMMAND_BEHAVIOR_CONTRACT.md](M3A0_COMMAND_BEHAVIOR_CONTRACT.md).

### M3A1 - Command contract and bus - next

Implement the first production command primitive from the M3A0 laws:

- canonical namespaced command IDs;
- closed inert payload validation;
- synchronous dispatch;
- structured success/rejection results;
- deterministic diagnostics;
- no raw mutation authority or legacy/UI dependency;
- explicit reentrancy policy.

M3A1 should establish command execution structure without prematurely implementing the full condition, cost, effect or queue engines.

## Immediate sequence

```text
M0A-M0E safety foundation - complete
   |
M1A-M1D engine kernel and seams - complete
   |
M2A-M2E explicit state architecture - complete
   |
M3A0 legacy command behavior/design authority - complete
   |
M3A1 command contract/bus - next
```

Do not jump directly to mod loading, total conversions, or bulk content conversion. Those would lock in legacy assumptions before the engine is ready.

## Later milestones

- M3A1-M3G commands/conditions/effects/costs and first vanilla cutover;
- M4 calculation/modifier engine;
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