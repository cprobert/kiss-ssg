# aikb.js

## Responsibility

Writes the site's own knowledge base — the folder `config.folders.aikb` names, default `./AIKB` — from one settled build. The third of the three "describe the site" writers: `sitemap.js` writes it for a crawler, `llms.js` for an answer engine, this one for the **next developer**, who is usually the same developer two years later with none of the context left.

It does two separable jobs. It **builds and renders the map** — pages, their models and controllers, which partials each one rendered, the partial→page index, the asset pipeline — which is regenerated on every build and must never be hand-edited. And it **evaluates the note rules** against the authored half of the folder (`notes/`), which the engine never writes: which subjects have no note (`missing`), and which notes have outlived their subject (`dead`).

Everything but the two writers is pure, and nothing anywhere reads a clock: two identical builds must produce byte-identical files, or the committed folder churns on every build and its diff stops meaning anything.

## Public interface

- `classifyModel(model)` → `file:<name>` / `folder:<name>` / `url:<url>` / `inline` / `none`, from the **registered** model option. The same three string tests `resolveModel` makes, in the same order.
- `classifyController(controller)` → `file:<name>` / `inline` / `none`, from the registered controller option.
- `pageOrigin(options)` → `{ model, controller }`. What `lib/kiss.js` calls in `page()`, before the chain replaces `options.model` with the resolved data.
- `buildSiteMap({ stack, graph, config, pipeline, buildDir, stagingDir })` → `SiteMap`: `{ site, pages[], partials{}, models[], controllers[], pipeline[] }`, every list sorted. `pipeline` defaults to `config.assets.pipeline`.
- `renderSiteMap(map)` → the markdown of `site-map.md`, one trailing newline.
- `renderAikbReadme()` → the markdown of `AIKB/README.md`.
- `noteSubjects(map)` → `{ kind, id }[]`, sorted by kind then id: every controller **file**, every **URL** model, every pipeline step.
- `notePathFor(subject, notesDir = 'notes')` → the note's path. `stockist.js` → `notes/controllers/stockist.md`; `https://api.example.com/v2/events?x=1` → `notes/models/api.example.com-v2-events.md`; `tailwind` → `notes/pipeline/tailwind.md`.
- `evaluateNotes(map, notesDir)` → `{ missing, dead }`, both sorted lists of paths, both built from `notesDir` so they are the paths a person would type.
- `async writeAikb({ map, folder, logger, write = true })` → `AikbResult` (`{ folder, written, notes }`). Writes `README.md` (only if absent), `site-map.md` and `site-map.json`. `write: false` evaluates and writes nothing. A write failure is logged and reported as `written: false`.
- `lastBuildRecord(report)` → the report with `duration` and every `pipeline[].duration` dropped, key order otherwise unchanged.
- `async writeLastBuild({ folder, report, logger })` → `boolean`. Writes `last-build.json`.

## Depends on

`fs-extra`; `./utils.js` (`globFiles`, `hashId`, `posixPath`); `./build-report.js` (`reportedPath`, `reportedView` — both exported for this module).

## Depended on by

`lib/kiss.js` (`Kiss.aikb()`, and `Kiss._buildAikb()` inside `_finishBuild()`). The generated files are read by the `kiss-memory` plugin's `kiss-catch-up`, `kiss-pulse` and `kiss-close` skills, and `last-build.json` is the file `kiss-ssg check --against` is normally pointed at.

## Non-obvious behavior

- **The map is written after the build settles, not on the promise queue.** `.sitemap()` and `.llms()` need only the registry, which is complete once `_promises` has drained. The partial-per-page index is learned from _rendering_ (`lib/dependency-graph.js`), so a map built at that point would list no partials at all. `Kiss._finishBuild()` is the one place where every page has rendered — which is also where the report is assembled, so the report can carry the verdict.
- **The model classification comes from the registration, not the stack.** By the time a page is on the stack, `options.model` _is_ the resolved data: a map read off the stack alone would say `inline` for every page in the site. `Kiss.page()` calls `pageOrigin(options)` after its two auto-mappings and hands the result to `_preparePage`, which parks it on the stack entry as `entry.origin`. It is deliberately not a key on `options`: every own key of a registration reaches the render context and the dev-mode `.json` sibling.
- **The dependency graph is keyed on the path a page was written to, which under `cleanBuild: 'atomic'` is the staging path.** A promotion rewrites each stack entry's `buildTo` to the real folder but leaves the graph alone, so `graph.usesOf(entry.buildTo)` returns `[]` after a successful atomic build. `buildSiteMap` therefore inverts `graph.toJSON()` and maps **both** sides through `reportedPath`, and `Kiss` passes `_stagingDir ?? _promotedFrom` so the prefix survives the promotion.
- **`README.md` is written once and never overwritten.** It is the one file in the folder that asks the reader to write something; a build that rewrote it every time would be punishing them for doing what it asked.
- **Nothing under `notes/` is ever written, moved or deleted by the engine.** The two rules are findings on the report and nothing more: they never change `ok`, and `exitCodeFor` does not read them. A strict mode is a deliberate non-goal — a rule that fails a build for a missing paragraph gets a paragraph of filler, not a paragraph of judgement.
- **Inline controllers and inline (object) models are not subjects, and cannot be.** There is no file to hang a note on and no stable id to name one by. Example 8's index page has an inline controller and is deliberately not a subject; its fan-out's `stockist.js` is. This is a documented limit, not an oversight.
- **A note's filename is derived from the subject's id, so two subjects can collide.** `a-x.js` and `a/x.js` both slug to `a-x`. Rare, and the alternative — a hash in the filename — would make the rule impossible to apply by hand, which is the property that matters more.
- **A URL model's note is named for the endpoint, not the request.** Host plus path, query and fragment dropped: the query is where the page number and the API key live, and a note per page of results is a note nobody writes.
- **Every `.md` under `notes/` that is not an expected note is `dead`,** including one filed under a folder the engine does not recognise. Silently ignoring it would hide it for ever, which is the failure mode the rule exists to catch.
- **`last-build.json` drops every duration, not just the top-level one.** The plan called for "the report minus `duration`"; a `pipeline[].duration` is timing too, and leaving it in would make the file churn on every build of any site with an asset pipeline — which is exactly the property the folder is committed for. Nothing reads those durations: `diffReports` pairs reports by `buildDir` and matches pages by `buildTo` and `hash`.
- **Markdown tables are emitted pre-aligned, the way prettier aligns them** — every cell padded to the widest in its column, a delimiter row of at least three dashes — so a committed `site-map.md` passes `prettier --check` and a pre-commit hook never has to rewrite a build artefact. Width is counted in code points rather than display columns; that is the same number for every character kiss can put in a cell (output paths are slugged to ASCII by `utils.toSlug`, and a partial name is a filename). `site-map.json` and `last-build.json` are `JSON.stringify` with two spaces, which is _not_ what prettier does to a short array — this repository's `.prettierignore` excludes example 8's generated JSON for that reason, and a consuming site should do the same.
- **A `generate: false` page is in the map,** as it is in the report: it is a registered page with a claimed output path, and hiding it would hide its model and controller too.
- **The folder is source, not output.** It sits outside `folders.build`, survives `cleanBuild`, is absent from `foldersToEnsure` (so a site that never calls `.aikb()` never gets an empty `AIKB/`), and is meant to be committed.

## Types

`SiteMap` with `SiteMapSite`, `SiteMapPage`, `SiteMapSource` and `SiteMapPipelineStep`; `NoteSubject`; `AikbResult`. The report's own view of the last of these is `BuildAikb` in `lib/build-report.js` — the same three fields, declared where the report shape is declared so `BuildReport` stays readable in one file. `Kiss.aikb()`'s reserved options are `AikbOptions` in `lib/kiss.js`, beside `SitemapOptions` and `LlmsOptions`.
