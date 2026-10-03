# M1B Definition Contracts

## Purpose

M1B creates the first validated content-definition layer on top of the M1A identity and registry kernel.

It deliberately does **not** migrate gameplay behavior. Legacy Evolve remains authoritative at runtime. The new contracts are inert engine primitives that prove static definitions can be represented without carrying mutable save state, DOM behavior, or legacy callbacks into `src/engine/**`.

The initial V1 families are:

- achievements;
- resource metadata;
- basic technology metadata.

## Definition lifecycle

M1A deliberately treated `definition` as opaque. M1B adds an optional `definitionValidator` seam to `Registry`.

A validating registry performs registration in this order:

1. validate canonical content identity and registry type;
2. validate owner, schema version, tags, and aliases;
3. enforce namespace/declared-owner consistency;
4. check alias collisions;
5. validate and canonicalize the family definition;
6. commit the entry and aliases only after all validation succeeds.

Validation therefore remains atomic. A malformed definition cannot leave a partial entry or reserve a legacy alias.

Family validators return fresh frozen records. The registry does not retain the caller-owned input object. Mutating the source object after registration therefore cannot change registered content.

A bare `Registry` without `definitionValidator` remains a generic M1A primitive and continues to treat its definition as opaque. Immutability of family definitions is owned by the M1B contracts rather than by an untyped deep-freeze mechanism in the registry.

## Namespace ownership

M1B closes the temporary ownership deferral from M1A.

For ordinary content registration:

```text
canonical ID namespace == owner.packageId
```

Examples:

```text
evolve:resource/food       owner.packageId = evolve     valid
warcraft:resource/gold     owner.packageId = warcraft   valid
evolve:resource/food       owner.packageId = example    invalid
```

This is a **declared-owner consistency rule**. It prevents one registry record from claiming a canonical namespace while declaring a different owner package.

It does **not** authenticate packages or by itself reserve the `evolve` namespace against an untrusted caller that simply declares `owner.packageId = evolve`. Real package identity, namespace reservation, trust, dependency, extension, and override policy belongs to the later package-loading milestones.

Cross-package extension and override are **not** implemented by bypassing this invariant. A later package/content milestone must provide an explicit extension mechanism with its own ownership and conflict rules.

The structured error for ordinary ownership mismatch is:

```text
CONTENT_NAMESPACE_OWNER_MISMATCH
```

## Closed contract policy

The V1 definitions are closed contracts.

Unknown fields fail instead of being silently ignored. This catches both typos and accidental leakage of future behavior/state into an earlier schema.

For example, these do not belong in the M1B resource definition:

```text
amount
max
diff
delta
display
bar
```

Likewise achievement `unlocked`/rank state and technology `reqs`, `cost`, `condition`, `action`, `effect`, or `post` callbacks are intentionally outside the V1 contracts.

Definitions accept plain data only. Accessor-backed fields, symbol-keyed fields, non-plain objects, malformed primitives, and wrong field types fail with structured `EngineContractError` codes. Validation inspects property descriptors rather than executing getters.

Current M1B definition-related codes are:

- `INVALID_DEFINITION_VALIDATOR`;
- `CONTENT_NAMESPACE_OWNER_MISMATCH`;
- `INVALID_DEFINITION`;
- `UNKNOWN_DEFINITION_FIELD`;
- `INVALID_DEFINITION_FIELD`;
- `UNSUPPORTED_DEFINITION_SCHEMA_VERSION`.

## Achievement V1

Canonical family type:

```text
achievement
```

Schema version:

```text
1
```

Shape:

```js
{
    presentation: {
        nameKey: 'achieve_mass_extinction_name',
        descriptionKey: 'achieve_mass_extinction_desc',
        flairKey: 'achieve_mass_extinction_flair'
    },
    classification: {
        category: 'species'
    }
}
```

The V1 contract stores presentation/localization keys and static classification only.

Mutable achievement state such as unlocked rank, universe-specific rank, mastery contribution, or active perk state belongs to explicit runtime state and later behavior systems.

The real legacy `mass_extinction` achievement is represented in tests as:

```text
evolve:achievement/mass_extinction
legacy alias: mass_extinction
```

## Resource metadata V1

Canonical family type:

```text
resource
```

Schema version:

```text
1
```

Shape:

```js
{
    presentation: {
        nameKey: 'resource_Food_name',
        colorRole: 'info'
    },
    properties: {
        tradable: true,
        stackable: true
    }
}
```

The real legacy `Food` resource is represented in tests as:

```text
evolve:resource/food
legacy alias: Food
```

M1B intentionally does not model amount, capacity, delta, production rate, trade quantity, crates/containers, crafting recipes, atomic mass, production math, or capacity calculation. Some of those may later become definition data, but their semantic home will be decided during the appropriate resource/calculation migration rather than guessed in M1B.

## Basic technology metadata V1

Canonical family type:

```text
technology
```

Schema version:

```text
1
```

Shape:

```js
{
    presentation: {
        nameKey: 'tech_club',
        descriptionKey: 'tech_club_desc'
    },
    classification: {
        category: 'agriculture',
        era: 'primitive'
    }
}
```

The real legacy `club` technology is represented in tests as:

```text
evolve:technology/club
legacy aliases: club, tech-club
```

The shared legacy progression key `primitive` is **not** an alias for the club definition. Multiple technology definitions can grant different levels to the same progression state key, so that relationship is contextual rather than a direct one-to-one legacy identity. M1D represents it as an explicit contextual legacy mapping.

Requirements, grants, costs, conditions, effects, action callbacks, trait gates, and post callbacks remain outside M1B. They need the later condition/effect/cost and technology-migration architecture rather than a premature executable schema.

## Cross-reference validation design

M1B establishes the validation boundary but does not yet create a technology graph or resource-reference system.

Future cross-reference validation must use two phases:

```text
Phase 1: validate + register individual definitions
Phase 2: validate the assembled content set
```

The second phase will check matters such as:

- referenced IDs exist;
- referenced IDs have the expected content type;
- progression graph integrity;
- cycles where forbidden;
- package dependency/extension policy.

References must not be required to resolve during `register()`. Doing so would make package registration order semantically significant and would prevent deterministic package assembly when a valid reference is registered later in the same content set.

## Engine modules

M1B adds:

```text
src/engine/definitions/common.mjs
src/engine/definitions/achievement.mjs
src/engine/definitions/resource.mjs
src/engine/definitions/technology.mjs
```

The dependency direction remains inward:

```text
identity.mjs
    ^
    |
registry.mjs
    ^
    |
definitions/*
```

The definition modules use the registry and identity contracts. They do not import vanilla content or legacy runtime modules.

## Tests

M1B coverage proves:

- real vanilla achievement/resource/technology metadata can be represented;
- runtime/save-state fields are absent from those representations;
- family registries validate schema version 1;
- canonical namespace must match the record's declared owner package;
- namespace/owner equality is not treated as package authentication;
- family definitions are detached immutable copies;
- nested definition records are frozen;
- source mutation after registration cannot alter registry content;
- unknown/runtime/future-behavior fields are rejected;
- required fields and field types are enforced;
- hostile getters are rejected without execution;
- symbol-keyed/non-plain definition shapes are rejected;
- failed definition registration remains atomic;
- contextual technology progression keys are not misused as direct aliases;
- the definition-validator context is frozen and explicit.

The repository test runner discovers the M1B tests automatically, and the M0E5 architecture fitness gate continues to enforce the zero-legacy boundary for every new `src/engine/**` file.

## Explicit non-goals

M1B does not:

- register the vanilla catalog into the running game;
- bulk-convert achievements, resources, or technologies;
- create `GameState`;
- migrate resource amounts/capacities/production;
- migrate achievement unlock behavior;
- model technology requirements/grants/costs/actions;
- introduce conditions, effects, commands, or calculations;
- add runtime environment ports;
- create the legacy bridge;
- load packages/mods;
- define public Mod API stability;
- change save format or vanilla gameplay behavior.

Those responsibilities remain in later milestones.
