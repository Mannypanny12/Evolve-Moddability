# Modding Architecture

## Architectural principles

1. **Wrap first, migrate later.** Existing Evolve logic is adapted behind stable interfaces before it is rewritten.
2. **Vanilla is the compatibility oracle.** Refactors must preserve observable behavior.
3. **No public dependency on `global`.** Mods use stable services and registries.
4. **Namespaced IDs from the beginning.** Public IDs use forms such as `evolve:food` and `example:mana`.
5. **Declarative where practical, code where necessary.** Avoid inventing a pseudo-language capable of expressing every mechanic.
6. **Mod-owned state is isolated.** A mod writes only to its own save namespace through the storage API.
7. **Debuggability is a feature.** Registries, modifiers, dependencies, and unlocks should be inspectable.
8. **Upstream mergeability matters.** Avoid unnecessary edits to unrelated vanilla code.

## Current architecture observations

Evolve already contains several useful registry-like structures:
- races and genus definitions;
- traits;
- events;
- achievements;
- resource metadata tables;
- technology and action definitions.

However, those definitions often contain executable functions which directly read and mutate `global.*`, and production/jobs/UI frequently reference specific vanilla IDs directly.

The main extraction problem is therefore not identifying content. It is replacing cross-system assumptions with stable services.

## Target layers

```text
+------------------------------------------------------+
| Authoring / tooling                                  |
| validator | package builder | graphical editor       |
+--------------------------+---------------------------+
                           |
                           v
+------------------------------------------------------+
| Mod package / loader                                 |
| manifest | dependencies | load order | profiles      |
+--------------------------+---------------------------+
                           |
                           v
+------------------------------------------------------+
| Public Mod API                                       |
| registries | hooks | modifiers | effects | UI | save |
+--------------------------+---------------------------+
                           |
                           v
+------------------------------------------------------+
| Engine services                                      |
| state | resources | actions | tick | RNG | saves     |
| production | combat | prestige | statistics          |
+--------------------------+---------------------------+
                           |
             +-------------+-------------+
             |                           |
             v                           v
       Vanilla content                Mod content
```

## Registry layer

The first stable abstraction is a registry service. It owns public content identities and maps them to current vanilla implementations.

Initial registry families:
- resources;
- achievements;
- races;
- traits;
- events;
- actions;
- technologies;
- buildings/structures;
- jobs.

A registry entry must have a stable namespaced ID. During migration, a registry may contain a legacy ID mapping.

Example:

```js
registry.resources.register({
  id: "evolve:food",
  legacyId: "Food",
  source: "evolve"
});
```

## State/service boundary

The public API must not expose the shape of `global`.

Early service implementations may proxy directly to it:

```js
game.resources.get("evolve:food")
```

may initially resolve to:

```js
global.resource.Food
```

The indirection is the important part. It allows the internal save/state shape to evolve without breaking mods.

## Modifier engine

The modifier engine is the central mechanism for composable gameplay changes.

Example target families:
- `production.*`
- `storage.*`
- `cost.*`
- `capacity.*`
- `population.*`
- `combat.*`
- `research.*`
- `crafting.*`
- `morale.*`
- `trade.*`
- `prestige.*`

Modifiers are ordered, attributable, and explainable. The engine should be able to return both the final value and a breakdown of contributing modifiers.

## Hook/event bus

The engine should expose lifecycle hooks rather than requiring mods to patch functions.

Initial hook candidates:
- `game:loaded`
- `tick:before`, `tick:after`
- `resource:beforeGain`, `resource:afterGain`
- `resource:beforeSpend`, `resource:afterSpend`
- `action:beforeExecute`, `action:afterExecute`
- `building:constructed`
- `technology:researched`
- `job:assigned`
- `combat:started`, `combat:resolved`
- `prestige:before`, `prestige:after`
- `achievement:unlocked`
- `save:before`, `save:after`

Hook naming and mutability rules must be versioned before third-party use.

## Declarative conditions and effects

Frequently used behaviors should have data representations, for example:
- requires technology;
- requires building;
- requires race/tag;
- unlock content;
- add capacity;
- modify production;
- grant resource;
- grant achievement.

Bespoke mechanics continue to use code through the advanced API.

## UI boundary

The existing Vue/jQuery UI should not be rewritten as a prerequisite.

Instead, later milestones add explicit extension points:
- register tab;
- register panel;
- register settings section;
- register popover/details provider;
- register wiki/encyclopedia section.

## Save boundary

Engine-owned state and mod-owned state are separate.

Target shape:

```json
{
  "engine": { "version": "..." },
  "game": {},
  "mods": {
    "example": {
      "version": "1.2.0",
      "data": {}
    }
  }
}
```

A mod receives only its own storage namespace. Save migrations remain deterministic and versioned.

## Security boundary

Data-only mods and executable code mods are distinct concepts.

Data mods should be loadable without arbitrary code execution. Code mods are explicitly trusted until a later sandbox design exists.

## Upstream policy

The fork should retain a recognizable relationship to upstream Evolve. Modding changes should be concentrated in:
- new modding/engine adapter modules;
- narrowly scoped call-site changes;
- characterization tests.

Avoid broad aesthetic refactors unrelated to the modding goal.
