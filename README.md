# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

Kiss-ssg uses [handlebar partials](https://handlebarsjs.com/guide/partials.html#partials) and [handlebar-layouts](https://www.npmjs.com/package/handlebars-layouts) to help you make DRY static websites.

Install with `npm install kiss-ssg --save-dev`.

## Requirements

Node 22.12 or newer. kiss-ssg v2 is an ES module: use `import Kiss from 'kiss-ssg'`. Plain `require('kiss-ssg')` also works on Node ≥22.12.

## Types

TypeScript declarations ship with the package, generated from the JSDoc in the engine — so a plain-JavaScript site gets completion, hover docs and checking from `// @ts-check` alone, with no TypeScript of its own and no `@types/` package to install:

```js
// @ts-check
import Kiss from 'kiss-ssg'

/** @type {import('kiss-ssg').KissConfigInput} */
const config = { siteUrl: 'https://example.com', cleanBuild: 'atomic' }

const kiss = new Kiss(config)
```

The same applies to `PageOptions`, `PagesOptions`, `KissController` (a controller function), `BuildError` (the error `complete()` rejects with, carrying `err.failures`) and `BuildReport` (what `.report()` returns).

## Using an AI coding agent?

Everything an agent needs ships in the package, so point it at `node_modules` rather than at this README. In the project's `CLAUDE.md` (or the equivalent for your agent), import the cheat-sheet:

```markdown
@node_modules/kiss-ssg/llms.txt
```

That file is the API contract: the pipeline, every method and option, the helpers, the migration recipes. Beside it sit `node_modules/kiss-ssg/AIKB/` (per-module notes), `node_modules/kiss-ssg/types/` (declarations the agent's editor reads) and `node_modules/kiss-ssg/examples/` (eleven runnable sites with a README each — copy the exemplar whose shape matches).

Give the agent a verdict it can act on: `npx kiss-ssg check site.js` runs your build script as a dry run and prints one JSON report per site built, exit 1 on any failure, without touching the published output (see [Checking a build](#checking-a-build)), and `npx kiss-ssg aikb site.js` records what the site is into `AIKB/`, which the agent reads back next time.

If the agent is Claude Code, this repository is also a plugin marketplace. In Claude Code, run:

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-ssg@kiss-ssg
/plugin install kiss-memory@kiss-ssg
```

The first line registers this repository as a marketplace; the other two install its two plugins. `kiss-ssg` builds sites; `kiss-memory` remembers them — it reads the `AIKB/` folder `npx kiss-ssg aikb <build-script>` records, and the diff `kiss-ssg check` produces against that record by default, so a developer returning after two years can be briefed on what the site is and what bites (`/kiss-memory:kiss-site-brief`), and a piece of work can be framed, steered and closed against the site's own output (`/kiss-memory:kiss-branch-open`, `kiss-branch-pulse`, `kiss-branch-close`) — the baseline moving only when the close records it. Between pieces of work, `/kiss-memory:kiss-memory-consolidate` tidies what the loop accumulates: it folds the session logs' durable lessons into `AIKB/site.md`, an authored page the build never writes, retires feedback that keeps recurring so it stops being surfaced at every open, and repairs the notes `check` reports as stale, dangling or dead. See [`plugins/kiss-memory/`](plugins/kiss-memory/).

The `kiss-ssg` plugin installs four skills, all named `kiss-<something>` so they're easy to spot alongside skills from other plugins — `/kiss-ssg:kiss-site-new` (build a site from a description, or a whole new section on one), `/kiss-ssg:kiss-page-add` (add or update a single page on a site that's already set up), `/kiss-ssg:kiss-site-migrate` (move a v1 project to v2) and `/kiss-ssg:kiss-build-check` (verify a build and read its report). They carry no copy of the API: each points at the docs installed in `node_modules/kiss-ssg/`, so the guidance cannot drift from the engine you have. You don't have to invoke them by name — each skill's description is written for automatic discovery, so a request like "add a page to this site" or "why is my kiss-ssg build failing" reaches for the matching skill on its own. The plugin source is [`plugins/kiss-ssg/`](plugins/kiss-ssg/).

## Usage

kiss-ssg has 3 methods

- .page()
- .pages()
- .scan()

The simplest usage is to use .scan() to scan your 'pages directory' for \*.hbs files and outputs them to the 'build folder'.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss()
kiss.scan()
kiss.generate()
```

**Note**: kiss will generate the default folders for you when you first run the script. You can overwrite the folder locations bay passing a config to the kiss constructor.

The default config options are:

```js
{
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: {
    headers: {},
    timeout: 10000,
    retries: 0,
    cache: false
  },
  assets: {
    hash: false,
    version: null,
    pipeline: []
  },
  markdown: {
    html: true,
    xhtmlOut: true,
    breaks: false
  },
  links: {
    check: true
  },
  port: 3001,
  livereloadPort: 35729,
  devHost: '127.0.0.1',
  folders: {
    src: './src',
    build: './public',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    partials: './src/partials',
    models: './src/models',
    controllers: './src/controllers',
    aikb: './AIKB'
  }
}
```

Partials: Cam be a .hbs, a .html file or a .md file, Note: .md files are automatically parsed

| Option         |                    Default                     |                                                                                                                                                                                                                Purpose                                                                                                                                                                                                                |
| -------------- | :--------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| dev            |                     false                      |                                                                                                       Dev mode will start a local live-reload server and rebuild on file change. Model and controller changes are picked up too: a rebuild re-runs models and controllers, and edited controller files are reloaded from disk.                                                                                                        |
| verbose        |                     false                      |                                                                                                                                                                                      Enables additional output on the terminal, when set to true                                                                                                                                                                                      |
| cleanBuild     |                      true                      |                                                                                           `true`, `false` or `'atomic'`. `true` empties the build dir — in the constructor, before anything is rendered. `'atomic'` builds into a staging folder and swaps it in only when `complete()` resolves. See **Cleaning the build folder** below.                                                                                            |
| extensionLess  |                     false                      |                                                                                                                                          When `true`, a non-index page builds to `<path>/<slug>/index.html` instead of `<path>/<slug>.html` — a URL like `/about/` instead of `/about.html`.                                                                                                                                          |
| sass           |             `{ includePaths: [] }`             |                                                                                                                                                             `includePaths` is passed to sass as `loadPaths`, so `@use`/`@import` can resolve from those directories too.                                                                                                                                                              |
| fetch          |                   see below                    |                                                                                                   The policy for `http(s)` models: `headers` sent with every request, `timeout` in ms, `retries` after a network error or a 5xx, and `cache` (`false`, or a directory to cache successful bodies in). See **Remote models** below.                                                                                                    |
| assets         | `{ hash: false, version: null, pipeline: [] }` | Cache busting for the files copied into the build, plus the external commands run before the copy. `hash: true` renames every emitted `.css`/`.js` to carry a content hash; `version: '1.4.5'` renames nothing and makes `{{asset}}` append `?v=1.4.5`; `pipeline` is an ordered list of `{ name?, run, watch?, cwd? }` steps. All off is today's build, unchanged. See **Cache-busting asset URLs** and **An asset pipeline** below. |
| port           |                      3001                      |                                                                                                         The port the dev server listens on (`dev: true` only). A port already in use fails the build with one message naming it — nothing can be served, so give a second site its own `port` rather than letting them clash.                                                                                                         |
| livereloadPort |                     35729                      |                                                                                  The port the live-reload server listens on, and the one the injected reload script talks to (`dev: true` only). Give a second site its own value to run both at once — a clash is now logged and live reload simply switched off, rather than killing the process.                                                                                   |
| devHost        |                  '127.0.0.1'                   |                                                                                         The interface the dev and live-reload servers bind to. Loopback only by default; set `'0.0.0.0'` to reach the preview from another device on your network — live reload follows the host the page was loaded from, so the preview reloads there too.                                                                                          |
| folders        |                   see above                    |                                                                                                                                                                                             A JSON object of alternative folder locations                                                                                                                                                                                             |
| folders.aikb   |                    './AIKB'                    |                                                                                           Where `npx kiss-ssg aikb` records the site's knowledge base. Source, not output: it sits outside `folders.build`, is never derived from `folders.src`, is not created until you record one, and is meant to be committed. `null` switches it off                                                                                            |
| siteUrl        |                   undefined                    |                                                                                                                                                                  The site's base URL, required by `.sitemap()` (see below) and by the `canonical` / `absUrl` helpers                                                                                                                                                                  |

A key you pass explicitly as `undefined` takes its default — `new Kiss({ port: process.env.PORT })` with `PORT` unset still gets 3001, and the same holds inside `folders` and `sass`. `null` is a real value: set a folder to `null` to switch it off.

<br />

**Note**: All config settings are available in the view under "this.config"

Each page gets its **own shallow copy** of the resolved config, so a controller that mutates `options.config` changes that page only — never the other pages, `kiss.config`, or the sitemap. Pass `config` in a page's options to override settings for that page alone (nested objects such as `folders` are shared with the global config, and kiss never mutates them).

### Cleaning the build folder

`cleanBuild` decides what happens to `folders.build`, and it takes three values.

`true` (the default) empties the build folder **in the `Kiss` constructor** — before a single model has resolved or page rendered — and nothing puts it back if the build then fails. For a build folder you regenerate from scratch every time that is exactly right. For one that holds output you have already published, it is not: a re-run to fix one typo destroys the old output first, and a build that fails leaves the folder empty or half-built.

`false` never cleans; files from earlier builds stay where they are.

`'atomic'` is the safe re-run. The build goes into a staging folder beside the build folder, and the whole thing is swapped into place only when `complete()` resolves:

```js
const kiss = new Kiss({
  cleanBuild: 'atomic',
  folders: { build: `./handbooks/${cohort}` },
})
kiss.scan().generate()
await kiss.complete() // the folder is replaced here, in one step
```

Until that line, the previous output is untouched — and if any page fails, `complete()` rejects, the staging folder is deleted and the old output is still there, byte for byte. Everything the build writes follows the staging folder: pages, copied assets, `sitemap.xml`, and a `.copyAssets()` you aimed explicitly at the build folder. The swap itself is two renames — your old output is renamed aside, the new build is renamed into place, and the old folder is then deleted — so there is no moment where the folder is half-copied, and a failed swap puts the old output straight back. A build killed mid-flight leaves a `.kiss-staging-…` or `.kiss-old-…` folder beside your build folder; the next build removes it and says so. Two things to know: only `complete()` promotes, so a chain that ends at `.generate()` swaps nothing in; and in `dev: true` it behaves as `true` and says so in one line, because the dev server has been serving the build folder since it started.

Whatever `cleanBuild` is set to, kiss refuses to build into a folder that would swallow the site's own source — the build folder being the source folder, containing it, or being `'.'` or `'/'`. That is a floor, not a licence: if your build folder is built from a variable (`./handbooks/${cohort}`), validate it before you construct, because an empty value resolves to the parent folder.

### Building more than one site from one source tree

kiss has no notion of "versions" or "sites" — it is one `Kiss` instance building to one `folders.build`. That is enough to build several outputs from one shared `src/`, each frozen once and never touched again: an archive of per-intake handbooks, a menu rebuilt every season, a docs site published per release. Four things kiss already gives you, combined:

1. **One `Kiss` instance per output, `folders.build` as the discriminator.** Everything else — pages, partials, models, controllers — is shared; only the build folder differs between runs:

   ```js
   const kiss = new Kiss({ folders: { build: `./menus/${season}` } })
   ```

2. **An arbitrary config key, carried into every view.** Pass whatever varies between outputs straight into `new Kiss({...})` and read it back as `config.<key>` — it is the only thing that needs to differ in the template:

   ```js
   new Kiss({ season, folders: { build: `./menus/${season}` } })
   ```

   ```hbs
   <h1>The {{config.season}} menu</h1>
   ```

3. **`folders.assets: null` plus an explicit `copyAssets(src, buildDir)`** when each output must own its assets outright, rather than sharing a folder kiss would otherwise keep re-copying from:

   ```js
   const kiss = new Kiss({ folders: { build: menuDir, assets: null } })
   kiss.copyAssets('./shared/assets', menuDir).scan().generate()
   ```

4. **`cleanBuild: 'atomic'`**, so a re-run that fixes a typo in this output can never destroy — or half-build — an output already published (see **Cleaning the build folder** above).

The one thing kiss cannot validate for you: the value that becomes `folders.build` is yours before it ever reaches the constructor. Check it looks like a slug — not empty, no `..`, no path separators — before building, since an empty or malformed value resolves against the parent of every output you have already published, not just the one you meant to build.

See `examples/7-versioned-outputs.js` for a full runnable version: one seasonal menu per season, each with its own copied assets, plus a small second build that lists every season folder found on disk. `examples/` ships in the published package, so `node_modules/kiss-ssg/examples/README.md` is a copy you can run without cloning the repo. Examples 1–6 and 10 are the feature reference, one idea each; 7–9 and 11 are exemplars — whole sites to copy by shape: versioned outputs, a data-fed site with one broken record, the v1 → v2 migration recipes, and a blog with pagination, tag pages, a feed and a redirect. Every example builds and exits by default (`npm run eg1` … `eg11`); pass `--dev` to run examples 1–6, 8, 9, 10 and 11 as a live dev server instead (7 takes a season slug in place of `--dev`, and 8 exits 1 by design).

### Remote models

A model can be a URL, and `config.fetch` is how you make that usable against a real API. It applies to every `http(s)` model of that site (it is per instance — there is no per-page override):

```js
const kiss = new Kiss({
  fetch: {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    timeout: 15000,
    retries: 2,
    cache: './.kiss-cache',
  },
})
```

- **headers** — sent with every URL-model request. This is where an API token or an `Accept` header goes. Keep the token itself in an environment variable, not in the config you commit.
- **timeout** — milliseconds. The request is aborted and that page fails, naming the URL and the timeout. It defaults to 10 seconds: an API that accepts your connection and then goes quiet no longer hangs your build for ever.
- **retries** — extra attempts after a network error or a 5xx, with a short backoff. A 4xx is never retried: the server has already told you the request itself is wrong, so asking again only risks locking a key. If every attempt fails, the error says how many were made.
- **cache** — `false`, or a directory. A successful body is written there under a hash of the URL **and** the headers you sent (a different token is a different entry), and every later build reads the file instead of fetching: later in the same build, on the next `dev`/`.watch()` rebuild, and in tomorrow's build in a new process. That is what stops a watch rebuild paying a network round trip for every remote model, and it lets you build offline. An error response is never cached. There is no expiry — delete the directory (or one file inside it) when you want fresh data — and it is build output, so add it to `.gitignore`:

```
.kiss-cache/
```

A cached model is a build input, exactly like a `.json` file in your models folder: what is in that directory is what your site is built from.

### Assets

Any static files you have in the assets directory will be copied to the build directory

#### Cache-busting asset URLs

Link an asset with the `asset` helper and the caching policy stops living in your template:

```handlebars
<link rel='stylesheet' href='/{{asset "css/site.css"}}' />
```

| `config.assets`        | What is emitted                | What the helper renders |
| ---------------------- | ------------------------------ | ----------------------- |
| _(default)_            | `public/css/site.css`          | `css/site.css`          |
| `{ hash: true }`       | `public/css/site.a1b2c3d4.css` | `css/site.a1b2c3d4.css` |
| `{ version: '1.4.5' }` | `public/css/site.css`          | `css/site.css?v=1.4.5`  |

Ask for the path the file has when nothing is renaming it — a `.scss` source by its compiled `.css` name — and the same template line works under all three. The helper renders no leading slash, so the base is yours: `/{{asset …}}` for a root-relative link, or `{{root}}{{asset …}}` if your layout already climbs back to the build root (which is what makes a nested page work opened straight off the file system). The hash is taken over the bytes that were emitted (a stylesheet after sass compiled it), so the URL changes when, and only when, the file a browser downloads changes; the file it replaces is deleted as it is written, so a `dev` session leaves one stylesheet in the build rather than one per save. Only `.css` and `.js` are renamed: an image, a font or `robots.txt` is reached by URLs kiss does not rewrite — the ones inside a stylesheet, and the ones a host asks for by a fixed name — so those keep their names, and `{{asset}}` still resolves them.

The other two forms, for a layout that climbs back to the build root and for an absolute URL — the hashed extension and the `?v=` query both survive the wrap:

```handlebars
<link rel='stylesheet' href='{{root}}{{asset "css/site.css"}}' />
<link rel='preload' as='style' href='{{absUrl (asset "css/site.css")}}' />
```

#### An asset pipeline

`config.assets.pipeline` runs an external tool as part of the build — a CSS toolchain, an icon sprite, anything with a command line. Each step is `{ name?, run, watch?, cwd? }`, and kiss knows nothing about the tool itself:

```js
const kiss = new Kiss({
  dev: process.argv.includes('--dev'),
  assets: {
    pipeline: [
      {
        name: 'tailwind',
        run: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify',
        watch:
          'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify --watch=always',
      },
    ],
  },
})
```

Every `run` is executed through a shell, in order, awaited, **before the asset copy** — so a tool that writes into your assets folder has its output copied into the build like any other asset — and again before the copy on every whole-site `watch` rebuild. A step that exits non-zero (or cannot be spawned) fails the build like a failed page: `complete()` rejects and the failure is named `<pipeline: tailwind>`, while the pages and the asset copy still run so the whole build is still reported. `report().pipeline` carries `{ name, ok, duration }` per step.

`name` defaults to the first word of `run`, `cwd` to `process.cwd()`, and each command inherits `process.env` plus `KISS_BUILD`, `KISS_ASSETS` and `KISS_DEV` (`'1'` or `'0'`). `watch` is the dev-mode half: in `dev: true` only, it is started once — after that step's `run` has succeeded — kept for the session with its output going through kiss's logger, and ended by `close()`. A watch process that dies on its own is logged, not a build failure, and a rebuild never starts a second one. Editing a page, a partial or a layout does **not** re-run the steps; a tool that must see those edits is what `watch` is for.

`kiss-ssg check` runs the pipeline exactly as a build does, so a check is not read-only over your working tree: it regenerates whatever the steps generate. `examples/10-asset-pipeline.js` (`npm run eg10`) is a runnable version that needs nothing installed.

### Markdown options

`config.markdown` is handed to this instance's [Remarkable](https://github.com/jonschlinkert/remarkable) — the renderer behind both `.md` partials and the `{{markdown}}` helper, so the two can never disagree:

```js
new Kiss({
  markdown: { breaks: true, typographer: true },
})
```

The three defaults (`html: true`, `xhtmlOut: true`, `breaks: false`) are the keys kiss has an opinion about, **not** the keys it accepts — the block is passed through as-is, so any other Remarkable option reaches the renderer without kiss knowing its name. It is merged one level deep, like `sass`, `fetch` and `assets`, so setting one key keeps the rest at their defaults.

**`breaks: false` is deliberate.** With `breaks: true`, every newline inside a paragraph becomes a `<br />` — so a paragraph you hard-wrapped in your editor renders with a line break at each of the source's wrap points, mid-sentence. Turn it on only if your `.md` sources genuinely treat a newline as a line break.

Set it in config rather than reaching for `kiss.remarkable` afterwards: `.md` partials are rendered to HTML **when they are registered**, which happens in the constructor, so a later mutation would change the `{{markdown}}` helper but silently miss every partial unless you also called `kiss.registerPartials()`.

### .page()

Instead (in in conjunction) of using the .scan() method you can pass a model to the view using the .page() method. This allows you to name the view and pass a model to that view. The model is then available in the handlebar template under the model property, e.g. {{model.name}}

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ dev: true })
kiss
  .page({
    view: 'index.hbs',
    model: 'index.json',
    controller: 'index.js',
    title: 'My Page Title',
  })
  .generate()
```

**Note**: The file locations of the models, views, and controllers are relative to the folder locations defined in the kiss configuration. Alternatively, instead of passing a file location you can pass a native object for that setting.

Views: can se a .hbs file or a string
Models: can be a .json file, a http api endpoint, or a JSON object
Controllers: can be a .js file or a function that returns a page option JSON to be merged into the page options

The options that you can pass to .page() & pages() are:

```js
  {
    view: 'index.hbs',
    model: {}
    controller: ({model})=>{return {model: model}},
    title: 'Page Title',
    description: 'A description of the page (useful for meta data)'
    path: '/',
    slug: 'index',
  }
```

These options are both used internally by kiss and are available in view.

- view = A handlebars view.
- model = A json object, the name of the json file relative to the models folder or a URL for an API endpoint.
- controller = A function that returns a page options object - used for manipulating data in the model.
- title = The page title
- config = Config overrides for this page only, merged over the global config
- path = the folder path to the page
- slug = the name of the file without the extension
- generate = whether to build this page at all (default `true`); set to `false` to skip it entirely — e.g. a fanned-out `.pages()` item that fails a check in its controller. Nothing is written for that page, and `.generate()`/`.complete()` still resolve normally.

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view — but only when the view is a `.hbs` filename. A view passed as a template string has no file path to infer from, so it gets a generated `snippet-N` slug and no folder; pass a `slug` (and a `path`, if you want one) yourself.

_Note:_ Slugs and path segments are slugified: accented Latin letters are transliterated (`Über uns` → `uber-uns`), anything else outside `a-z0-9` becomes a `-`, and leading/trailing dashes are trimmed. A title written in a script with no Latin equivalent (Japanese, Korean, Cyrillic…) has nothing to transliterate, so it falls back to a short stable hash such as `p-9736ca69` — not pretty, but unique, which keeps each page in its own file. Pass an explicit `slug` when you want a readable URL for such a page. If two pages end up with the same output path the build fails and names the path — only one of them could ever exist on disk.

### .pages()

In addition to passing page options you can also pass a option mapper to act as a controllers to the .page() and .pages() methods:

```js
import Kiss from 'kiss-ssg'

const kiss = new Kiss()
kiss
  .page({
    title: 'My Team Page',
    view: 'about/index.hbs',
    model: 'departments.json',
    controller: ({ model }) => {
      return {
        model: model.sort(
          (a, b) => parseInt(a.sort_order) - parseInt(b.sort_order),
        ),
      }
    },
  })
  .generate()
```

### Controller

The option mapper is really useful for mapping a slug from the model. This is great for dynamic slugs and a necessity when passing an array of models to the .pages() method to generate a series of pages.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ test: '123' })

kiss
  .page({
    title: 'Page Title',
    view: 'index.hbs',
  })
  .pages({
    view: 'course.hbs',
    model: 'https://{my-cool-api}/courses',
    controller: ({ model }) => {
      return {
        slug: model.slug,
      }
    },
    path: 'courses',
  })
  .generate()
```

**Note**: controllers should stay pure — return new values rather than mutating `model` (or a nested option such as `config.folders`) in place. How much an in-place mutation costs you depends on the model kind: a `.json` file, a models folder, or an `http(s)://` URL model is re-resolved on every build and on every `.watch()` whole-site rebuild, so mutating one of those in place is contained to that single build. A **plain object** model is different — it is replayed from a shallow snapshot of the original `.page()`/`.pages()` call, so an object model your controller mutated in place is still mutated on the next rebuild: an in-place `array.push(...)` or property assignment on it accumulates one more change with every save, and the dev server drifts further from what a fresh build would produce. Returning new values sidesteps the distinction entirely.

### .sitemap()

Generates a `sitemap.xml` in the root of the build folder from every page you've registered, so you don't need to hand-roll one yourself. Requires `siteUrl` to be set on the Kiss config; it logs an error and skips writing if it isn't.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ siteUrl: 'https://example.com' })
kiss.scan().generate().sitemap()
```

It can be called before or after `.generate()` — both just wait for all your pages to be registered before doing their own thing.

Each `<loc>` is the same string the `canonical` helper renders on that page, built by the same code — so a page built to a directory index is listed with its trailing slash (`courses/index.html` → `https://example.com/courses/`), which is the URL a static host serves without a redirect. See **canonical / absUrl** below.

Any individual page can opt out with `ignoreSitemap: true`, and override the sitemap entry with `sitemapPriority` (default `'1.00'`), `sitemapChangefreq` (omitted unless set), and `sitemapLastmod` (default: the current time, shared across all pages): A page with `generate: false` is left out as well.

```js
kiss.page({
  view: 'private/index.hbs',
  ignoreSitemap: true,
})

kiss.page({
  view: 'landing-page.hbs',
  sitemapPriority: '0.9',
  sitemapChangefreq: 'weekly',
})
```

`sitemap.xml` is overwritten on every call by default. Pass `{ overwrite: false }` to skip writing (and skip the callback firing with data) if one already exists at the build path:

```js
kiss.sitemap({ overwrite: false })
```

**Note**: `overwrite: false` only has an effect if you also set `cleanBuild: false` on the Kiss config. With the default `cleanBuild: true`, the whole build folder — including any previous `sitemap.xml` — is emptied before generation starts, so there's never an existing file left for `.sitemap()` to find.

### .llms()

Writes an [`llms.txt`](https://llmstxt.org) into the root of the build folder: the curated, AI-facing index of your site, the file an answer engine reads before it crawls. It is `.sitemap()`'s sibling — same registry, same titles, same URLs, a different reader — so the two can never drift apart. It needs `siteUrl`, a `title` and a `summary`; without any of them it logs an error and skips the file rather than throwing.

```js
kiss
  .page({
    view: 'index.hbs',
    title: 'A1K9 Training',
    description: 'Dog training and behaviour work in South Wales',
  })
  .pages({ view: 'courses/course.hbs', model: 'courses', path: 'courses' })
  .page({ view: 'rota.hbs', ignoreLlms: true }) // in the sitemap, out of the index
  .generate()
  .sitemap()
  .llms({
    title: 'A1K9 Training',
    summary: 'Dog behaviour and obedience training in South Wales.',
    sections: { root: 'Pages', courses: 'Courses' },
    notes: 'src/content/llms-notes.md',
  })
```

writes:

```markdown
# A1K9 Training

> Dog behaviour and obedience training in South Wales.

## Pages

- [A1K9 Training](https://a1k9training.co.uk/): Dog training and behaviour work in South Wales

## Courses

- [Bronze obedience](https://a1k9training.co.uk/courses/bronze-obedience): Six weeks, group class
```

**The options**: `title` is the `# ` heading and `summary` the `> ` blockquote — and `summary` (like the optional `notes`, which becomes a trailing `## Notes` section) is either the text itself or a path, relative to your working directory, to a `.md`/`.txt` file holding it, so a long summary can live beside the rest of your content. `sections` maps a top-level path segment to a heading (`{ courses: 'Courses' }`); the key `root` names the section holding pages with no path (default `Pages`), and any segment you do not map is title-cased (`behavioural-consultations` → `Behavioural Consultations`). `overwrite` (default `true`) behaves exactly as the sitemap's.

**Which pages are listed**: every registered page, grouped by the first segment of its `path` with the root group first, in registration order. A page opts out with `ignoreLlms: true`, and a page already out of the sitemap (`ignoreSitemap: true`) or not being built at all (`generate: false`) is out of `llms.txt` too — the index is a subset of the site the sitemap describes, never a superset. `llmsSection: 'Name'` puts one page under a heading of your choosing regardless of its path. Each entry is `- [title](url): description`, with the description omitted when the page has none and the title falling back to the page's slug, title-cased; each URL is the same string that page's own `{{canonical}}` renders.

It is chainable, can be called before or after `.generate()`, and is re-run by a whole-site watch rebuild like `.sitemap()`. Its callback receives the rendered text (`kiss.llms(options, (text) => …)`), and the file it wrote is reported as the build report's `llms`.

### .feed()

Writes an RSS 2.0 feed into the root of the build folder: the third file derived from the same registry as `sitemap.xml` and `llms.txt`, so an item can never name a URL your site does not serve. One `<item>` per page that carries a date, newest first. It needs `siteUrl` and a `title`; without either it logs an error and skips the file rather than throwing.

```js
kiss
  .pages({
    view: 'blog/post.hbs',
    model: 'posts', // each post's JSON carries its own `date`
    path: 'blog',
  })
  .page({ view: 'blog/index.hbs', path: 'blog' }) // no date: not an item
  .generate()
  .sitemap()
  .feed({
    title: 'A1K9 Training — the blog',
    description: 'Dog behaviour and obedience training in South Wales.',
    section: 'blog',
    limit: 20,
  })
```

writes `public/feed.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>A1K9 Training — the blog</title>
    <link>https://a1k9training.co.uk/</link>
    <description>Dog behaviour and obedience training in South Wales.</description>
    <atom:link href="https://a1k9training.co.uk/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>Tue, 03 Feb 2026 00:00:00 GMT</lastBuildDate>
    <item>
      <title>Loose-lead walking</title>
      <link>https://a1k9training.co.uk/blog/loose-lead-walking</link>
      <guid isPermaLink="true">https://a1k9training.co.uk/blog/loose-lead-walking</guid>
      <pubDate>Tue, 03 Feb 2026 00:00:00 GMT</pubDate>
      <description>Six weeks, one lead, no pulling.</description>
    </item>
  </channel>
</rss>
```

**The options**: `title` (required) is the channel's `<title>` and `description` its `<description>`. `section` limits the feed to one top-level `path` segment (`'blog'`) — omit it and every page is a candidate. `limit` (default `20`) caps the items, `filename` (default `feed.xml`) names the file inside the build folder, and `overwrite` (default `true`) behaves exactly as the sitemap's.

**Where the dates come from**: `dateField` (default `'date'`) names one field, and it is read from the page's options first and its resolved model second — so a post can be dated in its `.page()`/`.pages()` call or in its own `.json`, and either way it is the same key. A `Date`, epoch milliseconds, or any string `new Date()` parses is accepted; a value that cannot be read logs one warning and the page is treated as undated.

**Which pages are items**: every page with a readable date, newest first (the URL breaks a tie so the order is the same on every machine). A page with no date is simply left out — most of a site is undated, and that is not a mistake worth a warning. A page opts out with `ignoreFeed: true`, and a page already out of the sitemap (`ignoreSitemap: true`) or not being built at all (`generate: false`) is out of the feed too. Each `<link>` and `<guid>` is the same string that page's own `{{canonical}}` renders, and the `<title>`/`<description>` are derived exactly as `llms.txt` derives them.

`<lastBuildDate>` is the newest item's date rather than the wall clock, so two identical builds produce byte-identical files and a feed you commit does not churn. It is chainable, can be called before or after `.generate()`, and is re-run by a whole-site watch rebuild like `.sitemap()` and `.llms()`. Its callback receives the rendered document (`kiss.feed(options, (xml) => …)`), and the file it wrote is reported as the build report's `feed`.

### Redirects

A page's `aliases` are the old URL paths it now answers. Every settled build collects them and writes `_redirects` into the root of the build folder — the [Netlify](https://docs.netlify.com/routing/redirects/) and [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/redirects/) format, and only that: no `.htaccess`, no `vercel.json`, no meta-refresh. There is no method to call; an alias is a property of a page, not a file you ask for.

```js
kiss
  .page({ view: 'about.hbs', aliases: ['/about-us', '/team.html'] })
  .pages({
    view: 'blog/post.hbs',
    model: 'posts', // a renamed post's own JSON carries `"aliases": ["/news/2024/thing.html"]`
    path: 'blog',
  })
  .generate()
```

writes `public/_redirects`:

```
/about-us /about 301
/news/2024/thing.html /blog/thing 301
/team.html /about 301
```

The target is the page's canonical path — `/`, `/courses/`, `/about` — the same string that page's own `{{canonical}}` renders and its `<loc>` in `sitemap.xml` carries, so a redirect can never point at a URL your site does not serve. Sources are written as you gave them, with a leading `/` added and any `?query` or `#fragment` dropped; a trailing slash is kept, because `/old/` and `/old` are two different paths to a host and you are the one who knows which was linked. Lines are sorted, so two identical builds write identical bytes and a committed `_redirects` does not churn.

On a `.pages()` fan-out the aliases belong to **each record**, never to the registration: `.pages({ aliases: [...] })` is not broadcast over the fan-out, because one source path redirecting to N different pages is not a redirect. Put them in the model item. A page with `generate: false` contributes none — there would be nothing at the other end.

A site with no aliases writes **no file at all**, not an empty one, so a hand-written `_redirects` you keep in `src/assets/` is copied into the build and left alone.

**Two findings ride along**, both advisory and both in `report().redirects` (`{ file, aliases, removed, collisions }`, or `null` when there is nothing to say):

- `removed` — pages the **last record** wrote that this build does not, minus any an alias now covers: a page that vanished with no redirect. It is the one finding that needs a recorded knowledge base (see [Recording the knowledge base](#recording-the-knowledge-base)); without `AIKB/last-build.json` it is empty, and an unreadable one is treated the same way. Paths are compared build-relative on both sides, so a record made from one working directory and a check run from another still agree.
- `collisions` — aliases a live page already answers, by its canonical path (`/about`) or by the file itself (`/about.html`), and any source two pages both claim. On both hosts a non-forced rule whose source is a real file is **silently ignored** — the line does nothing at all, with no error anywhere — which is why this is worth saying out loud.

Under `--summary` they print as `  removed without redirect: <path>` and `  alias collides with a page: <path>`. Neither changes `ok`, and neither changes the exit code.

### Waiting for the build

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
  console.error(err.message) // e.g. 1 page(s) failed to build: public/about.html
  process.exitCode = 1
}
```

A bad model is not a build failure — it is logged, that page is skipped, and it appears in the resolved data as `{ id, data: null, error }`. A bad controller _is_ a build failure: a controller that throws, one whose file is missing, one whose module does not export a function, and a `controller` option of an unrecognised type all fail that page and reject `.complete()`, rather than shipping a page built from un-controlled options. In a `.pages()` fan-out that failure is scoped to the one bad item: the rest of the items are still built, and each bad one is reported separately as `<view> [item N: <slug>]` (there is no output path to name it by). A missing or misspelled view file is a build failure too. So is an error thrown by a `.generate()` or `.sitemap()` callback — it is reported as `<generate callback>` / `<sitemap callback>` in `err.failures`. In `dev: true`, so is a dev server that cannot bind `config.port` (`Dev server could not bind 127.0.0.1:3001 (EADDRINUSE): the site is not being served`) — reported once, as `<dev server>` in `err.failures`; the watcher and live reload are stopped with it, so the process can exit once you have handled the rejection. A clash on `livereloadPort` is different: live reload is optional, so it is logged and switched off while the site keeps being served. `.complete()` reports a build's failures once: a second call in the same build resolves rather than rejecting again.

In dev mode, or after calling `.watch()`, call `await kiss.close()` to stop the watcher and server. It waits for a rebuild that is already running to finish, so once it resolves nothing more is written and it is safe to clean or deploy the build folder.

Editing a page template re-renders that page; deleting one, or creating any file under `src/`, rebuilds the whole site. Editing a partial or a layout re-renders only the pages that rendered it, and nothing more: your models are not re-read, your controllers are not re-run, and a model you load from a URL is not fetched again — a partial cannot change which pages exist or where they are written, so there is nothing else to redo. Which pages use which partial is learned while rendering rather than parsed out of your templates, so a partial chosen with `lookup`, one reached through another partial, and a layout reached with `{{#extend}}` all count; a partial no page has rendered yet re-renders every page and logs a notice naming it. With `verbose: true` a dev build writes `dependency-graph.json` (`{ partial: [built pages…] }`) beside `debug.json`, and each page's `.json` sibling lists the `partials` it used. Editing anything else under `src/` — a model JSON or a controller — rebuilds the whole site by replaying every page you registered, so models are re-read and controllers re-run (edited controller files are reloaded from disk, whether they use `export default` or `module.exports`). A rebuild replays each page from a shallow snapshot of its original `.page()`/`.pages()` call, so keep controllers pure (see the note under "Controller" above) — one that mutates its model in place carries that mutation into every later rebuild. A whole-site rebuild also tidies up after itself: output files the previous build wrote that the new one no longer produces — a page whose slug changed, one dropped from a `.pages()` fan-out, or a page `.scan()` had discovered whose template you deleted — are deleted, and `sitemap.xml` is regenerated if you called `.sitemap()`. A partial or layout you add mid-session is registered by that rebuild and usable straight away, and one you delete is unregistered — so a page still referencing a deleted partial fails the rebuild with `The partial <name> could not be found` rather than quietly rendering the deleted content until you restart. If you used `.scan()`, a rebuild scans your pages folder again, so a page template you create while watching is built without a restart; on a site where you registered pages by name with `.page()`, adding the file is not enough — add the call too. If a model or controller fails to resolve during a watch rebuild (e.g. a half-saved JSON file caught mid-write), that page's previous output is removed rather than left in place, so the dev server 404s on it until the next valid save instead of serving stale HTML.

Your browser is reloaded once per rebuild, when that rebuild has finished writing every page — not once per file — so a reload never lands on a page that has not been re-rendered yet, however large the site. The first build reloads the browser too, so a tab left open across a restart picks the new output up. Editing a stylesheet reloads just that stylesheet, leaving the page where it was.

### Checking a build

`npx kiss-ssg check <script>` builds the site your script builds and tells you whether it worked — without publishing anything. The build is staged and then discarded, so the build folder is neither emptied nor written, and what you get back is the verdict instead of the output:

```bash
npx kiss-ssg check build.js            # JSON, one report per Kiss instance — and, if the
                                       # site has recorded an AIKB/, what changed since
npx kiss-ssg check build.js --summary  # one line per instance instead
npx kiss-ssg check menu.js 2026-spring # arguments after the script go to the script
npx kiss-ssg check --against last.jsonl build.js  # diff against some other report instead
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
      "collisions": []
    },
    "feed": "./public/feed.xml"
  }
]
```

It exits **1** if any report is `ok: false`, if your script itself exited non-zero, or if no report was written at all — a script that never awaits `.complete()` reports nothing, which is itself the finding. Exit 0 with `ok: true` everywhere is the only passing result, which makes it a one-line CI step. Your site's own build log goes to stderr, so stdout is nothing but the JSON. `--summary` is the command's own flag and is read wherever you write it, so a site that needs that word for itself takes it after a bare `--` (`npx kiss-ssg check menu.js -- --summary`). Each page carries `hash`, the sha1 of the bytes it wrote — `null` for a page that failed or that you registered with `generate: false`.

When the site has recorded a knowledge base (see [Recording the knowledge base](#recording-the-knowledge-base)), `check` diffs against its `AIKB/last-build.json` without being asked. `--against <file>` (before the script) names a different baseline: it reads a report an earlier build left behind — a `KISS_REPORT` JSON Lines file, the JSON array `check` itself prints, or a single report object, all three read without you having to say which — and tells you which pages this build would add, remove or change. Pages are matched by output path and compared by `hash`, so it answers about the bytes a browser would receive rather than about which files you happened to touch; a page whose `hash` is `null` on either side counts as changed. Reports are paired by `buildDir`, so a script that builds several sites gets one diff each, and a file holding several builds of one folder is compared against the newest. Under `--summary` the diff prints under that site's line:

```
ok ./public (check) — 6 pages, 0 failed, 2 assets, 153ms
  + ./public/news/spring-2026.html
  - ./public/news/autumn-2025.html
  ~ ./public/news/index.html
  = 3 unchanged
```

Without `--summary`, stdout becomes `{ "reports": [...], "diff": [...] }` instead of the bare array whenever there is a diff to print — under `--against`, or under `check` when the site has a recorded baseline — and `diff` runs in the same order as `reports`, one `{ buildDir, added, removed, changed, unchanged }` entry each, every list sorted. A missing or unreadable file is a usage error (exit 1, nothing built). The diff never changes the exit code: it describes the build, it does not judge it.

**Broken internal links.** Every settled non-dev build also scans its own output and reports what it found as `report().links` — `{ checked, broken: [{ page, href }] }` — with one `  broken link: <page> -> <href>` line per finding under `--summary`. It checks the `href`, `src`, each `srcset` candidate and `action` of every `a`, `link`, `script`, `img`, `source`, `video`, `audio`, `iframe` and `form` your pages wrote, resolving a root-relative path against the build folder and a relative one against the page's own directory, and accepting a file that is there, a page this build wrote, `<path>/` → `<path>/index.html`, an extension-less `<path>` → `<path>.html` or `<path>/index.html`, and an asset under the name `{{asset}}` actually emitted.

An absolute URL on your own `siteUrl` counts as **internal** — that is what catches a renamed slug still linked from a nav or a `{{canonical}}`. Another origin, a protocol-relative `//host/x`, `mailto:`, `tel:`, `data:`, `javascript:`, a bare `#fragment` and an empty value are ignored; a query string and a fragment are stripped before resolving. Under `assets.hash` a hardcoded `/css/site.css` **is** a finding, because the file on disk is `css/site.<hash>.css` — use `{{asset}}`.

The finding is advisory: it never changes `ok` and never changes the exit code. Set `links: { check: false }` to turn the scan off. A dev build or a watch rebuild always reports `links: null` — a scoped re-render has not rewritten every page, so there is nothing honest to scan.

**Redirects and renames.** The same report carries `redirects` — the `_redirects` this build wrote from your pages' `aliases`, and two more advisory findings: a page the last record had that this build no longer writes and no alias covers (`  removed without redirect: <path>`), and an alias a live page already answers, which the host will silently ignore (`  alias collides with a page: <path>`). See [Redirects](#redirects).

You can drive the same thing yourself, without the command: `KISS_CHECK=1` turns any build into a check (`cleanBuild` becomes `'atomic'`, `dev` becomes `false`, and the staging folder is discarded when `.complete()` settles whether the build passed or failed), and `KISS_REPORT=<file>` appends each settled build's report to a file as JSON Lines, one line per `Kiss` instance; `KISS_AIKB=1` (same rule again) is the one thing `kiss-ssg aikb` adds on top of those two. None of them changes your script's exit code — that stays yours.

Two things a check cannot make true. A site that reads its own build folder back after `.complete()` — an index listing the version folders on disk — sees a folder nothing was published into. And a site with `cleanBuild: false` that relies on files an earlier build left behind starts from an empty staging folder, because a check stages everything.

### Recording the knowledge base

`npx kiss-ssg aikb <script>` writes the site's own knowledge base into `config.folders.aikb` (default `./AIKB`) — the map of the site as the build saw it, for the developer who comes back to it in two years and finds that every context window that held this is gone. It runs exactly the build `check` runs — staged and then discarded, publishing nothing — and the folder is the only thing it leaves behind.

```bash
npx kiss-ssg aikb build.js            # record it
npx kiss-ssg aikb build.js --summary  # ...and say in one line whether it did
```

Nothing else writes that folder. There is no API call for it, and an ordinary build, a `check`, a dev server and a watch rebuild all leave it exactly as they found it. Recording is a **ceremony**: run it when a piece of work is finished, and commit what it wrote. That is what makes `npx kiss-ssg check` mean "what have I changed since this work opened" rather than "since the last time anybody ran a build".

**It refuses to record a build that did not work.** A failed build writes nothing, and `--summary` says `not recorded — build failed`; the exit code is `check`'s. A dev build writes nothing either. The previous record stays exactly as it was — a knowledge base describing a broken build is worse than a slightly old one.

Four files, and all of them are byte-stable across two identical records — nothing is timestamped and every list is sorted — so recording an unchanged site twice leaves `git status` clean and any diff in the folder is a real change to the shape of the site. `README.md` is written once if it is absent and never overwritten: what the folder is, which files are generated, how to write and stamp a note, what the four findings mean, and what `site.md` is for. `site-map.md` and `site-map.json` are the map itself — the site's URL, build folder and source folders; a row per page giving its output path, view, model source, controller source and the partials and layouts it actually rendered; the partial → pages index; models and controllers with the pages that used them; the asset pipeline's steps; and a `## Subjects` table — each subject, the note it wants, and the first 12 characters of its hash (`site-map.json` carries the whole hash). `last-build.json` is that build's report with every timing dropped, and it is the baseline `npx kiss-ssg check` diffs your working tree against.

The folder is **source, not output**: it sits outside `config.folders.build`, survives `cleanBuild`, and is meant to be committed. Setting `folders.aikb: null` switches it off altogether.

**Having the folder is not the same as opting in.** A build reports `report().aikb` only when `folders.aikb` is set _and_ `<folder>/site-map.json` is there — the one file only a record writes. Until then `aikb` is `null` and no map is built, so the default `./AIKB` is harmless in a repository whose `AIKB/` is something else entirely. Once a site has recorded, every build — a `check` included — reports the folder and the note findings, with `written: false`.

**Notes are yours; the engine never writes one.** A map says what the site is; a note says why, which no build can work out. Three kinds of subject carry judgement, and each wants a note under `AIKB/notes/` at a path derived mechanically from its id:

| Subject                                               | Its note                                         |
| ----------------------------------------------------- | ------------------------------------------------ |
| a controller file, e.g. `stockist.js`                 | `AIKB/notes/controllers/stockist.md`             |
| a URL model, e.g. `https://api.example.com/v2/events` | `AIKB/notes/models/api.example.com-v2-events.md` |
| an asset pipeline step, e.g. `tailwind`               | `AIKB/notes/pipeline/tailwind.md`                |

Plain pages, partials and `.json` models are deliberately not subjects — a note saying "renders the about page" is noise. An inline controller or an object model has no file to attach a note to, and is not a subject either. Suggested headings, which nothing enforces: `## What it does`, `## Why it is this way`, `## Gotchas`.

**Every subject carries a hash, and a note may be stamped with it.** `site-map.json`'s `subjects` is `{ kind, id, note, hash }` per subject: sha1 of the controller file (line endings normalised, so a Windows checkout hashes the same), or of the pipeline step's `run` string, and `null` for a URL model — whose id _is_ the subject, so there is nothing for a hash to add. Copy it into the note's frontmatter as `subject-hash: <sha1>` when you write or review the note. The engine never writes a stamp, and an unstamped note is never reported stale — stamping is opt-in, per note. The hash to stamp with is on _every_ build's report as `report().aikb.subjects`, not only on a record's: when a stale note is found, `site-map.json` on disk still describes the previous record, so the report is the only place the current hash exists.

**`AIKB/site.md` is the page about the whole site** rather than about any one subject — authored, evergreen, and never written by the engine. It is scanned for dangling references when it is there and checked for nothing else. The generated `AIKB/README.md` names its five sections: What this site is and who for · How it is deployed · Conventions · Standing gotchas · Retired feedback. The `kiss-memory-consolidate` skill is what maintains it.

Every build reports four findings on `report().aikb.notes`: **missing** (a subject nobody has explained), **dead** (a note under `notes/` whose subject is not in the map), **stale** (a note whose `subject-hash` stamp is no longer its subject's hash — a URL model can never be stale) and **dangling** (`"<note path>: <token>"` for a backticked token in a note, or in `site.md`, that looks like a file reference and resolves to nothing: not a file on disk or under a source folder, a page view or output path, a partial name, a model or controller name, a folder in the map, or a path under the AIKB folder). `kiss-ssg check --summary` prints them as `note missing:` / `note dead:` / `note stale:` / `note dangling:` lines. The dangling filter is deliberately narrow — a token needs a `/` or a known extension and must hold no spaces, `<`, `>`, `*`, `{`, `}` or `$`; code fences, trailing-slash folders and anything with a URI scheme are skipped — because a lint that fires on every note is one people learn to ignore. None of the four is a build failure and none changes an exit code.

`examples/9-migrated-from-v1/AIKB/` and `examples/11-blog/AIKB/` are the runnable exemplars: committed knowledge bases recorded with `cd examples && npx kiss-ssg aikb <script>`, each with authored notes beside it stamped with their controllers' hashes — one note on example 9, two on example 11. The `kiss-memory` Claude Code plugin (see [Using an AI coding agent?](#using-an-ai-coding-agent)) is what reads the folder back.

### Other methods

- `.registerPartials()` — re-registers every partial and layout from disk, unregistering any whose file has gone, and returns the registered names. Kiss runs it for you at start-up and on every watch rebuild; call it yourself if you add or remove partial files at runtime without `.watch()`.
- `.viewStats()` — logs how many pages are queued and prepared, and with `verbose: true` writes a `debug.json` into the build folder listing every page as `{ view, buildTo, runCount, options }`. Chainable; handy from a `.generate()` callback to see what the build actually produced.
- `.getModelByID(id, data)` — pulls one entry out of the `[{ id, data }]` array `.generate()`/`.complete()` hand back, returning its `data` (or `{ error }` if no entry has that id). The id is the model's filename or URL.
- `.report()` — the last settled build as data, or `null` before the first `.complete()` has settled: `{ ok, mode, buildDir, duration, pages, failures, assets, sitemap, pipeline, llms, aikb, links, redirects, feed }`, every value JSON-safe. `aikb` is `null` unless the site has a knowledge base to report on (`folders.aikb` set, and a record already made — see "Recording the knowledge base"), and otherwise `{ folder, written, notes: { missing, dead, stale, dangling }, subjects }` — where it lives, whether _this_ build wrote it (`true` only for a passing `npx kiss-ssg aikb` run; every ordinary build reports `false`), the four note findings (paths, except `dangling`'s `<note path>: <token>`), and `{ kind, id, note, hash }` per subject of this build. `pages` is `{ view, buildTo, ok, hash }` per queued page — `hash` being the sha1 of the bytes that page wrote, or `null` when it wrote none — and `failures` is `{ view, buildTo, message }` — the same list as `err.failures`, with each `Error` reduced to its message. `links`, `redirects` and `feed` are new in this version, appended after `aikb` in that order, and each is `null` until a build actually does that piece of work — which is not the same as doing it and finding nothing. `links` is the broken-internal-link scan of the build's own output, `{ checked, broken: [{ page, href }] }` (`null` in dev, on a watch rebuild, and under `links: { check: false }`); `redirects` is what the build did about page `aliases`, `{ file, aliases, removed, collisions }` — the `_redirects` file written, the alias count in it, the pages the last record had that this build no longer has and no alias covers, and the aliases a live page already answers; `feed` is the feed file written, like `sitemap` and `llms`. Every path in them names the build folder you asked for, never a staging sibling. The same object is on the rejection as `err.report`, so a failed build can be read as data rather than parsed out of a log. See "Checking a build" above.

```js
kiss.scan().generate(function (data) {
  this.viewStats()
  console.log(this.getModelByID('index.json', data))
})
```

### Helpers

Kiss-ssg registers a few useful helpers by default including:

You can parse markdown like this:

```handlebars
<div>
  {{#markdown}}
    # Heading > this is markdown foo bar baz
  {{/markdown}}

  or

  {{markdown model.introduction}}
</div>
```

If you want to take a peek at whats properties you have available to to in a handlebars file you can use this helper:

```handlebars
{{{stringify this}}}
```

You can compile Sass, either from a file or an inline block:

```handlebars
{{{sass 'src/assets/main.scss'}}}

{{#sass}}
  $color: red; body { color: $color; }
{{/sass}}
```

A relative file path is resolved against `process.cwd()` — not the assets folder or the current view — so pass a path relative to where you run the build, or pass an absolute path (used as given). `loadPaths` for `@use`/`@import` comes from `config.sass.includePaths`; output is `'expanded'` in `dev: true` and `'compressed'` otherwise.

`offset` turns a zero-based `@index` into a one-based number:

```handlebars
{{#each items}}
  {{offset @index}}:
  {{this}}
{{/each}}
```

`lookup` is Handlebars' own `lookup` helper with one addition: when the key is undefined it logs `lookup: 'moodleAccess' is undefined in handbooks/uob.hbs`, so a dynamic partial `{{> (lookup . 'key')}}` whose key is missing from your data tells you which key and which page — it still fails the build with `The partial undefined could not be found`, as before.

`isActive` renders its block only when the current page matches `href`, handy for highlighting the current nav item:

```handlebars
<nav>
  {{#isActive page href='/about'}}<a
      class='active'
      href='/about'
    >About</a>{{else}}<a href='/about'>About</a>{{/isActive}}
</nav>
```

Hash options: `href` (the link's path), `active` (the class name rendered as `{{active}}` inside the block on a match — default `'active'`), `folderMatch` (default `false` — when `true`, also matches pages below `href`, so `href="/blog"` matches `/blog/post-1` too). `href` and the page's own URL are both reduced to the same key first (no leading/trailing slash, no extension, no trailing `index` segment), so the same `href="/about"` matches whether the page built to `about.html` or, with `extensionLess: true`, `about/index.html` — and `/about` and `/about/` are always equivalent. An empty `href` under `folderMatch` matches the home page only.

`canonical` is the current page's absolute URL, for a `<link rel="canonical">` — `siteUrl` joined to the page's own URL:

```handlebars
<link rel='canonical' href='{{canonical}}' />
```

It takes no arguments (`{{canonical this}}` — the shape a hand-rolled helper usually had — works too). It is built by the same code that writes `sitemap.xml`, so a page's canonical link and its `<loc>` are always the same string. A page built to a file is the bare URL (`courses/bronze.html` → `https://example.com/courses/bronze`); **a page built to a directory index keeps a trailing slash** (`courses/index.html` → `https://example.com/courses/`), because that is the URL a static host actually serves — Netlify, GitHub Pages and nginx all answer the bare `/courses` with a 301, and a canonical must be the URL that returns 200. The home page is `siteUrl` with one trailing slash. A `siteUrl` with a trailing slash is fine — you never get a double slash.

With `extensionLess: true` every page but the home page builds to `<path>/<slug>/index.html`, so every page but the home page is a directory index and its canonical ends in `/` too (`https://example.com/courses/bronze/`). That is deliberate, and it is the same rule: it is the URL the host serves without a redirect.

`absUrl` does the same join for any path of your own, which is what an Open Graph image or an RSS link needs:

```handlebars
<meta property='og:image' content='{{absUrl "/img/card.png"}}' />
<meta property='og:url' content='{{absUrl}}' />
```

`/about` and `about` both give `https://example.com/about`, and a trailing slash you write is kept rather than trimmed — `{{absUrl '/courses/'}}` → `https://example.com/courses/`, as does `{{absUrl '/courses/index.html'}}`. A file extension is kept (`{{absUrl 'css/site.css'}}` → `https://example.com/css/site.css`), a URL that already has a scheme is passed through untouched, and calling it with no path gives you `canonical`.

Both need `siteUrl` on the Kiss config. Without one they render nothing and log a warning (one per page) rather than failing the build.

`asset` gives you the URL of a file the build actually contains, under whatever cache-busting policy `config.assets` sets:

```handlebars
<link rel='stylesheet' href='/{{asset "css/site.css"}}' />
```

It renders `css/site.css`, `css/site.a1b2c3d4.css` or `css/site.css?v=1.4.5` depending on the config — see **Cache-busting asset URLs** above. There is no leading slash, so the template chooses the base: `/{{asset …}}`, `{{root}}{{asset …}}`, or `{{absUrl (asset …)}}` for an absolute URL. A path that is not in the build renders as you wrote it and logs one warning per page naming it, rather than failing the page.

`env` renders one branch or the other depending on whether you're in dev mode:

```handlebars
{{#env is='dev'}}
  <script src='http://localhost:35729/livereload.js'></script>
{{else}}
  <!-- production only -->
{{/env}}
```

`is` must be a string containing `"dev"` or `"prod"` (case-insensitive) — checked against the Kiss instance's `dev` config option.

Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```

## Migrating from v1

- **Node ≥22.12.0 first** (`package.json` `engines.node`) — check this before anything else here: v2 will not install or run below it. If your project pins a dev Node version the way this repo's own `.nvmrc` does, bump yours before touching any code.
- v2 is ESM-only (`import Kiss from 'kiss-ssg'`). `require()` still works on Node ≥22.12.
- `folders.root` and `folders.static` are gone — no module in v1 ever read them, so a config still passing them gets nothing rather than a quiet no-op. Delete the keys; with `// @ts-check` on your build script they are now a typing error too. The six folders v2 derives from `folders.src` / `folders.build` unless you override them (`pages`, `assets`, `layouts`, `partials`, `models`, `controllers`) are listed under "Usage" above.
- The `.generate()` callback now fires **after** the files are written (v1 fired it before). Use `await kiss.complete()` to await the whole build. Failures don't surface through `.generate()`, though: v1 logged a page's render/write failure and resolved anyway, while v2's `.complete()` **rejects** with an `AggregateError` (`err.failures` = `[{ view, buildTo, error }]`). The v1 callback-style idiom — `kiss.generate(function () { this.complete(function () { ... }) })` — now leaves that rejection unhandled the first time a page fails, so give `.complete()` a `.catch`:

  ```js
  kiss
    .scan()
    .generate()
    .complete()
    .catch((err) => {
      for (const f of err.failures) {
        console.error(`${f.view} | ${f.buildTo} | ${f.error.message}`)
      }
      process.exitCode = 1
    })
  ```

  A failed build never runs `.complete()`'s own callback, so anything you did there — writing a sitemap, generating an index, kicking off a deploy — has to run again in the `catch`. And a chain that ends at `.generate()` with no `.complete()` never sees any of this: it keeps exiting 0 on a broken build, so every deploy script must `await kiss.complete()` (or otherwise attach a rejection handler) to catch a failure.

- Each `Kiss` instance has its own Handlebars environment. Register custom helpers on `kiss.handlebars` (as the docs always said), not on the global `handlebars` module. Partials live there too: a helper that reads `require('handlebars').partials` finds nothing in v2 — read `kiss.handlebars.partials`, or drop the helper and use Handlebars' native dynamic partial, `{{> (lookup this "partialName")}}`. Every entry of `kiss.handlebars.partials` is a function — a compiled template that also records which page invoked it — so a helper that renders one by name must accept a function, and must pass its own `options.data` through: `const p = kiss.handlebars.partials[name]; typeof p === 'function' ? p(ctx, { data: options.data }) : kiss.handlebars.compile(p)(ctx, { data: options.data })` (it was a string only until the partial's first render anyway). That data frame is how the page is recorded as using the partial: a bare `p(ctx)` renders correctly, but under `watch()` that page is not re-rendered when the partial changes (unless no page recorded it at all, when every page is).
- `utils` moved from `kiss-ssg/libs/utils.js` to a named export: `import { utils } from 'kiss-ssg'`. The package's `exports` map has one entry, so any deep path into it (`kiss-ssg/lib/…`, `kiss-ssg/libs/…`) now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` rather than half-working — everything public is reachable from `'kiss-ssg'` itself.
- Controller files may use `export default` (legacy `module.exports` still works).
- Duplicate output paths — including `.pages()` fan-out where a controller yields the same slug twice — are no longer written twice: the second page is not built, and the collision fails the build (`complete()` rejects, naming the path as `Page already processed: <path>`) — v1 built whichever page came last. If a site relied on that v1 skip to give one source priority over another — registering a low-priority fan-out last, so the engine silently dropped whatever slug a higher-priority source had already claimed — dedupe the slugs yourself before registering instead:

  ```js
  const claimed = new Set(catalogItems.map((c) => c.slug))
  const rdItems = allRdItems.filter((r) => !claimed.has(r.slug))
  kiss.pages({ view: 'rd.hbs', model: rdItems /* ... */ })
  ```

- New: `kiss.close()` stops the dev server and file watcher.
- **Unchanged in v2**, so there is nothing to migrate even though it looks load-bearing: the per-page `generate: false` option (default `true`, see `.page()`'s options above) still skips building one page; `callback.call(this, ...)` still binds the `Kiss` instance inside `.generate()`/`.complete()`/`.sitemap()` callbacks; the per-page `ext` option; `copyAssets(sourceDir, targetDir)` to a second directory; `.viewStats()`/`.getModelByID()`. Anything under `this._stack` is internal and unversioned — code reading `_stack[].buildTo`/`_stack[].page.options` for a hand-rolled sitemap works today by accident; `.sitemap()` is the supported way to enumerate registered pages.
