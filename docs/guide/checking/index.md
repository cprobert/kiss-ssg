# Checking a build

Waiting for a build, dry-running it with kiss-ssg check, reading the report, and recording a site's knowledge base with kiss-ssg aikb.

## Waiting for the build

`.generate()` is chainable and returns immediately; its callback fires once every page has been attempted — including any that failed to render or write. Failures don't surface through this callback; they surface via `.complete()` (below). The callback's `data` argument (and `.complete()`'s resolved value) is `[{ id, data }]`, **one entry per queued promise in registration order** — the assets copy that runs automatically at construction is queued before any page you register, so `data[0]` is that copy's result, not your first page. Use `.getModelByID(id, data)` (see "Other methods" below) to pull out a specific page's model rather than indexing by position. To wait for the whole build (including a `.sitemap()` call and anything queued from a callback):

```js
await kiss.scan().generate().sitemap().complete()
```

`.complete()` waits for every page you queued, not just the ones `.generate()` had reached when it ran. Pages queued from a `.generate()` callback count — whether the callback queues them straight away or after an `await` — and so does a page queued after the last `.generate()` call, or one whose model was still loading when it ran: `.complete()` renders whatever is left before it resolves, so a slow model cannot cost you a page in a build that reports success. (It renders nothing if you never called `.generate()`.) The one thing it cannot see is a page a _synchronous_ callback defers to a later tick with `setTimeout` — queue those synchronously, or from an `async` callback.

If any page fails to render or write, the other pages still build but `.complete()` **rejects** with an `AggregateError`; `err.failures` lists them as `{ view, buildTo, error }`. That makes a broken build fail your script instead of silently shipping a site with a page missing:

```js
try {
  await kiss.scan().generate().complete()
} catch (err) {
  console.error(err.message) // e.g. 1 build failure: public/about.html
  process.exitCode = 1
}
```

A bad model is not a build failure — it is logged, that page is skipped, and it appears in the resolved data as `{ id, data: null, error }`. A bad controller _is_ a build failure: a controller that throws, one whose file is missing, one whose module does not export a function, and a `controller` option of an unrecognised type all fail that page and reject `.complete()`, rather than shipping a page built from un-controlled options. In a `.pages()` fan-out that failure is scoped to the one bad item: the rest of the items are still built, and each bad one is reported separately as `<view> [item N: <slug>]` (there is no output path to name it by). A missing or misspelled view file is a build failure too. So is an error thrown by a `.generate()` or `.sitemap()` callback — it is reported as `<generate callback>` / `<sitemap callback>` in `err.failures`. In `dev: true`, so is a dev server that cannot bind `config.port` (`Dev server could not bind 127.0.0.1:3001 (EADDRINUSE): the site is not being served`) — reported once, as `<dev server>` in `err.failures`; the watcher and live reload are stopped with it, so the process can exit once you have handled the rejection. A clash on `livereloadPort` is different: live reload is optional, so it is logged and switched off while the site keeps being served. `.complete()` reports a build's failures once: a second call in the same build resolves rather than rejecting again.

The rejection's message is `N build failure(s): <buildTo paths>`: output paths, not views, since a `.pages()` fan-out gives every failed entry the same view. An entry with no output path, such as a failing controller or callback, is named by `view` instead, and so is any `<pseudo-view>` even when it has a path. Two more pseudo-views: a stylesheet that will not compile is `<sass: <file>>` (it used to be logged in red and dropped, so a site shipped with no CSS on a green build and a passing `check`), and a redirects file that cannot be written is `<redirects>`, a custom `redirects.format` writer that throws included, because a site published without its redirects is a site whose old URLs 404. A `sitemap.xml`, `llms.txt` or feed write failure is only logged.

In a normal build `.generate()` minifies HTML with `html-minifier-terser`, which also runs **Terser over every inline `<script>` and clean-css over every inline `<style>`** and drops empty attributes, so `class=""` is not in the output and a syntax error in an inline script surfaces at build time rather than in the browser. Comments go too. Under `dev: true` minification is skipped altogether, so dev output keeps its comments and whitespace and a dev build never loads the minifier. **So a kiss build will never diff clean against output from a generator that does not minify**: when migrating a site onto kiss, normalise both sides (drop comments, collapse inter-tag whitespace) before comparing, or every page reads as dozens of changed lines that are all `style="margin-top: 25px;"` becoming `style="margin-top:25px"`. In dev mode, or after calling `.watch()`, call `await kiss.close()` to stop the watcher and server. It waits for a rebuild that is already running to finish, so once it resolves nothing more is written and it is safe to clean or deploy the build folder.

Editing a page template re-renders that page; deleting one, or creating any file under `src/`, rebuilds the whole site. Editing a partial or a layout re-renders only the pages that rendered it, and nothing more: your models are not re-read, your controllers are not re-run, and a model you load from a URL is not fetched again — a partial cannot change which pages exist or where they are written, so there is nothing else to redo. Which pages use which partial is learned while rendering rather than parsed out of your templates, so a partial chosen with `lookup`, one reached through another partial, and a layout reached with `{{#extend}}` all count; a partial no page has rendered yet re-renders every page and logs a notice naming it. With `verbose: true` a dev build writes `dependency-graph.json` (`{ partial: [built pages…] }`) beside `debug.json`, and each page's `.json` sibling lists the `partials` it used. Editing anything else under `src/` — a model JSON or a controller — rebuilds the whole site by replaying every page you registered, so models are re-read and controllers re-run (edited controller files are reloaded from disk, whether they use `export default` or `module.exports`). A rebuild replays each page from a shallow snapshot of its original `.page()`/`.pages()` call, so keep controllers pure (see the note under "Controller" above) — one that mutates its model in place carries that mutation into every later rebuild. A whole-site rebuild also tidies up after itself: output files the previous build wrote that the new one no longer produces — a page whose slug changed, one dropped from a `.pages()` fan-out, or a page `.scan()` had discovered whose template you deleted — are deleted, and `sitemap.xml` is regenerated if you called `.sitemap()`. A partial or layout you add mid-session is registered by that rebuild and usable straight away, and one you delete is unregistered — so a page still referencing a deleted partial fails the rebuild with `The partial <name> could not be found` rather than quietly rendering the deleted content until you restart. If you used `.scan()`, a rebuild scans your pages folder again, so a page template you create while watching is built without a restart; on a site where you registered pages by name with `.page()`, adding the file is not enough — add the call too, **and restart**: a rebuild replays the registrations recorded at start-up and never re-imports your build script, so a `.page()` you add while watching is not picked up. kiss says so rather than letting the rebuild imply otherwise. The same goes for a helper module the build script imports: helpers are registered once per process, so editing one needs a restart too. If a model or controller fails to resolve during a watch rebuild (e.g. a half-saved JSON file caught mid-write), that page's previous output is removed rather than left in place, so the dev server 404s on it until the next valid save instead of serving stale HTML.

Four more things about a watch session. `.watch({ entry })` names the script whose change triggers a full rebuild; it defaults to `process.argv[1]`, resolved to a file first (the path as given, then with `.js`, `.mjs` or `.cjs`, since `node router` reports it without the extension), and a folder is never watched, so a script named like its build folder (`node docs` building `docs/`) does not rebuild on its own output. A whole-site rebuild fetches every URL model again unless you set `config.fetch.cache`. An event on an empty file is ignored and the file is picked up once it has content, which also stops a slow truncate-then-write save rebuilding against a half-written file. And a page you registered by name whose `.hbs` you delete keeps failing the build until you remove the call. Your browser is reloaded once per rebuild, when that rebuild has finished writing every page — not once per file — so a reload never lands on a page that has not been re-rendered yet, however large the site. The first build reloads the browser too, so a tab left open across a restart picks the new output up. Editing a stylesheet reloads just that stylesheet, leaving the page where it was.

## Checking a build

`npx kiss-ssg check <script>` builds the site your script builds and tells you whether it worked — without publishing anything. Before the build it says on stderr which kiss-ssg the site resolves, and names a `node_modules/kiss-ssg` that is a link to a working tree rather than the registry package — the shape a plain `npm install` leaves behind after a `file:` dependency is repinned to a version range, because the lockfile's entry still satisfies it; `npm install kiss-ssg@^<version> --save-dev` re-resolves it. The build is staged and then discarded, so the build folder is neither emptied nor written, and what you get back is the verdict instead of the output:

```bash
npx kiss-ssg check router.js             # JSON, one report per Kiss instance — and, if the
                                         # site has recorded an AIKB/, what changed since
npx kiss-ssg check router.js --summary   # one line per instance instead
npx kiss-ssg check menu.js 2026-spring   # arguments after the script go to the script
npx kiss-ssg check --against last.jsonl router.js  # diff against some other report instead
```

```json
[
  {
    "ok": false,
    "mode": "check",
    "buildDir": "./public",
    "duration": 160,
    "pages": [
      {
        "view": "index.hbs",
        "buildTo": "./public/index.html",
        "ok": true,
        "hash": "9c1185a5c5e9fc54612808977ee8f548b2258d31"
      }
    ],
    "failures": [
      {
        "view": "stockists/stockist.hbs [item 3: harbour-market-stall]",
        "buildTo": null,
        "message": "Incomplete stockist record — missing address"
      }
    ],
    "assets": [{ "source": "css/site.css", "target": "css/site.605b52d7.css" }],
    "sitemap": "./public/sitemap.xml",
    "pipeline": [{ "name": "tailwind", "ok": true, "duration": 420 }],
    "llms": "./public/llms.txt",
    "links": {
      "checked": 24,
      "broken": [{ "page": "./public/about.html", "href": "/news/gone" }]
    },
    "redirects": {
      "file": "./public/_redirects",
      "aliases": 2,
      "removed": ["/news/autumn-2025.html"],
      "collisions": [],
      "moved": [
        { "id": "about", "from": "/about.html", "to": "/company/about.html" }
      ]
    },
    "feed": "./public/feed.xml"
  }
]
```

It exits **1** if any report is `ok: false`, if your script itself exited non-zero, or if no report was written at all — a script that never awaits `.complete()` reports nothing, which is itself the finding. Exit 0 with `ok: true` everywhere is the only passing result, which makes it a one-line CI step. Your site's own build log goes to stderr, so stdout is nothing but the JSON. `--summary` is the command's own flag and is read wherever you write it, so a site that needs that word for itself takes it after a bare `--` (`npx kiss-ssg check menu.js -- --summary`). Each page carries `hash`, the sha1 of the bytes it wrote — `null` for a page that failed or that you registered with `generate: false`.

When the site has recorded a knowledge base (see [Recording the knowledge base](#recording-the-knowledge-base)), `check` diffs against its `AIKB/last-build.json` without being asked. `--against <file>` (before the script) names a different baseline: it reads a report an earlier build left behind — a `KISS_REPORT` JSON Lines file, the JSON array `check` itself prints, the `{ reports, diff }` object it prints once it diffs, or a single report object, all four read without you having to say which — and tells you which pages this build would add, remove or change. Pages are matched by output path and compared by `hash`, so it answers about the bytes a browser would receive rather than about which files you happened to touch; a page whose `hash` is `null` on either side counts as changed. Reports are paired by `buildDir`, so a script that builds several sites gets one diff each, and a file holding several builds of one folder is compared against the newest. Under `--summary` the diff prints under that site's line:

```
ok ./public (check) — 6 pages, 0 failed, 2 assets, 153ms
  ~ asset css/site.css -> css/site.136acc63.css (was css/site.e7abc083.css)
  + ./public/news/spring-2026.html
  - ./public/news/autumn-2025.html
  ~ ./public/news/index.html
  = 3 unchanged
```

Without `--summary`, stdout becomes `{ "reports": [...], "diff": [...] }` instead of the bare array whenever there is a diff to print — under `--against`, or under `check` when the site has a recorded baseline — and `diff` runs in the same order as `reports`, one `{ buildDir, added, removed, changed, unchanged, assets }` entry each, every list sorted. A missing or unreadable file is a usage error (exit 1, nothing built). The diff never changes the exit code: it describes the build, it does not judge it.

**Assets that moved are named under the pages.** Whenever a diff has pages in it, `formatDiff` **opens** with one `~ asset <source> -> <target> (was <target>)` row per emitted asset whose filename changed — above the page rows, capped at ten with `… and N more assets changed` — and `diff[].assets` carries the same rows as `{ source, from, to }`. This exists because of `assets.hash`: a hashed stylesheet's filename **is** its content hash, so one changed asset rewrites the `<link href>` of every page that references it and the diff reads `~ <every page>, = 0 unchanged` with nothing in any page source to explain it. The row names the cause, and it goes first because that is where the reader already is: after a two-hundred-page list it would be a footnote reached by scrolling past everything it explains. Only assets both builds emitted are rows — one the baseline never saw has no previous name to have moved from — and nothing is printed when no page moved, since the rows are there to explain a diff rather than to be one.

**Broken internal links.** Every settled non-dev build also scans its own output and reports what it found as `report().links` — `{ checked, hostServed, broken: [{ page, href }] }` — with one `broken link: <page> -> <href>` line per finding under `--summary`. It checks the `href`, `src`, each `srcset` candidate and `action` of every `a`, `link`, `script`, `img`, `source`, `video`, `audio`, `iframe` and `form` your pages wrote, resolving a root-relative path against the build folder and a relative one against the page's own directory, and accepting a file that is there, a page this build wrote, `<path>/` → `<path>/index.html`, an extension-less `<path>` → `<path>.html` or `<path>/index.html`, and an asset under the name `{{asset}}` actually emitted.

An absolute URL on your own `siteUrl` counts as **internal** — that is what catches a renamed slug still linked from a nav or a `{{canonical}}`. Another origin, a protocol-relative `//host/x`, `mailto:`, `tel:`, `data:`, `javascript:`, a bare `#fragment` and an empty value are ignored; a query string and a fragment are stripped before resolving. Under `assets.hash` a hardcoded `/css/site.css` **is** a finding, because the file on disk is `css/site.<hash>.css` — use `{{asset}}`.

The finding is advisory: it never changes `ok` and never changes the exit code. Set `links: { check: false }` to turn the scan off. Paths your **host** serves that no build folder holds — a rewrite to a function, a bundle a post-build step writes, a file another script writes after kiss settles — go in `links: { hostServed: ['/v1/**', '/llms.txt'] }`: a reference the build cannot resolve that matches one is counted in `links.hostServed` rather than listed as broken. A pattern is the whole root-relative path; `*` matches within one segment, `**` across them, and every other character is literal. It is matched against the path the browser requests: `..` is resolved and stops at the origin root (`/v1/../gone.html` is a request for `/gone.html`), and a site whose `siteUrl` carries a path prefix writes its patterns with the prefix (`https://example.com/docs` → `/docs/api/**`). `{{link}}` and the checker are two halves of one thing: the helper renders a path the resolver accepts by construction, so a site whose internal hrefs are all `{{link}}` reports no broken links and the scan stays the net for the hand-written references beside them — with one qualifier, that the scan only knows the pages which wrote bytes, so a `{{link}}` to a page that failed to render _is_ reported broken on every page that linked it. A dev build or a watch rebuild always reports `links: null` — a scoped re-render has not rewritten every page, so there is nothing honest to scan.

**Launch-readiness audit.** Every settled non-dev build whose pages all succeeded also asks whether the site looks finished — from the HTML it wrote, the files in its build folder and its own state — and reports it as `report().audit`: `{ checked, ignored, skipped, findings: [{ check, page, detail }] }`. It runs under `check` too, and every `page` names the folder you asked for. Under `--summary`, and in the build log after an `Audit: N pages, M findings` line, each check that fired gets one line naming up to three of the paths it fired on — except the two duplicate checks, which get one line per shared value, so you can see what to change:

```
  audit description-missing: 12 pages (./public/about.html, ./public/contact.html, ./public/index.html, …)
  audit title-duplicate: "Aster & Oak" on 2 pages (./public/about.html, ./public/contact.html)
  audit favicon-missing
  audit stray-file: 2 files (./public/css/site.css.map, ./public/.DS_Store)
```

The checks, by the id `check` carries:

| id | fires when |
| --- | --- |
| `title-missing`, `description-missing` | a page has no `<title>`, or no `<meta name="description">`, or an empty one |
| `title-duplicate`, `description-duplicate` | two or more pages share one — a page whose `canonical` option names another URL is left out, since it has said it is a copy |
| `og-image-missing`, `og-image-relative` | no `og:image`, or one that is not an absolute `http(s)` URL — scrapers do not resolve a relative one |
| `canonical-missing` | `siteUrl` is set and the page has no `<link rel="canonical">` — `{{canonical}}` writes it |
| `img-alt-missing` | an `<img>` with no `alt` attribute at all (`alt=""` is right for a decorative image) |
| `h1-count`, `heading-skip` | a page without exactly one `<h1>`, or one whose headings jump a level (`h2 -> h4`) |
| `favicon-missing` | no page links an icon and there is no `favicon.ico` at the build root |
| `not-found-missing` | no `404.html` at the build root — under `extensionLess` a `404` view lands at `404/index.html`, which hosts do not serve |
| `site-url-local` | `siteUrl` is `localhost`, `127.*`, a `.local`/`.test`/`.invalid` name or a preview deploy (`.example` is fine) |
| `debug-dump` | `viewStats()` under `verbose: true` wrote `debug.json`, every page's options, into the build |
| `stray-file` | a dotfile (bar `.nojekyll`, `.htaccess` and `.well-known/`), a `.map`, `.log`, `.bak`, `.swp` or `~` file, `.DS_Store` or `Thumbs.db` |
| `console-log` | a `.js` file you wrote contains `console.log(` — `*.min.js`, `vendor/` and `node_modules/` are skipped |

Like the link scan, the findings are advisory: they never change `ok` and never change the exit code. A check your site deliberately does not want goes in `audit: { ignore: ['og-image-missing'] }`, with a comment saying why; it is then listed in `ignored`, so a clean audit with checks switched off is never mistaken for a clean site, and an id that is not a check throws when the `Kiss` is constructed. Under `cleanBuild: false` the build folder holds earlier builds' files, so the three checks that walk it — `not-found-missing`, `stray-file`, `console-log` — do not run and are listed in `skipped`. `audit: false` turns the whole pass off; a dev build, a watch rebuild and a build with any failure report `audit: null`.

**Redirects and renames.** The same report carries `redirects` — the redirect files this build wrote from your pages' `aliases`, the resolved `rules` as data, and three more advisory findings: a page the last record had that this build no longer writes and no alias covers (`removed without redirect: <path>`), a page the record and this build share an `id` with that is now written somewhere else with nothing answering its old URL (`moved without redirect: <from> -> <to> (<id>)`), and an alias a live page already answers, which the host will silently ignore (`alias collides with a page: <path>`). See [Redirects](../urls/#redirects).

Under check, the site's own build log **counts** broken links and audit findings (`3 broken links (listed in the check report)`, `Audit: 8 pages, 5 findings (listed in the check report)`) instead of listing them, because a terminal shows stderr beside the summary and every finding would be printed twice; the report is the list. Under `--summary`, `audit skipped (cleanBuild: false): <ids>` names the audit checks a `cleanBuild: false` build did not run, and `N pages canonical elsewhere` counts the pages whose `canonical` option names another URL. You can drive the same thing yourself, without the command: `KISS_CHECK=1` turns any build into a check (`cleanBuild` becomes `'atomic'`, `dev` becomes `false`, and the staging folder is discarded when `.complete()` settles whether the build passed or failed), and `KISS_REPORT=<file>` appends each settled build's report to a file as JSON Lines, one line per `Kiss` instance; `KISS_AIKB=1` (same rule again) is the one thing `kiss-ssg aikb` adds on top of those two. Any value counts as set except `0`, `false` and the empty string. None of them changes your script's exit code — that stays yours.

Two things a check cannot make true. A site that reads its own build folder back after `.complete()` — an index listing the version folders on disk — sees a folder nothing was published into. And a site with `cleanBuild: false` that relies on files an earlier build left behind starts from an empty staging folder, because a check stages everything.

`outputs.collisions` lists output paths claimed by multiple producers, their observed `producers` (`{ owner, kind }`), current `winner` (or null), and `refused` owner names. Collisions track active producers and disappear when a conflicting source is removed; page renames do not collide with the previous build. File paths use the configured build-folder spelling in plain, atomic and check builds. They remain advisory: they do not change `ok` or the check exit code. On a discarded check build, the winner describes the last successful writer before disposal. Inline-template owners use compact fingerprint IDs rather than template bodies.

## Recording the knowledge base

`npx kiss-ssg aikb <script>` writes the site's own knowledge base into `config.folders.aikb` (default `./AIKB`) — the map of the site as the build saw it, for the developer who comes back to it in two years and finds that every context window that held this is gone. It runs exactly the build `check` runs — staged and then discarded, publishing nothing — and the folder is the only thing it leaves behind.

```bash
npx kiss-ssg aikb router.js             # record it
npx kiss-ssg aikb router.js --summary   # ...and say in one line whether it did
```

Nothing else writes that folder. There is no API call for it, and an ordinary build, a `check`, a dev server and a watch rebuild all leave it exactly as they found it. Recording is a **ceremony**: run it when a piece of work is finished, and commit what it wrote. That is what makes `npx kiss-ssg check` mean "what have I changed since this work opened" rather than "since the last time anybody ran a build".

**It refuses to record a build that did not work.** A failed build writes nothing, and `--summary` says `not recorded — build failed`; the exit code is `check`'s. A dev build writes nothing either. The previous record stays exactly as it was — a knowledge base describing a broken build is worse than a slightly old one.

Four files, and all of them are byte-stable across two identical records — nothing is timestamped and every list is sorted — so recording an unchanged site twice leaves `git status` clean and any diff in the folder is a real change to the shape of the site. `README.md` is written once if it is absent and never overwritten: what the folder is, which files are generated, how to write and stamp a note, what the four findings mean, and what `site.md` is for. `site-map.md` and `site-map.json` are the map itself — the site's URL, build folder and source folders; a row per page giving its output path, view, model source, controller source and the partials and layouts it actually rendered; the partial → pages index; models and controllers with the pages that used them; the asset pipeline's steps; and a `## Subjects` table — each subject, the note it wants, and the first 12 characters of its hash (`site-map.json` carries the whole hash). Each page row also carries the page's `id`, so that `Id` column is the list of `{{link}}` targets the site answers to — the autocomplete for an agent adding a page or linking to one. `last-build.json` is that build's report with every timing dropped, and it is the baseline `npx kiss-ssg check` diffs your working tree against.

The folder is **source, not output**: it sits outside `config.folders.build`, survives `cleanBuild`, and is meant to be committed. Setting `folders.aikb: null` switches it off altogether.

**Having the folder is not the same as opting in.** A build reports `report().aikb` only when `folders.aikb` is set _and_ `<folder>/site-map.json` is there — the one file only a record writes. Until then `aikb` is `null` and no map is built, so the default `./AIKB` is harmless in a repository whose `AIKB/` is something else entirely. Once a site has recorded, every build — a `check` included — reports the folder and the note findings, with `written: false`.

**Notes are yours; the engine never writes one.** A map says what the site is; a note says why, which no build can work out. Three kinds of subject carry judgement, and each wants a note under `AIKB/notes/` at a path derived mechanically from its id:

| Subject | Its note |
| --- | --- |
| a controller file, e.g. `stockist.js` | `AIKB/notes/controllers/stockist.md` |
| a URL model, e.g. `https://api.example.com/v2/events` | `AIKB/notes/models/api.example.com-v2-events.md` |
| an asset pipeline step, e.g. `tailwind` | `AIKB/notes/pipeline/tailwind.md` |

Plain pages, partials and `.json` models are deliberately not subjects — a note saying "renders the about page" is noise. An inline controller or an object model has no file to attach a note to, and is not a subject either. Suggested headings, which nothing enforces: `## What it does`, `## Why it is this way`, `## Gotchas`.

**Every subject carries a hash, and a note may be stamped with it.** `site-map.json`'s `subjects` is `{ kind, id, note, hash }` per subject: sha1 of the controller file (line endings normalised, so a Windows checkout hashes the same), or of the pipeline step's `run` string, and `null` for a URL model — whose id _is_ the subject, so there is nothing for a hash to add. Copy it into the note's frontmatter as `subject-hash: <sha1>` when you write or review the note. The engine never writes a stamp, and an unstamped note is never reported stale — stamping is opt-in, per note. The hash to stamp with is on _every_ build's report as `report().aikb.subjects`, not only on a record's: when a stale note is found, `site-map.json` on disk still describes the previous record, so the report is the only place the current hash exists.

**`AIKB/site.md` is the page about the whole site** rather than about any one subject — authored, evergreen, and never written by the engine. It is scanned for dangling references when it is there and checked for nothing else. The generated `AIKB/README.md` names its five sections: What this site is and who for · How it is deployed · Conventions · Standing gotchas · Retired feedback. The `kiss-memory-consolidate` skill is what maintains it.

Every build reports four findings on `report().aikb.notes`: **missing** (a subject nobody has explained), **dead** (a note under `notes/` whose subject is not in the map), **stale** (a note whose `subject-hash` stamp is no longer its subject's hash — a URL model can never be stale) and **dangling** (`"<note path>: <token>"` for a backticked token in a note, or in `site.md`, that looks like a file reference and resolves to nothing: not a file on disk or under a source folder, a page view or output path, a partial name, a model or controller name, a folder in the map, or a path under the AIKB folder). `kiss-ssg check --summary` prints them as `note missing:` / `note dead:` / `note stale:` / `note dangling:` lines. The dangling filter is deliberately narrow — a token needs a `/` or a known extension and must hold no spaces, `<`, `>`, `*`, `{`, `}` or `$`; code fences, trailing-slash folders and anything with a URI scheme are skipped — because a lint that fires on every note is one people learn to ignore. None of the four is a build failure and none changes an exit code.

`examples/9-migrated-from-v1/AIKB/` and `examples/11-blog/AIKB/` are the runnable exemplars: committed knowledge bases recorded with `cd examples/<folder> && npx kiss-ssg aikb router.js` — every example is a folder with its own `router.js`, run from inside itself the way a real site is, each with authored notes beside it stamped with their controllers' hashes — one note on example 9, two on example 11. The `kiss-memory` plugin, for Claude Code or Codex (see [the README (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/README.md#what-you-just-installed)) is what reads the folder back.

## Other methods

-   `.registerPartials()` — re-registers every partial and layout from disk, unregistering any whose file has gone, and returns the registered names. Kiss runs it for you at start-up and on every watch rebuild; call it yourself if you add or remove partial files at runtime without `.watch()`. **The extension says what happens to the file**: under `folders.partials`, `.hbs` is a template, `.md` is Markdown rendered to HTML and then compiled, `.html` is **compiled as a Handlebars template like any other** — "as-is" only in the sense that nothing renders its body first, so `{{ }}` inside it _is_ interpolated and the helpers run, and `.txt` is text — escaped and **not compiled**, so its markup is shown rather than rendered and `{{name}}` inside it is printed rather than interpolated. `folders.layouts` takes `.hbs` only. That is what makes a code sample work without hand-escaping:

```hbs
<!-- src/partials/snippet.txt holds:  <div class="card">{{title}}</div>  -->
<pre>{{> "snippet"}}</pre>
```

…renders that line verbatim, tags and braces included. Partial names are path-derived and extension-less, so `note.txt` and `note.hbs` collide and the template wins.

**Every entry of `kiss.handlebars.partials` is a function** — a compiled template that also records which page invoked it, which is what scopes a watch-mode partial edit to the pages that used it. `handlebars-layouts` recompiles a string layout on every page render and never caches it, so compiling at registration is also what stops a layout being recompiled once per page. Code of yours that renders an entry by name must accept a function, and must pass its own `options.data` through: `const p = kiss.handlebars.partials[name]; typeof p === 'function' ? p(ctx, { data: options.data }) : kiss.handlebars.compile(p)(ctx, { data: options.data })`. That data frame is how the page is recorded as using the partial: a bare `p(ctx)` renders correctly, but under `.watch()` that page is not re-rendered when the partial changes (unless no page recorded it at all, when every page is).

-   `.copyAssets(sourceDir, targetDir)` — compiles every `*.scss`/`*.sass` under `sourceDir` to a sibling `.css` and copies everything else straight through to `targetDir`. Runs automatically once at construction time for `config.folders.assets` → `config.folders.build`; callable again for extra asset directories. Calls run one after another in registration order, not concurrently. Every emitted file is recorded in the instance's asset manifest — that is what `{{asset}}` reads, and what `config.assets` renames (see the config table).
-   `kiss.handlebars` — this instance's own Handlebars environment (`Handlebars.create()`, created per `Kiss`, so helpers and partials never leak between instances, and helpers registered on the global `handlebars` module are not seen); register custom helpers on it directly.
-   `import { utils } from 'kiss-ssg'` — `toSlug`, `sanitizePath`, `toTitleCase`, `trimLines`, `trimPath`, `posixPath`, `globFiles(dir, pattern)`, `hashId`, `toURLKey`, `toAbsoluteUrl(siteUrl, path, { trailingSlash })`, `toCanonicalPath`, `servedPathFor(pageURL, { trailingSlash })`.
-   `.viewStats()` — logs how many pages are queued and prepared, and with `verbose: true` writes a `debug.json` into the build folder listing every page as `{ view, buildTo, runCount, options }`. Chainable; handy from a `.generate()` callback to see what the build actually produced.
-   `.getModelByID(id, data)` — pulls one entry out of the `[{ id, data }]` array `.generate()`/`.complete()` hand back, returning its `data` (or `{ error }` if no entry has that id). The id is the model's filename or URL.
-   `.report()` — the last **settled** build as data, or `null` before the first `.complete()` has settled (a whole-site watch rebuild replaces it with its own, and anything else that changes the failure list without settling a build — a watch asset re-copy, a helpers reload — refreshes it in place, so `ok` is never behind the log: a stylesheet broken by an asset save is `ok: false` here as soon as that copy finishes. A refresh does not move `duration` or the build's other metadata, which still name the settle that produced it; a scoped page re-render changes no failures and so changes nothing here). `{ ok, mode, buildDir, duration, pages, failures, assets, sitemap, pipeline, llms, aikb, links, redirects, feed, robots, outputs, audit }`: `ok` is "nothing failed"; `mode` is `'build'`, or `'check'` when the build was staged and thrown away (see **Checking a build**); `buildDir` is the folder you asked for, never the staging sibling a `'atomic'` build writes to; `duration` is ms from `new Kiss()` to the moment the build settled — frozen there, so a watch refresh of the verdict does not grow it with the time the session has been open; `pages` is `{ view, buildTo, ok, hash, id, canonical }` per queued page, in registration order (an inline template's `view` is elided to its first line; `hash` is the sha1 of the bytes that page wrote, or `null` when it wrote none — a page that failed, or one with `generate: false`; `id` is the page's identity, what `{{link}}` resolves, and is `null` for an inline template, a `generate: false` page and a default id two pages arrived at; `canonical` is the URL the page named as its canonical when it named one elsewhere, else `null`); `failures` is `{ view, buildTo, message }` — the same list `err.failures` carries, with the `Error` reduced to its message so the whole thing survives `JSON.stringify`; `assets` is `{ source, target }` per emitted file (the path a template asks for, and the file that is actually there under `config.assets`); `sitemap` is the `sitemap.xml` this build wrote, or `null`; `pipeline` is `{ name, ok, duration }` per `config.assets.pipeline` step, in order, and `[]` when there are none; `llms` is the `llms.txt` this build wrote, or `null`; `aikb` is `null` unless the site has a knowledge base to report on (`config.folders.aikb` set, and a record already made — see **Checking a build**), and otherwise `{ folder, written, notes: { missing, dead, stale, dangling }, subjects }` — where that knowledge base lives, whether this build wrote it (`true` only for a passing `npx kiss-ssg aikb` run; every ordinary build reports `false`), the four note findings (paths, except `dangling`'s `<note path>: <token>`), and `{ kind, id, note, hash }` per subject of _this_ build, which is where the hash to stamp a note with comes from before a record has been made. The same object is on the rejection as `err.report`, so a failed build is readable as data without catching and re-deriving anything. `links`, `redirects` and `feed` are **new in this version**, appended in that order after `aikb`, and each is `null` until the build in question did that piece of work — which is not the same as "it did it and found nothing". `links` carries the broken-internal-link scan of this build's own output as `{ checked, hostServed, broken: [{ page, href }] }` (`null` on a dev build and under `config.links.check: false`); `redirects` carries what the build did about page `aliases` as `{ file, aliases, removed, collisions, moved, rules, json, formats, files }` — the host file it wrote (`null` under `format: 'none'`; note the report key is `formats`, the list that ran, where the _config_ key is `format`), how many alias paths went into it, **`rules`, the resolved `[{ from, to }]` list** so a deploy script can write any host's format from `kiss.report()` without parsing anything, the `redirects.json` IR, the format that ran, every file written, the pages the last record had that this build no longer has and no alias covers, the aliases a live page already answers, and `{ id, from, to }` per page the record and this build share an `id` with whose path changed and whose old path no alias covers; `feed` is the feed file this build wrote, like `sitemap` and `llms`; `robots` is `{ file, agents, disallowAll, sitemaps }` from `.robots()`, or `null` when it was never called — an object rather than a path because `disallowAll` is a fact that removes the site from search and a path cannot say it. `audit` is the **last** key, after `outputs`: `{ checked, ignored, skipped, findings: [{ check, page, detail }] }` from the launch-readiness audit (see **Launch-readiness audit** under **Checking a build**), or `null` when none ran — a dev build, `audit: false`, and any build with a failure. Every path in the three is named against the build folder you asked for, never the staging sibling, and so is every audit `page`. It is additive: `complete()` still resolves with the `data` array and still rejects with the `AggregateError`. A refresh returns a **new object**: a reference you kept is a snapshot of the moment you took it.

```js
kiss.scan().generate(function (data) {
  this.viewStats()
  console.log(this.getModelByID('index.json', data))
})
```
