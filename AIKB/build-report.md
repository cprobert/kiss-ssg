# build-report.js

## Responsibility

Turns one settled build into data: the JSON-safe `BuildReport` that `Kiss.report()` hands out, `err.report` carries, `KISS_REPORT` writes and `kiss-ssg check` prints — plus the one-line human rendering of it. Pure: every input is passed in, nothing here reads or writes anything.

## Public interface

- `buildReport({ stack, failures, manifest, buildDir, stagingDir, mode, startedAt, sitemap })` → `BuildReport`, whose keys are always in this order:
  - `ok` — `failures.length === 0`.
  - `mode` — `'build'` for a build that publishes, `'check'` for one that is staged and discarded.
  - `buildDir` — the folder the site asked for, never the staging sibling.
  - `duration` — ms since `startedAt` (`Kiss` passes its construction time).
  - `pages` — `{ view, buildTo, ok }` per stack entry, in registration order; `ok` is `false` when a failure names that output path.
  - `failures` — `{ view, buildTo, message }` per entry of `Kiss._failures`; the `Error` itself is not in the report.
  - `assets` — `{ source, target }` per asset-manifest entry: the build-relative path a template asks for, and the file that is actually there.
  - `sitemap` — the `sitemap.xml` this build wrote, or `null`.
  - `pipeline` — `{ name, ok, duration }` per `config.assets.pipeline` step this build ran, in order; `[]` when the site configured none.
- `formatReport(report)` → the summary line `ok|FAIL <buildDir> (<mode>) — N pages, M failed, K assets, Xms`, followed by one indented `<buildTo|view>: <message>` line per failure. What `kiss-ssg check --summary` prints instead of the JSON.

## Depends on

Nothing.

## Depended on by

`lib/kiss.js` (assembles one report per settled build in `_finishBuild()`), `bin/kiss-ssg.js` (`formatReport` for `--summary`).

## Non-obvious behavior

- **Every path in the report is mapped out of the staging folder** — page `buildTo`, failure `buildTo` and `sitemap` all go through the same internal `reportedPath(target, buildDir, stagingDir)`. `Kiss._reportedPath` does the same thing for the failure _message_; this is the same rule somewhere a unit test can reach it, and it is why `buildReport` takes `stagingDir` as well as `buildDir`. A staged build's paths are otherwise a folder with a random suffix that, in check mode, no longer exists by the time anyone reads the report.
- **A failure's `Error` is reduced to its `message` on purpose.** `JSON.stringify(new Error('x'))` is `{}`, so a report carrying the object loses exactly the text that says what went wrong. The object itself stays on the `AggregateError` `complete()` rejects with — the report is the serialisable view of the same build, not a replacement for it.
- **`assets` is the manifest, so it is keyed by the path a template writes**, not by the source file: a `.scss` appears under its compiled `css/site.css` name, and `target` is where cache busting put it (`css/site.a1b2c3d4.css`). See `AIKB/asset-manifest.md`.
- **A failure with no output path (`buildTo: null`) marks no page as failed** — a `.pages()` item, a controller, a callback or the dev server never reached the stack, so no `pages` entry belongs to it. It is still in `failures`, and it still makes `ok` false.
- **`pipeline` is appended, not slotted in beside `assets`.** It reports work that happens _before_ the copy, so its natural home would be above `assets` — but a consumer diffing two reports (or eyeballing one in a terminal) should see one new key rather than a reshuffle of the eight that were already there. A step's `Error` is dropped on the way in for the same reason a failure's is: the message is already in `failures`, under `<pipeline: <name>>`.
- **Key order is fixed** because the report is read as text at least as often as it is read as data — a diff of two runs should show what changed in the build, not a reshuffle.

## Types

`BuildReport`, `BuildPage`, `BuildAsset`, `BuildReportFailure` and `BuildPipelineStep` are declared here and re-exported from `lib/kiss.js` (`@typedef {import('./build-report.js').BuildReport} BuildReport`), the same way `KissConfig` is re-exported from `lib/config.js` — so a consumer reaches every one of them as `import('kiss-ssg').BuildReport`.
