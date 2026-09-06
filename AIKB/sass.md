# sass.js

## Responsibility

Owns the `sass` dependency: resolves the modern compiler API once, and defers loading it until something actually compiles a stylesheet. Every module that compiles Sass goes through this one binding instead of repeating the named-vs-default feature detection.

## Public interface

- `loadSass()` — returns the resolved sass binding (modern API: `compile(file, options)`, `compileString(source, options)`, and the rest of the `sass` namespace). Loads the package on first call, then hands back the same binding.
- `pickModernApi(mod)` — the pure feature detection, exported for its own test.
- `default` — `loadSass`.

## Depends on

`sass` (loaded lazily, via `node:module`'s `createRequire`).

## Depended on by

`lib/assets.js`, `lib/handlebars-helpers.js`.

## Non-obvious behavior

- **The package is loaded on first compile, not at import.** `sass` is the most expensive dependency in the tree — ~270ms to import, more than the entire build of a 50-page site. As a static `import` it was pulled in by `assets.js` and `handlebars-helpers.js`, which `lib/kiss.js` imports unconditionally, so every process that touched Kiss paid for it: a production build with no `.scss` file, a `kiss-ssg check`, a sitemap-only run. A site that never compiles Sass now never loads it; one that does pays the same cost, just later.
- **`createRequire`, not `await import()`.** The `sass` Handlebars helper is synchronous — Handlebars has no async helper contract — so the binding has to be resolvable without a tick. `sass` ships CJS, so a require resolves it. Resolution walks up from this file, so it finds the copy hoisted to a consuming project's root just as it finds a nested one.
- **The detection prefers the named export and reaches for `.default` only when it is missing** — not `mod.default ?? mod`. Sass releases before 1.45 put the modern `compile`/`compileString` API only on the default export, so reading the top level alone leaves `sass.compile` undefined and every compile throws `TypeError: sass.compile is not a function`. But current sass exports both, _and_ logs a deprecation warning the moment `.default` is touched — so the named export has to win, or every build on a modern sass prints that warning.
- **The detection is a pure function because the load is a `require`.** Vitest's module registry mocking (`vi.doMock`) intercepts `import`, not `createRequire`, so the two package layouts can no longer be simulated by mocking — and no longer need to be: `pickModernApi` is tested directly against both shapes (review finding: the binding used to be resolved at module load, and the detection was duplicated verbatim in both consumers, so a fix would have landed in only one copy).
