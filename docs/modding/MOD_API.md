# Public Mod API Direction

## Important sequencing rule

The public Mod API is intentionally **not** stabilized during the early engine refactor.

M1-M9 build and exercise internal engine contracts. Vanilla Evolve is migrated onto those contracts first.

Public third-party compatibility begins in M10, after the engine has survived real use.

This prevents the project from freezing legacy mistakes behind a supposedly stable facade.

## Internal engine API versus public Mod API

Internal engine code may use richer or less stable interfaces while the architecture evolves.

The public API is a permissioned facade over proven capabilities.

```text
mod
 |
Public Mod API
 |
permissions / ownership / validation
 |
engine commands + queries + registries + events
```

Mods do not receive the state store object or legacy `global`.

## Proposed public areas

Later API surface may include:

```text
api.content
api.query
api.commands
api.conditions
api.effects
api.calculations
api.modifiers
api.events
api.storage
api.ui
api.assets
api.localization
api.debug
```

Specific names remain provisional until M10.

## Content registration

Example direction:

```js
api.content.resources.register({
  id: "example:resource/mana",
  nameKey: "example:mana_name",
  tags: ["magic"]
});
```

Rules:

- IDs are namespaced;
- normal packages own only their namespace;
- silent replacement is forbidden;
- references are validated;
- package ownership is retained;
- definitions are immutable after the appropriate loading phase unless an explicit extension mechanism exists.

## Queries

Mods read state through stable queries/selectors.

Examples:

```js
api.query.resource("evolve:resource/food")
api.query.structureCount("evolve:structure/farm")
api.query.hasTechnology("evolve:technology/agriculture")
```

Returned objects should avoid exposing persistence/internal storage layout.

## Commands

Normal gameplay mutation uses commands.

Examples:

```js
api.commands.execute("example:command/cast_spell", payload)
api.commands.execute("engine:resource/grant", {
  resource: "example:resource/mana",
  amount: 10
})
```

The exact standard command set is defined only after vanilla migration proves what is useful.

Avoid generic arbitrary state setters.

## Conditions and effects

Data mods use declarative conditions/effects for common behavior.

Conditions should support structured diagnostics.

Effects run through engine mutation authority.

Advanced code mods may register custom condition/effect providers through explicit extension points, subject to versioning and permissions.

## Calculations and modifiers

Mods may contribute to named calculation targets.

Example direction:

```js
api.modifiers.register({
  id: "example:modifier/orc_lumber",
  target: "production:example:resource/lumber",
  operation: "multiply",
  value: 1.10,
  when: { trait: "example:trait/orcish" }
});
```

The calculation engine provides source attribution and trace output.

## Events/hooks

Public hooks are projections of stable domain events, not arbitrary internal function interception.

Example:

```js
api.events.on("engine:structure_built", event => {
  // react to a committed domain event
});
```

Each event documents:

- timing;
- payload;
- mutability;
- ordering guarantees;
- cancellation semantics if any;
- failure isolation.

Prefer follow-up commands/effects over mutating event payloads.

## Storage

Each package receives isolated storage:

```js
api.storage.get("settings")
api.storage.set("settings", value)
```

A package cannot write another package's namespace or raw engine save state.

## UI

UI extensions consume selectors/view models and issue commands.

Potential surfaces:

- top-level navigation;
- tabs;
- panels;
- settings;
- details/popovers;
- wiki/knowledge sections;
- custom views within controlled mounting points.

Mods should not rely on legacy DOM IDs.

## Diagnostics

Developer APIs should expose:

- registry/content ownership;
- definition validation;
- dependency graph;
- command trace;
- state diff;
- calculation/modifier trace;
- unlock/condition explanation;
- domain-event trace;
- package load diagnostics.

## Code-mod trust

Data-only packages execute no arbitrary JavaScript.

Executable packages are trusted code unless/until a real sandbox is designed.

The API boundary still matters for compatibility and architecture even when code is trusted.

## Stability policy

Before M10:

- internal names and shapes are not public contracts;
- sample migration adapters are not public APIs.

From M10 onward:

- API version is independent of game content version;
- compatibility ranges are declared by packages;
- breaking changes require API-version handling;
- vanilla first-party content and sample external mods form the contract test suite.
