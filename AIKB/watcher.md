# watcher.js

## Responsibility

Sets up `chokidar` watchers over the entry script, `config.folders.src` (pages and everything else), and the assets folder, and dispatches page/site/asset rebuilds when files change.

## Public interface

- `createWatcher({ config, getStack, entry = process.argv[1], rebuildSite, rebuildPage, assetsChanged, logger })` → `{ ready, close }`.
  - `ready` — `Promise` that resolves once every underlying chokidar watcher has fired its own `'ready'` event.
  - `close()` — `async`; closes every watcher. Required for the Node process to be able to exit (chokidar watchers otherwise keep the event loop alive).
  - Watches (up to three, depending on `entry`): the `entry` file (`'change'` → `rebuildSite()`); `config.folders.src`, ignoring `posix(assetsDir)/**` (`'all'` events other than `add*` → matches the changed path against `getStack()` by `view`; no match → `rebuildSite()`, one or more matches → `rebuildPage(entry)` per match); `assetsDir` (`'change'` → `assetsChanged()`). Each also has an `'error'` handler that logs via `logger.error`.

## Depends on

`chokidar`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `entry` defaults to `process.argv[1]` (the script that configured `Kiss`) because ESM has no equivalent of CommonJS's `module.parent` — there's no reliable way to ask "who required me" under ESM, so the watcher instead watches the top-level script itself and rebuilds the whole site on any change to it (since the page list itself may have changed).
- `watch({ entry: null })` disables the entry-script watcher entirely — tests use this to avoid an extra open file handle / watcher they don't need, since they configure `Kiss` from a helper module rather than a real "entry script".
- `add`/`addDir` events are ignored (`if (event.includes('add')) return`) — only changes to already-existing files trigger a rebuild; newly created files require a fresh `scan()`/process restart to be picked up.
- The `src` watcher's `ignored` option excludes `posix(assetsDir)/**` (nested assets included, via the `**` glob) so an asset change fires only `assetsChanged()` from the dedicated assets watcher, never a full-site `rebuildSite()` from the `src` watcher too.
- A change under `pages/` looks up matching stack entries by `view` (path relative to `pagesDir`) and rebuilds only those; a change anywhere else under `src/` that can't be matched to any stack entry rebuilds the *entire* site, on the assumption it might be a partial/layout/model/controller affecting multiple pages.
- Every watcher registers `'error'` → `logger.error('Watcher error', err.message)`. Chokidar emits `'error'` on things like an `EPERM`/`ENOSPC` from the underlying OS watcher; without a listener that is an unhandled `'error'` event, which crashes the process.
- `ready` resolves only when *all* chokidar watchers (entry, src, assets) have individually fired `'ready'` — callers should await it before relying on watch behavior (see `test/integration/watch.test.js`, which awaits `kiss._watcher.ready`).
- All three watchers are created with `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }` (`WRITE_SETTLE`), so a rebuild fires ~100ms after a file's size last changed rather than on the first notification. Editors and `fs.writeFile` can emit several `change` events per save; without this, a rebuild can read the file mid-write (old or truncated content), and under load the follow-up notification can be deduped/throttled by chokidar so no corrective rebuild ever happens.
