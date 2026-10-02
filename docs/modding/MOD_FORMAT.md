# Mod and Content Package Format

This document defines the intended package model. Exact schemas remain provisional until the package-loader milestone.

## First-party and external content

The refactored engine treats vanilla Evolve as first-party content using the same registration concepts as external packages.

First-party content may ship directly in the application source rather than as a physical archive.

External distributable packages may use an extension such as:

```text
example.evolvemod
```

with a ZIP-compatible internal format.

## Suggested layout

```text
manifest.json
content/
  resources.json
  structures.json
  technologies.json
  jobs.json
  races.json
  traits.json
  achievements.json
  events.json
  challenges.json
scripts/
  main.js
assets/
  icons/
  images/
strings/
  en.json
  nl.json
```

Only the manifest is mandatory.

## Manifest concept

```json
{
  "id": "example",
  "name": "Example Mod",
  "version": "0.1.0",
  "engine": ">=2.0.0",
  "api": ">=1.0 <2.0",
  "type": "content",
  "base": "evolve",
  "dependencies": [],
  "entry": "scripts/main.js"
}
```

Exact fields and version syntax remain provisional.

## IDs

Stable public IDs use:

```text
namespace:type/local_id
```

Examples:

- `evolve:resource/food`;
- `evolve:structure/farm`;
- `example:resource/mana`;
- `warcraft:unit/footman`.

Rules:

- namespace normally matches owning package;
- display/localization names are not identity;
- saved references use stable IDs;
- explicit extension/override mechanisms are required for cross-package changes;
- silent replacement is forbidden.

Legacy Evolve IDs are import/migration aliases, not the new canonical format.

## Package types

Candidate types:

- `content`: adds or extends content;
- `library`: shared dependency/code helpers;
- `ui`: presentation extensions;
- `total_conversion`: supplies a replacement base content root.

The first-party `evolve` package is internal base content rather than a special engine mode.

## Base content

A normal Evolve mod may declare:

```json
{ "base": "evolve" }
```

A total conversion may declare no base or another compatible base package.

Package resolution happens before save state is interpreted.

## Dependencies

The loader reports:

- missing dependency;
- incompatible version;
- dependency cycle;
- duplicate package ID;
- duplicate content ID;
- invalid cross-package reference;
- incompatible base content.

Silent partial loading is not acceptable for required dependencies.

## Data packages versus code packages

Data-only packages execute no arbitrary JavaScript.

Code packages are explicitly trusted unless a real sandbox is introduced later.

Both still use package ownership and public engine APIs so they remain diagnosable and versionable.

## Assets

Assets use package-relative logical paths through an asset resolver rather than assuming browser filesystem paths.

## Localization

Strings are namespaced.

Example:

```text
example:building_mage_tower_name
```

Content definitions reference localization keys rather than embedding identity in translated text.

## Storage

Runtime state is not stored inside the package.

Package-owned data lives in the save envelope:

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

Content-owned engine state, such as a registered resource's current amount, belongs in the appropriate engine state domain and is referenced by stable content ID.

## Migrations

Packages with persistent private data may provide deterministic migrations.

Engine/content schema migrations are separate from package-private data migrations.

The loader must not silently discard incompatible state.

## Profiles

A profile may select:

- base content;
- enabled packages;
- versions;
- settings;
- optional load-order metadata.

Total conversions are profile/save-level choices rather than casual mid-run toggles.

## Packaging boundary

The package format is deliberately late in the roadmap.

Internal engine definitions may evolve during M1-M9 without promising that early prototype schemas are final distributable formats.
