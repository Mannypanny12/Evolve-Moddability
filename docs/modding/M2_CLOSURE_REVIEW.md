# M2 Closure Review

## Scope

This review closes M2A through M2E as one state-architecture milestone before M3 commands begin.

M2 established the laws for authoritative engine state, proved them on the first real migrated domain, and converted those laws into cumulative architecture gates. M2E4 does not migrate another gameplay domain. It integrates the already-hardened M2C, M2D and M2E checks, reconciles their contracts, and verifies that the resulting architecture is coherent as one system.

## Final M2 state model

The current authoritative GameState root is schema version 2 and contains exactly:

```text
schemaVersion   metadata, owned by game-state-schema
achievements    authoritative domain, owned by achievement-state
```

`schemaVersion` is metadata rather than a gameplay domain and is never runtime writable.

The achievement domain owns its schema/default construction, invariants, semantic selectors and semantic mutation service. GameState composition is the only place where the generic state store grants a writable achievement scope.

## Final authority direction

After legacy hydration:

```text
GameState.achievements
        |
        +--> semantic selectors --> legacy read facade --> gameplay/wiki reads
        |
        +--> semantic mutation service --> compatibility projection
                                      |
                                      v
                              global.stats.achieve
```

`GameState.achievements` is authoritative. `global.stats.achieve` is a compatibility projection retained for historical pre-hydration migrations and the legacy save surface until persistence v2.

Ordinary gameplay may not use the compatibility mirror as competing authority.

## M2A: GameState laws

M2A established:

- an independent GameState schema version;
- a closed root;
- inert deterministic tree-data validation;
- rejection of accessors, exotic prototypes, symbols, sparse arrays, non-finite values, cycles, shared references and pathological nesting;
- explicit separation between authoritative state, definitions, application settings, transients, runtime services and persistence;
- one explicit owner for every authoritative domain;
- no generic arbitrary-path state setter;
- no unrestricted generic `modData` state bucket.

## M2B: store and capability separation

M2B established:

- deeply frozen committed state;
- deterministic detached snapshots;
- synchronous selectors;
- a read-only store facade separated from retained mutation authority;
- named top-level write scopes rather than arbitrary-path mutation;
- validated atomic transactions with rollback;
- reentrancy and async-mutation rejection;
- scope-escape detection and deterministic change diagnostics.

The architecture therefore distinguishes being able to observe state from being able to mint mutation rights.

## M2C: settings and transient separation

M2C classified mixed legacy settings/runtime data and established permanent target layers.

The important M2 exit law is that application preferences, UI session state, derived caches, working state, runtime/platform services, migration debris and debug state do not become GameState merely because legacy Evolve colocates or persists them.

CI now ratchets legacy settings/runtime debt downward and rejects prohibited catch-all GameState roots.

## M2D: first real authoritative migration

Achievements proved the migration pattern end to end.

The sequence was:

1. characterize the legacy achievement ledger and behavioral quirks;
2. define the GameState achievement schema and semantic selectors;
3. add an achievement-scoped runtime capability;
4. place persistent mutation behind a semantic service;
5. hydrate post-migration legacy state into GameState;
6. cut ordinary writes over to GameState authority;
7. retain a one-way synchronous compatibility projection;
8. cut ordinary readers over to a read-only semantic facade backed by `store.select()`.

Historical `vars.js` achievement migrations intentionally remain pre-hydration legacy writes. The compatibility adapter remains temporary migration/persistence scaffolding rather than public engine API.

## M2E: machine-enforced architecture

M2E converts the M2 design into cumulative CI law.

### M2E1 ownership

Every GameState root is classified as metadata or an authoritative domain. Domain owner, schema, validator, default factory, selector module and mutation-service module are machine reviewed. The ownership contract is strict JSON and resolves declared modules through real filesystem identity.

### M2E2 write boundary

Runtime writable roots must exactly equal authoritative domains. Metadata cannot be writable. Raw mutation authority and scopes remain inside GameState composition, one reviewed scope is minted per domain, and only the declared semantic mutation service receives it.

Capability surfaces are closed against hidden symbols, accessors, prototype-chain data, method-carried raw transactions, dynamic loaders and filesystem aliases.

### M2E3 read and dependency boundary

Each domain has a closed semantic selector surface. Domain selectors may inspect only their own GameState root and may not turn into cross-domain orchestration.

Schema, selector, mutation-service, store, shared-state and GameState-composition modules obey an explicit dependency DAG with exact allowlists. Every production module under `src/engine/state/**` must have a reviewed role.

The achievement compatibility adapter is the sole reviewed raw GameState composition consumer while the legacy bridge remains necessary.

### M2E4 integrated closure

The architecture report is versioned and includes:

- legacy architecture budgets;
- platform and bridge boundaries;
- M2C boundary and syntax hardening;
- M2D3 achievement authority and M2D4 reader migration status;
- M2E1 ownership;
- all M2E2 capability/write hardening;
- both M2E3 selector/dependency gates.

The report is normalized into plain JSON data only after a fail-closed losslessness check. Unsupported JSON values, negative zero, cycles and shared object references cannot silently disappear, normalize or duplicate during report serialization. The existing legacy mapping inspector shape `{ size, mappings, byDomain }` is preserved and explicitly covered by round-trip tests.

The M2E4 closure gate cross-checks ownership domains, writable roots, reviewed mutation surfaces, selector domains, mutation-scope ownership, summary/root counts, metadata non-writability and migration-gate presence rather than merely rerunning each individual scanner.

The M0-M2 architecture commands and report gates form a permanent required floor. They must remain present exactly once and in reviewed relative order, but M3 and later milestones may extend the cumulative architecture chain/report without reopening M2. GitHub Actions is also checked for the reviewed `npm test` -> architecture -> build -> browser-smoke path.

Production JavaScript source aliases are not allowed to hide outside ordinary module enumeration: source-directory symlinks and `.js`/`.mjs`/`.cjs` source-module symlinks below `src/**` are rejected by the closure gate.

## What M2 does not claim

M2 is deliberately not the end of state migration.

It does not mean:

- all legacy Evolve state has moved into GameState;
- commands/effects/costs exist yet;
- resources, technologies, jobs, structures or simulation systems have been migrated;
- the legacy save format has been replaced;
- `global` has been removed;
- the legacy bridge has been deleted;
- third-party mods may use raw internal state capabilities;
- cross-domain query/read-model architecture has been finalized.

Those belong to later milestones.

## Remaining intentional debt

The legacy achievement adapter remains because old save/hydration and compatibility projection still need it. Persistence v2 owns removal of raw-global serialization, and M9 owns final bridge deletion.

The current first migrated domain is achievements. Additional domains must follow the same M2 contracts rather than bypassing them.

## M2 closure gate

M2 is closed only when all of the following pass together:

- complete Node test suite;
- M0E5 engine/legacy architecture gate;
- M1 platform and legacy-bridge gates;
- M2C boundary and syntax-hardening gates;
- M2D3 authority and M2D4 reader gates;
- M2E1 ownership gate;
- every M2E2 mutation/capability hardening gate;
- every M2E3 selector/dependency hardening gate;
- M2E4 integrated closure gate;
- production game/wiki build;
- generated-output cleanliness;
- browser startup-failure negative control;
- real-browser game smoke;
- real-browser wiki achievement smoke.

No M2E4 closure change should alter gameplay, persistence semantics or production state code unless the audit discovers a concrete defect that requires it.

## Exit

With this gate green, M2 has accomplished its roadmap exit condition: GameState is authoritative for one real domain, the migration pattern has been exercised end to end, and CI enforces ownership, read and write boundaries strongly enough for M3 to introduce commands, conditions, effects and costs without reopening the foundational state model.
