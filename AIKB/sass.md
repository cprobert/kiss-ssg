# sass.js

## Responsibility

Owns the `sass` dependency: resolves the modern compiler API once, and defers loading it until something actually compiles a stylesheet. Every module that compiles Sass goes through this one binding instead of repeating the named-vs-default feature detection.

## Public interface

- `compileFile(target, { loadPaths, style })` — compiles a stylesheet file and returns its CSS, reusing the previous result while neither it nor anything it imports has changed. The path every consumer should use.
- `compileSource(source, { loadPaths, style })` — the same for an inline block, keyed on the source text.
- `clearSassCache()` — empties the memo. Exported for tests; nothing in `lib/` calls it.
- `loadSass()` — returns the resolved sass binding (modern API: `compile`, `compileString`, and the rest of the `sass` namespace). Loads the package on first call, then hands back the same binding.
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
- **Compilation is memoised, because the `sass` helper compiles at render time.** A stylesheet named by a partial is otherwise recompiled once per page that includes it, emitting identical bytes every time. Measured on a real consuming site (`learna-ltd/diploma-msc`): its `catalog.scss` costs 76ms per compile and is included by 111 course pages — 8.4 seconds of a production build spent producing 22KB of CSS it already had. The benchmark's `styled` scenario reproduces that shape; the memo takes its build 64.8% off at 200 pages.
- **The cache is validated against every file sass reports loading, not just the entry.** `CompileResult.loadedUrls` covers the entry and everything it `@use`d or `@import`ed, and each one's mtime is recorded with the result; a lookup restats them all and recompiles if any moved. That is what makes it correct under `watch` without this module having to be told a rebuild happened — the edit usually lands in an imported partial, and keying on the entry alone would serve stale CSS until the entry itself was touched. Restatting ~40 files costs a fraction of a millisecond against a 76ms compile.
- **A missing or unreadable dependency reports `NaN`**, which never equals a recorded mtime, so a vanished import forces a recompile (and lets sass raise the real error) rather than serving a cached result for a graph that no longer exists.
- **`compileSource` serves a zero-dependency block on its source alone.** An inline `{{#sass}}` block that imports nothing has no files to validate, so the freshness check — which requires at least one dependency — would never serve it. Its source text _is_ the cache key, so nothing outside it can go stale.
