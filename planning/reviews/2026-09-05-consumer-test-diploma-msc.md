# kiss-ssg v2 — real-consumer migration test: `learna-ltd/diploma-msc`

Engine: `/home/user/kiss-ssg` @ `review/v2-critical-friend` (`kiss-ssg@2.0.0-alpha.1`, commit `763f39f`), READ-ONLY.
Consumer: `/home/user/diploma-msc` (fresh shallow clone, throwaway, never pushed). Node v22.22.2, npm 10.9.7.
Scratch/evidence: `/tmp/claude-0/-home-user/39387e05-fcfa-5e5b-b24f-830d3dee7246/scratchpad/diploma-msc/`.

Headline: **the site builds on v2 with three small edits.** Two of them the migration guide told me to make;
one it did not. Under identical offline inputs v1 crashes with an opaque unhandled rejection and writes
**0 pages**, v2 writes **40 pages** and names its two failures. The three biggest risks for this consumer are
(1) `complete()` now rejecting into a callback-style call site, which kills all post-build work silently,
(2) the duplicate-output-path rule, which this site deliberately depends on the v1 behaviour of, and
(3) a `.pages()` fan-out that aborts at the first bad item and reports one error for N missing pages.

---

## Step 1 — Install

|                                   |                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` (as committed)      | **exit 0**, `added 1377 packages … in 2m`, 111 audit vulnerabilities. Log: `npm-install.log`. No `--ignore-scripts` fallback needed.                                                                                                                          |
| Point at local engine             | `npm install /home/user/kiss-ssg --ignore-scripts` → exit 0, `removed 30 packages, changed 1 package`. `package.json` now `"kiss-ssg": "file:../kiss-ssg"`, `node_modules/kiss-ssg -> ../../kiss-ssg` (symlink). Log: `npm-install-engine.log`.               |
| Resolution check (from the clone) | `import('kiss-ssg')` → `[ 'default', 'module.exports', 'utils' ]`; `require('kiss-ssg/package.json').version` → `2.0.0-alpha.1`; `require('kiss-ssg')` → `function Kiss`. CJS interop works with the site's `const Kiss = require("kiss-ssg")` **unchanged**. |

`--ignore-scripts` on the engine install was deliberate: kiss-ssg's `prepare` script runs
`git config core.hooksPath .githooks`, which for a `file:` dependency would have written into the
engine's git config — the engine had to stay untouched.

Two install-time notes (site problems, not engine): the site's `preinstall`/`postinstall` install
`rimraf`, `grunt-cli` and `firebase-tools` **globally** — most of the 2m wall time is a global
`firebase-tools` install that the build does not use. And `modules/handlebars-helpers.js` used to
`require('handlebars')` directly while never declaring it (see F-M1); it only ever resolved because
kiss-ssg v1 hoisted it.

## Step 2 — Data

**No content is committed.** `.gitignore` excludes `src/models/**/*.json` and `src/models-dump/**/*.json`;
`get-data-orchard.js` needs `ORCHARD_URL/USERNAME/PASSWORD/CLIENT_ID/CLIENT_SECRET` (there is no `.env`;
`.env.tpl` only carries `LOCAL_BIND_PORT`). I have no credentials, so no fetch was attempted.

What _is_ committed and usable:

- `src/models-static/{contact,enrolment-dates,prospectus/*}.json` — real, current model data.
- From it I generated `src/models/gatedProspectus/{msc,diploma}-in-respiratory-medicine.json`
  (2 files, verbatim items out of the committed `src/models-static/prospectus/all-prospectuses.json`,
  named with the same rule `get-data-orchard.js` uses). This is the only fan-out (`.pages()`) the
  offline build could exercise with real content. Script: `make-fixtures.js`.
- `src/models-dump/{blogPost/all-blogPosts.json,courseDirectory/all-courseDirectory.json}` written as
  `[]` — several controllers `require()` these files at module load, so the file has to exist. Empty
  array = "no content", not invented content; it unblocks `home.js` without fabricating anything.

What I tried and rejected: `src/assets/json/all-{blogs,catalogs}.json` and
`src/assets/data/all-course-directory.json` are committed aggregates, but they are **stale, foreign-shaped
projections** (Contentful era / client-search shape), not the Orchard models the templates now expect —
proof in `build2.log`: 69 × `TypeError: imagePath.startsWith is not a function` (templates pass
`thumbnailImage` to `cdnLearna`; in that dump it is `{url:…}`, in the live model it is a string) and
3 × `Cannot read properties of undefined (reading 'items')` (`static.js:7` wants `topicCollection.items`,
absent from that projection). Using them would have been inventing content, so they were removed.

**Skipped for want of credentials** — 30 page registrations were skipped with `Invalid model <name>`
(`blogPost` ×12, `courseDirectory` ×3, `studentStories`/`upcoming`/`courseDirectoryQualifications`/
`courseDirectoryProfessions` ×2 each, `faq`, `catalog`, `academicPapers`, `courseDirectoryTopics`,
`courseDirectorySchools`, `courseDirectoryCountries`, `brokerDirectoryTopics` ×1 each), which in a
credentialed build fan out to roughly 64 catalog pages, 59 blog pages, ~146 course-directory pages,
plus faculty tutor profiles (`facultyTutor` models are written from the `catalog` dump). The one
`.page()` that needs a quiz model (`find-your-fit.hbs`) was removed for the harness (below).

## Step 3 — Migration edits

Full diff: `migration.diff`. Three edits, all in two files.

| #   | File                                | Edit                                                                                                                               | Why                                                                                                             | Told by the guide?                                                                                                                                                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `modules/handlebars-helpers.js:225` | `renderPartial: function (name, ctx)` → `renderPartial: (hbs) => function (name, ctx)`, dropping the inner `require('handlebars')` | v2's Handlebars env is per-instance, so the global module's `partials` is empty                                 | **Yes** — llms.txt § Migrating, bullet 4                                                                                                                                       |
| 2   | `generate.js:87`                    | `registerHelper("renderPartial", helpers.renderPartial)` → `helpers.renderPartial(kiss.handlebars)`                                | pass the instance env into the helper made in edit 1                                                            | Yes (same bullet)                                                                                                                                                              |
| 3   | `generate.js:97,157-167`            | capture `const done = this.complete(...)` and add `done.catch(err => {print err.failures; process.exitCode = 1})`                  | v2's `complete()` rejects on any page failure; the site calls it callback-style, so the rejection was unhandled | **Partly** — the guide says `complete()` rejects, but not that a callback-style call site now needs a `.catch`, nor that the callback is skipped entirely on failure. See F-M2 |

Nothing else had to change. Specifically **unchanged and working**: `require('kiss-ssg')` (CJS on Node ≥22.12),
`new Kiss(config)` with the site's custom config keys, all 16 `kiss.handlebars.registerHelper` calls,
`kiss.copyAssets('./src/instance/dev','./public')`, the per-page `generate: <bool>` option (a v1 feature
the site uses at 3 registrations — still honoured at `lib/kiss-page.js:90,99`), and the site's **hand-rolled
sitemap**, which reaches into engine internals (`this._stack[].buildTo`, `this._stack[].page.options.sitemap`,
`this.config.folders.build`, and `callback.call(this)` binding) — all still shaped the same in v2.

Two further edits are **test-harness only**, marked `[offline-test harness]` in the diff, not migration:
removing the `find-your-fit.hbs` registration (its controller hard-throws without `src/models/quiz/*.json`)
and making `livereloadPort` env-overridable (port 35729 was occupied in this container — see Caveats).

## Step 4 — Build

Command: `node generate production` (what `npm run gen:production` runs between `get-data` and `grunt`).
ANSI-stripped logs: `build-nomodels.log` (bare clone), `build4.log` (migrated), `build5.log`, `build6.log` (green),
`build-v1.log` (v1 reference).

| Run                                 | Engine     | Result                                                                                                                                                                                          |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bare clone, no edits, no fixtures   | v2         | **exit 1**, 37 pages written, crash on an unhandled `AggregateError: 2 page(s) failed to build: home.hbs, find-your-fit.hbs`; site's `complete()` callback never ran → no sitemap, no final log |
| After migration edits               | v2         | **exit 1**, 39 pages, failures now reported as `BUILD FAILED: 2 page(s) failed…` with one line each                                                                                             |
| \+ empty dumps                      | v2         | **exit 1**, 40 pages, 1 failure (`find-your-fit.hbs` — needs the Orchard quiz model)                                                                                                            |
| \+ harness removal of that one page | v2         | **exit 0**, **40 pages + `sitemap.xml` (4423 B, 30 `<url>` entries)**, `complete()` resolved, callback ran, `Pages generated (production) to: ./public`                                         |
| Same inputs, migration reverted     | **v1.4.4** | **exit 1**, **0 pages written**, `UnhandledPromiseRejection … reason "#<Object>"` — no view name, no file, nothing built                                                                        |

The v1 reference run is worth reading twice: on this consumer's own offline inputs v1 cannot produce a
build at all, and the site's own source comment (`generate-pages.js:7-9`) says as much
("nothing catches that rejection, so the whole build dies"). v2 degrades to 40 pages plus a named failure list.

`err.failures` diagnosis (green-run inputs):

| Failure                                                                                                                         | Diagnosis                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `home.hbs` — `Cannot find module '../models-dump/blogPost/all-blogPosts.json'` (`src/controllers/home.js:2`)                    | **Site/data.** Orchard-only artefact, absent offline. Resolved by writing `[]`. Not a migration or engine issue. |
| `find-your-fit.hbs` — `Quiz file not found: src/models/quiz/career-course-matcher.json` (`src/controllers/find-your-fit.js:26`) | **Site/data.** Orchard-only.                                                                                     |

**Output-tree comparison.** There is no committed build output and `netlify.toml` names no publish dir
(it only declares `functions = "./functions"`; the real deploy target is Firebase Hosting `public/`).
A like-for-like v1 tree could not be produced (v1 writes nothing offline), so I compared the v2 tree against
the _registration list_ instead: 40 of ~70 registrations produced output, 30 were skipped for missing models,
0 unexpected extras, no duplicate or missing paths within what did build. Dev-mode builds 41 — one more,
`/ps/all.html`, exactly as expected: it carries `generate: config.instance != "production"`.
Page list: `pages-v2.txt`; tree: `public-v2/`.

## Step 5 — Dev mode + live reload

`node generate dev` (what `npm run dev` runs after grunt), `LOCAL_BIND_PORT=3456`,
`LOCAL_LIVERELOAD_PORT=35931`. Logs: `dev3-raw.log`, `dev4-raw.log`, `lr-test.log`; driver: `lr-test.mjs`.

- **(a) Serving** — `Serving (/home/user/diploma-msc/public): http://127.0.0.1:3456`, first build complete ~9 s, 41 pages.
  `/` → 200 (62 865 B, 3 ms), `/index.html` → 200, `/faculty/university-of-south-wales.html` → 200 (42 292 B),
  `/ps/msc-in-respiratory-medicine.html` → 200 (55 166 B), `/contact/` → 200 (directory index resolution works),
  `/nope.html` → 404.
- **(b) Livereload snippet** — served HTML ends with
  `<script>(… s.src = 'http://' + (location.hostname || 'localhost') + ':35931/livereload.js?snipver=1' …)</script>`:
  `location.hostname` ✔, configured (non-default) port ✔.
- **(c) WS handshake + partial edit** — `ws://127.0.0.1:35931/livereload`, hello sent, server hello received in
  **13 ms**. Editing `src/partials/tutors/icons/flexibility.hbs` → first `reload` in **0.848 s**; a `reload` naming
  `/public/tutors.html` at **0.863 s**; re-fetched `/tutors.html` contained the edit. **PASS.**
- **(d) Model edit (file-backed)** — editing `src/models/gatedProspectus/msc-in-respiratory-medicine.json`
  (title prefixed) → `reload` in **0.864 s**, and the re-fetched `/ps/msc-in-respiratory-medicine.html` carried the new
  title: the whole-site replay really did re-resolve the model. A second reload burst at **3.25 s** as the replay
  finished writing. **PASS.**
- **(e) New partial** — created `src/partials/kiss-v2-probe.hbs`, then referenced it from
  `src/pages/healthcert.hbs` → `reload` in **0.222 s**, `/healthcert.html` rendered the new partial. **PASS.**
- **(f) Shutdown** — `SIGINT` → process exited in **< 1 s**; both `3456` and `35931` re-bindable immediately after.
  (The engine installs no SIGINT/SIGTERM handler; default termination is clean because nothing is mid-write.)
  **PASS.** No node process is left running (verified with `pgrep -a node`).

All three edit types round-tripped and every source file I touched was restored afterwards.

---

## Findings

Severity: **P1** blocks or silently corrupts a production build · **P2** real defect, workaround exists ·
**P3** diagnosability/polish.

### SITE problems (the consumer must change)

| id   | area      | file:line                                                             | claim                                                                                                                                                                               | failure scenario                                                                                                                                                                                                                                                                                                  | sev | evidence                                                                                                                                                                                                      | proposed fix                                                                                                                                                                                               |
| ---- | --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-M1 | migration | `modules/handlebars-helpers.js:225` (pre-fix)                         | `renderPartial` read `require('handlebars').partials`, which is empty under v2's per-instance env                                                                                   | `/tutors.html` rendered `<div class="adv-icon mb-3"></div>` ×3 — three icons silently gone, build green, no warning anywhere                                                                                                                                                                                      | P1  | `grep -o '<div class="adv-icon mb-3">…' public/tutors.html` before fix vs `…><svg id="puzzle"…` after                                                                                                         | edit 1+2 in the table above (pass `kiss.handlebars` into the helper). The guide covers the cause; add the _symptom_ (silent empty string) so it is greppable                                               |
| F-M2 | migration | `generate.js:94-97` (pre-fix)                                         | `complete()` was called callback-style with no `.catch`                                                                                                                             | Any single failed page → unhandled `AggregateError`, node exits 1 with a raw stack, **and the `complete()` callback never runs**: no `sitemap.xml`, no completion log. `deploy:production` chains with `&&`, so it aborts — but a site that ignores exit codes would deploy a tree with a stale/absent sitemap    | P1  | `build-nomodels.log:975-1045` (raw crash), `build4.log` tail (after fix)                                                                                                                                      | edit 3 above                                                                                                                                                                                               |
| F-S1 | build     | `generate-pages.js:1007-1021`                                         | The R&D fan-out is registered last specifically because _"KISS skips a page whose slug is already taken, so a published course always wins the /p/<slug> namespace"_ — v1 semantics | With `researchAndDevelopment` data present, any slug shared with a published `catalog` course now **fails the build**: `complete()` rejects, exit 1, `deploy:production` aborts. Not reproducible offline (no Orchard data) but structurally certain — and the collision is the _designed_ state, not an accident | P1  | minimal repro `repro-dup/run.mjs` → `BUILD FAILED: 1 page(s) failed to build: ./public/p/acute-medicine.html … Page already processed`, `output: ['acute-medicine.html']` (the first page still wins on disk) | dedupe before registering: build the R&D list, filter out slugs already claimed by `catalog`, then `.pages()` on the remainder. Cheap and makes the intent explicit instead of leaning on engine tolerance |
| F-S2 | build     | `src/assets/json/*.json`, `src/assets/data/all-course-directory.json` | The committed aggregates are stale/foreign-shaped and cannot stand in for `src/models`                                                                                              | Anyone (human or agent) trying to build this repo without CMS credentials will reach for them and get 69 template TypeErrors that look like engine bugs                                                                                                                                                           | P3  | `build2.log` — 69 × `imagePath.startsWith is not a function`, 3 × `reading 'items'`                                                                                                                           | either commit a small real model fixture set, or state in `CLAUDE.md`/`README.md` that no offline build is possible                                                                                        |
| F-S3 | install   | `package.json:7,31`                                                   | `preinstall`/`postinstall` install `rimraf`, `grunt-cli`, `firebase-tools` globally                                                                                                 | ~2 min of a 2.5 min install is a global `firebase-tools` fetch irrelevant to building; CI images and containers pay it every time                                                                                                                                                                                 | P3  | `npm-install.log` (`added 1377 packages … in 2m`)                                                                                                                                                             | move them to `devDependencies` / an explicit `setup` script                                                                                                                                                |

### GUIDE problems (llms.txt § Migrating from v1 should say more)

| id   | area      | file:line                                                            | claim                                                                                                                                                                                                                                                                                                                                                                                                                  | failure scenario                                                                                                                                                                                                                                                                 | sev | evidence                                                                                                         | proposed fix                                                                                                                                                                                                                                                          |
| ---- | --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-G1 | migration | `llms.txt:84` ("v2's `complete()` rejects with an `AggregateError`") | The note describes the new _behaviour_ but not what a v1 call site must _do_. Two consequences are unstated: (i) `complete(cb)` returns a promise you now have to catch — the v1 idiom `kiss.generate(function(){ this.complete(function(){…}) })` leaves an unhandled rejection; (ii) on failure the callback **does not run at all**, so post-build work (sitemap, index generation, deploy triggers) silently stops | A migrating site "works", then one bad CMS record turns a 200-page build into a raw node stack trace with no sitemap. I hit exactly this on the first run                                                                                                                        | P1  | `build-nomodels.log:975-1045`; `lib/kiss.js:561` (`if (callback && this._failures.length === 0)`)                | add a two-line recipe: `const done = kiss.complete(cb); done.catch(err => { for (const f of err.failures) …; process.exitCode = 1 })`, plus the sentence "a failed build never runs your `complete()` callback — anything you do there must be repeated in the catch" |
| F-G2 | migration | `llms.txt:85` (duplicate output paths)                               | The change is stated; no migration recipe is offered, and it is not flagged that v1's tolerance was a _usable idiom_ (register the low-priority fan-out last and let it be skipped)                                                                                                                                                                                                                                    | A site built on that idiom migrates cleanly, passes review, and fails its first production build after the CMS gains one overlapping slug                                                                                                                                        | P2  | `generate-pages.js:1007-1009` (the site's own comment naming the v1 behaviour); `repro-dup/`                     | say "if you relied on v1's skip to give one source priority over another, dedupe the slugs yourself before registering — the engine no longer picks a winner", and name the symptom string `Page already processed`                                                   |
| F-G3 | migration | `llms.txt:80-86`                                                     | The § lists only what changed. It never says which v1 surfaces **survived**, so a migrator has to test each one. I had to verify by experiment that the per-page `generate: false` option still works, that `_stack[].buildTo` / `page.options` are still shaped for a hand-rolled sitemap, and that `callback.call(this, …)` still binds the Kiss instance — this site uses all three                                 | Migrators spend time re-deriving non-changes, or worse, "modernise" working code                                                                                                                                                                                                 | P3  | `lib/kiss-page.js:90,99`; `lib/kiss.js:160-190,494,561`; green build with the site's own sitemap block untouched | add a short "unchanged in v2" list — at minimum `generate:` per page, callback `this` binding, and a note that `_stack` is internal and unversioned                                                                                                                   |
| F-G4 | migration | `llms.txt:19` (controller purity)                                    | Purity is stated as an absolute, with the consequence given only for `.watch()`. It does not say **which model kinds are re-resolved** on a whole-site rebuild. This site mutates its model in ~20 controllers (`model.path = "blog"`, in-place `model.sort(...)`, `model.enrolmentDates = …`)                                                                                                                         | A migrator reading the warning literally concludes 20 controllers must be rewritten before the site can move. In fact file/folder models are re-read per page and per replay, so only inline object models accumulate — and this site's two inline models happen to be read-only | P2  | `lib/model-resolver.js` (60 lines, no cache); dev step (d) passed twice with mutating controllers in the chain   | qualify it: "file, folder and URL models are re-resolved on every whole-site rebuild, so in-place mutation of those is contained to one build; an **inline object** model is replayed from a shallow snapshot and _does_ accumulate"                                  |

### ENGINE problems (kiss-ssg)

| id   | area         | file:line                                   | claim                                                                                                                                                                                                                         | failure scenario                                                                                                                                                                                                                                                                                                                                                        | sev | evidence                                                                                                                                                                                                                                                            | proposed fix                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-E1 | engine/build | `lib/kiss.js:206` (`_prepareMultiplePages`) | A `.pages()` fan-out aborts at the first item whose controller throws: later items are never registered, never rendered, and **not reported** — one failure entry stands for N missing pages                                  | diploma-msc fans out 64 catalog pages from one `.pages()` call. One malformed CMS record → 1 error line, up to 63 product pages silently absent from the tree. The build does fail (so nothing ships silently), but the operator is told about one page and loses many                                                                                                  | P2  | `repro-fanout/run.mjs`: 4 items, controller throws on item-2 → `FAILURES REPORTED: 1`, `pages written: ['item-1.html']` (items 3 and 4 vanish with no mention). Same shape in the real build: `build2.log:2412` — 64 catalog models, one `view: 'catalogs'` failure | wrap the per-item controller/prepare step in its own try/catch inside the loop: record a failure per item (`buildTo` unknown → name it by view + item slug) and continue with the rest, so N bad items produce N failures and the good items still build                                                                                                   |
| F-E2 | dev          | `lib/kiss.js:100-107`                       | When the dev server cannot bind, the failure is (i) mislabelled — `Error running live reload server` for the _static HTTP server_ — and (ii) non-fatal: the build runs to completion and the process stays up serving nothing | I lost ~10 minutes to this. The log says `Serving … http://127.0.0.1:3001` (printed before the bind resolves), the site's own script then prints `http://localhost:3001`, and every request is ECONNREFUSED. The two error lines are ~500 lines apart in a verbose build log                                                                                            | P2  | `dev-raw.log`: line 226 `Serving … 3001`, line 231 `Dev server error listen EADDRINUSE`, line 232 livereload EADDRINUSE, line 752-753 `Error running live reload server / listen EADDRINUSE … 3001`; `curl` → connection refused                                    | (a) give the HTTP server its own message naming the port and the consequence — `Dev server could not bind 127.0.0.1:3001 (EADDRINUSE) — the site is NOT being served`; (b) print it again at the end of the build, where it will be seen; (c) consider making a dev-server bind failure fatal — unlike live reload, there is nothing left to do without it |
| F-E3 | dev          | `lib/dev-server.js:27` + `lib/kiss.js:100`  | One bind failure is reported twice, in two different phrasings, from two handlers (`server.on('error')` and `ready.catch`)                                                                                                    | Reads as two separate faults; makes the log harder to triage, and the second phrasing is the wrong subsystem                                                                                                                                                                                                                                                            | P3  | `dev-raw.log:231` and `:752`                                                                                                                                                                                                                                        | let `ready.catch` own the message and drop the duplicate, or tag both with the same subsystem name                                                                                                                                                                                                                                                         |
| F-E4 | livereload   | `lib/dev-server.js:31-37`                   | The livereload watcher emits one `reload` per output file, so the first `reload` reaches the browser ~0.85 s after an edit while a whole-site replay keeps writing for seconds afterwards                                     | On a big site a browser can reload against a page that has not been re-rendered yet, then sit on stale content until the next edit. Not observed as a failure here (my 1.5 s-later re-fetch always had the new content, and the 100 ms settle covers the half-written-file case), but the 0.86 s / 3.25 s two-burst pattern after a model edit shows the window is real | P3  | `lr-test.log:42-46` (burst at 0.863 s) vs `:130-134` (second burst at 5.627 s) for one edit                                                                                                                                                                         | coalesce a rebuild's writes into a single `reload` emitted when the rebuild settles, rather than one per file                                                                                                                                                                                                                                              |

Nothing else surfaced. Notably **clean** on this consumer: CJS `require()` interop, the per-instance
Handlebars env for all 16 site helpers, `copyAssets` to a second directory, Sass compilation (`includePaths`
into `node_modules/bootstrap/scss`), the `view: "<folder>"` + controller-supplied-view idiom this site uses
for all 64 product pages (`repro-viewfolder/` → both pages rendered from the right template), `generate: false`
page skipping, HTML minification, the hand-rolled sitemap over `_stack`, and every dev/livereload path in step 5.

## Caveats on the environment

- **Ports 3001 and 35729 were intermittently occupied** by a process outside my PID namespace — the culprit
  surfaced as `node 2-page.js` then `node 4-layouts-and-partials.js` with `cwd=/home/user/kiss-ssg/examples`,
  i.e. a sibling session running `npm run eg1…eg6`, whose examples bind those exact defaults. Every EADDRINUSE
  in `dev-raw.log`/`dev2-raw.log` is that, not an engine fault; step 5 was rerun on 3456/35931 and passed
  cleanly. It did, however, expose F-E2 — so the interference was accidentally useful.
- **The engine working tree changed under me at 22:49** (before my first write, after my first `git status`):
  `docs/index.html` and `src/partials/readme.md` deleted, `src/partials/usage/*.md` modified — consistent with
  someone running `node docs` in the sibling session. I touched nothing in `/home/user/kiss-ssg`; my only
  interaction was reads plus an `--ignore-scripts` file: install (so the engine's `prepare` hook never ran).
- The consumer clone keeps the three migration edits plus the two marked `[offline-test harness]` edits, my
  `src/models*` fixtures, and `package.json` pointing at `file:../kiss-ssg`. Nothing was committed or pushed.
