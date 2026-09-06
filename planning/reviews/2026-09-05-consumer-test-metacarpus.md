# metacarpus × kiss-ssg 2.0.0-alpha.1 — consumer compile test

Consumer: `learna-ltd/metacarpus` ("Learna Student Handbooks", https://handbooks.learna.ac.uk/), fresh shallow clone at `/home/user/metacarpus`, previously on `kiss-ssg ^1.1.2`.
Engine: `/home/user/kiss-ssg` @ `review/v2-critical-friend`, `2.0.0-alpha.1` (read-only; never modified). Node 22.22.2. Ports: dev 3101, livereload 35829.
Scratch artefacts: `/tmp/claude-0/-home-user/39387e05-fcfa-5e5b-b24f-830d3dee7246/scratchpad/metacarpus/`.

**Headline: it builds, and it builds _correctly_.** After two migration edits and one site-data repair, all 98 pages of a cohort render, and the v2 output is **byte-identical to the site's own committed v1 output** once the cohort name is normalised (`diff` of `2026-sept` vs `2027-march` with `s/2026-sept/cohort/` → empty). The versioned-cohort model is safe under v2's default `cleanBuild: true`: building a second cohort left the first's 107 files bit-identical.

## 1. Install

| Step                                               | Result                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `npm install --ignore-scripts`                     | OK, 266 packages, 3s                                             |
| `npm install /home/user/kiss-ssg --ignore-scripts` | OK; `package.json` → `"kiss-ssg": "file:../kiss-ssg"`, symlinked |
| Resolved version                                   | **`2.0.0-alpha.1`** ✅                                           |
| `npm run build:css` (Tailwind, outside kiss)       | OK offline, 17s, wrote `src/assets-cohort/css/output.css`        |

`--ignore-scripts` was a choice, not a failure recovery: metacarpus's `postinstall` is `npm install rimraf -g && npm install -g firebase-tools`, i.e. it mutates the global toolchain on every install. Nothing in the build needs it (`rimraf` is also a local dependency). Node floor is a hard blocker as the site is configured — see I-1.

## 2. Data

- Committed model data: `src/models-dump/studentHandbooks/all-studentHandbooks.json` (1.2 MB, **100 handbooks**). `src/models/` is `.gitignore`d, so the clone has no model folder at all — and `.pages({ model: 'studentHandbooks' })` reads `src/models/studentHandbooks/`.
- `get-data-orchard.js` needs `ORCHARD_URL`/`CLIENT_ID`/`CLIENT_SECRET`/`USERNAME`/`PASSWORD`; there is no `.env`. **Skipped — no network fetch performed.**
- Instead the model folder was rehydrated **offline from the committed dump**, using exactly the transform `get-data-orchard.js` applies (`content.writeToFile`: one file per `item.slug`, `JSON.stringify(item, null, 0)` with the same two `.replace()` calls). 100 files. Nothing invented; every byte came from the committed dump.
- Data shape: 100 items, **no duplicate slugs**, none missing. 97 have `validatingPartner.abbreviation` (UoB 40, USW 57); 3 do not (Applied Clinical Psychology PgDip + MSc, Sport and Exercise Nutrition MSc) — deliberately skipped by the site, see G-1.
- Committed cohort outputs: 18 folders `handbooks/2018-march` … `handbooks/2026-sept`, 98 HTML each. `handbooks/test` is gitignored.
- `node new-cohort test` runs fully offline (it _is_ the `dev` script) — see §5.

## 3. Migration — every edit, and why

Guide followed: `llms.txt` § Migrating from v1. Two edits, both in `new-cohort.js`.

| #   | File:line              | Edit                                                                                                                                  | Why                                                                                                                                                                                                                                                            |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | `new-cohort.js:90-96`  | Added `.catch()` on the `complete()` promise, printing `err.message` + each `err.failures[]` entry and setting `process.exitCode = 1` | **Guide bullet:** "v1 logged a page's render/write failure and resolved anyway; v2's `complete()` rejects with an `AggregateError`". Unhandled, v2 kills the process with a raw 2 417-line dump in which the actual cause appears 40 times with no page names. |
| M-2 | `new-cohort.js:13, 46` | Added `const livereloadPort = process.env.LOCAL_LIVERELOAD_PORT \|\| 35729` and passed `livereloadPort` in the Kiss config            | v2 **added** `livereloadPort`; without it every kiss dev site injects `:35729`, so a second site's pages poll the first site's reload server. Mirrors the site's own `port` idiom. Also what let this test coexist with the sibling diploma-msc run.           |

**Nothing else in the guide applied.** Verified individually, no change needed: CJS `require('kiss-ssg')` works on Node 22 ✅ · helpers already on `kiss.handlebars` (`new-cohort.js:52-55`) ✅ · `utils` not imported ✅ · controllers use `module.exports` ✅ · `folders.root` not used ✅ · no duplicate output paths (100 distinct slugs) ✅ · `generate`-callback ordering not depended on ✅ · dynamic partials already use the native `{{> (lookup . 'key')}}` form the guide recommends ✅.

**One separate, clearly-labelled site-data repair** (not a migration edit — see B-1):

| #   | File:line                          | Edit                                                             | Why                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `src/utils/university-data.js:100` | Added `moodleAccess: 'moodle-access'` to the `uob.general` block | Restores the value the site's own committed output proves was there: `handbooks/2026-sept/diploma-in-cognitive-behavioural-therapy.html` contains the rendered text of `src/partials/moodle-access.hbs`. Without it 40 of 98 pages fail. Not invented — recovered from committed output, identical to the value the other three universities carry. |

## 4. Build

### 4a. Cohort builds

| Run                   | Command                      | Exit  | Pages                          | Notes                                           |
| --------------------- | ---------------------------- | ----- | ------------------------------ | ----------------------------------------------- |
| Baseline (unmigrated) | `node new-cohort 2027-march` | 1     | 58/98                          | Raw unhandled `AggregateError`, 2 417 lines     |
| After M-1/M-2         | same                         | 1     | 58/98                          | Clean one-line summary + 40 named failure paths |
| After R-1             | same                         | **0** | **98/98**                      | 2 seconds                                       |
| Real cohort name      | `node new-cohort 2027-sept`  | **0** | **98/98**                      | 3 seconds                                       |
| Publish step          | `node export`                | 0     | 20 cohorts + index → `public/` | index links every cohort incl. both new ones    |

98 = 100 models − 3 without a validating partner (skipped by design) + 1 hand-written index.

**Output fidelity — the strongest result.** `diff` of the v1-built committed `handbooks/2026-sept/diploma-in-cardiology.html` against the v2-built `handbooks/2027-march/diploma-in-cardiology.html`, with the cohort string normalised, is **empty**. Same for `msc-in-cardiology.html` and `index.html`. Per-page `<title>` is correct per item.

### 4b. Versioning check — does cohort B disturb cohort A?

Method: fingerprint `handbooks/2027-march` (107 files, md5 each) and the whole archive; build `2027-sept` into its own folder; re-fingerprint.

```
A FILE LIST: IDENTICAL          (107 files, before == after)
A CHECKSUMS: IDENTICAL          (md5 of all 107, before == after)
ARCHIVE: 20a21 > handbooks/2027-sept        (only addition)
handbooks/2026-sept/index.html: OK          (md5sum -c)
handbooks/2018-march/index.html: OK
```

**Verdict: `cleanBuild` is correctly scoped to `config.folders.build`.** `_setupFolders()` (`lib/kiss.js:114-125`) calls `fs.emptyDirSync(this.config.folders.build)` and nothing wider. With `folders.build = './handbooks/<cohort>'` per instance, earlier cohorts are untouchable. Unchanged from v1 (v1.1.2 `kiss-ssg.js:321,376-379` has the same default and the same call). Two real hazards remain in _how the site drives it_ — B-2 and B-3.

## 5. Dev mode + live reload

`LOCAL_BIND_PORT=3101 LOCAL_LIVERELOAD_PORT=35829 node new-cohort test`

| Check                                                                                                         | Result                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Serving" line                                                                                                | `Serving (…/handbooks/test): http://127.0.0.1:3101` ✅                                                                                                  |
| `GET /` · `/index.html`                                                                                       | 200 · 200                                                                                                                                               |
| `/diploma-in-cardiology.html` · `/msc-in-cardiology.html` · `/sports-and-exercise-nutrition-certificate.html` | 200 · 200 · 200                                                                                                                                         |
| `/css/output.css` (the Tailwind build, via `copyAssets`)                                                      | 200                                                                                                                                                     |
| `/nope.html`                                                                                                  | 404                                                                                                                                                     |
| Livereload snippet                                                                                            | `s.src = 'http://' + (location.hostname \|\| 'localhost') + ':35829/livereload.js?snipver=1'` — **uses `location.hostname` and the configured port** ✅ |
| WebSocket handshake to `ws://127.0.0.1:35829/livereload`                                                      | server `hello` with protocols official-7/8/9 ✅                                                                                                         |
| Edit `src/partials/toc.hbs` → `reload`                                                                        | arrived **< 5 s**; served page and on-disk file both carry the marker ✅                                                                                |
| Edit `src/models/studentHandbooks/diploma-in-cardiology.json`                                                 | `change: …json` → `Rebuilding site:` → new title rendered ✅                                                                                            |
| Create `src/partials/kiss-v2-new.hbs`, then reference it                                                      | `add:` → replay → partial renders, **no restart** ✅                                                                                                    |
| `pkill` → ports released                                                                                      | `ss -ltn` shows 3101/35829 free; `curl` exit 7 ✅                                                                                                       |
| Errors in the whole dev session                                                                               | **0**                                                                                                                                                   |

Incidental: HTML comments are stripped **even in dev** — the first `<!-- marker -->` probe vanished (see G-3).

## 6. Findings

`id | area | file:line | claim | failure scenario | severity | evidence | proposed fix`

### P1

**B-1 — SITE — `src/utils/university-data.js:94-100` (uob `general`) × `src/partials/learna-login.hbs:8`**
`uob.general` carries no `moodleAccess` key, but `learna-login.hbs` — shared by all four universities' `login-details` partials — does `{{> (lookup . 'moodleAccess') }}`. USW, UoG and UWTSD all define it; UoB does not.
_Failure:_ every UoB page (22 PgDip + 18 MSc = **40 of 98**) throws `The partial undefined could not be found`. **Under v1 this was silent** — logged, build resolved, so a published cohort shipped 58 pages and the deploy exited 0 with 40 handbooks missing. v2 makes it a hard failure. Archetypal "v1-silent problem, now loud by design", and v2 is right.
_Evidence:_ `build-migrated.txt:885` lists all 40 paths; the key was isolated with a `lookup`-shadowing probe (`probe.cjs`) → `LOOKUP-UNDEFINED key=moodleAccess`. The site's own committed `2026-sept` UoB page contains the rendered `moodle-access.hbs` text, proving the key used to be there.
_Fix:_ restore `moodleAccess: 'moodle-access'` to `uob.general` (applied as R-1).

**B-2 — SITE — `new-cohort.js:34` + `:48`**
`generateHandbooks(args[0].toLowerCase())` does not validate the cohort name, and the name is interpolated straight into `folders.build`. An empty argument makes `build = './handbooks/'`, which v2 normalises to `'./handbooks'`.
_Failure:_ `node new-cohort ""` (or an empty shell variable in CI) empties **the entire archive — all 18 published cohorts — at construction time**, before a single page renders. Recoverable only from git.
_Evidence:_ `wipe-repro/repro.cjs`:

```
before: [ '2025-sept', '2026-sept' ]
resolved build: ./handbooks
after construction: []
```

_Severity:_ P1 despite being pre-existing (v1 identical) — the versioned layout is exactly the shape that makes it catastrophic.
_Fix:_ reject a cohort name that is empty or not `/^[a-z0-9][a-z0-9-]*$/` before constructing `Kiss`.

**B-3 — SITE (with a GUIDE component) — `new-cohort.js:26,34` × `lib/kiss.js:114-125`**
`cleanBuild` empties `folders.build` **in the constructor**, before any model resolves or page renders. The site's "already generated" guard exists only on the interactive prompt path; passing the cohort as argv (which is how `npm run new-cohort` ends, and the natural way to re-run one) bypasses it.
_Failure:_ re-running a **published** cohort to fix one typo destroys it first and, if the build then fails, leaves it destroyed or half-built. Not hypothetical: the pre-repair run left `handbooks/2027-march` with 58 of 98 pages and exit 1 — had that been `2026-sept`, a live cohort would have lost 40 handbooks with no undo.
_Evidence:_ `wipe-repro/rebuild.cjs`:

```
before: [ 'about.html', 'index.html' ]
after construction, before any render: []
BUILD FAILED: 1 page(s) failed to build: ./handbooks/2026-sept/index.html
cohort folder now: []
```

_Fix (site):_ apply the existence guard to the argv path, or build to a temp dir and swap on success. _Fix (guide):_ `llms.txt` says only "empties `config.folders.build` before generating" — it does not say _at construction_, nor that a failed build leaves the folder emptied. For any site building into a directory that holds published output, that ordering is the single most important fact about the flag.

### P2

**I-1 — SITE/ENGINE — `/home/user/metacarpus/.nvmrc` vs `kiss-ssg` `engines.node`**
Site pins Node **18.19.1**; kiss v2 requires **`>=22.12.0`**.
_Failure:_ anyone following the site's own `.nvmrc` (or a CI runner reading it) cannot run v2 at all.
_Evidence:_ `node -p "require('kiss-ssg/package.json').engines"` → `{"node":">=22.12.0"}`; `cat .nvmrc` → `18.19.1`.
_Fix:_ bump the consumer's `.nvmrc`; and make it the first line of § Migrating from v1 — it gates every other step.

**G-1 — GUIDE — `lib/kiss-page.js:99`, `:167`; `llms.txt` § API `.page(options)`**
`options.generate === false` skips a page (`Skipping page generation:`). metacarpus **depends on this**: `university-data.js` returns `{ generate: false }` for an unrecognised university/qualification pair, and the controller sets it when a handbook has no validating partner — that is how the 3 partner-less handbooks stay out of the published site.
_Failure:_ the option appears **nowhere** in `llms.txt` (the `.page()` bullet lists `view, model, controller, title, description, path, slug, ext, config`), nowhere in README, nowhere in the migration guide. A site relying on it has no way to know it is supported, and a future refactor has no doc telling it this is load-bearing. Had v2 dropped it, metacarpus would silently start publishing 3 "Unknown validating partner" pages.
_Evidence:_ v1 `kiss-ssg.js:201` `if (template && this.options.generate)`; v2 `lib/kiss-page.js:99` the same. Build log: `Skipping page generation: handbooks/unknown.hbs` ×3; 98 files, not 101.
_Fix:_ document `generate` (default `true`) in the `.page()` option list — it is the answer to "how do I conditionally not build a fanned-out page", a real need in any `.pages()` site.

**M-3 — GUIDE — `export.js:71-75`**
`export.js` calls `.generate(callback)` and **never calls `.complete()`**. Under v2 a page or controller failure is collected but nothing rejects, so the deploy entry point exits **0** with a broken `public/`.
_Failure:_ `npm run deploy` (`npm run export && firebase deploy`) ships a site missing pages, reporting success.
_Evidence:_ `lib/kiss.js:502-531` — `generate()` fires the callback regardless; failures surface only via `complete()`. `llms.txt` states this correctly under `.generate()`, but § Migrating from v1 does not — and a v1 site has no `complete()` habit to migrate.
_Fix:_ add to the migration guide: "v2 reports failures only through `complete()`; a v1 site that ends its chain at `.generate()` will keep exiting 0 on a broken build." (Applied as M-1 in `new-cohort.js`; `export.js` deliberately left as-is to preserve the record.)

**B-4 — SITE — `new-cohort.js:16-19, 31`**
The `readline` interface is created unconditionally at module load; `rl.close()` is only reached on the interactive branch, so the argv branch never releases stdin.
_Failure:_ `node new-cohort <cohort>` **never exits** when stdin is a pipe or socket (any CI runner). A **2-second** build hung past 300 s until stdin was `/dev/null`.
_Evidence:_ same build with `< /dev/null` → `EXIT:0 SECONDS:2`, 98 pages; without it, still running after 5 minutes with all 98 files already written.
_Fix:_ move `readline.createInterface` inside the `args.length === 0` branch. Pre-existing, but it will read as "kiss v2 hangs" to whoever migrates.

### P3

**G-2 — GUIDE/ENGINE — dynamic-partial diagnostics × `learna-login.hbs:8`**
When `{{> (lookup . 'key') }}` resolves to `undefined`, the only diagnostic is Handlebars' `The partial undefined could not be found`, ×40. It names neither the key nor the containing partial; the AggregateError names the _output path_, the log line names the _page view_ — neither is where the problem is.
_Failure:_ diagnosing B-1 required writing a custom `lookup` helper to shadow the built-in and log the key.
_Evidence:_ `probe.cjs` was necessary to get `LOOKUP-UNDEFINED key=moodleAccess`.
_Fix (sketch):_ register kiss's own `lookup` that, on `undefined`, logs `Dynamic partial lookup '<key>' is undefined` with the current view before delegating — ~5 lines in `lib/handlebars-helpers.js`, turning a 40-entry unreadable dump into one actionable line. Or document the diagnosis recipe.

**G-3 — GUIDE — `llms.txt` § `.generate(callback)`**
"HTML minified via `html-minifier-terser`, CSS/JS minified outside dev mode" reads as though HTML minification is dev-gated too. It is not: comments are stripped in dev.
_Evidence:_ `<!-- KISS-V2-PARTIAL-EDIT-MARKER -->` produced a correct reload and rebuild but zero occurrences in output; `grep -c "<!--"` → 0. A visible `<p>` marker worked immediately.
_Fix:_ reword to "HTML is always minified; CSS/JS minification is skipped in dev".

**B-5 — SITE — `export.js:15`** `.copyAssets('./src/assets-cohort', './handbooks/test')` runs _after_ the construction-time `./handbooks → ./public` copy (copies serialise in registration order, `lib/kiss.js:143-152`), recreating a stray `handbooks/test/` in the source tree that never reaches `public/`. Harmless (`clean` rimrafs it) — noted because the engine comment at `lib/kiss.js:140` names this consumer by name ("student-handbooks copies into its own assets folder"), so kiss already treats this site as a known shape.

**B-6 — SITE — `src/pages/handbooks/unknown.hbs:6`** `{{{stringify validating_partner}}}` uses the v1 snake_case field; the Orchard data is camelCase `validatingPartner`. Dead in practice (those pages are skipped by G-1), but it is the fallback view.

**B-7 — SITE — no `.sitemap()` and no `siteUrl` anywhere.** Neither entry point calls `.sitemap()`, so the site publishes no sitemap. Not a v2 issue — noted because "sitemap per cohort" was an explicit question: v2 would write it correctly per cohort (`.sitemap()` writes into `config.folders.build`, which _is_ the cohort folder), but the cross-cohort index built by `export.js` into `./public` would need its own `siteUrl` and its own call.

## 7. The versioned-cohort approach under v2

**What it is.** metacarpus is not one site — it is an **append-only archive of sites**. Each intake ("cohort": `2026-march`, `2026-sept`, …) gets its own full build of ~98 student handbooks into `handbooks/<cohort>/`, and is then **never rebuilt**: 18 such folders are committed to git, each a frozen snapshot of what students on that intake were handed. `export.js` copies the whole archive into `public/` and generates a top-level index linking every cohort by year. `node new-cohort test` is the dev loop — the same pipeline with `dev: true`, building the throwaway gitignored `handbooks/test` with live reload.

The mechanism is remarkably light. It rests on exactly three things kiss gives it:

1. **`folders.build` as the version key** — `build: './handbooks/' + cohort`, one `Kiss` instance per cohort. Everything else (pages, partials, models, controllers) is shared.
2. **An arbitrary config key carried into views** — `new Kiss({ cohort })`, read as `{{toUpperCase config.cohort}}` (`src/partials/uob/uob-cover.hbs:7`, `src/partials/cover-sheet.hbs:7`, `src/partials/uwtsd/cover-sheet.hbs:13`). That is the _only_ thing differing between two cohorts built from the same data — and it is why every cover reads "STUDENT HANDBOOK - 2027-MARCH".
3. **`copyAssets(src, cohortBase)` with `folders.assets: null`** — assets are pushed explicitly into the cohort folder rather than configured globally, so each frozen cohort carries its own CSS/images and stays renderable years later after the shared Tailwind build has moved on.

**What v2 changes for it.** Very little, and what it does change is in its favour:

- **`cleanBuild` is safe here.** The wipe is scoped to `folders.build`; the second cohort's build left the first's 107 files bit-identical. Same as v1 — no migration risk.
- **The orphan sweep is safe here.** `lib/kiss.js:683-692` removes only paths the _previous stack_ wrote and the new one does not; assets are never candidates and it cannot reach outside `folders.build`. Only `handbooks/test` is ever watched, so published cohorts are out of range entirely.
- **The output is unchanged** — byte-identical to the committed v1 build. That matters more than usual here: an archive whose old entries were built by v1 and new ones by v2 must not drift, and it does not.
- **v2's strictness is a net positive but shifts the risk.** B-1 is the whole story: v1 published a cohort with 40 handbooks missing and exited 0; v2 refuses. But because the wipe happens _before_ the render (B-3), v2's stricter failure model makes a _destroyed-and-not-rebuilt_ cohort more likely than v1 did — a louder failure now lands on an already-emptied folder. That interaction — `cleanBuild` at construction × failures at render — is the one thing this approach genuinely needs to know about v2.
- **`livereloadPort` newly makes the dev loop composable** — a real gain for a shop running the handbooks site and the marketing site side by side.

**Should kiss support it natively?** The pattern needs no new engine feature — it is already expressible, and elegantly so. What it needs is **acknowledgement in the docs**, because every sharp edge found here is an edge of the _versioned_ shape specifically:

- A short **"Building more than one site from one source tree"** section in README / `llms.txt`: one `Kiss` per output, `folders.build` as the discriminator, an arbitrary config key as the per-build variable read via `{{config.x}}`, and `folders.assets: null` + explicit `copyAssets` when each build must own its assets. Today a reader has to reverse-engineer all four from a consumer.
- A **`cleanBuild` warning** stating the wipe happens at construction, is unconditional, and is not rolled back if the build then fails — with the explicit advice: _if `folders.build` points at published output, validate the path first_.
- Optionally, one small config affordance would retire B-2 and B-3 together and is squarely in kiss's "small, dependency-driven" spirit: **build to a staging directory and promote on success** (`cleanBuild: 'atomic'`, or a documented build-and-rename recipe). For an append-only archive that is the difference between "a typo cost me a rerun" and "a typo cost me a published cohort".

Nothing here argues against v2 for this consumer. On the evidence it is a two-edit migration to byte-identical output, plus one site-data bug that v1 had been hiding for at least one intake.

## Appendix — artefacts

All under the scratchpad `metacarpus/` folder: `baseline.log`/`.txt` (unmigrated, raw AggregateError), `build-migrated.log`/`.txt` (clean failure report, 40 named paths), `build-repaired.log` (98/98, exit 0), `build-B.log`, `export.log`, `dev.log` + `lr.log`/`lr2.log`/`lr.mjs` (dev + livereload WebSocket transcripts), `probe.cjs` (the `lookup`-shadowing probe), `wipe-repro/repro.cjs` (B-2), `wipe-repro/rebuild.cjs` (B-3), the `A-files-*`/`A-sums-*`/`archive-*` versioning fingerprints, the `*.orig` pre-edit originals, and `v1/package/` (the `kiss-ssg@1.1.2` tarball used for every v1-vs-v2 behaviour comparison).

Clone state on exit: `new-cohort.js` (M-1, M-2), `src/utils/university-data.js` (R-1), `package.json`/`package-lock.json` (local engine), plus untracked `handbooks/2027-march`, `handbooks/2027-sept`, `public/`, `src/models/`. Never committed, never pushed. No node processes left running; ports 3101 and 35829 confirmed released. `/home/user/kiss-ssg` was never modified.
