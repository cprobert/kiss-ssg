# Plan — 2026-09-12: Broken links, server-side redirects, a feed, and a blog exemplar

Status: in progress. Session file: `planning/sessions/2026-09-12-link-check-redirects.md`.

## The problem this solves

After "what is this site", a returning developer's next two questions are "what did I just break" and "what did I just lose". A content edit that breaks an internal link is the commonest management failure and nothing catches it today; a renamed slug silently 404s every inbound link. Both answers come from data the engine already holds: the registry of every output path and the asset manifest (for links), and the last record's page list (for removals). A feed is the third file derivable from the same registry as `sitemap.xml` and `llms.txt`. The exemplar teaches the shapes agents otherwise reinvent.

The pattern is the one set by the site-memory branch: **verdicts an agent can act on, files derived from the registry, everything else an exemplar.** None of the findings changes an exit code.

## Contract

### L — `lib/links.js`: broken internal links as a check finding

- Runs once per settled **non-dev** build, in `Kiss._finishBuild()` beside the AIKB step, after every page has been written and before the report is assembled. Dev and watch rebuilds skip it (`links: null`): a scoped re-render has not rewritten every page. Off with `config.links = false` (default `true`).
- For each written page (`stack` entries with `generate !== false` and a written file), read the HTML back from disk (the staging folder under check mode; the ordering against `_discardStaging` must be verified, not assumed — see CLAUDE.md § Rules) and extract `href`, `src` and each `srcset` URL from `a`, `link`, `script`, `img`, `source`, `video`, `audio`, `iframe`, `form[action]`. A small tolerant regex pass over attributes is enough; no HTML parser dependency.
- **Ignore:** anything with a scheme (`https:`, `mailto:`, `tel:`, `javascript:`, `data:`), protocol-relative `//`, a bare `#fragment`, and an empty value. Strip `?query` and `#fragment` before resolving.
- **Resolve** a root-relative `/x` against the build root and a relative `x` against the page's own directory, as a browser would; then accept when it is: a file that exists under the build folder; a `buildTo` in the stack; `<path>/` → `<path>/index.html`; extension-less → `<path>.html` or `<path>/index.html`; an asset manifest `source` or `target`; or the page itself. Anything else is **broken**.
- **Report:** `links: null | { checked: number, broken: [{ page, href }] }` appended after `aikb`; `page` is the `buildTo` against the real build folder, sorted by page then href. `formatReport` prints `  broken link: <page> -> <href>`. Exit code unaffected.
- **Docs:** `AIKB/links.md`, the CLAUDE.md table row, `llms.txt` (§ check and the report shape), README (§ Checking a build), `types/`. Unit tests on the pure extractor/resolver; integration through a real site with one broken and one valid of each kind; the bin prints the line.

### R — page `aliases` and `_redirects`: server-side redirects, and removals without one

- Page option `aliases: string[]` — old URL paths (`/old-slug`, `/news/2024/thing.html`) that should redirect to this page. Carried through `.page()`, `.pages()` items (a record's `aliases`) and `.scan()`.
- On a settled non-dev build with any alias present, write `<build>/_redirects` (Netlify and Cloudflare Pages format, one `/<old> <new> 301` per alias, `new` being the page's canonical path as `{{canonical}}` derives it, without the origin), sorted, byte-stable. No other format this branch; no meta-refresh. Report `redirects.file` names it, or `null` when no page has an alias.
- **Two findings.** `removed`: when the site is recorded (`isRecorded(folders.aikb)`), every `buildTo` in `AIKB/last-build.json` that is not in this build and is not covered by an alias — a page that vanished with no redirect. `collisions`: an alias equal to a live page's path. Both advisory.
- **Report:** `redirects: null | { file: string|null, aliases: number, removed: string[], collisions: string[] }` appended after `links`. `formatReport` prints `  removed without redirect: <path>` and `  alias collides with a page: <path>`.
- **Docs:** `AIKB/redirects.md` (module `lib/redirects.js`), table row, `llms.txt` (page options, § check), README, `types/`. Unit tests on the pure derivation; integration: a recorded site, a renamed page with and without an alias.

### F — `.feed()`: RSS from the registry

- `kiss.feed(options, callback?)` beside `.sitemap()` and `.llms()`: same promise-queue timing, same replay, same `overwrite`. Options: `title` (required), `description`, `section` (a top-level `path` segment to include, e.g. `'blog'`; omit for every page), `limit` (default 20), `filename` (default `feed.xml`), `dateField` (default `date`). Requires `config.siteUrl`; logs and skips without it, as the sitemap does.
- An RSS 2.0 document with an `atom:link rel="self"`; one `<item>` per page with a date (`options.date`, else the model's `date`), newest first, `link` and `guid` from the same canonical join as the sitemap, `title` and `description` as `llms.txt` derives them. Pages without a date are left out and counted. `ignoreSitemap` and `generate: false` exclude, as for `llms.txt`.
- **Report:** `feed: string|null` appended after `redirects`. Callback receives the XML text.
- **Docs:** `AIKB/feed.md` (module `lib/feed.js`), table row, `llms.txt` § API, README, `types/`. Unit tests on the pure item derivation and renderer (escaping, RFC 822 dates, byte-stable); integration through a site with dated and undated pages.

### E — example 11: a blog, and the four recipes

- `examples/11-blog.js` + `examples/11-blog/`: posts as a `models/posts/` folder fan-out with a controller file; a **paginated** index (3 per page, prev/next, `/blog/`, `/blog/page/2/`) as a controller recipe; **tag pages** built from the posts' tags as a second fan-out; `.feed({ section: 'blog', title })`; one post renamed with an `aliases` entry so `_redirects` is written; `.sitemap()`. Clean by default. `--broken` adds one bad link to one post so the finding is visible in a run, the way example 8's `--atomic` shows atomic behaviour.
- Recorded (`node ../bin/kiss-ssg.js aikb 11-blog.js`) with `folders.aikb: './11-blog/AIKB'`, with an authored, stamped note for the posts controller and one for the tags controller — the "site brief on a real recipe" the operator asked for.
- README for the example (what each recipe is, what to copy), `examples/README.md`, `npm run eg11`, the examples integration test (page count, `_redirects` present, `feed.xml` present, `links.broken` empty by default and exactly one under `--broken`), README/llms.txt example counts (eleven).

## Non-goals

- No meta-refresh redirects, no `.htaccess`, `vercel.json` or nginx output (the operator chose `_redirects` only).
- No external link checking (no network at build time beyond URL models).
- No HTML parser dependency, no image processing, no schema language for models.
- No exit-code change for any finding; the `kiss-branch-close` skill is what treats them as stops.

## Delegation and sequencing

Fable briefs, reviews every diff, commits; agents implement and never commit. **Before any workstream starts, a fresh-context agent reads this contract adversarially** — the lesson from the site-memory branch — and its findings amend the contract in place. Then L and F run concurrently (disjoint regions of `lib/kiss.js`; report keys in the fixed order `links`, `redirects`, `feed`), R after L lands (both read the written pages and the stack), E after all three. README is Fable's.

## Success criteria (mirrored in the session file)

- [ ] L — every kind of internal reference resolved or reported; check mode included; dev skipped; `config.links = false` honoured; the summary line prints.
- [ ] R — `_redirects` byte-stable from `aliases`; a recorded site reports pages removed without one; a colliding alias reported.
- [ ] F — `feed.xml` from the registry, newest first, valid RSS 2.0, byte-stable, same URLs as the sitemap.
- [ ] E — example 11 builds clean with eleven-example counts updated; `--broken` shows exactly one finding; the recorded `AIKB/` with two stamped notes is committed; the four recipes have READMEs.
- [ ] Every new `lib/` module has a unit test and AIKB doc; `llms.txt`, `README.md`, `CLAUDE.md`, `types/` updated; gates green.

## Amendment — 2026-09-12: after the adversarial read

A fresh-context agent read the contract against the code before anything was built (`planning/reviews/2026-09-12-link-check-contract-critique.md`). Nine blockers. The contract above stands except where this section overrides it.

**Timing (findings 1, 2, 20).** `complete()` discards the staging folder _before_ `_finishBuild()` in check mode and on a failed build, and promotes before it on an atomic success — so a scan that reads pages back from disk in `_finishBuild()` reads nothing under `kiss-ssg check`. Two changes:

- **References are extracted at write time.** `KissPage.generate()` runs the extractor over `minifiedHtml` beside the `hash` assignment and parks the result on `page.links` (raw reference strings, deduped; a few hundred bytes, never the HTML). `null` until a write succeeds, like `hash`. "A written page" means `page.hash !== null`, not `generate !== false`.
- **Resolution runs before the folder moves.** A new `Kiss._checkLinks()` is called in `complete()`'s settle path _before_ `_discardStaging()` and before `_promote()`, in every branch, while the written files are still on disk (staging or real). It resolves each reference against: the file system under the current build folder (which is where `feed.xml`, `sitemap.xml`, `llms.txt`, `_redirects` and anything a pipeline step wrote already are), the stack's `buildTo`s, `<path>/` → `<path>/index.html`, extension-less `<path>` → `<path>.html` or `<path>/index.html`, and the asset manifest's **targets only** (finding 8: under `assets.hash` a hardcoded `/css/site.css` is genuinely broken). The result is latched on `_links` and mapped through `reportedPath` into the report by `_finishBuild()`. `_redirects` is written on the promise queue like `sitemap.xml`, before any promotion, recording `_redirectsPath`; the `removed`/`collisions` findings stay pure in `_finishBuild()`.

**What counts as internal (finding 7).** A reference whose origin equals `config.siteUrl`'s is internal: strip the origin, then apply the rules. `{{canonical}}` and `{{absUrl}}` emit absolute URLs on every page, so ignoring every scheme would miss exactly the slug rename this exists to catch. `srcset` candidates split on `,` and drop the `2x`/`640w` descriptor. The accepted shapes the site's own helpers emit — `{{asset}}` without a leading slash, `?v=` under `version`, `css/site.<hash>.css` under `hash`, `{{root}}{{asset}}` → `../css/site.css` — are the unit-test fixture list.

**Alias target (finding 3).** `toAbsoluteUrl('', toCanonicalPath(rel))`, not `toCanonicalPath` alone: the `index` collapse lives in `toAbsoluteUrl`. Home → `/`, a directory index → `/courses/`, a file page → `/about`. On Netlify and Cloudflare Pages a non-forced rule is silently ignored when a real file exists at its source; that is what `collisions` reports.

**Aliases on a fan-out (finding 4).** `aliases` is **not** inherited from a `.pages()` registration onto every item; the per-item source is the record's `aliases`, promoted where `slug` and `model` are. The reader reads `entry.page.options.aliases`. `aliases` is an ordinary page option and therefore reaches the render context and the dev `.json` sibling — accepted and documented (a template may legitimately show "formerly at …").

**`removed` (findings 9, 10).** Compare build-relative paths, paired on `buildDir`, by reusing `diffReports` against `AIKB/last-build.json` and filtering out removed paths covered by an alias — one comparison, not two that could disagree. Gate on `last-build.json` existing (not `isRecorded`, which flips inside `_finishBuild()`); missing or malformed → `removed: []`. Both lists sorted.

**Feed (findings 11, 13).** `dateField` is the one field (default `'date'`): `options[dateField] ?? options.model?.[dateField]`, guarded for `null` and array models; accepts a `Date`, epoch milliseconds or a `new Date()`-parsable string; invalid → undated, counted, one `warn`, never a throw. Dates emit as `toUTCString()`. `<lastBuildDate>` is the newest item's date, never the wall clock, so the file is byte-stable. Replay wiring is listed: `_feedRequest`, `_feedPath`, the `_replay()` reset and the re-issue beside `llms`. `report().feed` goes through `reportedPath`.

**Config key (finding 12).** `links: { check: true }` in `DEFAULT_CONFIG`, a one-level-merged block like `assets` and `fetch`, so a future ignore list is not a breaking rename. The `llms.txt` § Config block and the README default-config block must gain it in the same commit (`test/aikb.test.js` deep-compares them).

**Report (findings 5, 6, 15).** Three keys appended in the fixed order `links`, `redirects`, `feed`; every path in them through `reportedPath`; the tests that pin `aikb` as the last key or enumerate the key list are rewritten relative (the `llms.test.js` pattern); `lastBuildRecord` carries the new keys, so example 9 is re-recorded and committed on this branch.

**Sequencing (finding 14).** A **Beat 0**, landed by Fable before L and F start, owns the whole shared seam: `DEFAULT_CONFIG.links` and its typedef, the three report keys as `null` with typedefs and `formatReport`'s three new lines, the `Kiss` field declarations and `_replay()` resets, the rewritten key-order tests, `npm run types`, the config blocks in `llms.txt` and README, the report key list in `llms.txt`/README, example 9 re-recorded. After Beat 0: L owns `lib/links.js`, `lib/kiss-page.js`'s extraction line, `Kiss._checkLinks()` and its call sites, `AIKB/links.md`, its tests; F owns `lib/feed.js`, `Kiss.feed()`, the re-issue line, `AIKB/feed.md`, its tests; R owns `lib/redirects.js`, the alias promotion in `_prepareMultiplePages`, the queue write, the findings, `AIKB/redirects.md`, its tests. None of the three touches `lib/build-report.js`, `lib/config.js`, `types/`, `llms.txt`, `README.md` or `CLAUDE.md` except its own table row and `llms.txt` prose section; Fable regenerates `types/` at each landing.

**Docs the contract forgot (findings 16–19).** `.prettierignore` gains `examples/11-blog/AIKB/*.json`; `plugins/kiss-ssg/skills/kiss-build-check/SKILL.md`'s findings table and `plugins/kiss-memory/skills/kiss-branch-close/SKILL.md`'s gate gain the three new lines; `llms.txt`'s `--summary` line list gains them; the examples list in `llms.txt` already omits example 10 (a pre-existing corpse) and gains 10 and 11; README's "ten runnable sites" becomes eleven; every new `AIKB/*.md` carries the five headings in order and `llms.txt` contains the literal `.feed(`.
