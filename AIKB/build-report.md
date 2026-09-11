# build-report.js

## Responsibility

Turns one settled build into data: the JSON-safe `BuildReport` that `Kiss.report()` hands out, `err.report` carries, `KISS_REPORT` writes and `kiss-ssg check` prints — plus the one-line human rendering of it. Pure: every input is passed in, nothing here reads or writes anything.

## Public interface

- `buildReport({ stack, failures, manifest, buildDir, stagingDir, mode, startedAt, sitemap, pipeline, llms, aikb })` → `BuildReport`, whose keys are always in this order:
  - `ok` — `failures.length === 0`.
  - `mode` — `'build'` for a build that publishes, `'check'` for one that is staged and discarded.
  - `buildDir` — the folder the site asked for, never the staging sibling.
  - `duration` — ms since `startedAt` (`Kiss` passes its construction time).
  - `pages` — `{ view, buildTo, ok, hash }` per stack entry, in registration order; `ok` is `false` when a failure names that output path, and `hash` is the sha1 the page recorded for the bytes it wrote (`null` when it wrote none).
  - `failures` — `{ view, buildTo, message }` per entry of `Kiss._failures`; the `Error` itself is not in the report.
  - `assets` — `{ source, target }` per asset-manifest entry: the build-relative path a template asks for, and the file that is actually there.
  - `sitemap` — the `sitemap.xml` this build wrote, or `null`.
  - `pipeline` — `{ name, ok, duration }` per `config.assets.pipeline` step this build ran, in order; `[]` when the site configured none.
  - `llms` — the `llms.txt` this build wrote, or `null`. Appended after `pipeline` for the same reason `pipeline` was appended after `sitemap`: a consumer diffing two reports should see one new key, not a reshuffle.
  - `aikb` — `null` when the site has no knowledge base to report on, and otherwise `{ folder, written, notes: { missing, dead } }` as `lib/aikb.js` evaluated it (`AIKB/aikb.md`). Appended last, for the same reason. It is passed through **unmapped**: the knowledge base is source-side and committed, so it is never staged and its paths are already the ones a person would type.
- `formatReport(report)` → the summary line `ok|FAIL <buildDir> (<mode>) — N pages, M failed, K assets, Xms`, followed by one indented `<buildTo|view>: <message>` line per failure, then one `  note missing: <path>` per subject with no note and one `  note dead: <path>` per note whose subject is gone. What `kiss-ssg check --summary` prints instead of the JSON.
- `reportedPath(target, buildDir, stagingDir)` and `reportedView(view)` — the staging→real path mapping and the inline-template elision, exported so `lib/aikb.js` reports the same paths and the same views as the report does.

## Depends on

Nothing.

## Depended on by

`lib/kiss.js` (assembles one report per settled build in `_finishBuild()`), `bin/kiss-ssg.js` (`formatReport` for `--summary`).

## Non-obvious behavior

- **Every path in the report is mapped out of the staging folder** — page `buildTo`, failure `buildTo`, `sitemap` and `llms` all go through the same `reportedPath(target, buildDir, stagingDir)`. `Kiss._reportedPath` does the same thing for the failure _message_; this is the same rule somewhere a unit test can reach it, and it is why `buildReport` takes `stagingDir` as well as `buildDir`. A staged build's paths are otherwise a folder with a random suffix that, in check mode, no longer exists by the time anyone reads the report.
- **A failure's `Error` is reduced to its `message` on purpose.** `JSON.stringify(new Error('x'))` is `{}`, so a report carrying the object loses exactly the text that says what went wrong. The object itself stays on the `AggregateError` `complete()` rejects with — the report is the serialisable view of the same build, not a replacement for it.
- **`assets` is the manifest, so it is keyed by the path a template writes**, not by the source file: a `.scss` appears under its compiled `css/site.css` name, and `target` is where cache busting put it (`css/site.a1b2c3d4.css`). See `AIKB/asset-manifest.md`.
- **A failure with no output path (`buildTo: null`) marks no page as failed** — a `.pages()` item, a controller, a callback or the dev server never reached the stack, so no `pages` entry belongs to it. It is still in `failures`, and it still makes `ok` false.
- **`pipeline` is appended, not slotted in beside `assets`.** It reports work that happens _before_ the copy, so its natural home would be above `assets` — but a consumer diffing two reports (or eyeballing one in a terminal) should see one new key rather than a reshuffle of the eight that were already there. A step's `Error` is dropped on the way in for the same reason a failure's is: the message is already in `failures`, under `<pipeline: <name>>`.
- **`aikb` is `null` on most builds, and that is not the same as "no knowledge base".** The key carries a verdict only when the site is opted in — `folders.aikb` set, and either this build is a record (`KISS_AIKB`) or `<folder>/site-map.json` is already there. A site that has never recorded reports `null`; once it has, every build reports `{ folder, written, notes }` with `written: false` unless this one was the record itself. See `AIKB/aikb.md`.
- **Note findings never touch the verdict.** `aikb.notes` is advisory: `ok` counts failures only, `exitCodeFor` (`lib/check.js`) does not read it, and a build with ten missing notes still exits 0. `formatReport` says them out loud because they are the half of a site's knowledge base a build cannot write for anyone — but a rule that failed a build for a missing paragraph would get a paragraph of filler, not a paragraph of judgement.
- **The report is not quite what `AIKB/last-build.json` holds.** That file is `lastBuildRecord(report)` (`lib/aikb.js`): the same keys in the same order, minus `duration` and minus every `pipeline[].duration`, so two identical records write the same bytes and a committed snapshot only ever changes when the site does. `readReportsFile` and `diffReports` read it happily — neither looks at a timing. Its `mode` is `'check'`, because `kiss-ssg aikb` stages and discards the build the way `check` does.
- **`hash` is read off the `KissPage` the stack entry carries** (`entry.page?.hash ?? null`), not computed here — this module never sees bytes, and the page is the only thing that knows what it actually wrote (`AIKB/kiss-page.md`). It is appended after `ok` for the reason `pipeline` and `llms` were appended to the report: one new key beats a reshuffle of the three that were there. `null` covers three cases that all mean the same thing — nothing is on disk for this page: it failed, it was never rendered, or it was registered with `generate: false`. A stack entry with no `page` at all (a hand-built one in a test) reports `null` too, so the shape never depends on who assembled the stack. What reads it back is `diffReports` in `lib/check.js`, which is why "no hash" has to be distinguishable from "some hash": it counts a `null` on either side as _changed_, never as unchanged.
- **Key order is fixed** because the report is read as text at least as often as it is read as data — a diff of two runs should show what changed in the build, not a reshuffle.

## Types

`BuildReport`, `BuildPage`, `BuildAsset`, `BuildReportFailure`, `BuildPipelineStep` and `BuildAikb` are declared here and re-exported from `lib/kiss.js` (`@typedef {import('./build-report.js').BuildReport} BuildReport`), the same way `KissConfig` is re-exported from `lib/config.js` — so a consumer reaches every one of them as `import('kiss-ssg').BuildReport`.
