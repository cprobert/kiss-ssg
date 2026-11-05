# css-purge.js

## Responsibility

Remove the CSS no written page uses from the stylesheets a site names in `config.assets.purge.files`. PurgeCSS does the removal, run against the HTML the build actually wrote and the build's own scripts, with the site's `safelist`. This module resolves the config, purges, re-hashes and moves the manifest's name to the new output. It does not touch a page, and it does not decide when it runs: `lib/build-finish.js` `purgeAssets` does that, and each page rewrites its own bytes (`KissPage.replaceInOutput`).

## Public interface

- `resolvePurge(purge)` → `KissPurge | null`. `null`, `false` and absent purge nothing. An object needs a non-empty `files` list (the paths a template asks for; a leading `/` is dropped). `safelist` is strings and RegExps, default `[]`. `scripts` is a boolean, default `true`. Anything else throws, naming the key. `lib/config.js` calls it, so a typo fails at `new Kiss()`.
- `purgeCss(css, { html, scripts, safelist })` → the purged CSS: `new PurgeCSS().purge()` over raw HTML and JS content, `safelist` as PurgeCSS's `standard` list. PurgeCSS is **imported when this runs**, not at module load: `lib/config.js` imports this module on every build, and PurgeCSS brings PostCSS with it.
- `purgeStylesheets({ purge, root, manifest, pages, hash, minify, outputs })` → `PurgeResult[]`, one per file: `{ name, from, to, before, after }`. It:
  - reads every written page and, under `scripts`, every `.js`/`.mjs` in the build;
  - purges each file, then minifies it again when `minify` is on (a minifier failure keeps the purged text);
  - writes it under `hashedName` when the build hashes, or in place when it does not;
  - removes the old file, moves its output-registry claim, and calls `manifest.retarget(name, to)`.

  Throws for a named file the manifest does not hold.

- The `KissPurge` and `PurgeResult` typedefs.

## Depends on

`fs-extra`, `node:path`, `purgecss` (dynamic import), `./asset-manifest.js` (`contentHash`, `hashedName`), `./asset-minify.js` (`minifyText`), `./utils.js` (`posixPath`).

## Depended on by

- `lib/build-finish.js` `purgeAssets(kiss)`, called by `Kiss._purgeAssets()` **first** in `complete()`'s settle path, before the redirects. It is latched on `_purgeRun` and reset per build in `lib/rebuild.js`. It is skipped in dev and on a failed build. It rewrites each written HTML page from `from` to `to` (`KissPage.replaceInOutput`, which re-derives that page's `hash`, `links` and `audit` from the new bytes), and logs `Purged <name>: <before> KB → <after> KB`. A throw fails the build as `<purge>`.
- `lib/config.js` `resolveConfig`, for `assets.purge`.

## Non-obvious behavior

- **Against the written HTML, not the templates.** Every class a page carries counts, wherever it came from: a model, a helper, a partial, a `{{#each}}` over data. A template scan cannot see classes that come from data, and it keeps classes from template branches that never render. This is why it is an engine feature and not only the pipeline recipe: the built pages exist only inside the build.
- **First at the settle, because everything after it reads a stylesheet's name.** The link scan reads each page's extracted references, the audit reads its facts, the cache headers list the hashed outputs from the manifest, and the report lists assets and page hashes. A purge after any of them would leave it describing a file that no longer exists. Putting it before all of them, and having each page re-derive its own facts, means none of them has to know a purge happened.
- **Re-hashed, never renamed in place.** A hashed name is a promise that its bytes never change, and the cache headers tell hosts to keep it for a year. Purging changes the bytes, so the name has to change and the pages have to follow. Without `assets.hash` the name stays and only the bytes change, and no `immutable` header was promised.
- **The page rewrite is an exact string replacement** of the old build-relative output (`css/bootstrap.1a2b3c4d.css`). The content hash makes that string unique, whether a page links it root-relative, relative or absolute.
- **A safelist is unavoidable, so there is no default.** A class built at run time (`'modal-' + name`) appears in no page and no script, and is removed. It breaks the component only when it opens. So purging is opt-in by naming the file, the site's `safelist` keeps what a script builds, and the docs say to open every interactive component after turning it on.
- **Not in dev.** A scoped re-render would need the whole site's classes, and the preview should never hide a rule a page is about to use.
- **A non-dev `.watch()` scoped re-render after the settle** reads the purged name through `{{asset}}`, so it links the right file. But a class that only that edit introduced is not in the purged CSS until the next whole-site build. That is the watcher's best-effort fringe (`AIKB/rebuild.md`), cleared by a restart.
