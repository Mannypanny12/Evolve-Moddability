# M1B Post-Merge Review Hardening

This note records the focused hardening pass performed after the post-merge M1B audit. It clarifies a few boundaries in the original M1B document and strengthens them in code without expanding M1B into gameplay migration, package loading, state architecture, or executable content rules.

## Namespace consistency versus package authorization

M1B enforces this invariant for ordinary registration:

```text
canonical ID namespace == declared owner.packageId
```

This is a **namespace/declared-owner consistency rule**. It prevents an ordinary record owned as `example` from registering an `evolve:*` ID.

It is not yet package authentication. Before the package loader exists, a caller can self-declare `owner.packageId = 'evolve'`; the registry has no trusted package-loading context with which to prove that declaration came from first-party Evolve. Therefore the original shorthand that this rule by itself "reserves" `evolve` should be read narrowly: M1B establishes the ownership invariant required for reservation, while actual reserved-namespace authorization belongs to the later package boundary.

Cross-package extension/override still requires an explicit mechanism rather than pretending to own another namespace.

## Canonical validated-definition output

A validating registry now owns the final canonicalization boundary after a family validator returns.

Validated output must be synchronous, JSON-like static data:

- `null`, strings, booleans, and finite numbers;
- plain objects with enumerable data properties;
- dense arrays containing canonical static data.

Functions, `undefined`, BigInt, symbols, non-finite numbers, class instances, promises, sparse arrays, accessor-backed fields, symbol-keyed fields, cycles, and uninspectable proxies are rejected with `INVALID_CANONICAL_DEFINITION`.

The registry creates a detached deep immutable copy of validated output. This makes deep immutability an invariant of the validating-registry seam rather than a convention every future family validator must remember to implement perfectly.

Unexpected exceptions thrown by a family validator are converted to `DEFINITION_VALIDATOR_FAILURE`; structured `EngineContractError` failures keep their original code and gain definition identity context.

Definition errors now include diagnostic context such as:

```text
definitionId
definitionOwnerPackageId
definitionSchemaVersion
```

## Hostile-object hardening

The M1B object inspector now protects `Array.isArray`, prototype inspection, own-key inspection, and property-descriptor inspection. Revoked proxies at both root and nested definition paths therefore fail as structured contract errors rather than leaking native `TypeError` exceptions.

The registry canonicalizer independently applies the same fail-closed principle to validator output.

## Localization references

M1B presentation fields now use a localization-key validator rather than accepting any non-empty string.

The validator intentionally accepts both current legacy logical keys such as:

```text
resource_Food_name
tech_club
```

and future package-style namespaced keys such as:

```text
example:resource_rations_name
```

It rejects whitespace/control-character forms. This does not stabilize the final public localization API; package-level localization identity remains a later package/content responsibility.

## Source-backed vanilla characterization

The original M1B unit examples used literals copied from vanilla. The hardening pass adds characterization coverage tied to the current legacy source:

- `mass_extinction` is verified against the current legacy achievement grouping and localization-key convention;
- `Food` metadata is derived from its current `loadResource(...)` call plus the ordinary resource localization/default-color rules;
- `club` metadata is derived from its current legacy technology block and cross-checked against the legacy test API's live technology definition.

If those legacy shapes drift, the characterization test now fails and forces an explicit M1B contract review rather than allowing copied test literals to remain silently stale.

## V1 compatibility envelope

M1B V1 deliberately proves a constrained static subset, not universal vanilla representability.

### Representable directly in V1

- ordinary achievements such as `mass_extinction` whose presentation uses the standard static localization-key convention;
- ordinary resources such as `Food` with a static ordinary localization key, color role, tradable flag, and stackable flag;
- simple technologies such as `club` with static title/description keys, category, and era.

### Known legacy shapes intentionally deferred

- parameterized achievement presentation such as `trade` description arguments;
- runtime-derived achievement presentation such as `colonist` flair data;
- special/dynamic resource names such as Money, the current species resource, `Useless`, and event-driven resource renaming;
- runtime-derived technology presentation such as `wooden_tools` and `sundial`;
- technology requirements, grants, costs, conditions, effects, actions, trait gates, and post callbacks;
- resource amounts, capacities, production, trade quantities, crafting behavior, and other runtime/calculation state.

These are not omissions to fill by adding callbacks to M1B definitions. They require later localization/view-model, state, condition/effect/cost, calculation, bridge, or migration architecture.

## Added error codes

The hardening pass adds:

- `INVALID_CANONICAL_DEFINITION`;
- `DEFINITION_VALIDATOR_FAILURE`.

Existing family validation codes remain unchanged.

## Scope remains unchanged

M1B remains inert at runtime. Legacy Evolve is still authoritative. No vanilla content catalog is registered into the running game, no save format changes, no gameplay callbacks are migrated, and no package or public Mod API promise is introduced by this hardening pass.
