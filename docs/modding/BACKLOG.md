# Modding Backlog

This file is the temporary issue backlog while GitHub Issues are disabled for the fork.

When Issues are enabled, migrate these entries into individual GitHub issues and keep this document as the high-level index.

## M0: Safety and reproducibility

### [ ] M0A - Establish reproducible upstream baseline

**Goal:** Establish a reproducible, documented baseline before any runtime refactor.

**Scope**
- Record the exact upstream Evolve commit used as the baseline.
- Verify dependency installation and all existing build commands.
- Document generated JS/CSS artifact policy.
- Add a single repeatable command suitable for future CI that proves the unmodified source builds.
- Do not change gameplay.

**Acceptance criteria**
- A clean checkout can install and build using documented steps.
- Game and wiki bundles build successfully.
- The exact upstream baseline commit is recorded.
- No generated files that upstream asks contributors not to commit are introduced accidentally.
- Environment/version assumptions are documented.

### [ ] M0B - Add characterization test harness

**Goal:** Create the minimum test infrastructure needed to refactor Evolve safely.

**Scope**
- Add a test runner appropriate for the existing JavaScript/esbuild codebase.
- Make core game modules testable with minimal production-code disruption.
- Support controlled state fixtures.
- Support deterministic setup/teardown.
- Add initial characterization tests for a low-risk existing behavior.

**Acceptance criteria**
- Tests run from one documented npm command.
- At least one current vanilla behavior is captured before refactoring.
- Tests do not mutate real browser/localStorage data.
- Failure output clearly identifies changed state.
- No intentional gameplay changes.

### [ ] M0C - Create representative save/state fixtures

**Minimum fixture coverage**
- fresh evolution;
- early civilization;
- established/pre-industrial;
- industrial;
- early space;
- interstellar;
- late/high-complexity;
- reset-ready;
- active challenge;
- at least two materially different racial trait profiles.

**Acceptance criteria**
- Each fixture records origin/version and purpose.
- Fixtures are deterministic/reusable.
- No user-specific data.
- Expected high-level invariants are documented.
- Fixture format minimizes noisy diffs where practical.

### [ ] M0D - Add deterministic simulation regression tests

**Goal:** Prove that refactors preserve simulation behavior over time.

**Compare where applicable**
- resource amounts/capacities;
- population/jobs;
- unlocked technologies;
- buildings/structures;
- queues;
- statistics;
- production/power state;
- reset-relevant state.

**Acceptance criteria**
- Fixed fixture + fixed seed + fixed tick count yields stable expected results.
- Floating-point tolerances are explicit and narrow.
- A deliberate production change causes a useful failing diff.
- Unseeded randomness is removed from the tested path or clearly isolated.

## M1: Registry foundation

### [ ] M1A - Implement generic content registry core

**Required capabilities**
- register an entry;
- namespaced public ID;
- source/package ownership;
- duplicate detection;
- lookup/existence;
- iteration;
- useful validation errors.

**Acceptance criteria**
- Unit tests cover success and error cases.
- Registration/iteration semantics are documented.
- Silent duplicate replacement is impossible.
- No gameplay change.

### [ ] M1B - Define namespace and legacy-ID rules

**Rules**
- `evolve:*` is reserved for vanilla.
- Public IDs use `namespace:local_id`.
- Mod namespaces use a validated identifier format.
- Legacy vanilla IDs may map to public IDs during migration.
- IDs cannot be silently repurposed.
- Cross-namespace overrides require an explicit future mechanism.

**Acceptance criteria**
- Parser/validator tests exist.
- Reserved namespace behavior is tested.
- Legacy mapping is tested.
- Conflict errors identify owner and ID.

### [ ] M1C - Register first vanilla content through legacy adapters

**Approach**
- Keep existing vanilla objects/tables.
- Add adapter registration, for example `evolve:food -> Food`.
- Change the minimum lookup path needed to prove the boundary.
- Characterize behavior before changing lookup.

**Suggested targets:** achievements and/or resource metadata.

**Acceptance criteria**
- At least one real vanilla content family is discoverable through the registry.
- Existing legacy code still works.
- Regression tests show equivalent behavior.
- No mass JSON conversion.

### [ ] M1D - Add developer registry inspector

**Show**
- registry family;
- public namespaced ID;
- owning source/package;
- legacy ID/alias;
- duplicate/validation errors.

**Acceptance criteria**
- Developers can enumerate registered entries at runtime or through a documented debug command.
- Ownership and legacy mappings are visible.
- Inspector code is not a dependency of normal game logic.

## Later milestones

See [ROADMAP.md](ROADMAP.md) for M2 through M11.
