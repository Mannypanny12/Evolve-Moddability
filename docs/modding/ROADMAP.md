# Modding Roadmap

The milestones are intentionally incremental. Each milestone should leave vanilla Evolve playable.

## M0: Safety and reproducibility

### M0A Baseline build
- Document exact upstream commit.
- Verify clean install and build.
- Record generated-artifact policy.
- Add repeatable test commands without changing runtime behavior.

### M0B Characterization harness
- Add a test harness capable of loading game state and running deterministic logic.
- Prefer black-box or service-level tests over rewriting internals for testability.

### M0C Representative save fixtures
Cover at minimum:
- evolution;
- early civilization;
- industrial;
- space;
- interstellar;
- late game;
- prestige/reset;
- challenge run;
- multiple races.

### M0D Deterministic simulation tests
- Use seeded RNG where possible.
- Capture resource totals, unlock sets, state transitions, and reset outcomes.
- Establish tolerances where floating-point behavior requires them.

Exit criterion: architectural changes can be proven behavior-preserving.

## M1: Registry foundation

### M1A Registry core
Create generic registry primitives with:
- namespaced IDs;
- source ownership;
- duplicate detection;
- lookup;
- iteration;
- immutable public identity.

### M1B Namespace rules
Define:
- `evolve:*` for vanilla;
- mod namespace validation;
- reserved namespaces;
- legacy-ID mapping.

### M1C Legacy adapters
Register selected vanilla content through the new registry without changing behavior.

Start with low-risk content such as achievements/resources.

### M1D Registry inspector
Developer-only view/console output for:
- registered IDs;
- ownership;
- legacy mappings;
- duplicates/errors.

Exit criterion: at least one vanilla subsystem resolves through registries while gameplay remains unchanged.

## M2: Stable Game API

### M2A Read-only state API
Expose stable queries without exposing `global`.

### M2B Resource API
Provide get/amount/capacity/visibility and controlled mutation methods.

### M2C Namespaced mod storage
Mods can persist their own data without writing arbitrary keys into vanilla state.

Exit criterion: a demonstration module can inspect state and persist its own settings without direct `global` access.

## M3: Content package foundation

- Manifest parser and validator.
- Package identity/version.
- Dependency and compatibility model.
- Load-order rules.
- Data-only package support.
- Basic mod loader.
- Developer error reporting.

Exit criterion: a simple data mod can be discovered, validated, enabled, and loaded.

## M4: Modifier engine

- Modifier targets and operations.
- Deterministic ordering.
- Source attribution.
- Conditions.
- Explanation/breakdown API.
- First migrated vanilla calculation.

Exit criterion: one real vanilla calculation is produced via the modifier pipeline with regression equivalence.

## M5: Hook/event system

- Event bus.
- Stable lifecycle events.
- Read-only vs mutable contexts.
- Subscription lifecycle.
- Error isolation.
- Event inspector for developers.

Exit criterion: a mod can react to gameplay events without monkey-patching engine functions.

## M6: Declarative content

- Conditions.
- Costs.
- Effects.
- Unlocks.
- Common production/capacity modifiers.
- Data schemas and validator support.

Exit criterion: meaningful content can be authored without JavaScript.

## M7: Mod Manager

- Enable/disable.
- Dependency diagnostics.
- Compatibility/version diagnostics.
- Load order where required.
- Profiles.
- Save-required-mod reporting.
- Per-mod settings entry point.

## M8: Authoring tools

Start as a developer SDK/CLI, then progress toward a graphical creator.

Capabilities:
- schema-aware editor support;
- validation;
- dependency graph;
- package builder;
- live reload;
- resource/building/tech editors;
- modifier inspector;
- unlock explanation.

## M9: UI extension API

- Tabs.
- Panels.
- Settings.
- Details/popovers.
- Wiki/encyclopedia sections.
- Theming/assets.

Exit criterion: a mod can create a distinct progression surface without editing vanilla UI files.

## M10: Total conversion mode

- Optional exclusion of vanilla content modules.
- Replacement start state.
- Replacement progression roots.
- Custom factions/races/resources/tech/buildings/jobs.
- Custom reset/prestige paths.
- Custom top-level UI navigation.
- Save isolation/profile handling.

Exit criterion: a total conversion can boot with no visible vanilla progression required.

## M11: Android packaging

Only after package/save behavior is stable:
- Capacitor/native wrapper;
- local mod import;
- offline dependency packaging;
- Android file picker/share integration;
- lifecycle/offline-progress verification.

## Milestone rule

Do not begin a later milestone by bypassing a missing earlier abstraction. If a conversion needs raw `global` access because the public API lacks something, that is an API gap to design, not a reason to normalize direct coupling.
