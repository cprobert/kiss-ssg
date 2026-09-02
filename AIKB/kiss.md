# kiss.js

## Responsibility

The orchestrator and public API. `Kiss` owns config, a per-instance Handlebars environment and Remarkable renderer, the `_stack` of prepared pages, and the `_promises`/`_generating` queues that track every piece of async work (model resolution, asset copying, generate/sitemap runs). Every other `lib/*.js` module is wired together and driven from here.

## Public interface

- `class Kiss` (default export), also re-exported as `export { Kiss as 'module.exports' }` so `require('kiss-ssg')` on Node ≥22.12 returns the class, not `{ default: Kiss }`.
- `new Kiss(config)` — resolves config, sets up Handlebars/Remarkable, ensures folders, queues an asset copy, registers helpers and partials, and (in dev mode) starts the dev server and watcher.
- `.copyAssets(sourceDir, targetDir)` — queues `copyAssets()` onto `_promises`; returns `this`.
- `.registerPartials()` — re-runs `registerPartials()` against the current Handlebars env; returns its result.
- `.page(options, callback)` — resolves the page's model, runs its controller, prepares a `KissPage`, pushes it onto `_stack`; returns `this`.
- `.pages(options, callback)` — same as `.page()` with `options.dynamic = true` (one page per model in an array); returns `this`.
- `.scan()` — globs every `.hbs` under `config.folders.pages` and calls `.page()` for any not already in `_stack`; returns `this`.
- `.viewStats()` — logs `{ promise, stack }` counts (and, if `verbose`, writes `debug.json`); returns `this`.
- `.generate(callback)` — awaits `_promises`, renders every stack entry with `runCount === 0` once, awaits the writes, invokes `callback`; returns `this`.
- `.complete(callback)` — awaits `_drain()` (repeated `Promise.all` over `_promises` + `_generating`), invokes `callback` with the resolved data, and returns that data (a `Promise`, unlike the other chainable methods).
- `.sitemap(options, callback)` — awaits `_promises`, writes `sitemap.xml` via `writeSitemap()`; returns `this`.
- `.getModelByID(id, data)` — looks up `{ id }` in a resolved-models array; returns `.data` or an error object.
- `.watch({ entry = process.argv[1] } = {})` — starts (once) a `createWatcher()` wired to rebuild pages/site/assets; returns `this`.
- `.close()` — closes the watcher and dev server if running.
- `export { utils }` — re-exports `lib/utils.js`'s default export.

## Depends on

`fs-extra`, `glob`, `node:path`, `handlebars`, `handlebars-layouts`, `remarkable`; and `./utils.js`, `./logger.js`, `./config.js`, `./handlebars-helpers.js`, `./partials.js`, `./assets.js`, `./model-resolver.js`, `./controller-resolver.js`, `./sitemap.js`, `./kiss-page.js`, `./dev-server.js`, `./watcher.js`.

## Depended on by

Nothing in `lib/` — it is the entry point (`package.json`'s `main`).

## Non-obvious behavior

- Pipeline: `.page()`/`.pages()`/`.scan()` queue work (model → controller → `_preparePage`) as one caught promise per page on `_promises`; nothing renders until `.generate()`. `.generate()` awaits `_promises`, renders every stack entry whose `runCount` is 0, awaits the writes, then fires the callback. `_generating` tracks `generate()`/`sitemap()` runs. `complete()` drains both lists repeatedly because callbacks may queue more work.
- `_promises` must only ever contain *handled* (caught) promises — a bad model rejecting unhandled crashed the process in v1. The `.page()` chain's `.catch()` always resolves to `{ id, data: null, error }` instead of rejecting.
- Handlebars and Remarkable are created fresh per `Kiss` instance so partials/helpers from one instance never leak into another (matters for tests that build multiple sites in one process).
- `export { Kiss as 'module.exports' }` exists purely so CJS `require('kiss-ssg')` returns the class itself on Node ≥22.12, not `{ default: Kiss }`.
- `config.logger` is the one dependency-injection seam — pass `silentLogger` (from `lib/logger.js`) in tests to keep output quiet.
- Calling `complete()` from inside a `generate()` callback would deadlock: the callback runs inside a promise pushed onto `_generating`, and `complete()`'s `_drain()` awaits `_generating` before resolving — so `complete()` would be waiting on a promise that can't settle until the callback (which called `complete()`) returns. Never call `complete()` from inside a `generate()`/`sitemap()` callback.
- `_promises` and `_generating` are push-only for the life of the instance — they are never spliced or cleared. This only matters for long-running `watch()` sessions that call `complete()` repeatedly: each call re-awaits every promise ever queued (all already settled, so cheap, but the arrays grow unbounded).
- `_drain()` only catches work queued *synchronously* by a settled callback's continuation — a `setTimeout`-deferred `.page()` call (or anything else that queues work on a later tick) escapes it, because the `while` loop's re-check only sees array-length growth that happened before its next `Promise.all` starts.
- The `modelId` used in `.page()`'s `.catch()` failure entry is captured *before* the `.then()` chain runs, because `options.model` is reassigned to the resolved data inside `.then()` — reading `options.model` inside `.catch()` for a post-resolution failure would report the data, not the original id.
- Dedupe by `buildTo` (in `_preparePage`) also applies to `.pages()` fan-out, since each fanned-out page still goes through `_preparePage` individually — v1 never deduped fan-out output.
- Rebuilds triggered by the watcher (`rebuildSite`, `rebuildPage`) call `page.generate()` without awaiting it — fire-and-forget, matching v1's behavior. Watched rebuilds are not tracked on `_promises`/`_generating`.
