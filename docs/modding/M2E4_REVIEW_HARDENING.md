# M2E4 Review Hardening

## Purpose

This note records the adversarial review and hardening performed while closing M2 as one integrated state-architecture milestone.

M2E4 did not uncover a production gameplay defect and did not require changes under `src/**`. The findings were in integration/reporting assumptions, closure-gate strength, future extensibility, CI contract enforcement, filesystem enumeration, test efficiency, and stale design authority.

The implementation was not treated as closed merely because its first full CI run was green. A second hostile pass was performed against the capstone itself and against the assumptions shared by M2E1-M2E3.

## 1. Legacy mapping report assumption correction

The M2E4 deep dive initially assumed the legacy mapping inspector returned a `Map` that would disappear when the architecture report was serialized.

That assumption was incorrect. `inspectLegacyMappings()` already returns a frozen JSON-shaped object:

```text
{ size, mappings, byDomain }
```

The first M2E4 report test exposed the mistaken assumption. M2E4 was corrected to preserve the established inspector shape rather than inventing a replacement representation.

The integrated report explicitly normalizes its complete output through the JSON boundary and tests that the mapping count and records survive a full JSON round trip.

## 2. Fail-closed, lossless JSON report boundary

A plain `JSON.stringify()` round trip can silently discard or alter values. That is unacceptable for an architecture inspector because a future scanner could accidentally hide information from the printed report.

M2E4 therefore validates report data before normalization. Report data rejects:

- `undefined`, functions, symbols and bigint values;
- non-finite numbers;
- negative zero, which JSON normalizes to positive zero;
- symbol keys;
- accessors;
- exotic object prototypes such as `Map`;
- sparse or extended arrays;
- cycles;
- shared object references whose identity would be duplicated by JSON serialization.

Only after passing that boundary is the report normalized to plain JSON data.

## 3. Mutation-surface and summary consistency

The first closure gate cross-checked authoritative ownership domains with runtime writable roots, scopes and selector domains.

The adversarial review identified another independent contract that must participate: the reviewed semantic mutation surface from M2E2.

M2E4 now requires:

```text
ownership domains
== runtime writable roots
== reviewed mutation-surface domains
== selector domains
```

Every authoritative domain must expose at least one reviewed semantic selector and at least one reviewed semantic mutation method.

The second pass also cross-checks the independently reported domain counts and the ownership root/metadata counts against those concrete lists. A scanner can therefore no longer report a coherent-looking list and a contradictory count without the capstone noticing.

## 4. Cumulative CI chain without freezing future milestones

The first closure implementation checked only whether required architecture script names appeared somewhere in `package.json`. That was too weak.

The first hardening response went too far in the other direction and pinned the entire `test:architecture` script to one exact M2-only string. The second adversarial pass found that this would make the permanent M2 gate reject the first legitimate M3 architecture gate added later.

The final rule is monotonic instead:

- every M0-M2 architecture command must appear exactly once;
- those required commands must remain in their reviewed relative order;
- wrapping a required command in a bypass such as `|| true` no longer matches the reviewed command;
- later milestones may add their own commands before, between or after the established M2 commands without reopening M2;
- `inspect:architecture` remains pinned to the integrated report entry point.

The same extension rule applies to report gates. The M2 prerequisite gates are a permanent required floor, not an exclusive list. Future report gates may be added without making M2 fail merely because the architecture has grown.

M2E4 evaluates failures from the required M2 prerequisite gates. Future milestone gates retain responsibility for their own failures while remaining free to coexist in the same cumulative report.

## 5. CI workflow wiring

Checking `package.json` is not enough if GitHub Actions stops invoking those scripts.

The closure gate verifies that `.github/workflows/baseline-build.yml` retains one executable inline invocation of each of these commands in reviewed order:

```text
npm test
npm run test:architecture
npm run build
npm run test:browser
```

Additional CI steps remain allowed. The M2 safety path itself may not silently disappear or reorder.

## 6. Production-source filesystem aliases

The whole-M2 review found a remaining filesystem-enumeration loophole.

Several source scanners recurse normal directory/file entries. A JavaScript source symlink can have different filesystem identity and enumeration behavior from an ordinary source file, while a source-directory symlink can hide an arbitrary module subtree. M2E1 already rejects symlinked declared ownership modules and M2E2 already resolves capability aliases, but the complete read-side/module-enumeration claim needed one final closure rule.

M2E4 therefore rejects:

- a symlinked `src/` root;
- source-directory symlinks anywhere below `src/**`;
- `.js`, `.mjs` or `.cjs` source-module symlinks, including aliases whose target is a source module.

This makes the ordinary recursive source enumeration used by the earlier architecture gates exhaustive instead of allowing an unreviewed filesystem alias to sit outside it.

## 7. M2D3/M2D4 composable scanners

M2D3 and M2D4 originally predated the scanner-return style used by M2E1-M2E3. At initial M2 closure they were mature standalone executable scripts, so M2E4 first integrated them through a narrow subprocess adapter rather than duplicating their rules.

A post-closure tooling polish subsequently modernized both gates without changing their architecture laws:

- M2D3 now exports `scanAchievementAuthority(root)` and `runAchievementAuthorityCheck(root)`;
- M2D4 now exports `scanAchievementReaders(root)` and `runAchievementReaderCheck(root)`;
- their CLI behavior remains available behind `require.main === module`;
- the M2 migration-gate aggregator now calls those scanners directly instead of launching child Node processes;
- the architecture report therefore consumes the exact same rule implementations as the standalone CLI gates with no subprocess indirection.

This removes an older tooling asymmetry while preserving one implementation of each migration rule.

## 8. Adversarial closure checks

M2E4 negative controls prove closure fails when:

- a required M2 report gate disappears;
- writable domains drift from ownership;
- reviewed mutation surfaces drift from ownership;
- selector domains drift from ownership;
- independently reported domain/root counts contradict those lists;
- reviewed read or mutation surfaces become empty;
- mutation-scope ownership changes;
- GameState metadata becomes writable;
- the M2D authority/reader migration gates stop passing;
- the legacy mapping inspector shape becomes opaque/incomplete;
- a required architecture command disappears, is duplicated, reordered or wrapped in a bypass;
- the inspector command stops pointing at the integrated report;
- the GitHub Actions safety path loses or reorders a required command;
- report data contains values that JSON would silently discard, normalize or duplicate;
- a production source module is introduced through a filesystem symlink.

The inverse future-compatibility controls are also explicit: later report gates and later architecture commands can be added without reopening the completed M2 contract.

## 9. Test-work reduction

The first adversarial test suite rebuilt the full integrated architecture report separately for every negative-control mutation. During the first M2E4 implementation, report construction also spawned the mature M2D3/M2D4 gates, which made that repetition especially expensive.

The closure test suite was changed to perform one real whole-repository M2E4 scan per test process and deep-clone its returned report for synthetic negative controls. The later M2D scanner modernization further reduces report overhead by composing those gates in-process.

This reduces repeated work without weakening production coverage.

## 10. Design-authority reconciliation

The final M2 audit found stale cross-document state:

- `BACKLOG.md` still said M2D was next;
- `ROADMAP.md` did not mark M2C/M2D/M2E complete;
- `ARCHITECTURE.md` still showed an unrestricted generic `modData` root despite M2A explicitly forbidding such a catch-all.

Those documents are reconciled with the final M2 laws. The target architecture keeps future package-specific persistent state behind explicit reviewed ownership/persistence contracts rather than a generic state bucket.

A later navigation polish adds `CURRENT_ARCHITECTURE.md` as the compact authority index. It points readers to the current closure authority per topic while preserving slice-specific documents as migration history.

## 11. M1 structural visibility

The integrated report originally represented M1 mainly through protected-layer counts and architecture gate status.

A post-closure inspector polish adds a concrete M1 kernel summary to the same JSON report. It discovers and reports:

- identity and registry module exports;
- definition families, schema versions, validators and registry factories;
- actual registry family types produced by those factories;
- Clock/RNG/Storage/Logger runtime-port modules and factories;
- runtime-environment composition;
- engine inspection modules and exports.

The report remains fail-closed: malformed or missing M1 structure becomes an `m1Kernel` report violation rather than silently disappearing from inspection.

## Final review result

After the review and follow-up tooling polish, M2E4 provides:

1. a versioned integrated architecture report over the complete M0-M2 safety net;
2. fail-closed, lossless JSON report semantics;
3. concrete M1 kernel structure as well as M2 state structure;
4. cumulative visibility of M2C, M2D and M2E prerequisite gates;
5. cross-contract agreement between ownership, writable roots, mutation surfaces, scopes and selectors;
6. composable M2D3/M2D4 migration scanners with standalone CLI compatibility;
7. monotonic M0-M2 command/report-gate enforcement that can coexist with M3+ extensions;
8. direct CI-workflow safety-path verification;
9. filesystem-alias closure for production source enumeration;
10. adversarial negative controls for whole-M2 closure drift and future extensibility;
11. a compact current-architecture navigation authority;
12. no production `src/**` changes from the closure/tooling work.

`M2_CLOSURE_REVIEW.md` records the final M2 exit architecture. `CURRENT_ARCHITECTURE.md` is the navigation starting point for deciding which current authority to read. M3 can begin only after the complete CI/build/browser safety net is green on the hardened head.
