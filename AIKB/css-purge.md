# css-purge.js

## Responsibility

Remove the CSS no written page uses from the stylesheets a site names in `config.assets.purge.files`. PurgeCSS does the removal, run against the HTML the build actually wrote and the build's own scripts, with the site's `safelist`. This module resolves the config, purges, re-hashes and moves the manifest's name to the new output. It does not touch a page, and it does not decide when it runs: `lib/build-finish.js` `purgeAssets` does that, and each page rewrites its own bytes (`KissPage.replaceInOutput`).

## Public interface

- `resolvePurge(purge)` → `KissPurge | null`. `null`, `false` and absent purge nothing. An object needs a non-empty `files` list (the paths a template asks for; a leading `/` is dropped). `safelist` is strings and RegExps, default `[]`. `scripts` is a boolean, default `true`. Anything else throws, naming the key. `lib/config.js` calls it, so a typo fails at `new Kiss()`.
- `purgeCss(css, { html, scripts, safelist })` → the purged CSS: `new PurgeCSS().purge()` over raw HTML and JS content, with `classTokens` as its `defaultExtractor`, `DYNAMIC_ATTRIBUTES` as its `dynamicAttributes`, and `safelist` as both PurgeCSS's `standard` and `greedy` lists (a string becomes the exact-name RegExp). PurgeCSS is **imported when this runs**, not at module load: `lib/config.js` imports this module on every build, and PurgeCSS brings PostCSS with it. PostCSS, which the guard uses, is loaded the same way.
- `classTokens(content)` → every candidate class in a page or a script. It is the union of three sets: whole tokens (Tailwind's rule: up to whitespace, quotes, backticks or `<>`, not ending in `:`); what follows each `=` in a token (an unquoted attribute); and the `[A-Za-z0-9_-]+` pieces PurgeCSS's default found. Entity-encoded tokens are added decoded.
- `DYNAMIC_ATTRIBUTES`: the ARIA states plus `disabled`, `hidden` and `inert`. Attribute selectors on these are kept whatever value the markup holds, as PurgeCSS already does for `value`, `checked`, `selected` and `open`.
- `pageClasses(pages)` → `Map<class, first page>`: the classes in real `class` attributes, parsed with htmlparser2 (decoded, never matched in text).
- `selectorClasses(selector)` → the class names in one selector, CSS escapes decoded. Strings and attribute selectors are skipped.
- `purgeLosses({ before, after, used, tokens })` → `PurgeLoss[]`, **the guard**: a class a page carries, for which the stylesheet had a selector whose every class appears in the content, and the purged stylesheet has no selector at all.
- `purgeStylesheets({ purge, root, manifest, pages, hash, minify, outputs })` → `PurgeResult[]`, one per file: `{ name, from, to, before, after }`. It:
  - reads every written page and, under `scripts`, every `.js`/`.mjs` in the build;
  - purges each file, then minifies it again when `minify` is on (a minifier failure keeps the purged text);
  - writes it under `hashedName` when the build hashes, or in place when it does not;
  - removes the old file, moves its output-registry claim, and calls `manifest.retarget(name, to)`.

  Throws for a named file the manifest does not hold.

- The `KissPurge` and `PurgeResult` typedefs.

## Depends on

`fs-extra`, `node:path`, `htmlparser2` (`Parser`, for `pageClasses`), `purgecss` and `postcss` (dynamic imports), `./asset-manifest.js` (`contentHash`, `hashedName`), `./asset-minify.js` (`minifyText`), `./utils.js` (`posixPath`).

## Depended on by

- `lib/build-finish.js` `purgeAssets(kiss)`, called by `Kiss._purgeAssets()` **first** in `complete()`'s settle path, before the redirects. It is latched on `_purgeRun` and reset per build in `lib/rebuild.js`. It is skipped in dev and on a failed build. It rewrites each written HTML page from `from` to `to` (`KissPage.replaceInOutput`, which re-derives that page's `hash`, `links` and `audit` from the new bytes), and logs `Purged <name>: <before> KB → <after> KB`. A throw fails the build as `<purge>`.
- `lib/config.js` `resolveConfig`, for `assets.purge`.

## Non-obvious behavior

- **Whole class tokens, and nothing the old extractor kept is lost** (issue #78, 2.13.3). PurgeCSS's default extractor, `/[A-Za-z0-9_-]+/g`, split `bg-ink-900/80`, `min-h-[60vh]`, `p-1.5`, `hover:bg-brand-700` and every variant into pieces that are not the class. Every such rule was removed from a site that used it: a1k9training lost its hero height and nav padding, with 25,360 computed-style differences across 20 pages. Nothing reported it, and `kiss-ssg css` overstated "Removable" (29% against a real 11%) for the same reason. `classTokens` adds the whole tokens and keeps the old pieces, so the new candidate set is a superset of the old one. An extra candidate can only keep a rule that is not needed.
- **The guard fails the build; it does not repair.** `purgeStylesheets` purges and checks every named stylesheet before writing any. When `purgeLosses` finds a class that lost every rule, it throws, naming the class, the stylesheet and a page, and saying to safelist it or report it. The build fails as `<purge>` with the copied stylesheets whole. Two cases are exempt. A selector that names a class on no page is not counted (`.card .title` with no `.card` was rightly removed). A class that keeps any rule is not a loss either: a framework component with unused variants is the purge working. With 2.13.3's extractor put back, the guard fails the Tailwind fixture build and names all five classes (`test/integration/css-purge.test.js`; mutation run on this branch). It cannot see a class a script assembles from pieces, because no page carries it.
- **A safelist entry keeps every rule that names it.** `standard` alone only exempts the matching selector part. The rest is still checked, so `safelist: ['btn']` lost `.btn[data-size=xl]` on a page with no `data-size="xl"`, and the guard's own advice would not have worked. `greedy` keeps a rule when any part matches (the operator's decision, 2026-11-08).
- **ARIA state selectors are kept whatever the markup holds.** A disclosure button written `aria-expanded="false"` lost its `aria-expanded:rotate-180` rule (`[aria-expanded=true]`), because PurgeCSS also wants the attribute's value in the content and a script supplies it.

- **Every `.html` file in the build is read, not only the rendered pages.** An HTML file copied from the assets folder, or a page kept from an earlier build under `cleanBuild: false`, links the stylesheet too, and its classes were purged when only `kiss._stack` was read (Codex at the close, 2026-11-05; the integration test was red before). The rendered pages are still the only ones relinked to a re-hashed name: a copied page's own `<link>` is its author's.
- **Purged first, minified once, after.** `lib/assets.js` skips the copy-time minify for a file `assets.purge` names, and this module minifies it after purging. Minifying first strips comments, PurgeCSS's `/* purgecss start ignore */` included, and the protected block would be purged. Measured: with the old order, `.kept-by-comment` was removed (`test/integration/css-purge.test.js`, red before the fix). The minify after the purge is also the one that matters: it clears what the purge leaves behind, and the hash is taken from those final bytes.

- **Against the written HTML, not the templates.** Every class a page carries counts, wherever it came from: a model, a helper, a partial, a `{{#each}}` over data. A template scan cannot see classes that come from data, and it keeps classes from template branches that never render. This is why it is an engine feature and not only the pipeline recipe: the built pages exist only inside the build.
- **First at the settle, because everything after it reads a stylesheet's name.** The link scan reads each page's extracted references, the audit reads its facts, the cache headers list the hashed outputs from the manifest, and the report lists assets and page hashes. A purge after any of them would leave it describing a file that no longer exists. Putting it before all of them, and having each page re-derive its own facts, means none of them has to know a purge happened.
- **Re-hashed, never renamed in place.** A hashed name is a promise that its bytes never change, and the cache headers tell hosts to keep it for a year. Purging changes the bytes, so the name has to change and the pages have to follow. Without `assets.hash` the name stays and only the bytes change, and no `immutable` header was promised.
- **The page rewrite is an exact string replacement** of the old build-relative output (`css/bootstrap.1a2b3c4d.css`). The content hash makes that string unique, whether a page links it root-relative, relative or absolute.
- **A safelist is unavoidable, so there is no default.** A class built at run time (`'modal-' + name`) appears in no page and no script, and is removed. It breaks the component only when it opens. So purging is opt-in by naming the file, the site's `safelist` keeps what a script builds, and the docs say to open every interactive component after turning it on.
- **Not in dev.** A scoped re-render would need the whole site's classes, and the preview should never hide a rule a page is about to use.
- **A non-dev `.watch()` scoped re-render after the settle** reads the purged name through `{{asset}}`, so it links the right file. But a class that only that edit introduced is not in the purged CSS until the next whole-site build. That is the watcher's best-effort fringe (`AIKB/rebuild.md`), cleared by a restart.
