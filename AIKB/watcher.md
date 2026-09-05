# watcher.js

## Responsibility

Sets up `chokidar` watchers over the entry script, `config.folders.src` (pages and everything else), and the assets folder, and reports what happened. It decides nothing about a `src` event beyond which tree it came from: every one is forwarded to `Kiss`, which owns the dispatch (`AIKB/kiss.md`, `_handleChange`).

## Public interface

- `createWatcher({ config, entry = process.argv[1], rebuildSite, onChange, assetsChanged, logger })` → `{ ready, close }`.
  - `ready` — `Promise` that resolves once every underlying chokidar watcher has fired its own `'ready'` event.
  - `close()` — `async`; closes every watcher. Required for the Node process to be able to exit (chokidar watchers otherwise keep the event loop alive).
  - Watches (up to three, depending on `entry`): the `entry` file (`'change'` → `rebuildSite()`); `config.folders.src`, ignoring `posix(assetsDir)/**` (every `'all'` event → `onChange(event, posixPath)`, except the `add`/`addDir` burst chokidar emits before its own `'ready'`); `assetsDir` (`'change'` → `assetsChanged()`). Each also has an `'error'` handler that logs via `logger.error`.

## Depends on

`chokidar`.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- `entry` defaults to `process.argv[1]` (the script that configured `Kiss`) because ESM has no equivalent of CommonJS's `module.parent` — there's no reliable way to ask "who required me" under ESM, so the watcher instead watches the top-level script itself and rebuilds the whole site on any change to it (since the page list itself may have changed).
- `watch({ entry: null })` disables the entry-script watcher entirely — tests use this to avoid an extra open file handle / watcher they don't need, since they configure `Kiss` from a helper module rather than a real "entry script".
- **The `add`/`addDir` burst from chokidar's initial scan is the one thing the `src` watcher filters out.** The gate is a `scanned` boolean set by that watcher's own `'ready'` handler: chokidar emits an `add` for every existing file during its initial scan, and forwarding that burst would rebuild the site once per file at startup. It is the reason the old `if (event.includes('add')) return` guard existed; that guard also made newly created files invisible until restart, and a page edited to reference a new partial then failed to render with its error swallowed, so the page looked frozen (review finding B2). Real `add`s are forwarded like any other event, and `Kiss` sends them to a full replay.
- A new page view on a `.scan()`-registered site is built by the replay the `add` triggers: `_replay()` re-runs `scan()` when `_scanRequested` is set, so a view that did not exist at the first scan joins `_registrations` there. On an explicitly registered site the replay is a harmless no-op for the new file, which was never going to be auto-discovered. See `AIKB/kiss.md`.
- The `src` watcher's `ignored` option is the `isInside(assetsDir)` **predicate**, so an asset change fires only `assetsChanged()` from the dedicated assets watcher and never reaches `onChange` (where it would land on the replay fallback and rebuild the whole site). It must stay a predicate: chokidar v4 removed glob support, and the `` `${posix(assetsDir)}/**` `` string this used to be silently matched nothing — every asset save then rebuilt the whole site. `test/unit/watcher.test.js` asserts the asset watcher fires while `onChange` stays untouched, which is what caught it.
- **Which stack entry (if any) a change belongs to is no longer decided here.** Matching a path against the stack by `view`, sending a partial or layout edit down the scoped fast path, and routing everything else to a replay all live in `Kiss._handleChange` — the watcher has no access to the stack, the partials registration or the rebuild queue, and splitting the decision across two modules is what let the old `getStack()`/`rebuildPage` pair drift from what the queue actually did. The dispatch table is in `AIKB/kiss.md`.
- `rebuildSite` survives as the entry-script watcher's callback only: a change to the script that configured `Kiss` can change the page list itself, so it is always a whole-site replay and never needs the path.
- A site rebuild is not purely additive: `_replay()` also deletes output files the previous stack wrote that the new stack no longer produces (and re-runs `sitemap()` if one was ever requested), so deleting a model from a `.pages()` fan-out folder, or changing a slug in a controller, actually removes the old page from the dev server — see `AIKB/kiss.md`. That includes a page whose model or controller fails to resolve mid-rebuild (e.g. a half-saved JSON file caught by `chokidar` while still being written): the page is simply never re-prepared, so it drops out of the new stack and its previous output is removed like any other orphan — the dev server 404s on it rather than continuing to serve the stale HTML until the next valid save.
- Nothing the watcher calls is awaited by it, but every rebuild it triggers is still tracked: `Kiss` puts each render on `_generating` and serialises the work through its rebuild queue, so a whole-site rebuild triggered moments later waits for it (and for any still-resolving initial build) before it resets the stack — see `AIKB/kiss.md`.
- Every watcher registers `'error'` → `logger.error('Watcher error', err.message)`. Chokidar emits `'error'` on things like an `EPERM`/`ENOSPC` from the underlying OS watcher; without a listener that is an unhandled `'error'` event, which crashes the process.
- `ready` resolves only when _all_ chokidar watchers (entry, src, assets) have individually fired `'ready'` — callers should await it before relying on watch behavior (see `test/integration/watch.test.js`, which awaits `kiss._watcher.ready`).
- All three watchers are created with `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }` (`WRITE_SETTLE`), so a rebuild fires ~100ms after a file's size last changed rather than on the first notification. Editors and `fs.writeFile` can emit several `change` events per save; without this, a rebuild can read the file mid-write (old or truncated content), and under load the follow-up notification can be deduped/throttled by chokidar so no corrective rebuild ever happens.
