# site-helpers.js

## Responsibility

Loads the **site's own** Handlebars helpers from `config.folders.helpers` and registers them on the `Kiss` instance, so a build script never writes `registerHelpers(kiss)` itself. Distinct from `handlebars-helpers.js`, which registers the helpers kiss ships.

## Public interface

- `helpersEntry(folder)` → the absolute path of the folder's `index.js` / `index.mjs` / `index.cjs`, or `null`. `null` is the ordinary case for a site with no custom helpers and must stay silent.
- `loadSiteHelpers(folder, { kiss, logger, fresh, previous })` → `{ loaded, entry, registered?, error? }`. Imports the entry, calls its `registerHelpers` export (or its default) with the instance, and **resolves** rather than throwing — a helpers folder that will not load is a build failure for the caller to record, not an exception through `new Kiss()`.

## Depends on

`fs-extra`, `node:path`, `node:module`'s `createRequire`, `node:url`'s `pathToFileURL`. Nothing in `lib/`.

## Depended on by

`lib/kiss.js` only — the constructor starts `_loadHelpers()`, `generate()` awaits it, and the helpers watcher calls it again with `fresh: true`.

## Non-obvious behavior

- **This module can only exist because the ordering constraint kiss documented for years was false.** `llms.txt` said the `registerHelpers(kiss)` call "must stay immediately after `new Kiss()`: partials are compiled at construction, and a helper registered later is not there when they render." Measured: a helper registered after construction _and_ after `.page()` renders correctly, in pages and inside partials. Handlebars resolves a helper from the registry at **render** time, not at compile time. That is what makes asynchronous loading safe from a synchronous constructor: the import is started in the constructor and awaited by `generate()`, which is always before the first render.
- **`generate()` awaits `_helpersReady` alongside `_promises`, and throws its result away.** `Promise.all([this._helpersReady, ...this._promises]).then(([, ...data]) => …)`. The discard is load-bearing: `data` is the documented array whose entry 0 is the construction-time asset copy, and renumbering it would silently break every site using `getModelByID`. Same reasoning that keeps `config.assets.pipeline` off `_promises` (`AIKB/kiss.md`).
- **`folders.helpers` is not derived from `src` and is not in `foldersToEnsure`.** It defaults to `./helpers`, beside the build script, for the same reason `aikb` does: it is code the author writes, not content derived from `src`. Keeping it out of `src` also keeps it out of the `src` watcher, whose dispatch has no branch that could serve it — a helper module there is none of the six things a `src` event can be, so it fell through to a replay that ran the cached module and changed nothing.
- **A reload busts both module caches**, the same idiom as `controller-resolver.js`: `require.cache` by filename for CommonJS, a `?v=<mtimeMs>` query for ESM. Re-registering a helper of the same name is how Handlebars replaces one, so an **edited** helper needs no teardown.
- **A removed helper does need one**, and that is what `previous`/`registered` are for. `registered` is the names the site's registrar added on that load, measured as the difference in `kiss.handlebars.helpers` across the `register(kiss)` call — so a built-in is never counted as the site's. Hand that list back as `previous` on the next reload and those names are unregistered **after the module imports and before the registrar runs**: whatever the new source does not re-register stays gone. The ordering is the whole design — clearing before the import would empty a running site's registry on a module that fails to import, and clearing after the registrar would undo the load itself. A registrar that throws part-way restores the saved functions, because a half-registered site is worse than the one it replaced.
- **The bust reaches the entry and nothing else, and that is stated rather than papered over.** `index.js`'s own `import './format.js'` resolves to the un-busted URL and comes back from the ESM cache, so re-running the registrar would register the **old** helper while every page re-rendered and the browser reloaded — the dev rebuild trap, inside the feature built to remove it. ESM has no cache-invalidation API, so `Kiss`'s `helpersChanged` compares the changed path with `helpersEntry()` and, for anything else in the folder, prints the restart notice and **does not rebuild**: no re-render, no live reload, no claim that the edit landed.
- **The watcher for this folder lives in `watcher.js` and only exists when the folder does** (`existsSync`), so a site with no helpers opens no extra file handle. On a change to the **entry**, `Kiss` reloads fresh and re-renders every stack entry — helpers only affect rendering, so this is a replay minus its expensive half (no model re-read, no controller re-import, no URL model re-fetch).
- **A load failure is recorded as `<site helpers>` on `_failures`**, so `complete()` rejects rather than shipping a site whose templates silently lost their helpers. An entry that exports something other than a function is the same kind of failure, named explicitly, because the alternative is every `{{helper}}` rendering as nothing on a green build.
