# M0A Reproducible Baseline

## Baseline identity

This moddability project starts from upstream Evolve commit:

```text
3436358dcd03d9f9e071d51ea071e0a78c0322e4
```

Upstream repository:

```text
pmotschmann/Evolve
```

The commit message is `1.4.1`. The checked-in `package.json` currently reports application version `1.4.10`.

The Git SHA is the authoritative baseline identity. Characterization work must be traceable to an exact source state rather than only a displayed game version.

## Build environment

The initial automated baseline environment is:

- Linux GitHub Actions runner: `ubuntu-latest`
- Node.js: 20.x
- dependency install: `npm ci`
- full build: `npm run build`

Node 20 is used because the checked-in esbuild 0.25 dependency requires Node 18 or newer. This establishes a project CI environment; it is not yet a claim that other Node versions are unsupported.

## Verification

From a clean checkout:

```bash
npm ci
npm run build
```

The workflow `.github/workflows/baseline-build.yml` runs the same sequence and then verifies that the build did not leave tracked changes.

## Generated artifacts

The inherited upstream README says pull requests should not contain generated JS/CSS build outputs.

This fork retains that policy:

- edit source files rather than generated bundles;
- use normal build commands for verification;
- do not intentionally commit generated JS/CSS merely because a local build changed them;
- review diffs before committing.

Generated assets already present in the inherited baseline remain part of repository history. This policy concerns new moddability diffs.

## Fork-specific tracked metadata

Upstream's `.gitignore` broadly ignores `docs` and dot-directories. This fork has narrow exceptions for:

- `docs/modding/**`
- `.github/workflows/**`

The broader upstream ignore behavior remains intact.

## Package metadata observation

At this baseline:

- `package.json` reports version `1.4.10`;
- root metadata in `package-lock.json` reports `1.4.7`.

M0A records this inherited mismatch but does not alter dependency metadata unless it prevents a clean locked install/build. Build-system corrections must be minimal and explicitly non-gameplay.

## Acceptance

M0A is complete when automation proves a clean checkout can:

1. install from the checked-in lockfile;
2. build the game bundle;
3. build game CSS;
4. build the wiki bundle;
5. build wiki CSS;
6. finish without an unexpected tracked diff.

If the inherited baseline fails, diagnose it and make the smallest explicit build-only correction rather than masking the failure.
