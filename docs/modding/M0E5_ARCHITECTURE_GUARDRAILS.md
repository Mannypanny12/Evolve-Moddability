# M0E5 Architecture and CI Guardrails

M0E5 turns the refactor architecture into a machine-enforced boundary before M1A creates the first engine source file.

## Protected engine boundary

`src/engine/**` is reserved for platform-independent engine code.

Every `.js`, `.mjs`, and `.cjs` source file under that directory has a hard zero budget for direct:

- legacy `global` access;
- DOM/browser globals such as `window`, `document`, `navigator`, `globalThis`, jQuery, or Vue;
- `localStorage` or the legacy `save` storage wrapper;
- wall-clock access through `Date.now()`, `Date()`, `new Date(...)`, or `performance.now()`;
- randomness through `Math.random()`, legacy `Math.rand()`, or `crypto.getRandomValues()`;
- relative imports that resolve outside `src/engine/**`;
- CommonJS `require()` calls;
- imports of browser/UI packages such as jQuery, Vue, `@vue/*`, or Buefy, even when renamed locally.

Engine-to-engine relative imports are allowed. Browser/platform adapters introduced later belong outside `src/engine/**` and implement engine-owned contracts from the outside.

Engine imports are also checked for cycles. The clean engine starts acyclic.

## Legacy ratchets

The existing top-level `src/*.js` gameplay architecture remains legal only at the exact frozen M0E5 baseline recorded in `tests/architecture/legacy-architecture-baseline.json`.

The baseline uses code-aware masking so comments and literal text do not consume architecture budget; executable template expressions still count. It measures each legacy module independently for:

- direct `global` access;
- browser/UI references;
- storage access;
- wall-clock access;
- direct random access.

A metric may not increase. If refactoring makes a metric smaller, CI also fails until the stored baseline is lowered in the same change. This makes the budget a real downward ratchet instead of a ceiling that later code could grow back into.

New top-level legacy `src/*.js` modules are rejected as unbaselined. New architecture should be placed in its intended layer instead of enlarging the legacy root.

## Legacy dependency knot

At the M0E5 baseline, 20 legacy gameplay modules form the largest strongly connected component.

CI records both:

- largest legacy SCC size: 20;
- the exact set of modules currently participating in legacy cycles.

The SCC may shrink or split, but it may not grow. A module that becomes acyclic must be removed from the allowed cycle-member baseline in the same change, so it cannot silently rejoin later. Modules outside the current knot may not newly become cyclic.

## Self-test

The architecture checker has both rule-level and repository-level negative controls. They deliberately exercise forbidden engine patterns, a discovered bad engine file, renamed browser/UI package imports, CommonJS `require()`, engine import cycles, legacy SCC growth, and the requirement to lower SCC baselines after architectural improvement.

A clean synthetic engine repository must pass, a poisoned synthetic engine repository must return a nonzero architecture result, and the real repository must pass with zero `src/engine/**` violations and exact legacy ratchets. Comments, string literals, template literal text, and regular-expression literals do not consume engine dependency budget; executable template expressions still do.

## CI

`npm run test:architecture` runs the repository architecture gate explicitly in CI in addition to the architecture check being covered by the normal Node test suite.

Push CI matches both `m*` and `m*/**` development branches, so hyphenated milestone branches such as `m2-state` and slash-based branches such as `m2/state` inherit the same safety gates automatically.

## Scope

M0E5 does not:

- create the M1 registry;
- create `GameState`;
- move legacy code;
- reduce existing legacy budgets;
- introduce browser adapters;
- change gameplay.

It establishes the fence and the measured starting point before M1 begins.
