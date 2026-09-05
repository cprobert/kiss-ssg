# controller-resolver.js

## Responsibility

Resolves `options.controller` (a function, or a filename to load) and runs it against the page's `options`, merging whatever it returns.

## Public interface

- `runController(options, controller, { logger })` → `options` merged with `controller(options)`'s return value (`{ ...options, ...controller(options) }`). Returns `options` unchanged if `controller` isn't a function. **Rethrows** whatever the controller throws, after logging it.
- `async loadController(controllersDir, file, { logger, fresh = false })` → the controller function; **throws** `Failed to find controller: <path>` if the file doesn't exist (after logging it). Resolves `${controllersDir}/${file}` to an absolute path with `path.resolve`, `import()`s it via `pathToFileURL(...).href`, and returns `mod.default ?? mod` (so both `export default fn` and legacy `module.exports = fn` work). `fresh: true` bypasses the module caches so an edited file is re-read.
- `async applyController(options, { controllersDir, logger, fresh = false })` → an options object, with the controller applied (if `options.controller` is a string filename or a function) and `title` defaulted from `options.model.title` if neither is already set. Never mutates the object it was given. **Throws** if the controller cannot be run: a missing file, a controller that throws, or a `controller` of any other type (`Unknown controller type: <typeof>`). `fresh` is passed straight through to `loadController`.

## Depends on

`fs-extra`, `node:path`, `node:url` (`pathToFileURL`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Controller files resolve against `process.cwd()` (via `path.resolve`), consistent with every other folder lookup in the codebase (models, partials, layouts, assets). v1 used `require.main.require` (resolved relative to the entry script) but gated the attempt on a cwd-relative `existsSync` check first — so in v1 a differing cwd already caused the existence check to fail before the entry-relative `require` ever ran, meaning v1's entry-relative resolution never actually worked either; this module's cwd-relative resolution is not a behavior change in practice.
- `fresh: true` (passed by `lib/kiss.js` only while replaying a watch rebuild) busts _two_ caches, because Node keeps two: the ESM loader caches by resolved URL, so the file URL gets a `?v=<mtimeMs>` query appended; the CommonJS loader caches by _filename_ and never sees that query, so a `module.exports = fn` controller would keep returning the stale export unless `require.cache[require.resolve(path)]` is deleted as well. Both are needed — dropping either one leaves one of the two module systems stale. `require` here comes from `createRequire(import.meta.url)` (this module is ESM, so there is no ambient `require`).
- Cache-busting keys on `mtimeMs`, so an _unchanged_ controller still hits the ESM cache on replay (no re-evaluation cost per rebuild); only edited files reload. Two rewrites within the same filesystem-timestamp tick would collapse to one URL — not a concern in watch mode, where chokidar's `awaitWriteFinish` already delays a rebuild ~100ms past the last write.
- Without `fresh` (every non-watch build) behaviour is byte-for-byte unchanged: `import()` caches per resolved URL exactly as `require()` cached per path, so a controller changed mid-process is not re-read. `test/unit/controller-resolver.test.js` pins that cached-by-default behaviour alongside the `fresh` cases.
- Accepts both `export default fn` and CommonJS-style `module.exports = fn` (`import()` surfaces the latter as `mod.default`), via `mod.default ?? mod`.
- **A controller that cannot run fails the page** (review finding F-01, 2026-09-05). All three paths — a missing file, a controller that throws, an unrecognised `controller` type — used to log and carry on returning the un-controlled `options`, so the page built without its derived slug or reshaped model and the build still exited 0. They now throw; `lib/kiss.js`'s `page()` records the throw on `_failures` and `complete()` reports it. The log lines are unchanged, so the console output a consumer already recognises still appears. `test/unit/controller-resolver.test.js` pinned the old behaviour and was deliberately flipped.
- The `?v=<mtime>` ESM cache-bust above leaks module instances by design: Node has no API to evict a module from the ESM registry, so every edit to a controller during a long `watch()` session retains one more instance for the life of the process. Dev-only and small (a few hundred tiny modules over an afternoon of edits), documented rather than fixed (review finding F-02).
- `options.title` only falls back to `options.model.title` when `options.title` is unset _after_ the controller runs, so a controller that removes/clears `title` will still get the model's title as a fallback.
- That fallback returns a **new** object rather than assigning onto the caller's `options`. It used to mutate in place, which broke `.pages()`: the fan-out reused one options object per loop, item one set the title, and the "unless already set" guard then skipped every item after it — so every page in the fan-out rendered the first item's title while `{{model.x}}` looked correct. `lib/kiss.js` now also builds a fresh options object per fanned-out page; either fix alone would have closed the observed bug, and both are kept because the aliasing was the real hazard.
