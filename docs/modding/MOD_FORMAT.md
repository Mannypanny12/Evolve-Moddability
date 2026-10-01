# Mod Package Format

This document defines the intended package model. File extensions and exact schemas remain provisional until M3.

## Package concept

A distributable package may eventually use an extension such as:

```text
example.evolvemod
```

Internally it is a ZIP-compatible archive.

## Suggested layout

```text
manifest.json
content/
  resources.json
  buildings.json
  technologies.json
  races.json
  traits.json
  achievements.json
  events.json
scripts/
  main.js
assets/
  icons/
  images/
strings/
  en.json
  nl.json
```

All folders are optional except the manifest.

## Manifest concept

```json
{
  "id": "example",
  "name": "Example Mod",
  "version": "0.1.0",
  "engine": ">=2.0.0",
  "api": ">=1.0 <2.0",
  "type": "content",
  "dependencies": [],
  "entry": "scripts/main.js"
}
```

## IDs

Public content IDs use:

```text
namespace:local_id
```

Examples:
- `evolve:food`
- `example:mana`
- `warcraft:grunt`

Rules:
- namespace must match the owning package unless an explicit override/extension permission exists;
- IDs are stable save/API identities and must not be repurposed casually;
- display names are localization keys, not identities.

## Package types

Initial concepts:
- `content`: adds content to the base game;
- `library`: shared dependency/API helper;
- `ui`: predominantly presentation/extensions;
- `total_conversion`: replaces the normal visible content/progression root.

Exact enforcement is deferred.

## Dependencies

Dependencies identify package IDs and version ranges.

The loader must report:
- missing dependency;
- incompatible version;
- cycles;
- duplicate package IDs;
- conflicting content ownership.

Silent partial loading is undesirable.

## Data mods vs code mods

Data-only packages do not execute arbitrary JavaScript.

Packages with an entry script are executable/trusted mods.

Until sandboxing exists, enabling a code mod should be treated as trusting that code.

## Assets

Assets are package-relative and addressed through a package asset resolver rather than raw filesystem/browser paths.

## Localization

Mod strings are namespaced to avoid collision.

Example:

```text
example:building_mage_tower_name
```

## Mod storage

Runtime save data is separate from package files:

```json
{
  "mods": {
    "example": {
      "version": "0.1.0",
      "data": {}
    }
  }
}
```

## Migrations

A code-capable mod may declare deterministic migrations between its stored-data versions.

The loader must not silently discard incompatible stored mod data.

## Profiles

A later Mod Manager may define profiles as sets of:
- enabled package IDs;
- versions;
- mod settings;
- load-order metadata when necessary.

Total conversions are expected to be profile-level choices rather than casually toggled inside an active incompatible save.
