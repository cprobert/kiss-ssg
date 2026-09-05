# watcher.js

## Responsibility

Sets up `chokidar` watchers over the entry script, `config.folders.src` (pages and everything else), and the assets folder, and dispatches page/site/asset rebuilds when files change.

## Public interface

- `createWatcher({ config, getStack, entry = process.argv[1], rebuildSite, rebuildPage, assetsChanged, logger })` → `{ ready, close }`.
  - `ready` — `Promise` that resolves once every underlying chokidar watcher has fired its own `'ready'` event.
  - `close()` — `async`; closes every watcher. Required for the Node process to be able to exit (chokidar watchers otherwise keep the event loop alive).
  - Watches (up to three, depending on `entry`): the `entry` file (`'change'` → `rebuildSite()`); `config.folders.src`, ignoring `posix(assetsDir)/**` (`'all'` events other than `add*` → an `unlink` under `pagesDir` goes straight to `rebuildSite()`; otherwise the changed path is matched against `getStack()` by `view`, no match → `rebuildSite()`, one or more matches → `rebuildPage(entry)` per match); `assetsDir` (`'change'` → `assetsChanged()`). Each also has an `'error'` handler that logs via `logger.error`.

## Depends on

`chokidar`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `entry` defaults to `process.argv[1]` (the script that configured `Kiss`) because ESM has no equivalent of CommonJS's `module.parent` — there's no reliable way to ask "who required me" under ESM, so the watcher instead watches the top-level script itself and rebuilds the whole site on any change to it (since the page list itself may have changed).
- `watch({ entry: null })` disables the entry-script watcher entirely — tests use this to avoid an extra open file handle / watcher they don't need, since they configure `Kiss` from a helper module rather than a real "entry script".
- `add`/`addDir` events are ignored (`if (event.includes('add')) return`) — only changes to already-existing files trigger a rebuild; newly created files require a fresh `scan()`/process restart to be picked up.
- The `src` watcher's `ignored` option is the `isInside(assetsDir)` **predicate**, so an asset change fires only `assetsChanged()` from the dedicated assets watcher, never a full-site `rebuildSite()` from the `src` watcher too. It must stay a predicate: chokidar v4 removed glob support, and the `` `${posix(assetsDir)}/**` `` string this used to be silently matched nothing — every asset save then rebuilt the whole site. `test/unit/watcher.test.js` asserts the asset watcher fires without the site watcher, which is what caught it.
- A change under `pages/` looks up matching stack entries by `view` (path relative to `pagesDir`) and rebuilds only those; a change anywhere else under `src/` that can't be matched to any stack entry rebuilds the _entire_ site, on the assumption it might be a partial/layout/model/controller affecting multiple pages.
- A **deleted** page view is the exception to the match-by-view dispatch: it looks like a match (the stack entry still names it), but re-rendering it is exactly wrong — the view is gone, so the render now fails (see `AIKB/kiss-page.md` on `_getTemplate`) and the page's stale output would sit there unrebuilt and unswept. An `unlink` under `pagesDir` therefore always calls `rebuildSite()`, and the replay decides the page's fate by how it was registered (see `AIKB/kiss.md`): a `scan()`-discovered page is dropped and its output swept, a page registered by name fails loudly and keeps its stale output (review finding B3).
- The two rebuild callbacks are not the same operation. `rebuildPage` re-renders one already-prepared page against the options it was built with — right for a template edit, which is all a `pages/` change can be. `rebuildSite` calls `Kiss._replay()`, which re-runs the whole registration pipeline (model resolution, controllers, page preparation) rather than just re-rendering the stack — that is what makes an edited model JSON or controller file take effect, since those live outside `pages/` and so land on the site path.
- A site rebuild is not purely additive: `_replay()` also deletes output files the previous stack wrote that the new stack no longer produces (and re-runs `sitemap()` if one was ever requested), so deleting a model from a `.pages()` fan-out folder, or changing a slug in a controller, actually removes the old page from the dev server — see `AIKB/kiss.md`. That includes a page whose model or controller fails to resolve mid-rebuild (e.g. a half-saved JSON file caught by `chokidar` while still being written): the page is simply never re-prepared, so it drops out of the new stack and its previous output is removed like any other orphan — the dev server 404s on it rather than continuing to serve the stale HTML until the next valid save.
- Neither rebuild callback is awaited by the watcher, but `rebuildPage`'s render _is_ tracked on `Kiss._generating`, so a whole-site rebuild triggered moments later waits for it (and for any still-resolving initial build) before it resets the stack — see `AIKB/kiss.md`.
- Every watcher registers `'error'` → `logger.error('Watcher error', err.message)`. Chokidar emits `'error'` on things like an `EPERM`/`ENOSPC` from the underlying OS watcher; without a listener that is an unhandled `'error'` event, which crashes the process.
- `ready` resolves only when _all_ chokidar watchers (entry, src, assets) have individually fired `'ready'` — callers should await it before relying on watch behavior (see `test/integration/watch.test.js`, which awaits `kiss._watcher.ready`).
- All three watchers are created with `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }` (`WRITE_SETTLE`), so a rebuild fires ~100ms after a file's size last changed rather than on the first notification. Editors and `fs.writeFile` can emit several `change` events per save; without this, a rebuild can read the file mid-write (old or truncated content), and under load the follow-up notification can be deduped/throttled by chokidar so no corrective rebuild ever happens.
