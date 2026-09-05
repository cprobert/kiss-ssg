# Changelog

Written for people building a site with kiss-ssg, not for people maintaining it.
Newest first. `/branch-close` adds an entry alongside each version bump.

## 2.0.0-alpha.1 — 2026-09-05

**Fixed**

- `.pages()` gave every page in a fan-out the first item's value for any page
  option derived from the model — `{{title}}` was the one you would notice,
  while `{{model.title}}` looked correct. Each fanned-out page now gets its own
  options.
- In watch mode, saving a file under your assets folder rebuilt the whole site
  as well as recopying the assets. It now only recopies the assets.

**Changed**

- Pages, partials and sitemap entries are discovered in a stable sorted order,
  so two builds of the same site produce the same output regardless of the
  machine.
- Dependencies brought up to date (glob, chokidar, fs-extra, serve-static and
  friends). No change to how you configure or call kiss-ssg, and the Node floor
  is still 22.12.

**Added**

- `utils.posixPath(path)` and `utils.globFiles(pattern)` on the `utils` export.

## Unreleased

_v2 is in development on the `v2` branch. The v1 → v2 migration notes live in
[`llms.txt`](llms.txt) § Migrating from v1 and in the README, and will become
this file's `## 2.0.0` entry when the line is released._

**Fixed**

- A trailing slash on a folder you configure is now tolerated. Previously
  `folders: { assets: './src/assets/' }` wrote the compiled CSS next to your
  build folder — `./publicmain.css` at the project root — and logged it as a
  success, so the deployed site had no stylesheet.
- A trailing slash on `folders.models` no longer breaks a `.pages()` fan-out.
  `folders: { models: './src/models/' }` made every model in the folder
  unreadable and failed the build with `Invalid model <folder>`, an error that
  blamed the folder name.
- A project folder whose name contains `[`, `*` or another glob character (for
  example `site[old]`) now builds. Previously `.scan()` found no pages, no Sass
  was compiled, and the build finished reporting success with an empty output
  folder.
- A page whose view file is missing or misspelled now fails the build instead of
  writing the filename into the output. Previously `.page({ view: 'abuot.hbs' })`
  produced `public/abuot.html` containing the text `abuot.hbs`, and the build
  reported success.
- Deleting a page template while watching now rebuilds the whole site, instead of
  re-rendering the deleted page over its own output. If `.scan()` found that
  page, it is dropped from the site and its output file is deleted; a page you
  registered by name with `.page()` keeps failing the build until you remove the
  call.
- Deleting a partial or layout while watching now removes it from the site.
  Previously it kept rendering its last-known content until you restarted, so
  the dev server and a fresh production build disagreed; a page that still
  references the deleted partial now fails the rebuild instead.
- Creating a partial or layout while watching now registers it straight away.
  Previously new files were invisible until you restarted, and the next edit to
  a page referencing one failed silently, leaving that page's output frozen.
- Creating a page template while watching now builds it, on a site that uses
  `.scan()`. Previously it needed a restart, because a rebuild replayed the
  pages the first scan found rather than scanning again.
- `.scan()` no longer registers a view a second time when you called `.page()`
  for it earlier in the same chain — that produced a `Page already processed`
  error on the build.
- `await kiss.close()` no longer returns while a rebuild is still writing. A
  rebuild requested just before you closed kept running afterwards, so a clean
  or deploy step that ran once `close()` resolved raced files still being
  written — and could see the build folder recreated after it deleted it.
- A page queued after the last `.generate()` call is now built instead of being
  silently dropped from a build that reports success. `.complete()` renders
  anything no `generate()` pass reached — the pages a callback's `.scan()`
  discovers, or a page whose model resolved after `generate()` had already
  started, which made the outcome depend on how fast that model loaded.
- `.complete()` now waits for pages queued by an `async` `generate` callback
  after an `await`, as the docs always claimed. Previously it resolved before
  those pages were written, so a deploy or CI step could run against a site that
  was still being built.
- A view passed as a template string no longer builds into a folder named after
  its own markup. `.page({ view: '<p>hi</p>', slug: 'ok' })` wrote
  `public/-p-hi-/ok.html` — the folder came from the last `/` in the template,
  so any closing tag produced one — and the sitemap carried the same wrong URL.
  Such a page now builds to `public/ok.html`.
- A page's `ext` can no longer write outside your build folder. It was the one
  page option that was never sanitised, so `ext: './../../../escaped/x.html'` —
  reachable from model data through the usual "controller derives the page's
  options" pattern — wrote above the build folder, where nothing cleans it up.
  It is now slugified like `path` and `slug` (`.xml` still means `.xml`), and a
  page that would still resolve outside the build folder fails the build.
- Pages whose titles are not written in the Latin alphabet no longer collide.
  Every Japanese, Korean or Cyrillic title slugified to `-`, so a `.pages()`
  fan-out over such a model built one file and quietly lost the rest. Accented
  Latin is now transliterated (`Über uns` → `uber-uns`) and a title with no
  Latin equivalent falls back to a short stable hash (`p-9736ca69`), so every
  page gets its own file. Slugs also no longer keep a trailing `-` when the
  title ends in punctuation: `Hello World!` is now `hello-world`, not
  `hello-world-`.
- A controller that changes `options.config` no longer changes the whole site.
  Every page shared the one live config object, so a controller setting
  `options.config.siteUrl` for its own page rewrote `kiss.config`, changed every
  other page — including ones already prepared — and changed every `<loc>` in
  `sitemap.xml`. Each page now renders with its own copy.

**Changed**

- `utils.globFiles` now takes the directory and the pattern separately —
  `globFiles(dir, pattern)` instead of `globFiles(pattern)`. The directory is
  escaped, so a folder name containing a glob character is matched literally.
- A controller that throws, a controller file that is missing, a controller
  module that does not export a function, and a `controller` option of an
  unrecognised type now fail the build. Previously each was logged and ignored,
  and the page was built and shipped from un-controlled options — no derived
  slug, no reshaped model — with the build reporting success.
- An error thrown by a `generate()` or `sitemap()` callback now fails the build
  too, and is reported as `<generate callback>` / `<sitemap callback>` in
  `err.failures`. Previously it was logged as "Error generating site" (or, more
  misleadingly, "Error creating sitemap.xml" after the file had been written
  correctly) and `complete()` still resolved, so a build that lost pages exited 0.
  A callback that returns a promise is covered too: `complete()` waits for that
  promise, so an `async` callback's rejection is reported by the same build.
- `complete()` now reports a build's failures once. A second `complete()` call
  in the same build resolves instead of rejecting again — the documented
  "`complete()` from inside a `generate` callback" pattern makes two calls race
  one failure, and the second rejection had nothing attached to it, so it took
  the process down after the first had already been handled and reported.
- Two pages that resolve to the same output path now fail the build. One of
  them was dropped with a `Page already processed` log and the build reported
  success, so a page you asked for was simply missing from the site — most
  often in a `.pages()` fan-out whose controller derives the slug from model
  data. `complete()` now rejects and names the path.
- Editing a partial or a layout while watching now re-renders every page without
  re-reading your models, re-running your controllers or re-fetching a model
  from a URL — the slow half of a rebuild, and none of it can be affected by a
  partial. Every other non-page change is still a whole-site rebuild.

**Added**

- Pass `config` in a page's options to override config settings for that page
  alone, e.g. `.page({ view: 'de.hbs', config: { siteUrl: 'https://de.example' } })`.
  Previously the option was silently discarded.
- `.registerPartials()`, `.viewStats()` and `.getModelByID(id, data)` are now
  documented in the README and `llms.txt`. They were always public — two of them
  are used in the shipped examples — but neither doc mentioned them.
