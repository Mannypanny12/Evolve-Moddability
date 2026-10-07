# M2D2b2 Review and Hardening

## Purpose

This pass reviews the implemented M2D2b2 achievement mutation service before M2D3 begins the legacy authority cutover.

The review remains inside the pure-engine boundary:

- no `unlockAchieve()` cutover;
- no legacy hydration or projection;
- no save/import/export/reset changes;
- no UI/message/mastery side effects;
- no ordinary achievement reader migration;
- no generic GameState mutation API expansion.

The goal is to verify that the two domain operations are strong enough for D3 and that their validation/result semantics do not hide compatibility traps.

## Review result

The two-operation design remains sound:

```text
advance
removeUniverseRank
```

No third mutation primitive is required by the characterized legacy write surface.

One production hardening gap was found and fixed. Several D3 compatibility seams were also made explicit and locked with focused tests/documentation.

## Hardening 1: nested mutation field values are now primitive-gated

The initial D2b2 implementation made the command object itself closed, plain and accessor-safe. However, after descriptor-safe field extraction, values such as `achievementId`, `rank`, or `universe` were passed directly into the shared identity/rank validators.

That was safe for ordinary primitive input, but malformed object/proxy values could reach diagnostic formatting in the shared validators. Diagnostic formatting is fail-safe against thrown traps, but inspecting an object can still invoke proxy behavior while trying to reject it.

The mutation boundary now rejects non-primitive field types locally before calling the shared validators:

```text
achievementId -> string required
rank          -> number required
universe      -> string required
advanceBase   -> boolean required
```

The existing domain-specific error codes are preserved:

```text
INVALID_ACHIEVEMENT_STATE_ID
INVALID_ACHIEVEMENT_STATE_RANK
INVALID_ACHIEVEMENT_UNIVERSE
INVALID_ACHIEVEMENT_STATE_MUTATION
```

Adversarial tests now supply hostile proxy objects as nested field values and prove that none of their `get`, `getPrototypeOf`, or `ownKeys` traps execute.

This closes the difference between a safe outer command container and safe field-value rejection.

## Hardening 2: transaction rollback is explicit at the service boundary

M2B already guarantees detached transaction candidates and rollback on validation failure. D2b2 now has direct domain tests proving the achievement service preserves those guarantees.

A custom GameState validator rejects an otherwise valid achievement advancement after the service mutator has modified the transaction draft. The failed operation is proven to leave:

```text
committed state unchanged
revision unchanged
lastChange unchanged
```

A subsequent valid achievement mutation succeeds through the same service capability, proving that a failed transaction does not poison the service or leave transaction reentrancy state stuck.

A second rollback test establishes a real prior committed `lastChange`, then rejects `removeUniverseRank()`. The failed removal preserves both revision and the exact prior diagnostic object.

The service therefore does not need its own rollback mechanism. It correctly inherits M2B transaction atomicity without masking transaction errors.

## Hardening 3: zero-valued no-ops retain D3 compatibility metadata

Legacy `unlockAchieve()` uses a truthiness-based universe-field condition:

```js
if (!global.stats.achieve[achievement][u_affix] || ... )
```

Consequently an already-present rank-zero universe field can still enter the legacy universe-write branch on another rank-zero request even though the stored value remains zero.

The clean engine correctly treats that operation as a state no-op:

```text
changed = false
universeTrackCreated = false
universeRankChanged = false
```

But its rich result retains enough pre-state information for D3:

```text
previousUniverseTrackPresent = true
previousUniverseRank = 0
newUniverseTrackPresent = true
newUniverseRank = 0
```

A dedicated review test freezes this case.

The same principle is locked for an existing base rank of zero: a repeated base-zero engine advancement is a no-op but still reports `previousBaseRank = 0` and `newBaseRank = 0`.

This distinction is important because **engine `changed` means authoritative state changed**, not "legacy code would have taken a UI/message/redraw branch."

## D3 compatibility invariant: legacy side effects must not be derived from `changed`

D3 must reproduce legacy state and observable compatibility behavior without contaminating the engine service with legacy policy.

The original legacy function can perform message/redraw work in cases where the clean GameState transaction is a no-op, particularly around falsy zero-valued universe fields.

Therefore D3 must not use:

```text
result.changed
```

as a general proxy for:

```text
legacy universe write branch ran
legacy message should be queued
legacy achievement UI should redraw
legacy mastery should recalculate
```

`changed` remains strictly a GameState commit fact.

D3 can derive legacy branch behavior from:

- the normalized legacy request rank;
- the original legacy call context;
- `recordCreated`;
- `previousBaseRank` / `newBaseRank`;
- `previousUniverseTrackPresent`;
- `previousUniverseRank` / `newUniverseRank`;
- `baseRankChanged`;
- `universeTrackCreated`;
- `universeRankChanged`.

No additional D2b2 mutation-result field is currently required.

## D3 compatibility invariant: implicit Standard and explicit `l` remain distinct caller intent

Two legacy calls can collapse to the same clean engine state mutation while still having different legacy control flow.

Conceptually:

```text
implicit Standard unlock -> advance(base=true)
explicit legacy `l`      -> advance(base=true)
```

However legacy `unlockAchieve()` checks the **original `universe` argument** before calculating the affix:

```js
if (global.stats.achieve[achievement] && universe !== 'l') {
    let u_affix = universe || universeAffix();
    ...
}
```

Therefore:

- an implicit Standard call may enter the second legacy branch with `u_affix = 'l'`;
- an explicit `universe = 'l'` call suppresses that branch entirely.

This can matter for zero-valued legacy state and side effects even though both requests map to the same authoritative GameState operation.

D3 must therefore retain the original legacy-call context while translating the request. It must not try to reconstruct all legacy control flow from the engine operation/result alone.

This is intentionally a D3 adapter responsibility rather than a reason to add legacy-affix concepts to D2b2.

## Hardening 4: both service methods are closure-bound capabilities

D2b2 already proved `advance()` cannot be redirected to another runtime with `.call()` or another `this` value.

The review adds the equivalent proof for `removeUniverseRank()`.

Borrowing the removal method from runtime A and invoking it with runtime B as `this` still mutates runtime A only. The authority is the private lexical transaction closure, not the method receiver.

## Hardening 5: rich result surface is frozen as an explicit contract

The review now asserts the exact top-level mutation-result surface:

```text
operation
achievementId
universe
changed
recordCreated
baseRankChanged
universeTrackCreated
universeRankChanged
universeRankRemoved
previousBaseRank
newBaseRank
previousUniverseTrackPresent
newUniverseTrackPresent
previousUniverseRank
newUniverseRank
diagnostic
```

The result object remains frozen. The nested M2B diagnostic and its change records are already frozen by the state store.

This protects D3 from accidentally depending on an ad-hoc or expanding result bag during the authority cutover.

## Re-checked decisions retained

The review specifically re-checked and retained these choices:

1. **No rank cap in D2b2.** Structural state accepts non-negative safe integers; vanilla challenge caps remain D3 policy.
2. **No registry-membership requirement.** Canonical unresolved/mod achievement IDs remain valid state identities.
3. **Standard is not a universe track.** Base `rank` represents Standard progress.
4. **Structural zero remains authoritative.** Record and universe-track presence at zero are preserved.
5. **Universe removal means property absence.** GameState never stores legacy `undefined`.
6. **No generic batch/reconcile API is added.** The characterized legacy write surface is still representable using `advance()` plus `removeUniverseRank()`.
7. **No `state-store.mjs` changes are needed.** M2B already provides the required atomicity, rollback, revision and diagnostic semantics.
8. **The legacy return boolean remains `baseRankChanged`.** `changed` is broader and must not replace it.

## Aggregate-achievement handoff

Legacy aggregate calculation is staged:

```text
base aggregate unlock
-> current non-Standard universe rank cleared
-> universe-specific qualification checked
-> universe rank optionally restored
```

D2b2 can represent each state transition with the existing operations.

D3 still needs to decide the adapter orchestration boundary for projection/UI work so that temporary engine transitions are not accidentally exposed through legacy compatibility projection between the clear and optional restore steps.

That is an authority-cutover orchestration question, not evidence for a generic D2b2 batch API.

If D3 proves that aggregate recalculation must be committed as one indivisible GameState transaction, add one narrow aggregate-domain operation backed by that evidence rather than introducing a generic mutation DSL.

## Production footprint after review

The only production file changed by the review is:

```text
src/engine/state/achievement-state-service.mjs
```

The review does not change:

```text
src/engine/state/state-store.mjs
src/engine/state/game-state.mjs
src/engine/state/achievement-state.mjs
src/achieve.js
src/vars.js
src/main.js
src/resets.js
```

All additional work is test/documentation hardening.

## D3 readiness checklist

M2D2b2 is ready for D3 only when all of the following remain true:

1. nested hostile field values are rejected without trap execution;
2. ordinary command accessor/proxy hardening remains green;
3. structural-zero creation and repeated-zero no-op semantics are explicit;
4. result metadata remains sufficient to distinguish numeric change from structural presence;
5. transaction validation failures roll back state/revision/lastChange;
6. both service methods remain closure-bound to their originating runtime;
7. the exact result surface remains frozen;
8. the two operations still represent every characterized legacy state transition;
9. D3 is explicitly warned not to derive legacy redraw/message behavior from `changed`;
10. D3 preserves original legacy request context, including implicit Standard versus explicit `l`;
11. no generic write authority escapes;
12. no legacy production behavior changes;
13. full M0/M1/M2 tests, architecture gates, build and browser smoke remain green.
