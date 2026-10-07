# M3B Deep Review and Hardening

## Purpose

This pass reviews M3B1, M3B2, and M3B3 as one condition-engine milestone before M3C begins.

The review deliberately re-opened assumptions rather than only checking whether the latest tests were green. It examined:

- inert condition-data validation;
- primitive registration and evaluation;
- compound `all` / `any` / `not` semantics;
- condition result and diagnostic contracts;
- semantic read capabilities;
- technology/resource/structure/trait predicates;
- the temporary Evolve legacy condition-read adapter;
- the M1D mapping relationship;
- representative differential evidence against real legacy behavior;
- cumulative architecture enforcement;
- milestone ownership and deferrals.

No M3B redesign was required. The core engine contracts remain intact. The hardening changes are confined to compatibility boundaries and additional regression evidence.

## Review conclusion

The M3B architecture remains sound:

```text
inert condition description
        |
        v
M3B1 condition evaluator
        |
        v
M3B2 fixed semantic predicates
        |
        v
narrow semantic read capabilities
```

During migration only, a first-party bridge may implement those read capabilities from legacy state:

```text
legacy state edge
        |
        v
src/legacy/bridge/evolve-condition-read-adapter.mjs
        |
        v
M3B2 read-capability contract
```

The dependency never points back from `src/engine/conditions/**` into legacy code.

## Confirmed M3B1 invariants

The review confirmed that condition definitions remain closed inert data and are detached/frozen before primitive validation. Validator output is canonicalized again before evaluation.

The kernel continues to reject:

- executable values inside condition data;
- accessors and hidden/symbol-keyed data;
- exotic prototypes;
- sparse or extended arrays;
- cycles and shared object identity;
- non-finite numbers;
- excessive width/depth;
- declared async/generator/class registrations;
- runtime Promise/thenable leakage.

Compound semantics remain intentional:

- `all` evaluates all children and aggregates failures in declaration order;
- `any` short-circuits on success and preserves failed branches under `condition.any.failed`;
- `not` does not leak a child's failure reasons when the negation succeeds.

The module-wide evaluation lock is intentional. The hardening pass adds explicit regression evidence that nested evaluation is rejected even when the nested call uses a different evaluator instance, and that the shared lock is released after failure.

## Confirmed M3B2 invariants

The read surface remains deliberately narrow and receiver-independent:

```text
technology.has
resource.amount
resource.available
resource.capacity
structure.count
structure.activeCount
trait.has
```

Reader functions are snapshotted at composition time, outputs are validated, and provider failures are normalized without leaking arbitrary provider details.

The core requirement vocabulary remains unchanged:

- `technology.acquired`;
- `technology.not_acquired`;
- `resource.available`;
- `resource.amount.at_least`;
- `resource.below_capacity`;
- `structure.count.at_least`;
- `structure.active_count.at_least`;
- `trait.present`;
- `trait.absent`.

The review found no reason to add generic state-path predicates, affordability, queue prediction, Registry lookups, or mutation capability.

## Hardening finding 1: mapping-catalog growth must not widen compatibility automatically

Before this pass the M3B3 adapter constructed its subject index from every entry in the Evolve legacy mapping catalog.

That meant the compatibility surface could grow merely because an unrelated later milestone added a new M1D mapping. The behavior contradicted M3B3's intended bounded first-party bridge even though unsupported unmapped IDs still failed closed.

The adapter now has an explicit reviewed mapping allowlist containing only:

- `evolve.resource.dna_state`;
- `evolve.resource.rna_state`;
- `evolve.technology.primitive_progression`;
- `evolve.trait.gravity_well_state`;
- `evolve.trait.flier_state`;
- `evolve.trait.warlord_state`;
- `evolve.structure.city_compost_state`.

The older M1D Food mapping is intentionally not part of M3B compatibility support. A regression test proves that its presence in the mapping catalog does not make `evolve:resource/food` readable through this adapter.

Future mapping-catalog growth therefore requires an explicit reviewed adapter decision rather than silently widening M3B's migration surface.

## Hardening finding 2: malformed truthy legacy markers were too permissive

Legacy traits commonly use numeric ranks while display/presence flags may be booleans. The original adapter used JavaScript truthiness for these values.

That accidentally treated malformed present values such as strings, arrays, objects, `NaN`, negative numbers, or an own property containing `undefined` as semantic state rather than corruption.

The bridge now accepts presence markers only as:

- boolean values; or
- finite non-negative numeric values, where zero is absent and non-zero is present.

A missing field still means absent. Present values outside that legacy-compatible representation fail with `INVALID_LEGACY_CONDITION_STATE`.

The same rule now applies consistently to:

- mapped trait presence;
- mapped resource `display` state;
- `soul_eater` and `evil` context used to interpret primitive rank 2.

This aligns the implementation with M3B3's existing rule that missing state is ordinary absence while malformed present state is a contract failure.

## Hardening finding 3: read-only behavior is now explicit regression evidence

The bridge had no mutation APIs and its implementation was read-oriented, but M3B did not previously pin the stronger property that representative reads leave the supplied legacy object unchanged.

The hardening suite now snapshots representative legacy state, exercises every supported reader family, and verifies the state is byte-for-byte unchanged afterward.

This protects the rule that a condition check cannot become a hidden gameplay mutation path.

## Hardening finding 4: contextual primitive progression needed one more branch

Legacy primitive rank 2 represents different canonical technologies depending on race context:

```text
soul_eater && !evil -> wooden_tools
otherwise           -> bone_tools
```

The original M3B3 differential matrix covered ordinary progression and the Soul Eater branch, but did not separately pin `soul_eater && evil`.

The hardening differential now proves that this combination resolves back to Bone Tools, not Wooden Tools, and that the representative Wheel requirement still matches legacy behavior.

This remains an acquired-state interpretation only. It does not promote `global.tech.primitive` to a canonical technology and does not rerun current presentation qualification callbacks.

## Hardening finding 5: DNA edge evidence is broader

The existing differential covered:

- available DNA below capacity;
- hidden DNA;
- exactly-at-capacity DNA;
- final-menu divergence.

The hardening matrix additionally pins:

- completely missing DNA state;
- DNA already above its recorded capacity.

Both remain rejected by the reusable resource-condition composition in agreement with the corresponding legacy resource gate.

## Deliberate non-changes

The review intentionally did not add:

- a generic legacy `reqs` translator;
- executable/custom condition callbacks;
- direct GameState access;
- Registry lookup from condition evaluation;
- cost quoting or payment;
- queue or predictive eligibility;
- effects or mutations;
- UI/localization concerns;
- technology path/era presentation logic;
- generic structure power/support reconciliation;
- a public third-party condition API;
- a vanilla action cutover.

Those remain owned by later milestones exactly as before.

## Architecture assessment

The existing cumulative fitness gates remain the correct enforcement model:

- M3B1 recursively protects `src/engine/conditions/**` from legacy, state-infrastructure, Registry, command, UI/platform, mutation, dynamic-import, and external-package dependencies;
- M3B3 additionally quarantines the Evolve compatibility adapter under `src/legacy/bridge` and restricts its imports and legacy authority;
- the hardening changes do not add a new engine dependency edge.

No production file under `src/engine/conditions/**` needed modification during this review.

## Final M3B closure criteria after hardening

M3B may remain closed when the cumulative safety net proves that:

1. condition descriptions and results remain inert and deterministic;
2. primitive registrations/read capabilities remain fixed and synchronous;
3. compound reason semantics remain stable;
4. semantic subjects use canonical typed IDs;
5. condition reads cannot mutate authoritative or legacy state;
6. the temporary legacy reader supports only explicitly reviewed subjects;
7. malformed present legacy state fails closed;
8. representative contextual technology, trait, resource and structure behavior remains differentially characterized;
9. affordability, queueing, effects, mutation, UI and vanilla cutover remain outside M3B;
10. unit, characterization, architecture, build and browser gates remain green.

With those conditions satisfied, M3B is complete and the next implementation milestone is M3C Effect/operation planning.
