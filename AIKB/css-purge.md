# css-purge.js

## Responsibility

Remove the CSS no written page uses from the stylesheets a site names in `config.assets.purge.files`. PurgeCSS does the removal, run against the HTML the build actually wrote and the build's own scripts, with the site's `safelist`. This module resolves the config, purges, re-hashes and moves the manifest's name to the new output. It does not touch a page, and it does not decide when it runs: `lib/build-finish.js` `purgeAssets` does that, and each page rewrites its own bytes (`KissPage.replaceInOutput`).

## Public interface

- `resolvePurge(purge)` → `KissPurge | null`. `null`, `false` and absent purge nothing. An object needs a non-empty `files` list (the paths a template asks for; a leading `/` is dropped). `safelist` is strings and RegExps, default `[]`. `scripts` is a boolean, default `true`. Anything else throws, naming the key. `lib/config.js` calls it, so a typo fails at `new Kiss()`.
- `purgeCss(css, { html, scripts, safelist, reads })` → the purged CSS. It calls `new PurgeCSS().purge()` over:
  - the raw HTML and JS;
  - **one more content item, holding the pages' exact `class` attribute values** (`attributeClasses`, one per line, extension `kiss-classes`), read by an extractor that only splits lines.

  The options: `classTokens` as the `defaultExtractor`, `DYNAMIC_ATTRIBUTES` as `dynamicAttributes`, and `safelist` as PurgeCSS's **`greedy`** list only (a string becomes the exact-name RegExp; `greedy` keeps everything `standard` would). PurgeCSS is **imported when this runs**, not at module load: `lib/config.js` imports this module on every build, and PurgeCSS brings PostCSS with it.

- `purgeReads()` → a fresh `PurgeReads` (`{ tokens, classes, exact }`: two `Map`s keyed by page or script text, and a `WeakMap` from a page list to its exact classes, deduplicated and joined, since a build purges every stylesheet against the same list; third review, 2026-11-08) for one run of purges: `purgeStylesheets` makes one per build and `lib/css-audit.js` `auditCss` one per audit. Passed to every `purgeCss` of the run as `reads`, so each page and script is tokenised and parsed once however many stylesheets it meets. PurgeCSS runs its extractor over every content string for every stylesheet. Keyed by text, not by list: the audit hands each stylesheet a different list. The first version kept a module-level `WeakMap` on the list's identity, which the audit never hit (review, 2026-11-08).
- `attributeClasses(html)` → the classes in real `class` attributes, parsed with htmlparser2 (decoded, never matched in text), each once.
- `classTokens(content)` → every candidate class a script, or text, might name. It is the union of three sets:
  - whole tokens: up to whitespace, quotes, backticks or `<>`, except inside `[…]`, where quotes and `>` are allowed (one nested group, `[&[open]]`); a trailing `:` is trimmed;
  - the value after the first `=` of an unquoted attribute;
  - the `[A-Za-z0-9_-]+` pieces PurgeCSS's default found.

  A token holding a character reference is read again decoded, with `lib/links.js` `decodeEntities`.

- `DYNAMIC_ATTRIBUTES`: the ARIA states plus `disabled`, `hidden` and `inert`. Attribute selectors on these are kept whatever value the markup holds, as PurgeCSS already does for `value`, `checked`, `selected` and `open`.
- `purgeStylesheets({ purge, root, manifest, pages, hash, minify, outputs })` → `PurgeResult[]`, one per file: `{ name, from, to, before, after }`. It:
  - reads every written page and, under `scripts`, every `.js`/`.mjs` in the build;
  - purges each file, then minifies it again when `minify` is on (a minifier failure keeps the purged text);
  - writes it under `hashedName` when the build hashes, or in place when it does not;
  - removes the old file, moves its output-registry claim, and calls `manifest.retarget(name, to)`.

  Throws for a named file the manifest does not hold.

- The `KissPurge` and `PurgeResult` typedefs.

## Depends on

`fs-extra`, `node:path`, `htmlparser2` (`Parser`, for `attributeClasses`), `purgecss` (dynamic import), `./links.js` (`decodeEntities`), `./asset-manifest.js` (`contentHash`, `hashedName`), `./asset-minify.js` (`minifyText`), `./utils.js` (`posixPath`).

## Depended on by

- `lib/build-finish.js` `purgeAssets(kiss)`, called by `Kiss._purgeAssets()` **first** in `complete()`'s settle path, before the redirects. It is latched on `_purgeRun` and reset per build in `lib/rebuild.js`. It is skipped in dev and on a failed build. It rewrites each written HTML page from `from` to `to` (`KissPage.replaceInOutput`, which re-derives that page's `hash`, `links` and `audit` from the new bytes), and logs `Purged <name>: <before> KB → <after> KB`. A throw fails the build as `<purge>`.
- `lib/config.js` `resolveConfig`, for `assets.purge`.

## Non-obvious behavior

- **Whole class tokens, and nothing the old extractor kept is lost** (issue #78, reported against 2.13.3; the fix ships in the release after it). PurgeCSS's default extractor, `/[A-Za-z0-9_-]+/g`, split `bg-ink-900/80`, `min-h-[60vh]`, `p-1.5`, `hover:bg-brand-700` and every variant into pieces that are not the class. Every such rule was removed from a site that used it: a1k9training lost its hero height and nav padding, with 25,360 computed-style differences across 20 pages. Nothing reported it, and `kiss-ssg css` overstated "Removable" (29% against a real 11%) for the same reason. `classTokens` adds the whole tokens and keeps the old pieces, so the new candidate set is a superset of the old one. An extra candidate can only keep a rule that is not needed.
- **A class in the markup cannot be lost: it reaches PurgeCSS exactly, as htmlparser2 read it.** `classTokens` stays a heuristic for scripts and text, and it still cuts some legal classes (`a>b`). Each rule a page could match is still PurgeCSS's decision, ids, tags and attributes included. **There is no guard.** A first version checked the purged CSS afterwards and failed the build when a used class lost every rule. The code review of that slice (2026-11-08) showed it was unsound in both directions:
  - it judged a selector by its classes alone, so `#sidebar .card` with no `#sidebar`, `ul.menu` with no `<ul>`, and `.btn[data-size=xl]` failed builds whose purge was right;
  - it judged by the same tokens that had missed a class, so it could never report a miss.

  The operator chose to make the failure impossible rather than detect it. The one hole left, a class a script assembles from pieces (`'modal-' + name`), was never visible to any check, which is why the safelist exists.

- **`classTokens` is linear on any input, and the shape of `WHOLE_TOKEN` is why.** A bracket group never runs past whitespace or the next `[` and holds at most one nested group, and the trailing `:` is trimmed by a loop after the match. The first version refused a trailing `:` inside the pattern and let a group run to any `]`. Measured on this branch: 50 to 53 s on 200,000 characters of `:`, of `[`, or of `a[` repeated. `/:+$/` as the trim cost 21 s on 200,000 `:` followed by a letter. A minified bundle can hold such a run. `test/unit/css-purge.test.js` times all four at 200,000 characters against a 250 ms budget.
- **A safelist entry keeps every rule that names it.** `standard` alone only exempts the matching selector part. The rest is still checked, so `safelist: ['btn']` lost `.btn[data-size=xl]` on a page with no `data-size="xl"`. `greedy` keeps a rule when any part matches (the operator's decision, 2026-11-08). A site with a safelist may keep more CSS than it did before. "Any part" is every name PurgeCSS 8.0.0 reads from a selector (`getSelectorValue`): class, id, tag, attribute and pseudo-class. So `'active'` keeps `.btn:active`, `/open/` keeps `[open]` rules and `/^nav/` keeps `nav …` rules, measured through `purgeCss` in the fourth review (2026-11-08). GUIDE says so and tells a site to anchor its patterns.
- **A selector that matches every element is kept** (`:focus-visible { … }`, `:-moz-focusring:where(…)`). PurgeCSS 8.0.0 removes one made of pseudo-classes alone (`AIKB/upstream.md`). `PSEUDO_PART` in its `standard` safelist keeps it, and leaves every other part of a selector to be checked. Found by the a1k9training clean room: with no safelist, every keyboard focus ring went (62 computed-style differences, all focus states).
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
