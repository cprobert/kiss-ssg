# controller-resolver.js

## Responsibility

Resolves `options.controller` (a function, or a filename to load) and runs it against the page's `options`, merging whatever it returns.

## Public interface

- `runController(options, controller, { logger })` → `options` merged with `controller(options)`'s return value (`{ ...options, ...controller(options) }`). Returns `options` unchanged if `controller` isn't a function, or if the controller throws (error is caught and logged, not propagated).
- `async loadController(controllersDir, file, { logger, fresh = false })` → the controller function, or `null` if the file doesn't exist. Resolves `${controllersDir}/${file}` to an absolute path with `path.resolve`, `import()`s it via `pathToFileURL(...).href`, and returns `mod.default ?? mod` (so both `export default fn` and legacy `module.exports = fn` work). `fresh: true` bypasses the module caches so an edited file is re-read.
- `async applyController(options, { controllersDir, logger, fresh = false })` → `options`, with the controller applied (if `options.controller` is a string filename or a function) and `options.title` defaulted from `options.model.title` if neither is already set. `fresh` is passed straight through to `loadController`.

## Depends on

`fs-extra`, `node:path`, `node:url` (`pathToFileURL`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Controller files resolve against `process.cwd()` (via `path.resolve`), consistent with every other folder lookup in the codebase (models, partials, layouts, assets). v1 used `require.main.require` (resolved relative to the entry script) but gated the attempt on a cwd-relative `existsSync` check first — so in v1 a differing cwd already caused the existence check to fail before the entry-relative `require` ever ran, meaning v1's entry-relative resolution never actually worked either; this module's cwd-relative resolution is not a behavior change in practice.
- `fresh: true` (passed by `lib/kiss.js` only while replaying a watch rebuild) busts *two* caches, because Node keeps two: the ESM loader caches by resolved URL, so the file URL gets a `?v=<mtimeMs>` query appended; the CommonJS loader caches by *filename* and never sees that query, so a `module.exports = fn` controller would keep returning the stale export unless `require.cache[require.resolve(path)]` is deleted as well. Both are needed — dropping either one leaves one of the two module systems stale. `require` here comes from `createRequire(import.meta.url)` (this module is ESM, so there is no ambient `require`).
- Cache-busting keys on `mtimeMs`, so an *unchanged* controller still hits the ESM cache on replay (no re-evaluation cost per rebuild); only edited files reload. Two rewrites within the same filesystem-timestamp tick would collapse to one URL — not a concern in watch mode, where chokidar's `awaitWriteFinish` already delays a rebuild ~100ms past the last write.
- Without `fresh` (every non-watch build) behaviour is byte-for-byte unchanged: `import()` caches per resolved URL exactly as `require()` cached per path, so a controller changed mid-process is not re-read. `test/unit/controller-resolver.test.js` pins that cached-by-default behaviour alongside the `fresh` cases.
- Accepts both `export default fn` and CommonJS-style `module.exports = fn` (`import()` surfaces the latter as `mod.default`), via `mod.default ?? mod`.
- A throwing controller leaves `options` completely untouched (`runController`'s catch returns the original `options`, not a partial merge) — the page still builds with whatever options it already had.
- `options.title` only falls back to `options.model.title` when `options.title` is unset *after* the controller runs, so a controller that removes/clears `title` will still get the model's title as a fallback.
