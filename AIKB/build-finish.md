# build-finish.js

## Responsibility

What a settled build says about itself: the build report (`_finishBuild()`, and its re-derivation
`_refreshReport()`), and the four things the settle path decides beside it — the link scan
(`_checkLinks()`), the launch-readiness audit (`_runAudit()`), the redirect files and their
findings (`_writeRedirects()`, `_redirectFindings()`, `_lastBuildRecord()`), and the site's
knowledge-base record (`_buildAikb()`). `lib/kiss.js` decides _when_ each runs — `complete()`'s
settle path calls the redirect write, the scan and the audit above its three-way branch, and
`_finishBuild()` after it (`AIKB/kiss.md`) — and this module does the run and records the result
on the instance. The pure work is elsewhere: `lib/build-report.js`, `lib/links.js`,
`lib/audit.js`, `lib/redirects.js`, `lib/aikb.js`.

Every function takes the `Kiss` instance and reads its state at call time. The state stays on
`Kiss` — `_report`, `_finishedAt`, `_aikbVerdict`, `_links`, `_audit`, the `_redirects*` fields —
and each private method on `Kiss` is a one-line delegator to the function here. Calls between
these functions, and into the rest of the instance, go through it (`kiss._buildAikb()`,
`kiss._reportInputs()`, `kiss._stackForRecord()`, `kiss._reportedPath()`), so a test that patches
one on the instance is seen.

## Public interface

Each is the body of the `Kiss` private method named beside it:

- `finishBuild(kiss)` — `_finishBuild()`; `reportInputs(kiss)` — `_reportInputs()`;
  `refreshReport(kiss)` — `_refreshReport()`.
- `buildAikb(kiss)` — `_buildAikb()`.
- `runLinkCheck(kiss, { quiet })` — `_checkLinks()`; `runAudit(kiss, { quiet })` — `_runAudit()`.
- `writeAliasRedirects(kiss)` — `_writeRedirects()`; `findRedirectChanges(kiss)` —
  `_redirectFindings()`; `lastBuildRecord(kiss)` — `_lastBuildRecord()`.

Three are named apart from their method because the method's own name is a function this module
imports: `checkLinks` (`lib/links.js`), `writeRedirects` and `redirectFindings`
(`lib/redirects.js`).

## Depends on

`fs-extra`, `./utils.js`, `./build-report.js` (`buildReport`, `auditLines`), `./links.js`,
`./audit.js`, `./redirects.js` (`collectAliases`, `redirectFindings`, `writeRedirects`),
`./check.js` (`readReportsFile`, `aikbRecordRequested`), `./aikb.js` (`buildSiteMap`,
`isRecorded`, `writeAikb`, `writeLastBuild`).

## Depended on by

`lib/kiss.js` only, through its delegating methods.

## Non-obvious behavior

- **`_writeRedirects()` now writes up to two files, and only one of them is the host's.** `redirects.json` — the host-neutral IR — goes out on every build that has an alias, whatever `config.redirects.format` says; the format picks what goes beside it. `_redirectsPath` stays the **host** file, so the report's `redirects.file` keeps the meaning it had in 2.3, and it is `null` under `format: 'none'`: the honest answer for a build that deliberately wrote no host file, rather than a path that would read as a redirect some host is serving. A custom writer runs inside the same promise the `.catch` below wraps, so a writer that throws fails the build exactly as a failed write does — swallowing it would rebuild, in the site's own code, the silent no-op the format block exists to end.
- **Every settled build assembles exactly one report** (`_finishBuild()`, `AIKB/build-report.md`), after the staging folder has been promoted or discarded so every path in it names the folder the site asked for. It is latched on `_report` rather than on `_failuresReported`, because the nested-`complete()` pattern settles one build twice and `KISS_REPORT` takes one line per build, not per call; `_report` (and `_idIndex`/`_idNoticed`, `_sitemapPath`, `_llmsPath`, `_feedPath`, `_links`, `_audit`, `_debugWritten`, `_redirectsPath`, `_redirectsJsonPath`, `_redirectsFiles`, `_redirectsResult`, and `_startedAt`) reset in `_replay()` beside the failure sweep, so a watch rebuild reports itself rather than the first build, and `duration` measures that rebuild rather than the hours the dev server has been up. The report is deliberately additive: `complete()` still resolves with the `generate` data array and still rejects with the `AggregateError` — consumers documented in `llms.txt` rely on both — and the report rides along on `err.report`.
- **Three report keys are wired here before the modules that fill them exist.** `_finishBuild()` passes `links: this._links`, `redirects: this._redirectsResult` and `feed: this._feedPath` into `buildReport`, `links` is filled by `_checkLinks()`, `redirects` by `_writeRedirects()`/`_redirectFindings()` (above) and `feed` by `.feed()` — the three modules that fill the seam have all landed, and each key is still `null` on a build that did not do that piece of work, which is not the same as "it did it and found nothing". The fields are the whole seam: `_links` and `_redirectsResult` are the findings, `_redirectsPath` and `_feedPath` are the files as written — staging paths under `'atomic'` and under check, mapped into the report by `buildReport` exactly as `_sitemapPath` and `_llmsPath` are — and `_feedRequest` is the standing request a replay re-issues. That last one is the one field `_replay()` deliberately does **not** reset: like `_sitemapRequest` and `_llmsRequest` it is the request rather than the result, and clearing it would leave the re-issue block with nothing to re-issue.
- **The knowledge base is built from `_finishBuild()`, in a fixed order, and it is the only writer that cannot use the promise queue.** `_buildAikb()` runs first — before `buildReport()` — because the report carries the verdict as its appended `aikb` key; `last-build.json` is written afterwards, because it _is_ this build's report. `.sitemap()` and `.llms()` need only the registry and so can wait on `_promises`; the map's partial-per-page index is learned from _rendering_, so anything earlier than a settled build would list no partials at all. A failure to write is logged and reported as `written: false` — never a build failure, the same stance as the `dependency-graph.json` dump.
- **`_buildAikb()` decides in two steps: is there a knowledge base here, and may this build write it.** `folders.aikb` unset → `aikb: null`, nothing built. Otherwise `record = aikbRecordRequested()` (`KISS_AIKB`, read by exactly the rule `KISS_CHECK` is read by, beside `checkModeRequested()`) and the site is opted in when `record || isRecorded(folder)` — `isRecorded` (`lib/aikb.js`) being "`<folder>/site-map.json` is there", the one file only a record writes. Not opted in → `aikb: null` and no map is built, which is why an ordinary build of a site that has never recorded costs one `stat`. Opted in → the map is built and the notes evaluated whatever happens next, and `write = record && !config.dev && failures.length === 0`. A record refused for either of those last two reasons logs a notice naming the reason: the operator is waiting for the folder to change, and silence would read as success. There is no per-build state to reset, so a watch replay needs no hook — `_replay()`'s own `complete()` re-enters `_finishBuild()`, and in dev nothing is written anyway.
- **`_promotedFrom` exists because the dependency graph outlives the staging folder.** `_promote()` rewrites every stack entry's `buildTo` to the real folder but leaves the graph, whose page keys are the paths the pages were actually written to — staging paths, under `cleanBuild: 'atomic'`. It therefore parks the staging prefix on `_promotedFrom` before clearing `_stagingDir`, and `_finishBuild()` passes `_stagingDir ?? _promotedFrom` to both `buildSiteMap` and `buildReport`. Without it a promoted atomic build produced a map with no partials in it at all — and a report whose `sitemap` and `llms` named a folder that no longer existed, since neither `_sitemapPath` nor `_llmsPath` is rewritten by the promotion either. Mapping a path that is already real is a no-op, so nothing else moves.
