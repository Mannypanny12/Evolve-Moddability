# M3B3 Condition Legacy Evidence and Closure

## Purpose

M3B3 closes the M3B condition milestone by proving the M3B1/M3B2 condition contracts against representative real Evolve legacy state without teaching engine condition code about legacy implementation details.

The slice adds:

- a bounded first-party compatibility read provider under `src/legacy/bridge`;
- explicit M1D mapping-catalog entries for the representative resources, traits and structure;
- contextual interpretation of the existing primitive technology progression mapping;
- differential evidence for positive/negative traits, contextual technology requirements, resource availability/capacity, and total/active structure requirements;
- explicit characterization of legacy behavior intentionally not reproduced by the core condition engine;
- a cumulative M3B3 architecture closure gate.

M3B3 does not cut over vanilla gameplay.

## Dependency direction

The allowed direction is:

```text
legacy state edge
  -> evolve-condition-read-adapter
  -> M3B2 semantic read shape
  -> M3B2 core predicates
  -> M3B1 evaluator
```

Engine condition modules never import the legacy bridge.

The compatibility adapter does not import `vars.js`, `actions.js`, or any other legacy gameplay module and does not reference the legacy root singleton directly. It receives a synchronous `readLegacyRoot` function at composition time. The returned provider exposes only the four M3B2 reader groups and contains no mutation capability.

Because the root is requested for each semantic read, `setGlobal()`-style root replacement does not leave the adapter pointing at stale state.

## Supported subjects are deliberately bounded

The bridge is not a generic canonical-ID-to-legacy-path resolver. Mapped subjects are explicitly recorded in the M1D mapping catalog. Unsupported canonical subjects throw `UNSUPPORTED_LEGACY_CONDITION_SUBJECT` instead of silently evaluating as absent.

M3B3 adds representative mappings only:

- `evolve:resource/dna` -> remove by M6B;
- `evolve:resource/rna` -> remove by M6B;
- `evolve:trait/gravity_well` -> remove by M6D;
- `evolve:trait/flier` -> remove by M6D;
- `evolve:trait/warlord` -> remove by M6D;
- `evolve:structure/city/compost` -> remove by M6F.

Food and primitive progression mappings already existed from M1D.

## Primitive technology interpretation

The existing contextual mapping for `global.tech.primitive` remains the authority. The bridge does not create a canonical `primitive` technology.

For acquired-state reads:

```text
club         -> primitive >= 1
bone_tools   -> primitive >= 2 and not (soul_eater and not evil)
wooden_tools -> primitive >= 2 and soul_eater and not evil
sundial      -> primitive >= 3
```

This answers whether a canonical technology was acquired. It deliberately does not rerun the technology's current presentation/qualification callback. Availability and acquired state remain different concepts.

## Representative differential evidence

### Wheel

Legacy Wheel requires primitive rank 2 and the `gravity_well` trait. The M3 condition equivalent is:

```text
all
  any
    technology.acquired(bone_tools)
    technology.acquired(wooden_tools)
  trait.present(gravity_well)
```

The differential matrix covers ordinary and Soul Eater level-2 progression.

### Arcology

Legacy `not_trait: ['warlord']` is compared directly with `trait.absent(evolve:trait/warlord)`.

### DNA

The bridge proves the reusable resource portion of legacy DNA qualification:

```text
resource.available(dna)
resource.below_capacity(dna)
```

The final evolution-menu flag is intentionally not represented as a generic state-path condition. A state can therefore satisfy both resource predicates while the legacy action `condition()` is false because the final menu is active. That is expected evidence that action-specific availability and reusable resource semantics remain separate.

### Compost structures

A representative legacy `Structs` pseudo-cost is compared with:

```text
structure.count.at_least(city/compost)
structure.active_count.at_least(city/compost)
```

Compost is deliberately chosen because it is switchable and its active count corresponds directly to its legacy `on` field. M3B3 does not claim that every powered/supported structure can use this simple compatibility rule.

## Flier/cement bypass

Legacy `skipRequirement()` still allows the `flier` trait to bypass the `cement` technology-track requirement. M3B3 characterizes this behavior but does not hide it inside the technology reader.

When the owning technology content migrates in M6E, the target form is declarative composition such as:

```text
any
  technology.acquired(cement-related canonical prerequisite)
  trait.present(flier)
```

The precise canonical technology graph remains an M6E concern.

## State validation

Missing mapped subjects are ordinary state:

- missing trait -> absent;
- missing resource -> amount 0, unavailable, capacity 0;
- missing representative structure -> count 0 / active count 0;
- missing primitive rank -> rank 0.

Malformed present state is a contract failure. Accessor-backed fields, hostile/uninspectable objects, non-finite resource values, negative capacities, and invalid structure/technology counts fail with deterministic bridge contract errors. The M3B2 read boundary then preserves the bridge cause code while M3B1 adds condition kind/path/phase context.

## Explicit non-goals

M3B3 does not migrate or generically translate:

- arbitrary legacy `reqs` objects;
- `condition()` callbacks;
- genes / blood mechanics;
- `not_tech` progression-slot semantics;
- technology path/era presentation rules;
- already-granted action availability behavior;
- queue prerequisite prediction;
- affordability or payment;
- arbitrary legacy state-path predicates;
- general active structure power/support reconciliation;
- bulk technology/resource/trait/structure mappings.

Those remain owned by later reviewed migration slices, especially M3D/M3E/M6B/M6D/M6E/M6F.

## M3B closure

M3B is complete when M3B1, M3B2 and M3B3 collectively prove:

1. conditions are inert, synchronous, deterministic and non-mutating;
2. `all`, `any`, and `not` preserve structured machine-readable failure semantics;
3. technology/resource/structure/trait predicates use canonical IDs and narrow semantic reads;
4. condition engine code has no dependency on legacy state or the definition Registry;
5. the temporary legacy provider is quarantined under `src/legacy/bridge` and has explicit removal milestones;
6. unsupported compatibility subjects fail closed instead of being treated as absent;
7. representative real legacy semantics are differentially proven;
8. intentional semantic differences from legacy monolithic helpers are documented;
9. no affordability, queue, effect, mutation, UI, or vanilla cutover enters M3B;
10. the full unit, architecture, build, and browser safety net remains green.

After this closure the next M3 slice is M3C effect/operation planning.
