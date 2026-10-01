# Mod API Direction

This is a design contract, not yet an implemented API.

## Versioning

The public API has an explicit version independent from the game content version.

Mods declare compatible API/engine ranges in their manifest.

## Core surface

Proposed high-level namespaces:

```js
api.registry
api.state
api.resources
api.actions
api.technologies
api.structures
api.jobs
api.races
api.traits
api.achievements
api.events
api.modifiers
api.effects
api.storage
api.ui
api.debug
```

Not every namespace is part of the first implementation milestone.

## Registries

Example:

```js
api.registry.resources.register({
  id: "example:mana",
  tags: ["energy", "magic"]
});
```

Registration rules:
- IDs are namespaced.
- A mod normally registers only within its own namespace.
- Overrides require an explicit override mechanism.
- Silent replacement is forbidden.
- Ownership metadata is retained.

## Resource API

Proposed read surface:

```js
api.resources.get("evolve:food")
api.resources.amount("evolve:food")
api.resources.capacity("evolve:food")
api.resources.isVisible("evolve:food")
api.resources.byTag("food")
```

Controlled mutation surface:

```js
api.resources.add(id, amount, context)
api.resources.spend(id, amount, context)
api.resources.setCapacity(id, amount, context)
```

Direct access to `global.resource` is not part of the API.

## Modifiers

Example:

```js
api.modifiers.register({
  id: "example:orc_lumber",
  target: "production.resource.example:lumber",
  operation: "multiply",
  value: 1.10,
  when: ctx => ctx.race === "example:orc"
});
```

Required properties:
- stable ID;
- source ownership;
- deterministic ordering;
- inspectable contribution.

## Hooks

Example:

```js
api.events.on("technology:researched", event => {
  // react without patching engine functions
});
```

Hooks must document:
- timing;
- payload;
- whether payload is mutable;
- cancellation semantics if any;
- error behavior.

## Effects and conditions

Common conditions/effects should be reusable definitions rather than custom scripts.

Example condition concepts:
- technology level;
- building count;
- race/faction/tag;
- challenge active;
- resource threshold.

Example effect concepts:
- unlock;
- grant resource;
- change capacity;
- apply modifier;
- grant achievement;
- reveal content.

## Storage

```js
const value = api.storage.get("key");
api.storage.set("key", value);
```

The runtime automatically scopes this to the calling mod.

Mods may not use this API to write another mod's namespace.

## UI

Later API examples:

```js
api.ui.registerTab(...)
api.ui.registerPanel(...)
api.ui.registerSettings(...)
api.ui.registerWikiSection(...)
```

UI extension APIs should pass structured state/commands rather than expose arbitrary vanilla DOM internals where practical.

## Debug

Developer builds should expose:
- registry inspector;
- modifier explanation;
- dependency graph;
- unlock-reason explanation;
- hook/event tracing;
- package/load diagnostics.
