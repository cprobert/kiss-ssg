# Plan — 2026-10-24: Learning packages — IMS content packages and SCORM 1.2, one per group of pages

Status: contract, amended after the adversarial read (see the amendment at the end, which overrides the sections above where they differ). Session file: `planning/sessions/2026-10-24-learning-packages.md`. Consumer: the MSc Internal Medicine programme, `C:\Code\programmes\internal-medicine`, branch `spike/moodle-packaging` (its session file `docs/sessions/courtenay-probert/2026-10-24-moodle-packaging.md`).

## The problem this solves

A site built with kiss can be a course: lessons of pages that a learning management system (Moodle first) should import as activities. An LMS imports a **package**: a zip with `imsmanifest.xml` at its root, the pages it lists beside it, and a table of contents. An IMS content package is shown with that table of contents and records nothing; a SCORM 1.2 package is the same zip with a little more in the manifest, and its pages talk to the LMS through a JavaScript API, so it can record completion, answers and a score.

Today a site has to hand-roll that, after the build, outside kiss. Unlike `sitemap.xml` or `feed.xml`, which are one file for one build, a course is **many packages in one build**, one for each lesson. The consumer has 33 lessons today; it uploads one lesson at a time, so an update after a review round stays small.

Everything a package needs is already in kiss's registry: each page's written file (`entry.page.outputPath`), its own options (`entry.page.options`), and the references it makes (`entry.page.links`, with `links.js`'s `resolveTarget`). The pattern is the one kiss has used since site memory: **a file derived from the registry, so it can never name a page the build did not write.**

## Facts this contract rests on

Read from `lib/` on 2026-10-24 (a research pass with file and line evidence, kept in the session's scratch notes). Each is re-checked against the code before the step that depends on it.

- `.sitemap()`, `.llms()`, `.feed()` and `.robots()` wait for `Promise.all(this._promises)`, which covers model, controller and preparation, **not** `KissPage.generate()` (`kiss.js:1440`, `1481`, `1547`, `1604`; `page-registry.js:450-519`). They can run while pages are still being written. `_redirects` is written inside `complete()` after `_settle()` (`kiss.js:1332-1384`, `build-finish.js:394-455`), and its failure is a build failure.
- The minifier runs on every non-dev page whatever its `ext` (`kiss-page.js:289-300`), and it breaks XML: `<file href="x"/>` loses its self-closing slash.
- Unknown page options are kept on `entry.page.options` (`page-registry.js:88`; `PageOptions` in `kiss.js:131-164`); a controller's patch is spread over them; a `.pages()` registration's options are copied into every item, except `aliases` and `id` (`page-registry.js:331-359`).
- `entry.page.outputPath` is the absolute written file; `entry.page.hash` is non-null only when bytes were written; `entry.page.links` is the sorted, de-duplicated `href`/`src`/`srcset`/`action` values (`links.js:116-159`), not CSS `url()`.
- A post-render writer writes under `_writeConfig.folders.build` (the staging folder under `cleanBuild: 'atomic'` and check mode) and maps paths for the report with `real()` (`staging.js:42-61`; `build-finish.js:112-118`).
- No zip code or dependency exists; `zlib.deflateRawSync` and `zlib.crc32` are in Node from 22.2 (`engines` is `>=22.12`).
- Scoped watch re-renders re-run no writer (`rebuild.js:366-397`).
- kiss ships no client-side JavaScript today; the only injected script is the dev livereload snippet (`kiss-page.js:274-280`).

## Contract

### M — membership: a page names its package

- Page option `package`: a string, the package's id (`'m2-l1'`). A page without it is in no package. It is carried by `.page()`, `.pages()` (the registration's value is copied into every item, as every option is) and a controller's patch, so a fan-out can give each item its own: `controller: ({ model }) => ({ package: model.lessonId })`.
- Optional page option `packageSection`: a string. Pages of one package with the same section are grouped under one parent item of that title in the table of contents (a module package with its lessons as chapters). Without it, items are flat.
- A package's items are in **registration order** (the order the pages were registered, `stack` order is not), titled by each page's `title`.
- The id must be a slug (`[a-z0-9-]`); anything else fails the build at prepare, naming the page. Two pages of one package with the same output file is already a build failure.

### W — `kiss.packages(options)`: the writer

- `kiss.packages({ format, dir, title, identifier, only })`, chainable, in the router's terminal chain beside `.sitemap()`. Every option has a default:
  - `format`: `'imscp'` (default) or `'scorm12'`, or an array of both, to write each package in each format.
  - `dir`: the build-relative folder the zips go in, default `'packages'`. A path that resolves outside the build folder is refused, as `feed`'s `filename` is.
  - `title`: `(id, pages) => string`, the package's title in the table of contents; default the first page's `title`.
  - `identifier`: `(id) => string`, the manifest's identifier; default `id` itself, which an LMS uses to tell one package from another across uploads, so it must stay stable.
  - `only`: an array of package ids to write, default all. (A site with 33 lessons builds one while it is being tried.)
- **When it runs:** inside `complete()`, after `_settle()`, beside `_writeRedirects` and before the link check, the audit and the promote/discard branch, on **non-dev builds only**. Dev and watch skip it, with one notice the first time a dev build has a request (`AIKB/rebuild.md`'s Known knowns gains the row; `CLAUDE.md` § Rules on the dev watcher).
- **Files of a package** (its _closure_): each member page's written file, plus every reference in its `links` that `resolveTarget` resolves to a file in the build, transitively for any `.html` reached (a page may link to a page of another package: that is an outside reference, below).
- **The package root:** the deepest folder that contains every member page. Each file's path in the zip is its path relative to that root, so the pages' relative links still work. `imsmanifest.xml` is written at the zip's root, beside them.
- **Outside references** are reported, not fatal: a reference that is root-relative (`/css/site.css`: an LMS does not serve the package at the site's root), that resolves above the package root, or that names a page of another package. Each is `{ package, page, href }` in the report. A reference with a scheme (`https:`, `mailto:`, `data:`) is left alone, as in `links.js`.
- **Zip file name:** `<dir>/<id>.zip` for one format, `<dir>/<id>.<format>.zip` for more than one. Each is claimed in the output registry as kind `'package'`.
- **Failure:** a requested package that cannot be written (a member page not written, a zip write error) fails the build, pushed onto `_failures` as `<packages>`, as `<redirects>` is. A package with no member pages is a finding, not a failure.
- **Report:** `packages: null | [{ id, format, file, title, pages: string[], files: number, outside: [{ page, href }] }]`, appended last, `file` mapped with `real()`, sorted by id then format. `formatReport` prints one line per package and one per outside reference.

### Z — `lib/zip.js`: a deterministic zip

- A pure module: `zip(entries: [{ name, bytes }]) => Buffer`. No dependency: `zlib.deflateRawSync` (level fixed) and `zlib.crc32`.
- Byte-stable: entries sorted by `name`, every timestamp fixed at 1980-01-01 00:00 (the earliest DOS date), no extra fields, no comment, forward slashes, UTF-8 names (flag bit 11). Two calls with the same entries give the same bytes.
- Small entries (the manifest, a page under a set size) may be stored rather than deflated, by a fixed rule, so the choice never depends on the machine.

### X — the manifests

- Generated by the writer as text, written only into the zip, never through the page pipeline or the minifier, and well-formed XML (a unit test parses each with `htmlparser2` in XML mode, already a dependency).
- **IMS CP 1.1:** `<manifest identifier version="1.1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">`, one `<organization>` (the package title, its items in registration order, grouped by `packageSection`), and one `<resource type="webcontent" href="<page>">` per page, each listing its `<file>`s: the page and the closure files it references. Files referenced by no page (none expected) are listed on the first resource.
- **SCORM 1.2:** the same structure in the 1.2 namespaces (`http://www.imsproject.org/xsd/imscp_rootv1p1p2`, `xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"`), `<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>`, and each page's resource `adlcp:scormtype="sco"`: **every member page is a SCO**, so the LMS tracks each page.
- The schema files (`.xsd`) are not shipped: Moodle does not need them, and leaving them out keeps the zip to what the pages need. To be confirmed in Moodle; added only if an LMS refuses the package.

### B — the SCORM bridge

- kiss ships its first client-side script: a built-in helper, `{{scormBridge}}`, that renders one inline `<script>` (no file to copy, so the same page works on the web, in an IMS content package and in a SCORM package, byte for byte).
- On load it looks for the SCORM 1.2 `API` object up the `parent` chain and then `opener` (the standard search, a bounded number of levels). **When none is found, every call is a no-op**: the page is on the web or in an IMS content package.
- When found: `LMSInitialize('')`; sets `cmi.core.lesson_status` to `completed` on the first load (a formative page is complete when it is seen; the default a site can change, below); `LMSCommit` and `LMSFinish` on `pagehide`.
- A small global API for the page's own script, `window.kissScorm`:
  - `interaction({ id, type: 'choice', response, correct, result })`: appends one `cmi.interactions.n` entry (`id`, `type`, `student_response`, `correct_responses.0.pattern`, `result` as `correct` or `wrong`, `time`), then commits.
  - `score(raw, max = 100)`: sets `cmi.core.score.raw`, `min` 0 and `max`.
  - `status(value)`: sets `cmi.core.lesson_status` (`completed`, `incomplete`, `passed`, `failed`), for a site whose pages are not complete when seen.
  - `available`: `true` when an LMS answered.
- Each value is clipped to SCORM 1.2's limits (an interaction id is a CMIIdentifier: no spaces, at most 255 characters), so an LMS never refuses a call; a refused call is not retried and never throws into the page.
- The helper renders nothing at all under `config.scorm === false`, for a site that wants no script in its pages.
- The script has no `console.log` (the audit flags one).

### C — what the consuming site owns

The seams are the page options (M), the writer's call and report (W), and `window.kissScorm` (B). Everything else is the site's:

- Which pages form a package, and its title. The consumer gives each lesson's three tab pages `package: '<module>-l<n>'` and `packageSection` none; its title is the lesson's (`M2 L1 · Acute cardiovascular emergencies`).
- Pages that stand alone: no root-relative link, no link above the lesson's folder. The consumer's pages have inline styles and inline SVG; its "← All modules" link points above the lesson, so its packaging build leaves it out (a model flag), and the writer's outside report proves none is left.
- The interactive questions: the markup, the choosing and revealing, and their calls to `window.kissScorm` (`interaction` per answer, with a stable id from the topic, tab and question; `score` as the share answered correctly). They work without the bridge, on the web.
- **H5P is not kiss's** in this contract: the consumer builds its H5P package from its own model. The roadmap (`planning/specs/2026-10-24-learning-resources-roadmap.md`) weighs bringing it into kiss.

## Non-goals

- H5P, SCORM 2004, cmi5, xAPI and LTI (the roadmap).
- Packages in dev and watch builds.
- Scored, graded assessment: the bridge records what a page sends; how a score counts is the LMS's setting.
- Shipping the `.xsd` schema files, unless an LMS refuses a package without them.
- Any new dependency.

## Delegation and sequencing

One session (Claude) briefs, builds and commits in the worktree; the operator reviews each diff. **Before any code, a fresh-context agent reads this contract adversarially**, read-only, asking of every artefact it names: what writes this, when, and what moves its baseline? Its findings amend this contract in place, in a dated section.

Then, in order: Z (the zip, pure, with its tests), X (the manifests, pure), M and W (membership and the writer, through `complete()`), B (the bridge). The consumer builds against each as it lands: first an IMS content package of M2 lesson 1, then SCORM 1.2, then the interactive questions.

## Success criteria (mirrored in the session file)

- [ ] Z — two identical calls give identical bytes; a zip written by `lib/zip.js` opens in Windows Explorer, `unzip -t` and Moodle.
- [ ] X — both manifests parse as XML; each lists exactly the zip's files; one organisation in registration order.
- [ ] M, W — one zip per package, many per build; `only` builds one; outside references reported; a failed package fails the build; dev skips with one notice; the report and `formatReport` show it.
- [ ] B — with no LMS, every call is a no-op; with a stub `API`, `interaction`, `score` and completion reach it with SCORM 1.2's names and limits; the page bytes are the same in both.
- [ ] Docs, as `CLAUDE.md` § Rules asks: `AIKB/` docs for `lib/zip.js` and the writer's module, `GUIDE.md`, one line in `llms.txt`, `README.md`, `types/`, the skill and its row in `test/unit/skill-coverage.test.js`, `src/models/guide.json`.
- [ ] Clean room: a fresh agent with only the packed tarball builds a two-lesson course of packages that passes `kiss-ssg check`.
- [ ] The consumer's M2 lesson 1 packages upload to a Moodle test course.
- [ ] `npm run gates` is green.

## Amendment — 2026-10-24: after the adversarial read

A fresh-context agent read this contract against `lib/` and the IMS CP and SCORM 1.2 specifications, read-only. Every fact in "Facts this contract rests on" held, with two corrections: `real()` is at `lib/build-report.js:259` (`build-finish.js` only passes it the staging folder), and the audit's console-log check counts `.js` files only, so it never sees an inline script. It also measured that terser minifies the bridge's IIFE and keeps its global, and confirmed the timing inside `complete()`: after `_settle()`, above the promote/discard branch, the zips land in `_writeRoot`, are promoted under `'atomic'`, discarded in check mode and on failure, and include pages a `.generate()` callback queued. Its findings, and the operator's decisions, override the sections above where they differ.

### Decisions by the operator

- **A convention, not a method.** There is no `kiss.packages()`. A page with a `package` option is packaged; `config.packages` holds the settings, each with a default (`{ format: 'imscp', dir: 'packages', title, only }`), and `config.packages = false` turns packaging off. The writer runs in `complete()` whenever a written page has `package`, as redirects run whenever a page has `aliases`. This removes the trap a method would set: a router that calls it and never `complete()` would get nothing, silently.
- **Stored zips, a content hash, a diff.** Every entry is stored (method 0): no zlib, so the bytes are the same on every Node and platform. Each package in the report carries `hash`: sha1 over its sorted `(name, bytes)` pairs. `kiss-ssg check --against` and `formatCheck` gain a packages section (added, changed, removed), so a course uploads only the packages that changed.
- **In a SCORM package, a link from one member page to another is a finding**, not a failure: it would load the second page inside the first page's SCO. It is reported with the reason, and the docs say the LMS's table of contents is the navigation. One SCO per page stays the default, for that reason: each page is tracked on its own.
- **Item and resource identifiers come from the page's `id`.** Moodle matches a package's SCOs by item identifier when a package is updated in place, and deletes those that disappear, with their tracks. So the identifier is a **promise**: it stays the same while the page's `id` does, whatever its path or position. A member page with no usable `id` (kiss withdraws a default id that two pages share) fails the build and names the page: a silent fallback would break the promise. A site that may move pages sets explicit ids.

### Decided here, from the findings

- **Registration order (M).** The stack fills in the order models resolve, not the order pages were registered (`page-registry.js:205`). `registerPage` captures a sequence number synchronously, and each stack entry carries `order: [registration, item]` (on the entry, not in `options`, which leak into the render context). Members are sorted by it.
- **The closure (W) has its own extraction**, keeping the element and attribute of each reference, because `entry.page.links` is a flat list that cannot tell a link a reader follows from a file a page needs:
  - **Followed** (the page needs them): `src`, `link[href]`, `srcset`, `poster`, `object[data]`, `embed[src]`, `track[src]`, SVG `use`/`image` `href`, CSS `url()` and `@import` in `<style>`, in `style=` and in a followed `.css` file, transitively through `.css` only.
  - **Not followed**: `<a href>`, `form[action]`, JavaScript imports and anything a script loads. An `<a>` to a member page is allowed; an `<a>` to any other file of the build is an outside reference and is not included.
  - Each value goes through `classifyReference` first (dropping `#fragment` and `?query`; a same-origin absolute URL is outside, a scheme is left alone), then resolves **only against the files written by this build** (the output registry's claims), and never against the packages folder, so a stale file or an earlier zip can never be packed.
  - A directory or extension-less reference (`../tab-2/`) is an outside reference: an LMS serves the package's files as they are, and does not map a folder to its `index.html`.
- **The package root (W)** is the deepest folder that contains the whole closure, the pages and the files they need, computed on build-relative POSIX paths, so a shared `assets/` folder is inside. Root-relative references stay outside. A single page at the build root has the build root as its package root.
- **Failure (W).** The writer runs only when no page failed (as the audit does), so one failure is not reported twice. Pages with `generate: false` are never members. An id in `only` that names no package is a notice that names it. Each zip is written to a temporary file and renamed. The run is latched (`_packagesRun`, as `_redirectsRun` is) and reset in `rebuild.js`'s replay.
- **The report (W).** `packages: null | [{ id, format, file, title, hash, pages, files, outside }]`, appended last, also in `reportInputs()` (or `_refreshReport()` drops it). Zip names are always `<id>.<format>.zip`, so adding a format never renames a file. `formatReport` caps the outside lines, as it caps asset lines. Under `cleanBuild: false` a package that no longer exists leaves its old zip: the docs say to upload what the report lists, not what a folder holds. The output registry gains the kind `'package'`.
- **The manifests (X).** An XML declaration (UTF-8), and `& < > " '` escaped in every title. Identifiers share one XML ID space, so each has a fixed prefix (`MANIFEST-`, `ORG-`, `ITEM-`, `RES-`) and is cleaned to a valid ID (a letter first, no `/`), collisions broken deterministically. `<organizations default="ORG-…">`; `identifierref` on leaf items only (section items have none); a `<title>` on every organization and item. In SCORM 1.2, `<metadata>` is the first child of `<manifest>`, and `adlcp:scormtype` is lower case. The line "files referenced by no page are listed on the first resource" is deleted: the closure is built from references, so there are none.
- **The zip (Z).** DOS date `0x0021` (1980-01-01; zero is not a valid date), time 0; "version made by" with host 0 (MS-DOS) and external attributes 0; version needed 10; general-purpose flags bit 11 only (UTF-8 names); method 0 only; no data descriptors, no extra fields, no comment, no directory entries; no Zip64 (a lesson is far below its limits). CRC-32 from `zlib.crc32`.
- **The bridge (B):**
  - It reads `cmi.core.lesson_status` first, and sets `completed` only from `not attempted`, `browsed` or `incomplete`, so a `passed` or `failed` is never downgraded; then it commits at once (`pagehide` in an LMS frame is best effort).
  - The completion seam is the helper's hash: `{{scormBridge}}` completes a page when it is seen; `{{scormBridge complete="manual"}}` leaves it to `kissScorm.status()`. `config.scorm` is dropped: a site that wants no script does not call the helper.
  - `interaction()` finds its index from `cmi.interactions._count`; if the LMS does not support interactions (error 401), interactions are switched off quietly. A `choice` answer is a letter `a`–`z` (option index), as SCORM 1.2 requires; `time` is CMITime (`HH:MM:SS`); the id is a CMIIdentifier, cleaned to `[A-Za-z0-9_.-]` with a short hash suffix rather than clipped, so two long ids never collide.
  - `score(fraction)` takes 0 to 1 and sets `raw` to its percentage, `min` 0 and `max` 100 (SCORM 1.2's range).
  - `cmi.core.session_time` (CMITimespan) is set before `LMSFinish`. The search up `parent` and `opener` sits in `try`/`catch` (a cross-origin frame throws). Including the helper twice is harmless (`if (window.kissScorm) return`).
- **`package` is a reserved word in strict mode.** Code reads `options.package`; no doc example destructures it. A site already using a `package` page key changes meaning: the CHANGELOG's upgrade note says so.
- **Docs, added to the obligations:** `llms.txt` § Helpers and its "Built-in helpers" roster name `scormBridge` (`test/aikb.test.js:145-158`), and `AIKB/handlebars-helpers.md` documents it; `PageOptionsKnown` gains `package` and `packageSection`; the `AIKB/` docs for `build-finish`, `build-report`, `output-registry` and `kiss` are updated; the skill row goes to `kiss-page-add`; `CHANGELOG.md` with the upgrade note; and `examples/13-course-packages`, a two-lesson course with one interactive question, because what ships is an example.

### What this means for the consumer (C)

- Package ids and page ids from slugs, never positions: the package is the lesson's slug (`m2-acute-cardiovascular-emergencies`), and each tab page's explicit `id` is the lesson slug and the tab's key, so neither changes when lessons are reordered.
- `config.packages.title` receives each member page's options and model, so it can read the lesson's name.
- Its tab pages do not link to each other, so its SCORM packages raise no member-link finding; with the "All modules" link left out of the packaging build, the closure is the three pages alone (measured: its templates use no `src`, `url(` or asset helper).
- Interaction ids are built from the topic, tab and question, and cleaned by the bridge.
- Moodle settings to choose when uploading: require every SCO to be complete (`completionstatusallscos`), no grade or a grade method for the formative scores, and the course structure shown in the player.
