# Contract — Launch readiness: audit findings and `kiss-site-review`

Session: `planning/sessions/2026-09-27-launch-readiness.md` · branch `feat/launch-readiness` · base `main`

The one document both workstreams build against. It is amended **in place** with a dated section when the design moves, and never forked. The body below already includes the 2026-09-27 critique amendments, which are listed at the end.

## Design in one paragraph

Every non-dev build **whose pages all succeeded** gets an `audit`: advisory findings about whether the site looks finished, decided from the HTML kiss wrote, the files in the build folder and the build's own state. The design mirrors the broken-link scan, which is the precedent in every respect:

- The per-page facts are extracted **at write time** in `KissPage`, beside `links` and from the same minified bytes, so nothing reads HTML back.
- The site-level pass runs **once, in `complete()`'s settle path, immediately after `_checkLinks()`**, against `this._writeRoot`, before the staging folder is discarded or promoted. So it runs under `kiss-ssg check` too.
- The result is latched on the instance, reset where `_links` is reset, and passed through `_reportInputs()`, which means `_refreshReport()` carries it. It is appended to the report as the **last** key.

Findings never touch `ok`, `failures` or the exit code.

## Workstream A — engine, and the public API docs that must land with it

### Owns

- `lib/audit.js`: new, one responsibility, "decide launch-readiness findings from written output".
- `test/unit/audit.test.js`: new.
- `AIKB/audit.md`: new, from the AIKB template, plus a row in the `CLAUDE.md` table: `| Launch-readiness audit | lib/audit.js | AIKB/audit.md |`.
- Seams it may edit, and nothing else in them:
  - `lib/kiss-page.js`: one field, `/** @type {import('./audit.js').PageFacts|null} */ audit = null`, set beside `this.links = extractReferences(minifiedHtml)` (the page's output path passed in, see `html` below) and nulled everywhere `links` is nulled.
  - `lib/kiss.js`:
    - `_audit = null` and `_runAudit({ quiet })` beside `_checkLinks`, called once directly after `this._checkLinks(...)` in the settle path.
    - Reset beside both `this._links = null` sites. At the watch re-check (the orphan/restore sweep), reset **then re-run**, as links does.
    - `audit: this._audit` in `_reportInputs()`.
    - A private `_debugWritten` flag, set where `viewStats()` writes `debug.json` (see `debug-dump`).
  - `lib/build-report.js`: `BuildAudit`/`BuildAuditFinding` typedefs, the `audit` key appended **after `outputs`**, its `page` values mapped through `real()`, and summary lines in `formatReport`.
  - `lib/config.js`: `KissAudit` typedef, `DEFAULT_AUDIT`, `audit?` on the input typedef, the merge, and validation (see Config).
- `test/integration/audit.test.js`: new. Existing report-shape tests are adjusted only where they pin the full key list.
- **`last-build.json` carries `audit`.** `lastBuildRecord` (`lib/aikb.js`) spreads the report, and that is intended: the record is what the next build diffs against, and a finding that appeared is worth seeing. A re-records `examples/9-migrated-from-v1/AIKB/` and `examples/11-blog/AIKB/` (`kiss-ssg aikb`) so `test/integration/examples.test.js` stays green. B re-records them again after its example sweep. `lib/aikb.js` itself is not edited.
- `types/`: regenerated with `npm run types` in A's commit. It is never hand-edited. `CHECKS` is `Object.freeze([...])` with a JSDoc `@type {readonly [...]}` or a const assertion, so `CheckId` emits as a union.
- **Public API docs, in A's commit, per CLAUDE.md "same commit":** `llms.txt`, `README.md` and `GUIDE.md` each describe `config.audit` (`check`, `ignore`, the `false` shorthand), the `audit` report key and the check ids. `AIKB/kiss.md`, `AIKB/kiss-page.md`, `AIKB/build-report.md` and `AIKB/config.md` describe the seams above.

### Pure API of `lib/audit.js`

```js
// Per page, at write time. Tolerant regex over opening tags, the lib/links.js
// compromise. Before matching it applies the same pre-strip links.js does
// (comments, script bodies, style bodies) plus <template>…</template> and
// <svg>…</svg> bodies, because a count check (h1-count, heading-skip) turns an
// extra match into an invented finding, and a miss here is not harmless.
extractPageFacts(html, outputPath) → PageFacts {
  html: boolean,          // outputPath ends .html/.htm AND the bytes contain <html or <body.
                          // Extension first: a file extension is a statement about processing.
  title: string|null,     // text of the first <title> after the pre-strip (so never an svg title),
                          // decoded with the links.js entity subset, whitespace-collapsed, trimmed; '' when empty
  description: string|null, // content of <meta name="description">
  ogImage: string|null,   // content of <meta property="og:image"> OR <meta name="og:image">
  canonical: string|null, // href of <link rel="canonical">
  icon: boolean,          // any <link rel> whose space-separated tokens include "icon"
  imgMissingAlt: string[],// src of each <img> with NO alt attribute (alt="" is present); '' when no src
  headings: number[],     // levels 1–6 in document order
}

// Once per build, in the settle path.
auditBuild({ pages, buildDir, siteUrl, ignore, ownsFolder, debugWritten }) → { checked, ignored, skipped, findings }
//   pages: [{ buildTo, facts, canonicalElsewhere, siteUrl }]. Written pages only (hash !== null, facts !== null).
//     canonicalElsewhere = typeof entry.page.options.canonical === 'string' && entry.page.options.canonical !== ''
//       (the field buildReport already emits as pages[].canonical, with no URL comparison, so no URL policy is involved)
//     siteUrl = the page's own merged config.siteUrl, falling back to the instance's (the {{canonical}} rule,
//       handlebars-helpers.js siteUrlFor)
//   buildDir: this._writeRoot. Never config.folders.build: under 'atomic' and check the pages are in staging.
//   ownsFolder: the author's `cleanBuild !== false`, read before check mode rewrites it (see "folder walk")
//   Finding: { check: CheckId, page: string|null, detail: string|null }
//   findings sorted by check (in CHECKS order), then page, then detail
```

**Folder walk:** a file found by the walk is reported as `` `${buildDir}/${posixRelativePath}` `` with forward slashes, **never** with `path.join`. `reportedPath` only strips a staging prefix followed by `/`, so a Windows separator would leak `kiss-staging` into the report.

### The checks

`CHECKS` is an exported, frozen, ordered array of ids. These ids are the public vocabulary: the config's `ignore` list, the report's `check` field and the summary lines all use them.

Per page (only pages with `facts.html === true`; `page` is the page's `buildTo`, mapped to the real folder in the report):

| id                      | fires when                                                                                                                                    | detail                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `title-missing`         | `title` is null or `''`                                                                                                                       | null                             |
| `title-duplicate`       | two or more pages share an identical non-empty title — one finding per page, pages that are `canonicalElsewhere` excluded from the comparison | the title                        |
| `description-missing`   | `description` null or `''`                                                                                                                    | null                             |
| `description-duplicate` | as `title-duplicate`, for description                                                                                                         | the description                  |
| `og-image-missing`      | `ogImage` null or `''`                                                                                                                        | null                             |
| `og-image-relative`     | `ogImage` present but not an absolute `http(s):` URL (scrapers do not resolve relative)                                                       | the value                        |
| `canonical-missing`     | the page's `siteUrl` is set and the page has no canonical link                                                                                | null                             |
| `img-alt-missing`       | one finding per `<img>` without `alt`                                                                                                         | the src                          |
| `h1-count`              | the number of level-1 headings ≠ 1                                                                                                            | the count, as a string           |
| `heading-skip`          | a heading more than one level deeper than the one before it (h2→h4); the first heading is not a skip                                          | `h2 -> h4` (the first skip only) |

Site-level (`page: null` unless stated). `favicon-missing` and `not-found-missing` do not run when `checked === 0`, because a feed-only or JSON-only instance has no HTML to be missing them from:

| id                  | fires when                                                                                                                                                                                                                                                                                                                                                 | detail                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `favicon-missing`   | no audited page has `icon` **and** no `favicon.ico` at the build root                                                                                                                                                                                                                                                                                      | null                                                    |
| `not-found-missing` | no `404.html` at the build root (walk). If `404/index.html` exists, the detail says so, because `extensionLess` puts a `404` view there and hosts serve `/404.html`                                                                                                                                                                                        | null or `404/index.html exists — hosts serve /404.html` |
| `site-url-local`    | the **instance's** `siteUrl` hostname is `localhost`, `127.*`, `0.0.0.0`, `[::1]`, ends `.localhost`/`.local`/`.test`/`.invalid`, or matches a preview pattern: `deploy-preview-<n>--*.netlify.app`, `*-git-*.vercel.app`. **Not** `.example`: that is the documentation domain every shipped example uses. A per-page override is reported with that page | the siteUrl                                             |
| `debug-dump`        | `debugWritten`: `viewStats()` wrote `debug.json` (every page's options and models) into a non-dev build. Decided from state rather than disk, because the write is not awaited and a disk check would race. `page` is the file                                                                                                                             | null                                                    |
| `stray-file`        | a file under the build folder (walk) whose basename is a dotfile, except anything under `.well-known/` and `.nojekyll`, `.htaccess`; or ends `.map`, `.log`, `.bak`, `.swp`, `~`; or is `.env*`, `.DS_Store`, `Thumbs.db`. `page` is the file                                                                                                              | null                                                    |
| `console-log`       | a `.js` file under the build folder (walk), **excluding** `*.min.js` and any path with a `vendor/` or `node_modules/` segment, contains `console.log(`. `page` is the file                                                                                                                                                                                 | the occurrence count, as a string                       |

**Folder ownership.** `not-found-missing`, `stray-file` and `console-log` read the whole build folder. Under `cleanBuild: false` that folder holds whatever earlier builds and sibling instances left there, so these three are **not run** and are listed in `skipped`. Example 7's second instance shares its folder with every season and is the proof. Every other check runs.

**A failed build is not audited.** When `_failures.length > 0` at the call site, `_audit` stays `null`. Pages that failed have no facts, so site-level findings would be false and would bury the real failures.

`canonicalElsewhere` pages **are** audited for every check except the two duplicate checks. A page that names another URL as its canonical is saying it is a copy, so a duplicate title there is expected.

### Config

```js
config.audit = {
  check: true, // false skips the whole audit (report key null)
  ignore: [], // CheckIds to skip
}
config.audit = false // shorthand for { check: false, ignore: [] }
```

Resolution **throws**, fail-closed like `redirects.format`, on:

- an `audit` that is neither a boolean nor a plain object;
- an `ignore` that is not an array;
- an `ignore` entry not in `CHECKS`. The error names the entry and lists the valid ids.

The object form merges one level deep, like `links`. The audit is skipped in dev and so on every watch rebuild: `_audit` stays null there.

### Report

```js
audit: null | {
  checked: number,        // pages audited
  ignored: CheckId[],     // the resolved ignore list, sorted
  skipped: CheckId[],     // checks not run because the build does not own its folder, in CHECKS order
  findings: [{ check, page, detail }], // page mapped through real()
}
```

`null` means that no audit ran (dev, `check: false`, a failed build), and `{ checked: 0, …, findings: [] }` means that it ran and found nothing. `ignored` and `skipped` make sure that a clean audit with checks turned off is never read as a clean site.

### Summary and log

Per-page checks can fire on every page, so `formatReport` prints **one line per check that fired**. Paths are shown as the report carries them:

```
  audit description-missing: 12 pages (./public/about.html, ./public/contact.html, ./public/index.html, …)
  audit favicon-missing
  audit stray-file: 2 files (./public/css/site.css.map, ./public/.DS_Store)
```

That is up to three names, then `…` when there are more. A non-empty `skipped` gets one line: `audit skipped (cleanBuild: false): not-found-missing, stray-file, console-log`. The build log (`_runAudit`, not quiet) prints the same lines at `notice` level, preceded by one `info` line: `Audit: N pages, M findings` (or `none`).

### What stays out

- The `check --against` diff and `lib/check.js`: the diff remains page-hash based.
- Per-page opt-out (a page option `audit: false`).
- Awaiting `viewStats()`'s write (`debug-dump` is decided from state instead).

## Workstream B — skill, examples, upgrade note

Starts only after A is committed.

### Owns

- `plugins/kiss-ssg/skills/kiss-site-review/SKILL.md`: new.
- `test/unit/skill-coverage.test.js`: rows for `kiss-site-review` (the audit's ids and `config.audit.ignore`), and for `kiss-build-check` naming `audit` as advisory. Each row is seen red before its skill text lands.
- `plugins/kiss-ssg/skills/kiss-build-check/SKILL.md`: a short paragraph saying that `audit` exists, is advisory, and hands off to `kiss-site-review`.
- `plugins/kiss-ssg/skills/kiss-site-migrate/SKILL.md`: the upgrade note, since a minor reaches `^2` sites unasked. It covers new notice lines on every build, the `audit` key in the report and in `last-build.json`, and how to set `ignore`.
- `plugins/kiss-ssg/README.md`: a skill list entry.
- `examples/*`, `starter/`: the example sweep (below), including a re-record of the AIKB for examples 9 and 11 afterwards.

`CHANGELOG.md` and the version bump belong to `/branch-close`.

### The skill

Framing: **launch readiness**. It is not "hide how it was built". The steps:

1. Run `npx kiss-ssg check <script>` and read `audit` (and `links`). Group the findings by check, and give the fix for each in kiss terms: the layout's `<head>`, a `404` view with `extensionLess` in mind, `{{canonical}}`, `siteUrl`, an asset folder that is shipping a `.map`, `verbose` plus `viewStats()` left on. It says what `skipped` and `ignored` mean.
2. The judgement pass, with a browser when one is available, over a built preview **served with the build folder as the site root** (`--dev`, or any static server rooted at `public/`) — never a server rooted above it, such as VS Code Live Server on the repo, where every root-relative `{{link}}` resolves outside the site and reads as broken (2026-09-27: ten false 404s on example 11 that way, zero from the root): widths of 320, 768 and 1440 plus one odd width; long text and long unbroken strings; spacing, type, radius and button consistency across page templates; anything that looks clickable but is not; whether the 404 page helps someone who is lost. Without a browser, it says the pass did not run. It does not infer the result from the templates.
3. **Report first.** Findings go in a table (where, what, why it matters, proposed fix). The operator picks what to fix. Every fix is followed by a re-run of `check`.
4. Checks the site deliberately does not want go in `config.audit.ignore`, with a comment explaining why. They are not suppressed silently.

### Example sweep

Build every example with the audit and read the findings. Example 11 also moves its hand-written `{{root}}`-relative nav, brand and stylesheet links to `{{link}}`/`{{asset}}`, so one example does not model two link styles — the mix is why half its links worked under a subpath preview and half did not (logged as a follow-up by the 2026-09-27 discard-staging session). What ships is an example, so each finding is either fixed in the example or ignored with a one-line comment giving the reason, in examples whose point is something else. Five examples ship `verbose` plus `viewStats()`, so `debug-dump` fires on them, and whether a teaching example should keep modelling that is part of the question. **Open question for the operator after the measurement:** how much `<head>` boilerplate the minimal examples 1–5 should carry, against how many `ignore` lines they should show. This goes to the operator as an `AskUserQuestion` with the counts in hand. It is not decided here.

## Seams and ordering

1. A writes red tests for `extractPageFacts` and `auditBuild` (each failure message read), then implements them. Pulse.
2. A wires the audit into `KissPage`, `kiss.js`, the config and the report; the integration tests are red first. Then docs, `types/`, and the re-record of examples 9 and 11. Gates green. Pulse.
3. Main session reviews and commits A.
4. B: skill, coverage rows (red first), build-check and migrate notes, and the example sweep after the operator's decision.
5. Clean-room agent run, Codex review, `/branch-close`.

Agents never commit. Each workstream returns a diff and a list of anything it had to guess.

## Amendment — 2026-09-27, fresh-context critique

A critique by a fresh-context agent against the code returned 15 items. The main session re-checked the load-bearing ones by reading the code: the `lastBuildRecord` spread (`lib/aikb.js:973`), the byte-identity assertions in `examples.test.js:268` and `:458` and `types.test.js:43`, the `/`-only staging strip in `reportedPath` (`build-report.js:155`), `debug.json` in five examples' `public/`, the script-body pre-strip in `links.js`, example 7's `cleanBuild: false` instance, and the page-level `siteUrl` in `siteUrlFor`. The claim that vendored libraries contain `console.log` is inferred, not measured. Changes:

1. `last-build.json` carries `audit`, deliberately. A re-records examples 9 and 11. (Was: "stays out".)
2. `types/` and `llms.txt`/`README.md`/`GUIDE.md` moved to A's commit, per the CLAUDE.md "same commit" rule.
3. `auditBuild` is given `this._writeRoot`.
4. Walk paths use forward slashes, and summary paths are shown as the report carries them.
5. A failed build is not audited. The favicon and 404 checks need at least one audited page.
6. Under `cleanBuild: false`, the three folder-walk checks are `skipped` and reported as such.
7. New `debug-dump` check, decided from state.
8. `console-log` excludes `*.min.js`, `vendor/` and `node_modules/`. `.htaccess` is exempt. `og:image` is accepted via `name=` too. The pre-strip covers script, style, template and svg bodies.
9. `html` is decided by extension first.
10. `canonicalElsewhere` is defined from `options.canonical`, and `siteUrl` per page.
11. Config: the `audit: false` shorthand, and validation that throws.
12. The watch re-check re-runs the audit.
13. Types notes: `@type` on `KissPage.audit`, a `CheckId` union, `audit?` on the input typedef.
14. Entity decoding uses the `links.js` subset.
15. The `kiss-site-migrate` upgrade note goes to B.

## Amendment — 2026-09-27, `frontend-design` as an optional companion

The operator's decision. Workstream B also owns:

- `README.md`: an **optional** paragraph in the setup section. It covers Anthropic's `frontend-design` skill, how to install it (`claude plugin marketplace add anthropics/skills --scope project`, then `claude plugin install example-skills@anthropic-agent-skills --scope project`; confirm both commands against the marketplace before writing them), and that it arrives inside `example-skills` alongside 11 other skills. A's README edits are about the audit, and B's paragraph sits in a different section.
- `plugins/kiss-ssg/skills/kiss-site-new/SKILL.md` and `kiss-site-review/SKILL.md`: one line each saying that when `frontend-design` is available it sets the **visual direction** (type, colour, spacing tokens, layout character), and kiss keeps the **structure** (layouts, partials, the Sass folder, one view per page). Never a single-file page.
- A coverage row for that handoff in `test/unit/skill-coverage.test.js`.

`lib/init.js` and the declared plugins are **not** changed. The clean-room run (step 5) is done once with `example-skills` installed, to test whether `web-artifacts-builder` (React) competes with `kiss-site-new`. That risk is inferred, not measured.

## Amendment — 2026-09-27, preview root and example 11's link styles

From the operator's Live Server test of example 11, verified with Playwright: served from the repo root, 10 of 15 links 404'd; served with `public/` as the root (a static server, then `npm run eg11 -- --dev` on :3011), every link returned 200 and the operator clicked through them all. Two additions to Workstream B, both inside its existing scope: the review skill's judgement pass names the preview root, and the example sweep makes example 11 use one link style.
