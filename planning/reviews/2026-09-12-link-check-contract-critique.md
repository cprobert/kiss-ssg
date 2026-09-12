# Adversarial read — `planning/plans/2026-09-12-link-check-redirects.md`

Verdict up front: **the contract is not buildable as written.** Findings 1, 2, 6, 11, 14 and 20 are blockers; each has a code line that decides it. Everything else is a should-fix or a note.

---

## 1. BLOCKER — In check mode the pages are already deleted when `_finishBuild()` runs

**Evidence.** `lib/kiss.js:1338-1339` (check) and `lib/kiss.js:1317-1318` (any failed build):

```js
await this._discardStaging() // fs.remove(this._stagingDir)  — lib/kiss.js:816-822
await this._finishBuild()
```

and `lib/kiss.js:1344-1345` (atomic success): `_promote()` **then** `_finishBuild()`.

So at the moment `_finishBuild()` runs:

| Case                                       | Files on disk? | Where                                                                                 |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------- |
| (a) plain build (`cleanBuild: true/false`) | yes            | `entry.buildTo`, never staged                                                         |
| (b) `'atomic'` after promotion             | yes            | `_promote()` rewrote every `entry.buildTo` to the real folder (`lib/kiss.js:693-696`) |
| (c) **check mode (`KISS_CHECK`)**          | **no**         | `_discardStaging()` removed the whole staging tree one line earlier                   |
| (d) any failed atomic build                | **no**         | same                                                                                  |

Case (c) is the primary use case named in the contract ("check mode included", success criterion L). As written, L reads zero pages and reports `checked: 0, broken: []` under exactly the command it exists to serve — silently, because `fs.readFile` failures would be swallowed as "no HTML".

**Amendment (recommended: extract at write time, not read time).** Do not read HTML back from disk at all. In `KissPage.generate()`, immediately after the successful write and beside the `hash` assignment (`lib/kiss-page.js:236-237`), run the attribute extractor over `minifiedHtml` and park the result on the page:

```js
this.hash = createHash('sha1').update(minifiedHtml).digest('hex')
this.links = extractLinks(minifiedHtml) // string[] — refs only, not the HTML
```

Rationale, all code-backed:

- It works identically in all four cases above — no ordering dependency on `_discardStaging`/`_promote` at all.
- It follows the precedent the repo already set for exactly this problem: `hash` is documented as "the identity of the output… `null` until a write succeeds" (`lib/kiss-page.js:76-83`), and `BuildPage.hash` is read back from `entry.page?.hash` in `lib/build-report.js:166`. `links` is the same shape of state.
- It is cheap: a few hundred bytes per page, versus ~15 MB of retained HTML for a 500-page site if the whole document is kept.
- `generate: false` and failed pages contribute nothing for free (`lib/kiss-page.js:174` gates the whole block; the failure path rethrows before the write).

Then `_finishBuild()` only _resolves_ the refs. **But the accept-set still needs a file listing** ("a file that exists under the build folder"), and that listing has the same problem in case (c). Two options, pick one in the contract:

- **(i)** Build the accept-set from data only — the stack's `buildTo`s plus the asset manifest values plus `_sitemapPath`/`_llmsPath`/`_feedPath` — and drop "a file that exists under the build folder". This is fully staging-independent but misses files a pipeline step wrote straight into the build (`AIKB/kiss.md` "A pipeline step … writes wherever the site tells it to").
- **(ii)** Snapshot `fs.readdir(config.folders.build, { recursive: true })` **once**, at the top of `complete()`'s `.then()` — _before_ the promote/discard branch at `lib/kiss.js:1316` — and pass it into `_finishBuild()`. Latch it on an instance field the same way `_report` is latched (`lib/kiss.js:706`), or the nested-`complete()` pattern runs it twice.

Also: **`generate !== false` is not the right test for "a written file".** `KissPage.prepare()` defaults `generate: true` (`lib/kiss-page.js:152-160`) but a page can also fail to render, and `_rebuild()` can skip a target. Use `entry.page.hash !== null`, which is exactly the "these bytes are on disk" promise `lib/kiss-page.js:76-83` documents.

**Contract text to replace** (§L bullet 2): strike "read the HTML back from disk (the staging folder under check mode; the ordering against `_discardStaging` must be verified…)" and substitute the write-time extraction above plus whichever accept-set option is chosen.

---

## 2. BLOCKER — R writes `_redirects` at a point where the build folder may not exist, and where writing it breaks atomicity

Same evidence as finding 1. §R says "On a settled non-dev build with any alias present, write `<build>/_redirects`" — i.e. `_finishBuild()` timing. Consequences:

- **Check mode**: `fs.outputFile` creates parent directories, so it would _resurrect_ the staging folder `_discardStaging()` just removed. `_discardStaging()` deliberately keeps `_stagingDir` set for exactly this case (`lib/kiss.js:812-815` comment), so `close()` would remove it — but a check that never calls `close()` leaves a stray `<build>.kiss-staging-<pid>-<rand>` beside published output, which `_sweepStaleSiblings()` only cleans on the _next_ construction.
- **Atomic success**: `_promote()` has already pointed `config.folders.build` at the real target (`lib/kiss.js:690`), so `_redirects` lands in the promoted folder _after_ the swap. That violates the documented property "the whole folder appears at once" (`AIKB/kiss.md`, promotion bullet) — there is a window where the site is live without its redirects.

**Amendment.** Write `_redirects` on the promise queue exactly as `.sitemap()` does (`lib/kiss.js:1379-1400`): a `Promise.all(this._promises).then(...)` pushed onto `_generating`, recording `this._redirectsPath = ${config.folders.build}/_redirects`. Then it is inside staging before the swap, absent (correctly) in check mode, and drained by `_settle()`. The `removed`/`collisions` findings are pure data and can stay in `_finishBuild()`.

One knock-on: with the redirects writer on the queue, `.feed()` and it must both be re-issued on replay — see finding 13.

---

## 3. BLOCKER — the canonical path for an alias target is not `toCanonicalPath()`

§R: "`new` being the page's canonical path as `{{canonical}}` derives it, without the origin".

**Evidence.** `{{canonical}}` is `toAbsoluteUrl(siteUrl, toCanonicalPath(pageURL))` (`lib/handlebars-helpers.js:130`). The trailing-slash and `index`-collapsing happen in **`toAbsoluteUrl`**, not in `toCanonicalPath`:

- `toCanonicalPath` (`lib/utils.js:159-164`) only strips the last segment's extension. Its own JSDoc says "every other character, `index` segment and slash left alone".
- `toAbsoluteUrl` (`lib/utils.js:140-147`) is what does `.replace(/(^|\/)index(\.[^./]*)?$/, '$1')` and returns `${base}/` for an empty relative.

So, for `buildDir = './public'`:

| Page                                                  | `buildTo`                     | `toCanonicalPath(rel)` | what `{{canonical}}` shows, origin stripped |
| ----------------------------------------------------- | ----------------------------- | ---------------------- | ------------------------------------------- |
| file page                                             | `./public/about.html`         | `/about`               | `/about` ✅ same                            |
| directory index (`extensionLess`, or `path: courses`) | `./public/courses/index.html` | `/courses/index` ❌    | `/courses/`                                 |
| home page                                             | `./public/index.html`         | `/index` ❌            | `/`                                         |

A naive implementation writes `/old /courses/index 301` and `/old /index 301`. Both 404 (or 301-chain) on Netlify and Cloudflare Pages.

**Amendment.** State the exact derivation in the contract: `toAbsoluteUrl('', toCanonicalPath(entry.buildTo.slice(buildDir.length)))`. With `siteUrl = ''`, `base` is `''` and the function returns `/courses/`, `/about` and `/` respectively — the origin-less canonical path, from the one join the repo already guarantees agrees with `sitemap.xml` (`lib/sitemap.js:20-22`) and `llms.txt` (`lib/llms.js:126`). Do **not** write a fourth copy of this arithmetic.

Netlify/Cloudflare Pages correctness of `/old /courses/ 301`: fine — both accept a trailing-slash target. Note in the contract that on both hosts a **non-forced** rule is skipped when a real file exists at the source path, which is precisely why `collisions` matters; the finding text should say the rule will be _silently ignored_, not merely that it "collides".

---

## 4. BLOCKER — `aliases` on a `.pages()` call is broadcast to every fanned-out page

**Evidence.** `_prepareMultiplePages` builds each item's options as `{ ...options, config: {...}, slug, model }` (`lib/kiss.js:897-903`). Every own key of the `.pages()` options — `aliases` included — is copied onto **all N** pages. The contract says "`.pages()` items (a record's `aliases`)", i.e. the alias is meant to come from the _model item_, but nothing in the code reads `model.aliases`.

Result as written: `.pages({ view, model, aliases: ['/old'] })` emits N `_redirects` lines all with source `/old` and N different targets — a non-deterministic redirect and a `_redirects` file that is not byte-stable if stack order ever shifts.

**Amendment.** §R must state both halves explicitly:

1. In `_prepareMultiplePages`, `aliases` is **not** inherited from the registration onto items (delete it from the per-item spread, like the plan already does for `slug`/`model`).
2. The per-item source is `model.aliases` — promoted onto `pageOptions` at `lib/kiss.js:897`, the same place the "one options object per item" rule is already enforced and commented.
3. Say where the reader looks at settle time: `entry.page.options.aliases`.

Note, non-blocking: `aliases` as a page option **will** reach the render context and the dev-mode `.json` sibling, because `template(this.options, …)` (`lib/kiss-page.js:184`). That is the documented behaviour of page options and is fine — but it is the exact reason `origin` was kept _off_ options (`lib/kiss.js:864-869`). Record the decision rather than leaving it to be rediscovered.

---

## 5. BLOCKER — `test/integration/aikb.test.js:141` asserts `aikb` is the last report key

```js
expect(Object.keys(report).at(-1)).toBe('aikb')
```

This fails the moment `links` is appended. Three more places assert the report's key order or the derived record's:

- `test/unit/build-report.test.js:27-39` — exact eleven-key list.
- `test/unit/aikb.test.js:803-816` — `lastBuildRecord` ten-key list.
- `test/integration/llms.test.js:118-121` — deliberately _relative_ (`keys.indexOf('llms') === keys.indexOf('pipeline') + 1`) and survives; its comment already explains why relative assertions are the right pattern.

**Amendment.** Add to §L's Docs bullet: "rewrite `test/integration/aikb.test.js:141` as a relative assertion in the `llms.test.js:119` style (`keys.indexOf('aikb') === keys.indexOf('llms') + 1`), update the two exact key lists, and never assert `at(-1)` on the report again."

Also: `lastBuildRecord` is `{ ...report }` minus `duration` (`lib/aikb.js:897-909`), so all three new keys land in every site's committed `last-build.json` automatically — see finding 15.

---

## 6. BLOCKER — `redirects.file` and `feed` must go through `reportedPath()`, and there is a standing test that proves it

**Evidence.** `test/integration/examples.test.js:238-240`:

```js
expect(readAikb('last-build.json')).not.toContain('kiss-staging')
```

Every path in the report is mapped by `real()` = `reportedPath(target, buildDir, stagingDir)` (`lib/build-report.js:152, 179-180, 190`) precisely so this holds. `_sitemapPath`/`_llmsPath` are recorded as _staging_ strings (`lib/kiss.js:1393, 1436`) and mapped at assembly. The contract says nothing about this for `redirects.file` or `feed`.

**Amendment.** §R and §F: "`redirects.file` and `feed` are recorded as the path written (a staging path under `'atomic'`/check) and passed through `reportedPath` in `buildReport`, like `sitemap` and `llms`." Same for `links[].page`, which §L already gets right ("against the real build folder") but should name the function.

---

## 7. SHOULD-FIX — the resolver's "ignore anything with a scheme" rule is a false negative on this engine's own helpers

**Evidence of what kiss actually emits:**

| Helper                             | Emitted shape                                                                                                                                                                                                  | Code                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `{{canonical}}`                    | `https://site.example/courses/` (absolute, always)                                                                                                                                                             | `lib/handlebars-helpers.js:130`                      |
| `{{absUrl 'x'}}` / `{{absUrl}}`    | absolute, unless the argument already matches `/^[a-z][a-z0-9+.-]*:\/\//i` (passed through)                                                                                                                    | `lib/handlebars-helpers.js:143, 156, 163-167`        |
| `{{asset 'css/site.css'}}`         | `css/site.css` — **no leading slash**, template owns the base                                                                                                                                                  | `lib/handlebars-helpers.js:205-207`                  |
| `{{asset}}` under `assets.version` | `css/site.css?v=1.4.5` as a **SafeString**                                                                                                                                                                     | `lib/handlebars-helpers.js:210-216`                  |
| `{{asset}}` under `assets.hash`    | `css/site.a1b2c3d4.css`                                                                                                                                                                                        | same, via `hashedName` `lib/asset-manifest.js:26-30` |
| `{{root}}{{asset …}}`              | `../css/site.css` — the documented idiom (`README.md:240`), real in `examples/_shared/layouts/layout.hbs:16` and visible in built output (`public/9-migrated-from-v1/shelf/*.html` → `href="../css/site.css"`) |

So a kiss layout routinely emits `<link rel="canonical" href="https://site.example/courses/">` (`examples/_shared/layouts/layout.hbs:9`), which the contract skips. An absolute URL whose origin is the site's own `config.siteUrl` is an **internal** link and is exactly where a slug rename silently breaks: `{{absUrl 'old-slug.html'}}` in a nav or an OG tag keeps pointing at a page that no longer exists, and the contract as written never looks.

**Amendment (§L, "Ignore" bullet).** Before the scheme test: "when `config.siteUrl` is set and the URL starts with it (origin-compared, trailing slash tolerated), strip the origin and resolve the remainder as a root-relative path; only then ignore anything else carrying a scheme." Add the origin-match to the unit tests for the pure resolver.

**Amendment (§L, "Resolve/accept" bullet).** Spell out the shapes that must pass, all of them generated by code above:

- `/` and `` (empty after stripping `?`/`#`) → `index.html`
- `<path>/` → `<path>/index.html` (covers `{{canonical}}` of a directory index, and `extensionLess`)
- `<path>` with no extension → `<path>.html` **or** `<path>/index.html`
- `css/site.a1b2c3d4.css` (hashed manifest value)
- `css/site.css?v=1.4.5` (query stripped first)
- `../css/site.css`, `shelf/x.html`, `#main` (bare fragment → ignore)
- `srcset`: split on `,`, take the first whitespace-delimited token of each candidate, discard the `2x`/`640w` descriptor — the contract's "each `srcset` URL" does not say this and a naive split yields `img.jpg 2x` as a URL.

---

## 8. SHOULD-FIX — "an asset manifest `source` **or** `target`" makes the checker miss the one asset bug it should catch

**Evidence.** `manifest.record(name, emittedName)` keys by "the path a template writes" and stores the emitted name as the value (`lib/assets.js:70-80`, `lib/asset-manifest.js:38-45`). `{{asset}}` returns the **value** (`lib/handlebars-helpers.js:210`). `BuildAsset` is `{ source, target }` = key, value (`lib/build-report.js:19-23, 183-187`). With `assets.hash` off, key === value; with it on, they differ.

So under `assets.hash`, the only string that can legitimately appear in rendered HTML is the **target**. A template that hardcodes `href="/css/site.css"` instead of using `{{asset}}` is genuinely broken — the file on disk is `css/site.a1b2c3d4.css`, because `recordEmitted` **moves** it (`lib/assets.js:77`). Accepting `source` makes that link pass.

**Amendment.** §L: "accept an asset manifest **target**; a `source` that is not also a target is _broken_ under `assets.hash` and is the finding" (and identical under no policy, where source === target, so nothing is lost).

**Does the manifest exist when `folders.assets` is `null`?** Yes — `_assetManifest` is created unconditionally in the constructor and is instance state that survives a replay (`AIKB/kiss.md`, asset-manifest bullet). But `copyAssets` returns early on a falsy `sourceDir` (`lib/assets.js:91`), so the manifest is **empty** and nothing was copied. The resolver must handle an empty manifest as "no assets", not as an error — and this is the common case for `examples/7-versioned-outputs.js`-shaped sites, which set `folders.assets: null` deliberately (`llms.txt:74`).

---

## 9. SHOULD-FIX — the `removed` finding's strings are only comparable when the cwd and the `folders.build` string are identical

**Evidence.** `buildTo` is `${this.buildDir}/${this.pageURL()}` (`lib/kiss-page.js:136-138`) where `buildDir` is verbatim `config.folders.build`. The committed record proves the form:

```json
"buildDir": "../public/9-migrated-from-v1",
"buildTo": "../public/9-migrated-from-v1/index.html"
```

(`examples/9-migrated-from-v1/AIKB/last-build.json`, recorded from `examples/` — `package.json` scripts are `cd examples && node 9-migrated-from-v1`.)

Consequences:

- Same cwd, same config string → comparable, and the real-folder mapping is already handled because both sides went through `reportedPath` (`lib/build-report.js:98-105`).
- **Different cwd** (e.g. `npx kiss-ssg check examples/9-migrated-from-v1.js` from the repo root) → `buildDir` is `public/9-migrated-from-v1`, every `buildTo` differs, and every page in the record reads as "removed without redirect". A dozen false findings on a site nobody touched.

`diffReports` already has this exposure and guards it by pairing on `buildDir` and ignoring an unpaired `before` report (`lib/check.js:283-287, 303`). The `removed` finding must guard the same way, or better.

**Amendment.** §R: "`removed` compares **build-relative** paths — `buildTo.slice(buildDir.length)` on both sides — and is skipped entirely (reported `[]`, with one `notice`) when `report.buildDir !== record.buildDir`, the same pairing rule `diffReports` uses."

Related, also worth saying in the contract: **`removed` substantially duplicates `diffReports(...).removed`** (`lib/check.js:301`), which `kiss-ssg check` already prints by default against `last-build.json` (`lib/check.js:186-200` `defaultBaseline`). The new value is only "…and is not covered by an alias". Consider expressing it that way — as the alias-filtered subset — rather than as a second, independently-implemented comparison that can disagree with the `-` lines printed three lines above it in the same `--summary` output.

---

## 10. SHOULD-FIX — `isRecorded()` flips to `true` _inside_ `_finishBuild()`, so it is the wrong gate for `removed`

**Evidence.** `_finishBuild()` calls `_buildAikb()` first (`lib/kiss.js:710`), which calls `writeAikb` → `fs.outputJson('<dir>/site-map.json', …)` (`lib/aikb.js:880`). `isRecorded(folder)` is defined as exactly "`<folder>/site-map.json` is there" (`lib/aikb.js:125-128`). `last-build.json` is written **after** the report (`lib/kiss.js:760-765`).

So on the very first `npx kiss-ssg aikb <script>` for a site: `isRecorded()` is false before `_buildAikb()` and true after it, while `last-build.json` does not exist yet in either case.

**Amendment.** §R: gate on the existence of `<folders.aikb>/last-build.json` itself (and treat an unreadable/malformed one as "no baseline", `removed: []`, one `debug` line) — not on `isRecorded()`, and never after `_buildAikb()` has run.

---

## 11. BLOCKER — `options.date` is reachable, but only if §F says where, and `dateField` contradicts the prose

**Evidence.** `.llms()` reads `entry.page.options.title` / `.description` (`lib/llms.js:120-137`) — so any page option is reachable at settle time. `options.model` **is** the resolved data by then (`lib/kiss.js:1006`, and `AIKB/kiss.md` says so explicitly), so `options.model.date` is reachable too — for a `.pages()` fan-out it is the individual item (`lib/kiss.js:902`). Nothing in `lib/` currently reads a `date` key (verified: `grep -n "\.date\b" lib/*.js` → no hits), so there is no collision.

But the contract contradicts itself: the Options list defines `dateField` (default `'date'`) and the next bullet hardcodes "`options.date`, else the model's `date`".

**Amendment (§F).** "The date is `page.options[dateField] ?? page.options.model?.[dateField]`, with `model` guarded for `null` (a page with no model) and for an array (a non-`dynamic` page given an array model). `dateField` governs both lookups."

**Accepted formats and invalid handling — the contract says nothing and must.** Proposal:

- Accept a `Date`, a finite number (epoch ms), or a string `new Date(v)` parses. JSON models can only carry the last two.
- `Number.isNaN(d.getTime())` → the page is treated as **undated**: left out and counted in the same bucket as a page with no date at all, plus one `logger.warn` naming the page and the value. Never throw — a feed is not the render error channel, and §F already promises "Pages without a date are left out and counted".
- Emit RFC 822 with `d.toUTCString()` — locale-independent and byte-identical across machines, which is what the "byte-stable" success criterion needs. `toLocaleString`/manual month tables are not.
- **Byte-stability requires omitting `<lastBuildDate>` and any `new Date()` in the channel**, or deriving it from the newest item's date. The contract's criterion "byte-stable" is unachievable with a wall-clock channel date; say so. (`lib/sitemap.js:5` deliberately injects `now` as a parameter for exactly this reason — follow that pattern and make it injectable for the unit test.)

---

## 12. SHOULD-FIX — `config.links = false` needs a `DEFAULT_CONFIG` entry, and that trips a documentation-equality gate

**Collision check:** none. `KissConfig` carries `Record<string, any>` (`lib/config.js:88`), so `links` is legal as an arbitrary key and reaches views as `{{config.links}}`. `folders` is the closed one, and `links` is not a folder.

**But**: `resolveConfig` gives unknown keys no default (`lib/config.js:307-324`), so `config.links` would be `undefined` unless it is added to `DEFAULT_CONFIG` (`lib/config.js:160-172`). And the moment it is added, this gate fires:

```js
// test/aikb.test.js:95-106
const documented = extractDefaultsBlock(llmsTxt, '## Config')
expect(documented).toEqual(resolveConfig({}))
// …and the same for README.md's 'The default config options are:' block
```

**Amendment.** Add to §L's Docs bullet, explicitly: "`DEFAULT_CONFIG` gains the key; the `llms.txt` § Config block **and** the `README.md` default-config block must both be updated in the same commit or `test/aikb.test.js` fails; `KissSettings` gains a `@property` and `types/` is regenerated."

**Boolean vs nested block.** The repo's own convention is legible: a scalar knob is top-level (`dev`, `verbose`, `cleanBuild`, `extensionLess`, `siteUrl`), and anything with more than one knob gets a one-level-deep merged block (`sass`, `fetch`, `assets`, `markdown` — `lib/config.js:307-324`). A link checker will want a second knob within one branch (an ignore list for host-generated paths — `/_worker.js`, `/cdn-cgi/*` — is the first thing a real deploy needs). Recommend `links: { check: true }` with a frozen `DEFAULT_LINKS` merged like the other four; a boolean is defensible only if the contract also states that any future knob is a breaking rename. Either way the contract should make the choice deliberately instead of by omission.

---

## 13. SHOULD-FIX — `.feed()` (and the redirects writer) need replay wiring the contract does not list

**Evidence.** `.sitemap()` and `.llms()` each record a request object and are re-issued by `_replay()`:

- fields declared at `lib/kiss.js:256` (`_sitemapRequest`), `:258` (`_llmsRequest`), `:300` (`_sitemapPath`), `:303` (`_llmsPath`)
- reset in `_replay()` at `lib/kiss.js:1503-1509` (`_report`, `_sitemapPath`, `_llmsPath`, `_startedAt`, `_pipelineResults`)
- re-issued at `lib/kiss.js:1564-1572`

§F says "same replay" but names none of these. **Amendment:** enumerate `_feedRequest` (idempotent, re-recorded by the replay's own call), `_feedPath` (reset in `_replay()` beside `_llmsPath`), and the re-issue immediately after `_llmsRequest` at `lib/kiss.js:1570`. Same for `_redirectsPath` if finding 2 is taken.

---

## 14. BLOCKER — L and F are **not** disjoint regions of `lib/kiss.js`, and both must regenerate `types/`

The contract asserts "disjoint regions of `lib/kiss.js`; report keys in the fixed order". They collide in at least seven places:

| Seam                                                                                                   | Line                                          | L                 | F                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------- | --------------------------- |
| private field block                                                                                    | `lib/kiss.js:256-310`                         | —                 | `_feedRequest`, `_feedPath` |
| `_finishBuild`'s `buildReport({…})` call                                                               | `lib/kiss.js:711-730`                         | `links:`          | `feed:`                     |
| `_replay()` reset list                                                                                 | `lib/kiss.js:1503-1509`                       | —                 | `_feedPath`                 |
| `_replay()` re-issue block                                                                             | `lib/kiss.js:1564-1572`                       | —                 | `_feedRequest`              |
| `buildReport` signature + return literal + `BuildReport` typedef                                       | `lib/build-report.js:61-79, 133-150, 156-200` | both              | both                        |
| `formatReport` return array                                                                            | `lib/build-report.js:225-235`                 | broken-link lines | (R's two lines)             |
| `test/unit/build-report.test.js:27`, `test/unit/aikb.test.js:804`, `test/integration/aikb.test.js:141` |                                               | both              | both                        |

And `types/` is checked in and byte-compared (`test/unit/types.test.js`, `AIKB/kiss.md` § Types), so both workstreams regenerate `types/kiss.d.ts` and `types/build-report.d.ts` — a guaranteed conflict on generated files, which is precisely the "a diff that is mostly generated files" case CLAUDE.md § Rules says to surface before the step that depends on it.

**Amendment — replace the sequencing paragraph with an explicit region map:**

> **Beat 0 (Fable, one commit, before any workstream).** Land the shared seam: `BuildReport` gains `links`, `redirects`, `feed` (all typed, all `null`); `buildReport` gains the three inputs and the three keys in that order; `DEFAULT_CONFIG.links`; the `KissSettings` property; `_feedRequest`/`_feedPath`/`_redirectsPath` field declarations and their `_replay()` resets; the three key-order tests rewritten (relative, `llms.test.js:119` style); `npm run types`; the `llms.txt`/`README.md` config blocks. Green at this point, with all three keys `null`.
>
> **Then, concurrently.** L owns `lib/links.js`, `AIKB/links.md`, `test/unit/links.test.js`, and `Kiss._checkLinks()` + the one `links:` argument. F owns `lib/feed.js`, `AIKB/feed.md`, `test/unit/feed.test.js`, `Kiss.feed()` (inserted after `llms()`, `lib/kiss.js:1440`) + the one `feed:` argument and the one `_replay()` re-issue line. **Neither touches `lib/build-report.js`, `lib/config.js`, `types/`, `llms.txt`, `README.md` or `CLAUDE.md` again.** R then owns `lib/redirects.js` and the queued writer. Fable re-runs `npm run types` once after all three.

---

## 15. SHOULD-FIX — the three new keys land in every committed `last-build.json`, including the shipped exemplar

**Evidence.** `lastBuildRecord` is `{ ...report }` with `duration` deleted (`lib/aikb.js:897-909`). So `links`, `redirects` and `feed` propagate into `AIKB/last-build.json` for free — including `examples/9-migrated-from-v1/AIKB/last-build.json`, which is **committed** and byte-compared by `test/integration/examples.test.js:225-237`.

Two consequences the contract does not mention:

1. Example 9 must be **re-recorded** (`cd examples && node ../bin/kiss-ssg.js aikb 9-migrated-from-v1.js`) and the result committed in the same branch, or the working tree is dirty at `/branch-close`. That is not in §E's scope as written.
2. Byte-stability across two records must hold for the new keys. `links.broken` is sorted (✅ §L says so). `redirects.removed`/`collisions` must be sorted (§R says "Both advisory" but never says sorted — **say sorted**). `redirects.file`/`feed` are paths (stable once finding 6 is applied). `links.checked` is a count (stable). `removed` is stable only if finding 10's baseline rule is deterministic.

---

## 16. SHOULD-FIX — example 11's recorded AIKB needs a `.prettierignore` entry, or `npm run gates` fails

**Evidence.** `.prettierignore` carries an explicit, per-path entry with a seven-line comment explaining why:

```
# Written by `npx kiss-ssg aikb 9-migrated-from-v1.js` and committed as the
# exemplar. `JSON.stringify(map, null, 2)` puts one value per line where
# prettier would fill a short array onto one…
examples/9-migrated-from-v1/AIKB/*.json
```

§E commits `examples/11-blog/AIKB/` with `site-map.json` and `last-build.json`. Without `examples/11-blog/AIKB/*.json` added to `.prettierignore`, `npm run format:check` (a gate, and the pre-commit hook) fails. The generated `site-map.md` and `README.md` are _not_ ignored and **must** come out prettier-clean, exactly as example 9's do.

**Amendment.** Add both to §E: the `.prettierignore` line, and "the generated `AIKB/site-map.md` must be prettier-clean as emitted".

---

## 17. SHOULD-FIX — the plugin skills are part of the contract's own non-goal and are in nobody's Docs list

**Evidence.**

- `plugins/kiss-ssg/skills/kiss-build-check/SKILL.md:46-60` is the document that enumerates what a check reports beyond `ok` — the four `aikb.notes` lines, in a table, closing with "**Neither changes the exit code.** … exit 0 with `ok: true` on every report is still the only passing result."
- `plugins/kiss-memory/skills/kiss-branch-close/SKILL.md:41, 49-62` is the gate that turns advisory findings into stops.

The contract's Non-goals say "the `kiss-branch-close` skill is what treats them as stops" — asserting a change to a file no workstream owns. Neither skill appears in any Docs bullet.

**Amendment.** Add to §R (or to a Fable-owned docs beat): rows for `links.broken`, `redirects.removed`, `redirects.collisions` in the `kiss-build-check` findings table, and a sub-bullet in `kiss-branch-close` step "Verify" saying which of the three are stops. Also `llms.txt:213` documents the `--summary` output line-by-line ("plus a line per failure, then — for a site with a knowledge base — the four note findings, one line each…") and must gain the new lines.

---

## 18. NOTE — example counts: three places, and one is already stale

- `README.md:37` "ten runnable sites" → eleven.
- `README.md:194` "Examples 1–6 and 10 are the feature reference… `npm run eg1` … `eg10`" → extend.
- `llms.txt:275` **already omits example 10 entirely** ("Examples 1–6 are the feature reference… Examples 7–9 are exemplars… pass `--dev` to run examples 1–6, 8 and 9"). A pre-existing corpse; §E should fix it while it is there rather than adding 11 to a sentence that is wrong about 10.
- `package.json` needs `"eg11": "cd examples && node 11-blog"`.
- `examples/README.md` and the new `examples/11-blog/README.md`.

---

## 19. NOTE — things checked and found _not_ to need changing

- **`foldersToEnsure`** (`lib/config.js:346-361`): no change. `_redirects` and `feed.xml` go into `folders.build`, which is already ensured. `aikb` is deliberately absent and stays absent.
- **`package.json` `files` whitelist** (`package.json:19-26`): no change. `bin`, `lib`, `types`, `llms.txt`, `AIKB`, `examples` already cover `lib/links.js`, `lib/redirects.js`, `lib/feed.js`, `AIKB/*.md` and `examples/11-blog/`.
- **Asset-copy vs `_redirects` collision**: a site with `src/assets/_redirects` has it copied by the construction-time `copyAssets` (first promise on `_promises`, `lib/kiss.js:393`), which drains before either candidate write point — so the engine's file wins. Worth one sentence in `AIKB/redirects.md`; no code change.
- **`test/aikb.test.js` module/doc coverage**: each of `lib/links.js`, `lib/redirects.js`, `lib/feed.js` needs `AIKB/<name>.md` **containing all five `HEADINGS` in order** (`test/aikb.test.js:43-49, 67-78`) _and_ a `CLAUDE.md` table row containing the literal `AIKB/<name>.md`. The contract says "AIKB doc, table row" but not the five-heading template.
- **`llms.txt` must contain the literal `` `.feed( ``** — `test/aikb.test.js:81-85` derives `publicMethods` from `Kiss.prototype` and asserts `llmsTxt.toContain('`.' + name + '(')`.

---

## 20. BLOCKER — §E's `--broken` example will report a _second_ broken link unless the feed is on the queue

§E's blog layout will carry `<link rel="alternate" type="application/rss+xml" href="/feed.xml">`, and §E asserts "`links.broken` … exactly one under `--broken`".

This holds **only** if `feed.xml` is written before the link scan. It is, as §F is written — "same promise-queue timing" as `.sitemap()`/`.llms()`, which are drained by `_settle()` before `complete()`'s branch at `lib/kiss.js:1316`. But if finding 1's accept-set is built from data rather than from a directory listing (option (i)), `feed.xml` and `sitemap.xml` must be added to the accept-set explicitly from `_feedPath`/`_sitemapPath`/`_llmsPath` — none of which the contract mentions.

And it does **not** hold for `_redirects` under §R as written (finding 2), nor for `_redirects` at all in check mode. Since nothing links to `_redirects`, that is harmless — but the exemplar's assertion "exactly one" is load-bearing for §E's success criterion and must be backed by an explicit accept-set, not by the fact that the file happens to exist on disk during a plain `npm run eg11`.

**Amendment.** §L: "the accept-set explicitly includes `_sitemapPath`, `_llmsPath` and `_feedPath` (mapped through `reportedPath`), so a site's own generated files are never reported as broken in any mode."

---

## Summary of required contract edits

| #   | Sev        | Section    | Edit                                                                                                                                   |
| --- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | blocker    | L          | extract links at write time in `KissPage.generate()`; choose a staging-independent accept-set                                          |
| 2   | blocker    | R          | write `_redirects` on the promise queue, not in `_finishBuild()`                                                                       |
| 3   | blocker    | R          | alias target is `toAbsoluteUrl('', toCanonicalPath(rel))`, not `toCanonicalPath`                                                       |
| 4   | blocker    | R          | `aliases` per-item from `model.aliases`; not inherited by the fan-out                                                                  |
| 5   | blocker    | L          | rewrite `test/integration/aikb.test.js:141`; update two exact key lists                                                                |
| 6   | blocker    | R, F       | `redirects.file` and `feed` through `reportedPath`                                                                                     |
| 11  | blocker    | F          | `dateField` governs both lookups; define accepted formats, invalid handling, `toUTCString`, no wall-clock channel date                 |
| 14  | blocker    | sequencing | Beat 0 shared-seam commit; explicit region map; one `npm run types` at the end                                                         |
| 20  | blocker    | L, E       | accept-set includes `sitemap.xml`/`llms.txt`/`feed.xml` explicitly                                                                     |
| 7   | should-fix | L          | same-origin absolute URLs are internal; enumerate accepted shapes; `srcset` descriptors                                                |
| 8   | should-fix | L          | accept manifest **target** only; empty manifest when `folders.assets` is `null`                                                        |
| 9   | should-fix | R          | build-relative comparison; skip on `buildDir` mismatch; relate to `diffReports`                                                        |
| 10  | should-fix | R          | gate on `last-build.json`, not `isRecorded()` (which flips inside `_finishBuild`)                                                      |
| 12  | should-fix | L          | `DEFAULT_CONFIG.links`; `llms.txt`/`README` config-block equality gate; decide boolean vs block                                        |
| 13  | should-fix | F          | `_feedRequest`/`_feedPath` + `_replay()` wiring                                                                                        |
| 15  | should-fix | E          | re-record example 9; sort `removed`/`collisions`                                                                                       |
| 16  | should-fix | E          | `.prettierignore` entry for `examples/11-blog/AIKB/*.json`                                                                             |
| 17  | should-fix | R          | `kiss-build-check` / `kiss-branch-close` skills + `llms.txt:213` summary line                                                          |
| 18  | note       | E          | three example-count sites; `llms.txt:275` already stale about example 10                                                               |
| 19  | note       | —          | verified no change needed: `foldersToEnsure`, `files` whitelist; AIKB five-heading template and the `` `.feed( `` literal are required |
