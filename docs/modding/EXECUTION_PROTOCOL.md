# Refactor execution protocol

This protocol exists to keep long refactor work bounded, inspectable, and resistant to the repeated late-stage stalls seen during M3. It applies to M3G and later milestone work unless a slice documents a stricter process.

## Why this exists

The recurring M3 stalls were not one repeated engine defect. They clustered around integration and closure work:

- a production/browser state shape differed from Node fixtures;
- a new reviewed dependency made an older cumulative architecture allowlist stale;
- CI output had to be recovered from artifacts after the useful failure detail was hidden;
- documentation/roadmap state lagged behind a completed implementation;
- long tool sequences repeatedly read a moving branch head while new commits were still landing.

The implementation itself was usually small. The expensive part was reconciling several moving proof surfaces at once.

## Mandatory checkpoint order

Every substantial slice or review/hardening pass should use these checkpoints in order:

1. **Freeze the base.** Record the exact starting commit SHA and create/use one dedicated branch for the bounded slice.
2. **Review first.** Inspect implementation, legacy evidence, architecture contracts, tests, and documentation before editing. Record concrete findings.
3. **Implement only justified hardening.** Do not pull the next roadmap slice into the current branch.
4. **Run targeted proof first.** Exercise changed modules and their closest integration/architecture guards before spending a full CI run.
5. **Run the cumulative architecture gate.** Search for every changed dependency in older allowlists/fitness rules before treating a new helper/import as complete.
6. **Run production-shape proof early.** If the slice touches legacy `global`, Vue/DOM state, browser composition, persistence, or platform adapters, run the relevant real-browser/runtime proof before final closure documentation.
7. **Run one full repository CI checkpoint.** Ordinary tests, architecture, build, generated-output cleanliness, negative controls, and browser proof must all pass on one exact SHA.
8. **Close documentation and lifecycle metadata.** ROADMAP, BACKLOG, closure docs, mapping `removeBy` metadata, and deferred-owner notes must agree.
9. **Run final exact-head CI.** The documented head, not merely the preceding code head, is the closure authority.
10. **Stop and report.** Do not chain the next unrelated roadmap slice into the same long tool sequence.

## Fixed-head rule

Once a review checkpoint starts, source reads should use the recorded commit SHA or the dedicated hardening branch. Do not diagnose a failed run against an unpinned moving branch ref.

After a write:

- refresh the branch head once;
- treat that new SHA as the next checkpoint head;
- do not mix evidence from older and newer heads in one conclusion.

This is especially important when CI and repository writes are both active.

## Failure-triage rule

When CI fails:

1. identify the first failing step;
2. inspect that step's preserved artifact/log;
3. reproduce or characterize the single failure with the smallest relevant test/gate;
4. fix that cause;
5. rerun targeted proof before another full CI pass.

Do not repeatedly poll every workflow surface or make speculative production changes from an abbreviated CI annotation.

## Runtime-shape rule

Node fixtures are not sufficient proof when legacy production state is transformed by runtime frameworks. Any bridge that reads or writes live Vue/DOM/platform-managed state needs at least one real runtime/browser proof while the slice is still active.

Fixtures should still model the discovered production shape after a browser-only gap is found, but the fixture must not replace the real-browser proof.

## Architecture-impact rule

Whenever a new module/import is introduced inside a previously closed boundary:

- search all cumulative fitness/allowlist rules that mention the consumer or boundary;
- update only the reviewed dependency set;
- retain a negative control proving arbitrary imports remain forbidden.

This prevents the repeated pattern where production code is correct but an older closure gate is surprised later.

## Closure-state rule

A milestone is not closed merely because code and CI are green. The authoritative status documents must also agree on:

- completed slice;
- next active slice;
- closure document;
- deferred/removal owners.

Where practical, closure fitness should machine-check those status markers so stale roadmap text cannot silently survive.

## Time-bounding rule

Long-running external operations must remain bounded:

- CI jobs require a job timeout;
- browser/WebDriver/network waits require explicit timeouts;
- child processes require forced cleanup fallback;
- test failures must preserve logs as artifacts.

The repository already has these protections for the current baseline workflow and browser harness. New long-running tools must preserve the same property.

## Definition of a clean checkpoint

A checkpoint is clean when:

- the branch head SHA is known;
- no unreviewed edits are still landing;
- targeted proof is green;
- any full CI run being cited belongs to that exact SHA;
- documentation accurately describes the state reached;
- the next slice has not begun.

This protocol is workflow hardening, not an additional gameplay milestone.
