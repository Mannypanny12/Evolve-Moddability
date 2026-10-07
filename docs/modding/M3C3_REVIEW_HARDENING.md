# M3C3 Review and Hardening

## Purpose

This pass reviews the implemented M3C3 DNA closure evidence for false-confidence risks before M3D begins. The goal is not to add new effect semantics, but to make the M3C closure proof strong enough that later work can rely on it.

The review keeps the original M3C3 boundary intact:

- no production change under `src/engine/effects/**`;
- no vanilla cutover;
- no payment implementation;
- no legacy effect adapter;
- no EffectExecutor;
- no GameState or legacy-state read/write authority in M3C.

## Findings and hardening

### 1. The DNA differential checked only two selected amounts

The original M3C3 test recorded RNA and DNA amounts before legacy execution and asserted the observed deltas were `RNA -2` and `DNA +1`.

That was necessary but not sufficient for a closure proof. If the legacy DNA callback later gained an additional synchronous side effect elsewhere in state, those two assertions could still pass while M3C3 continued claiming that `+1 DNA` was the complete effect-side decomposition.

Hardening:

- successful DNA execution now snapshots the complete installed legacy state;
- the expected post-state is derived from that snapshot with exactly two changes: `RNA.amount -2` and `DNA.amount +1`;
- the complete actual state must deep-equal that expected state;
- failed direct execution cases must deep-equal the complete pre-state.

This turns the test from a selected-field check into a bounded complete synchronous mutation-footprint proof for this action.

### 2. Presentation qualification separation was documented more strongly than M3C3 itself proved

M3A0 had already characterized that hidden DNA presentation or an active final-evolution menu can make `condition()` false while direct execution still mutates RNA/DNA.

The initial M3C3 closure reused that design conclusion but only tested insufficient RNA and full DNA as non-executable states.

Hardening:

- M3C3 now directly covers hidden DNA presentation;
- it also covers active `evoFinalMenu`;
- in both cases legacy presentation qualification is false;
- direct execution still changes exactly RNA and DNA as expected;
- the M3C EffectPlan remains exactly `resource.grant(evolve:resource/dna, 1)`.

This makes the presentation/effect separation part of M3C3's own executable closure evidence.

### 3. First-party content leakage guard was too literal

The initial M3C3 architecture rule rejected assembled content IDs such as:

```text
evolve:resource/dna
```

but could miss ordinary split construction such as storing `evolve` separately and appending the remainder later.

Hardening:

- generic effect source now rejects any `evolve` namespace token, case-insensitively;
- this applies to code, strings, and comments;
- adversarial coverage includes direct IDs, comments, split namespace construction, and differently cased namespace tokens.

The purpose is architectural cleanliness rather than malicious-code detection. Deliberately obfuscated token construction remains a review concern, while M3C1's dependency/runtime/authority gate remains the real capability boundary.

### 4. Payment and condition vocabulary guard covered only a narrow naming set

The initial closure gate caught obvious names such as `cost`, `paymentPlan`, `quote`, `condition`, and `conditionEvaluator`, but ordinary renamings could evade the intent without being obfuscated.

Hardening expands the reviewed vocabulary to cover common forms including:

```text
costPlan / costPlans
prices / pricing
payments / paymentPlans
quotes / quotePlan / quotePlans
affordable
requirements
predicate / predicates
eligibility
canExecute
```

Strings/comments remain masked for payment/condition terms so explanatory diagnostics do not fail the gate. First-party Evolve namespace knowledge remains forbidden even in comments.

## Deliberate non-changes

### No production DNA planner

M3C3 still does not add `createDnaEffectPlan()` under the generic engine. DNA-specific composition remains test evidence until later first-party command/content composition is introduced.

### No payment model

The review does not define a PaymentPlan or affordability contract. RNA consumption remains evidence reserved for M3D.

### No generic full-state differential utility

The complete-state comparison is intentionally local to this characterization test. M3C3 does not add a production or shared engine simulator/diff utility merely to support one closure proof.

### No semantic source scanner claim

Architecture vocabulary scanning is a regression ratchet, not a proof against intentionally disguised code. The stronger no-state/no-runtime/no-mutation/no-external-dependency gates remain cumulative and authoritative.

## Exit assessment

After hardening, M3C3 proves all of the following together:

1. the real legacy DNA callback's complete synchronous state mutation is exactly RNA `-2` plus DNA `+1` for the successful representative case;
2. failed direct execution leaves complete state unchanged;
3. presentation qualification can be false without changing the semantic effect definition;
4. the M3C representation remains exactly one DNA grant and contains no RNA payment;
5. generic effect source contains no first-party Evolve namespace knowledge;
6. common payment/quote/affordability and condition/requirement/predicate ownership cannot quietly drift into M3C under ordinary names;
7. no production M3C capability was widened.

With the full unit, architecture, build, generated-output, and browser safety net green on the final head, M3C can be treated as closed and M3D can begin from a stronger boundary.
