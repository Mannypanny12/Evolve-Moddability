# M3F4 Cutover proof and closure

M3F4 closes the first live vanilla command vertical without adding another gameplay action. The reviewed vertical remains `evolution.dna`:

```text
legacy DNA UI/action shim
    -> production DNA command runtime
    -> CommandBus
    -> evolve:command/evolution/dna
       -> DNA execution condition
       -> 2 RNA PaymentQuote / PaymentPlan
       -> +1 DNA EffectPlan
    -> M3F1 atomic resource settlement
    -> bounded legacy RNA/DNA compatibility state
```

The legacy callback continues to return its historical `false` value. New callers of the production runtime receive the normalized structured command result instead.

## Closure evidence

M3F4 adds four cumulative proof layers.

### Production-composition result proof

`tests/integration/m3f4-dna-production-runtime.test.cjs` exercises the real application composition root rather than a hand-built command registration. It proves:

- successful dispatch returns the frozen normalized command success result;
- RNA is debited by 2 and DNA is granted by 1 as one committed operation;
- insufficient RNA returns a structured `insufficient_resource` rejection without mutation;
- DNA at capacity returns the condition rejection before settlement;
- arbitrary unreviewed resource accessors still fail closed through the public condition-read diagnostic chain.

### Real built-browser proof

`tests/browser/m3f4-dna-cutover-smoke.cjs` boots the built game in real Chrome from a fresh profile, clicks RNA twice, clicks the migrated DNA action, and verifies the rendered resource counters transition from RNA 2 / DNA 0 to RNA 0 / DNA 1. Severe application/browser errors remain fatal.

The browser proof exposed an integration-only compatibility gap that the plain-object Node fixtures could not reveal: legacy resource records are passed directly into Vue 2 by `loadResource()` / `vBind()`. Vue observes those records in place and replaces resource fields such as `amount`, `max`, and `display` with reactive getter/setter descriptors. The original M3 bridge intentionally admitted only plain data descriptors, so the live DNA command failed closed before settlement even though isolated command tests passed.

M3F4 fixes that at the narrow legacy compatibility boundary. `reviewed-reactive-resource-field.mjs` recognizes only the reviewed Vue-observed resource-record shape and only the resource adapters use that exception. Generic legacy path traversal, structure/trait reads, and unrelated bridge state remain data-descriptor-only. Unmarked accessors remain rejected. Resource writes continue through the reactive setter, preserving the live UI update path.

This compatibility is temporary legacy-bridge behavior, not a new engine state contract. RNA/DNA mappings retain `removeBy: M6B`, where authoritative resource state is scheduled to migrate.

### Cumulative M3F architecture closure

`tests/architecture/m3f4-cutover-closure.cjs` reconciles the whole vertical rather than treating M3F1-M3F3 as unrelated local proofs. It requires:

- M3E4 queue closure remains green and the nonqueueable DNA action does not acquire queue authority;
- M3F1 atomic resource settlement remains the only reviewed write boundary;
- M3F2 DNA command boundaries remain intact;
- M3F3 live-cutover boundaries remain intact;
- the legacy `actions.js` direct-global ratchet remains reduced from the pre-cutover 2667 budget to 2664 or lower;
- the RNA/DNA mappings remain one-to-one and retain their M6B removal milestone;
- the cumulative architecture and browser commands remain present exactly once and in reviewed order.

The existing M3B3 and M3F1 fitness allowlists were tightened to admit only the new bridge-local reviewed reactive-resource helper required by the real live state shape. No general accessor or dependency exception was introduced.

### CI diagnostics

The baseline workflow now preserves full test, architecture, and browser command output as always-uploaded artifacts while retaining the exact guarded `npm test`, `npm run test:architecture`, and `npm run test:browser` execution contracts. This was used to diagnose the live browser failure without weakening assertions or guessing from abbreviated annotations.

## Post-closure review hardening

A second deep review after the initial M3F4 closure found no new gameplay-semantics defect, but it did find three justified closure/process hardening items and fixed all three:

1. **The Vue compatibility exception was broader than necessary.** The reviewed helper now accepts only the exact resource fields used by this boundary (`amount`, `max`, and `display`) and additionally pins the expected writable/configurable Vue observer data-descriptor shape. Dedicated negative controls reject unrelated accessors and weakened/forged observer descriptors. The real-browser DNA proof remains green with the narrower rule.
2. **Repository status authority had drifted behind the implementation.** `ROADMAP.md` and `BACKLOG.md` still described M3F4 as next even after M3F4 had closed, and the backlog had also lost the later-added `CommandBus.prepare()` surface from its M3A1 summary. The status documents are corrected and `m3f4-status-doc-fitness.cjs` now machine-checks M3F closed / M3G next markers plus the `prepare()` contract so this class of closure drift cannot silently recur.
3. **The repeated late-M3 stalls had a workflow pattern.** `EXECUTION_PROTOCOL.md` now requires a fixed starting SHA and dedicated slice branch, review-before-edit, targeted proof before full CI, explicit cumulative-architecture impact checks, early real-runtime/browser proof for legacy/Vue/platform boundaries, final documentation closure, and one final exact-head CI run before starting the next slice.

The review also rechecked two suspicious-looking semantics and confirmed they are intentional legacy parity rather than bugs: M3F1 capacity clamping for a debit matches legacy `modRes(..., true)`, and DNA correctly does not use M3D's broader current-affordability assessment as execution authorization because the legacy direct action only gates on current RNA holdings plus DNA capacity.

This review does not begin M3G and adds no second gameplay migration, new queue authority, new engine state domain, or broader executor.

## What M3F4 deliberately does not do

M3F4 does not:

- migrate a second vanilla action;
- make DNA queueable or consume WorkItems/WorkQueue in production;
- introduce scheduling/offline execution;
- migrate resources into GameState;
- add persistence changes;
- execute prestige or special payment families;
- expose a public mod command API;
- expand the integrated architecture report into a whole-M3 report.

Those remain owned by later milestones. In particular, M3G owns the complete M3 command/condition/effect/payment/queue/cutover audit and architecture-report closure.

## M3F closure

M3F is closed when the final branch head passes the complete ordinary test suite, cumulative architecture fitness, game/wiki build, generated-output cleanliness, injected browser-startup failure negative control, and real-browser smoke chain.

At M3F closure the first vanilla action is demonstrably no longer its own gameplay authority: the live DNA action delegates validation/planning/atomic mutation to the reviewed command architecture, while legacy presentation and callback protocol remain compatible at the edge.
