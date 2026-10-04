# M2E4 Review Hardening

## Purpose

This note records the adversarial review performed while closing M2 as one integrated state-architecture milestone.

M2E4 did not uncover a production gameplay defect and did not require changes under `src/**`. The findings were in integration/reporting assumptions, closure-gate strength, CI contract enforcement, test efficiency, and stale design authority.

## 1. Legacy mapping report assumption correction

The M2E4 deep dive initially assumed the legacy mapping inspector returned a `Map` that would disappear when the architecture report was serialized.

That assumption was incorrect. `inspectLegacyMappings()` already returns a frozen JSON-shaped object:

```text
{ size, mappings, byDomain }
```

The first M2E4 report test exposed the mistaken assumption. M2E4 was corrected to preserve the established inspector shape rather than inventing a replacement representation.

The integrated report now explicitly normalizes its complete output through the JSON boundary and tests that the mapping count and records survive a full JSON round trip.

## 2. Fail-closed JSON report boundary

A plain `JSON.stringify()` round trip can silently discard `undefined`, functions and symbol-keyed data. That is unacceptable for an architecture inspector because a future scanner could accidentally hide information from the printed report.

M2E4 therefore validates report data before normalization. Report data rejects:

- `undefined`, functions, symbols and bigint values;
- non-finite numbers;
- symbol keys;
- accessors;
- exotic object prototypes such as `Map`;
- sparse or extended arrays;
- cycles.

Only after passing that boundary is the report normalized to plain JSON data.

## 3. Mutation-surface consistency

The first closure gate cross-checked authoritative ownership domains with runtime writable roots, scopes and selector domains.

The adversarial review identified another independent contract that must participate: the reviewed semantic mutation surface from M2E2.

M2E4 now requires:

```text
ownership domains
== runtime writable roots
== reviewed mutation-surface domains
== selector domains
```

Every authoritative domain must also expose at least one reviewed semantic selector and at least one reviewed semantic mutation method.

## 4. Exact cumulative CI chain

The first closure gate checked that required architecture script names appeared somewhere in `package.json`.

Substring presence is too weak for a capstone gate. It could accept:

- duplicate gates;
- reordered or replaced gates whose names still appeared elsewhere;
- unreviewed extra commands;
- a partially altered chain.

M2E4 now pins the complete `test:architecture` command as one exact reviewed chain and pins `inspect:architecture` to the integrated report exactly.

Future architecture-gate changes therefore require an intentional M2E4 contract update rather than silently changing the closure safety net.

## 5. M2D3/M2D4 integration without logic duplication

M2D3 and M2D4 predate the scanner-return style used by M2E1-M2E3. Their mature architecture gates are standalone executable scripts.

Rather than duplicate or substantially refactor their already-reviewed source-analysis logic during the closure milestone, M2E4 adds a narrow subprocess adapter that executes those authoritative gates and converts their real exit status into report data.

This preserves one implementation of each migration rule while making their status composable inside the integrated architecture report.

## 6. Adversarial closure checks

M2E4 negative controls now prove closure fails when:

- a prerequisite report gate disappears;
- writable domains drift from ownership;
- reviewed mutation surfaces drift from ownership;
- selector domains drift from ownership;
- reviewed read or mutation surfaces become empty;
- mutation-scope ownership changes;
- GameState metadata becomes writable;
- the M2D authority/reader migration gates stop passing;
- the legacy mapping inspector shape becomes opaque/incomplete;
- the architecture CI chain gains, loses or substitutes commands;
- the inspector command stops pointing at the integrated report;
- report data contains values that JSON would silently discard or corrupt.

## 7. Test-work reduction

The first adversarial test suite rebuilt the full integrated architecture report separately for every negative-control mutation. Because report construction also executes the mature M2D3/M2D4 migration gates, this was correct but unnecessarily expensive.

The test suite now builds one immutable baseline report per test process and deep-clones it for each synthetic negative control. The real closure test still performs its own complete scan.

This reduces repeated work without weakening production coverage.

## 8. Design-authority reconciliation

The final M2 audit found stale cross-document state:

- `BACKLOG.md` still said M2D was next;
- `ROADMAP.md` did not mark M2C/M2D/M2E complete;
- `ARCHITECTURE.md` still showed an unrestricted generic `modData` root despite M2A explicitly forbidding such a catch-all.

Those documents are now reconciled with the final M2 laws. The target architecture keeps future package-specific persistent state behind explicit reviewed ownership/persistence contracts rather than a generic state bucket.

## Final review result

After the review, M2E4 provides:

1. a versioned integrated architecture report over the complete M2 state safety net;
2. fail-closed JSON report semantics;
3. cumulative visibility of M2C, M2D and M2E prerequisite gates;
4. cross-contract agreement between ownership, writable roots, mutation surfaces, scopes and selectors;
5. exact CI/inspector command-chain enforcement;
6. adversarial negative controls for whole-M2 closure drift;
7. reconciled roadmap/backlog/target-architecture authority;
8. no production `src/**` changes.

`M2_CLOSURE_REVIEW.md` records the final M2 exit architecture. M3 can begin only after the complete CI/build/browser safety net is green on the hardened M2E4 head.
