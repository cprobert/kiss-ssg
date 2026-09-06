# Changelog

Written for people building a site with kiss-ssg, not for people maintaining it.
Newest first. `/branch-close` adds an entry alongside each version bump.

## Unreleased

**Added**

- **A Claude Code plugin** lives in the repository: `/plugin marketplace add cprobert/kiss-ssg` then `/plugin install kiss-ssg@kiss-ssg` gives Claude three skills — build a new site, migrate a v1 site, check a build — each pointing at the docs installed in `node_modules/kiss-ssg/`. The README's new "Using an AI coding agent?" section says how to point any agent at the package.
- **`npx kiss-ssg check <script>`** — a dry run of your own build script. It
  builds the site into a staging folder, tells you whether it worked, and then
  throws the staging folder away: your build folder is neither emptied nor
  written, so you can check a site whose output is already published. You get a
  JSON array with one report per `Kiss` instance the script created — the pages
  it built, anything that failed and why, the assets it emitted — and exit code
  1 if anything failed, if your script exited non-zero, or if it never settled a
  build at all. `--summary` prints one line per site instead. Arguments after
  the script are passed through to it, so a site that takes a season or a cohort
  is checked the way it is run.
- **`kiss.report()`** — the last settled build as data: `{ ok, mode, buildDir,
duration, pages, failures, assets, sitemap }`, every value JSON-safe, so a
  deploy script can decide what to do without parsing log output. The same
  object rides on the rejection as `err.report`. `complete()` itself is
  unchanged: it still resolves with the data array and still rejects with the
  `AggregateError`.
- **`KISS_CHECK=1` and `KISS_REPORT=<file>`** for driving the same thing from a
  harness of your own: the first turns any build into a check, the second
  appends each settled build's report to a file as JSON Lines. Neither changes
  your script's exit code.
- **TypeScript declarations ship with the package**, generated from the engine's
  own JSDoc. Put `// @ts-check` at the top of your build script and your editor
  knows every config key, every page option and every method — with no
  TypeScript in your project and no `@types/` package to install. Annotate with
  `/** @type {import('kiss-ssg').KissConfigInput} */` on your config,
  `PageOptions` / `PagesOptions` on page options, `KissController` on a
  controller, and `BuildError` on the error `complete()` rejects with, so
  `err.failures` is typed. A misspelled key inside `folders` is now an error you
  see while typing rather than a build that quietly used the default folder;
  keys of your own on the config and on page options stay allowed, because they
  reach your templates.
- `package.json` gains a `types` field and an `exports` map. `import` and
  `require` both still resolve to `lib/kiss.js`, so nothing about how you load
  kiss-ssg changes.
- **`examples/` now ships in the package**, each of the two tiers with its own
  README, so `node_modules/kiss-ssg/examples/README.md` is a copy you can run
  without cloning the repo.
- Two new exemplar examples: `examples/8-data-fed-site.js` (`npm run eg8`), a
  site built from a folder of records where one is broken, and
  `examples/9-migrated-from-v1.js` (`npm run eg9`), every v1 → v2 migration
  recipe from `llms.txt` as running code in a site that builds clean.

## 2.0.0-alpha.2 — 2026-09-06

_Still a prerelease of the v2 line, now on `main`. The v1 → v2 migration notes
live in [`llms.txt`](llms.txt) § Migrating from v1 and in the README, and will
become this file's `## 2.0.0` entry when the line is released._

**Added**

- A documented pattern — "Building more than one site from one source tree"
  (README, `llms.txt`) — for building several versioned outputs (per-intake
  handbooks, a menu rebuilt each season) from one shared `src/`: one `Kiss`
  instance per output, `folders.build` as the discriminator, an arbitrary
  config key carried into views, `folders.assets: null` + explicit
  `copyAssets` when an output must own its assets, and `cleanBuild: 'atomic'`
  so a re-run can never destroy one already published. Runnable example:
  `examples/7-versioned-outputs.js` (`npm run eg7`).

- A fetch policy for models you load from a URL, so `model: 'https://…'` works
  against a real API. `config.fetch` takes `headers` (sent with every
  URL-model request — this is where an API token goes), `timeout` in
  milliseconds, `retries` (extra attempts after a network error or a 5xx; a
  4xx is never retried, and the error tells you how many attempts were made)
  and `cache`. Set `cache` to a directory and every successful response is
  saved there, keyed by the URL and the headers you sent, so the next build —
  including every `dev`-mode rebuild, which until now re-fetched every remote
  model on every save — reads the file instead of the network, and an offline
  build still works. An error response is never cached. There is no expiry:
  delete the directory when you want fresh data, and add it to your
  `.gitignore`.

- Cache-busting asset URLs, so a caching policy stops being something your
  templates spell out. Link a file with `href="/{{asset "css/site.css"}}"` and set
  `assets: { hash: true }` on your config: every `.css` and `.js` copied into
  the build is renamed to carry a hash of its contents
  (`css/site.a1b2c3d4.css`), the helper renders that name, and the file it
  replaces is deleted — so a changed stylesheet is a URL no cache has seen and
  an unchanged one keeps its URL for ever. `assets: { version: '1.4.5' }` is
  the alternative: nothing is renamed and the helper appends `?v=1.4.5`
  instead. With neither set your build emits exactly the files it does today
  and the helper renders the plain path, so the same template line works under
  all three. The path comes back without a leading slash, so you pick the base:
  `/{{asset …}}`, `{{root}}{{asset …}}`, or `{{absUrl (asset …)}}`. Only `.css` and `.js` are renamed — an image, a font or
  `robots.txt` is reached by URLs kiss does not rewrite — but `{{asset}}`
  resolves any file in your assets folder, and wrapping it
  (`{{absUrl (asset "css/site.css")}}`) gives you the absolute URL.

- Two helpers for absolute URLs, so you stop hardcoding your domain in your
  templates. `{{canonical}}` is the current page's full URL — put it in
  `<link rel="canonical" href="{{canonical}}">` — and `{{absUrl '/img/card.png'}}`
  turns any path of yours into one, for `og:image`, a feed or an RSS link. Both
  read `siteUrl` from your config, the same key `.sitemap()` already needs, and
  `{{canonical}}` is built by the same code as `sitemap.xml`, so a page's
  canonical link and its `<loc>` can never disagree: `/about/index.html`
  collapses to `https://example.com/about`, the home page is your `siteUrl` with
  one trailing slash, and it reads the same whether `extensionLess` is on or
  off. Without a `siteUrl` they render nothing and log one warning per page
  instead of failing your build.

- A safe way to rebuild a folder you have already published:
  `cleanBuild: 'atomic'`. The build goes into a staging folder beside your
  build folder and is swapped into place in one step when
  `await kiss.complete()` resolves — so until that moment your previous output is
  untouched, and if any page fails the staging folder is deleted and the old
  output is still there, byte for byte. The swap is two renames — your old
  output aside, the new build in — so it is never half-applied, and a build
  killed mid-flight leaves a folder beside your build folder that the next run
  clears up. Pages, assets and `sitemap.xml` all follow it. Use it wherever `folders.build` holds output people are already
  reading: with the default `cleanBuild: true` that folder is emptied in the
  `Kiss` constructor, before anything renders, and a build that then fails
  leaves it empty or half-built. It is for one-shot builds — in `dev: true` it
  behaves as `true` and tells you so — and only `complete()` promotes, so a
  chain that ends at `.generate()` swaps nothing in. `cleanBuild` now also
  rejects any value other than `true`, `false` or `'atomic'`, rather than
  quietly treating it as "don't clean".

**Changed**

- The v1 → v2 migration notes (`llms.txt` § Migrating from v1, README) now
  carry the recipes learned from two real migrations: the Node floor as the
  first thing to check, a `complete()`-rejection catch you can copy, how to
  dedupe slugs if you relied on v1's duplicate-path skip, and a list of what
  is unchanged in v2 so you don't waste time re-verifying it.

- kiss now refuses to build into a folder that would swallow your source: if
  `folders.build` is `folders.src`, contains it, or is `'.'` or `'/'`,
  `new Kiss(...)` throws instead of emptying it. It is a floor, not a licence
  — if your build folder comes from a variable (`./handbooks/${cohort}`),
  validate it before you construct, because an empty value resolves to the
  parent folder and `cleanBuild: true` would empty that.

- URL models now time out. `config.fetch.timeout` defaults to 10 seconds, where
  before there was no limit at all — an API that accepted the connection and
  then said nothing could hang a build for ever. If 10 seconds is too tight for
  your API, raise it (`fetch: { timeout: 30000 }`); everything else about the
  new `fetch` block is off by default, so a site that sets nothing behaves as
  it did.

**Fixed**

- One bad item in a `.pages()` fan-out no longer takes the rest of the fan-out
  with it. A controller that threw for a single item abandoned every item after
  it — those pages were never built and never mentioned, so a 64-page fan-out
  could report one error and quietly lose 63 pages. Each bad item is now
  reported on its own (named `<view> [item N: <slug>]`) and every good item is
  still built; the build still fails.
- Live reload now works when you preview the site from another device. With
  `devHost: '0.0.0.0'`, a page opened on a phone or tablet asked that device's
  own `localhost` for the reload script, so edits never reached it; the page now
  reloads from whatever host it was loaded from.
- A reload no longer races the file write, and editing an asset of any type
  reloads the page. The browser could previously be told to reload while a page
  was still being written, and editing an `.svg`, `.webp`, `.avif`, `.ico`,
  `.woff` or `.woff2` did not reload at all. Both are now covered by the
  once-per-rebuild reload under **Changed** below, which replaced the
  write-settle and the watched-extension list this entry first described.
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
- A `model` URL that answers with an error status now fails that page instead of
  publishing the error. A `500` (or any non-2xx) whose body is the usual JSON
  error envelope became the page's model, so the page rendered empty or garbage
  content and the build reported success.
- The `{{sass "path"}}` helper now accepts an absolute path. It used to join
  every path onto the working directory, so a path a controller had resolved
  became `<cwd>/abs/path/main.scss` and failed the build with
  `no such file or directory`.
- `{{#isActive page href="/blog" folderMatch=true}}` now matches whole path
  segments instead of any substring of the URL. A `/blog` nav item lit up on
  `my-blog-post.html`, `/docs` on `news/docs-archive.html`, `/product` on
  `products/index.html` — and with `href` left off, every item in the nav was
  active on every page. An `href` of `""` under `folderMatch` now matches the
  home page only.
- The same `href` now works whether or not `extensionLess` is on. `href="/about"`
  matched your about page with the flag off and nothing with it on (only
  `href="/about/"` worked), so turning the flag on silently lost every nav
  highlight but the home page. `/about` and `/about/` are now the same page
  under either setting.
- `{{#isActive}}` no longer fails the build over a template mistake. A
  data-driven nav whose model has no `href` key, a page context without a
  `pageURL`, or a forgotten page argument each threw and dropped the page from
  the build; the block now renders as not-active and the reason is logged.
- `{{markdown}}` no longer fails the build when the model field it is given is
  `null`, an object or an array — one `null` field removed the whole page. It
  logs the unexpected value and renders nothing, as it already did for a missing
  field. `{{#env is=…}}` given something that is not a string does the same
  instead of throwing.
- Running a second site in dev mode no longer kills the process. Both sites'
  live reload servers wanted the same port (35729) and the resulting
  `EADDRINUSE` was an uncaught exception that took the whole dev process down —
  even though `port` exists precisely so two sites can run side by side. A clash
  is now logged, live reload is switched off for that site, and its dev server
  keeps serving. Give the second site its own `livereloadPort` to get live
  reload back on both.
- A config key you pass explicitly as `undefined` now takes its default instead
  of blanking it. `new Kiss({ port: process.env.PORT })` with `PORT` unset left
  the dev server on a random port logged as `http://localhost:undefined`, and
  `{ cleanBuild: opts.clean }` with the flag absent quietly stopped emptying
  your build folder. The same applies inside `folders` and `sass`. `null` is
  still a real value — it is how you switch a folder off.

**Removed**

- `folders.root` is gone. It was in the documented default config but no part of
  the engine ever read it, so setting it changed nothing and it was never even
  created on disk. Delete it from your config; leaving it in is harmless.
- `folders.static` is gone, for the same reason. It was in the documented
  default config and re-derived from `folders.src`, but no part of the engine
  ever read it and it was never created on disk — static files are copied from
  `folders.assets`. Delete it from your config; leaving it in is harmless.

**Changed**

- Your browser is now reloaded once per rebuild, once that rebuild has written
  every page — not once per file it wrote. On a big site the first of those
  per-file reloads reached the browser within a second of your edit, while the
  rebuild was still writing, so the page could reload onto output that had not
  been re-rendered yet and then sit on stale content until your next save. One
  save is now one reload, sent when the rebuild has finished. Editing a
  stylesheet still reloads just that stylesheet, leaving the page where it was,
  and the first build reloads a tab you left open across a restart.

- A dynamic partial whose key is missing now names the key. `{{> (lookup . 'moodleAccess')}}`
  with no `moodleAccess` in the data failed with only `The partial undefined
could not be found`, which told you neither the key nor the page; you now also
  get `lookup: 'moodleAccess' is undefined in handbooks/uob.hbs`, once per page.
  The build still fails exactly as it did.

- A dev server that cannot start now fails the build instead of leaving you with
  a site nobody is serving. If `port` is already taken, the run used to print
  `Serving … http://127.0.0.1:3001`, log the clash twice — one of those as
  `Error running live reload server`, the wrong server — then finish the build
  and sit there answering nothing. You now get one line naming the port and what
  it costs you:

  ```
  Dev server could not bind 127.0.0.1:3001 (EADDRINUSE): the site is not being served
  ```

  The watcher and live reload stop with it and `complete()` rejects with a
  `<dev server>` failure, so the process can exit. A clash on `livereloadPort` is
  unchanged: live reload is optional, so it is logged once and the site keeps
  being served.

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
- The shipped helper docs are now complete: `llms.txt` gains a `## Helpers`
  section and README's `### Helpers` gains entries for `sass`, `offset`,
  `isActive` and `env` (previously only `markdown` and `stringify` were
  documented). Both also now state that the `generate`/`complete` `data` array
  includes the automatic asset-copy result as its first entry, that a
  controller must be pure because watch-mode replays a shallow snapshot of the
  page's options, and precisely which `folders.*` keys `folders.src`
  re-derives (`build` is not one of them).

**Added**

- Pass `config` in a page's options to override config settings for that page
  alone, e.g. `.page({ view: 'de.hbs', config: { siteUrl: 'https://de.example' } })`.
  Previously the option was silently discarded.
- `.registerPartials()`, `.viewStats()` and `.getModelByID(id, data)` are now
  documented in the README and `llms.txt`. They were always public — two of them
  are used in the shipped examples — but neither doc mentioned them.
- `livereloadPort` (default `35729`) — the port the live reload server listens
  on, and the one injected into the dev-mode reload `<script>`. Set it per site
  so two sites can watch at once without fighting over the port, or pointing
  each other's browsers at the wrong reload server.
- `devHost` (default `'127.0.0.1'`) — the interface the dev and live reload
  servers bind to. **Behaviour change:** dev mode used to bind every interface,
  so the unbuilt site was reachable from anyone on your network even though the
  log line said `localhost`; it is now loopback only. If you preview on your
  phone or another machine, set `devHost: '0.0.0.0'`.

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
