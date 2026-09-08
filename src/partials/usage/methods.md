## Methods

kiss-ssg's core methods:

- .page()
- .pages()
- .scan()
- .generate()
- .complete()

The simplest usage is to use .scan() to scan your 'pages directory' for \*.hbs files and outputs them to the 'build folder'. `.scan()` skips any view you've already registered with `.page()` earlier in the same chain, so the two can be mixed — `kiss.page({...}).scan().generate()`.

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

Views: can be a .hbs file or a template string
Models: can be a .json file, a http(s) API endpoint, or a JSON object (a response with a non-2xx status fails that page rather than publishing the error body)
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
    ext: 'html',
    config: {},
    ignoreSitemap: false,
    sitemapPriority: '1.00',
    sitemapChangefreq: undefined,
    sitemapLastmod: undefined,
  }
```

These options are both used internally by kiss and are available in view.

- view = A handlebars view.
- model = A json object, the name of the json file relative to the models folder or a URL for an API endpoint.
- controller = A function that returns a page options object - used for manipulating data in the model.
- title = The page title
- path = the folder path to the page
- slug = the name of the file without the extension
- ext = the output file extension (default `html`)
- config = config overrides for this page only, merged over the global config

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view — but only when the view is a `.hbs` filename; a template string has no file path to infer from, so it gets a generated slug instead. Two pages that resolve to the same output path fail the build rather than silently overwriting one another.

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

`.pages()` works the same way, except `model` must resolve to an array (or a models folder full of `.json` files) and it fans out one page per item.

### .generate() and .complete()

`.generate(callback)` waits for every queued page's model to resolve, then renders and writes each page. It's chainable and returns straight away — its callback fires once every page has been attempted, whether or not it succeeded:

```js
kiss.scan().generate(function (data) {
  console.log('build attempted', data.length, 'items')
})
```

To actually wait for the whole build — including anything a `.sitemap()` call or a `.generate()` callback queues — `await` `.complete()` instead:

```js
try {
  await kiss.scan().generate().complete()
} catch (err) {
  console.error(err.message) // e.g. 1 page(s) failed to build: public/about.html
  process.exitCode = 1
}
```

A bad model isn't a build failure: it's logged, that page is skipped, and it shows up in the resolved data as `{ id, data: null, error }`. A missing view file, a controller that throws (or is missing, or doesn't export a function), a callback that throws, and two pages that resolve to the same output path **do** fail the build — `.complete()` rejects with an `AggregateError` listing every failure.

**Note**: a controller must be pure — return new values, never mutate `model` (or a nested option such as `config.folders`) in place. In `dev: true`, `.watch()` replays a page from a shallow snapshot of its original `.page()`/`.pages()` call, so an object model your controller mutated in place is still mutated on the next rebuild.

### .sitemap()

Generates a `sitemap.xml` in the build folder from every page you've registered. Requires `siteUrl` to be set on the Kiss config; it logs an error and skips writing if it isn't. Can be called before or after `.generate()`:

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ siteUrl: 'https://example.com' })
kiss.scan().generate().sitemap()
```

Any page can opt out with `ignoreSitemap: true`, and override its entry with `sitemapPriority` (default `'1.00'`), `sitemapChangefreq` (omitted unless set), and `sitemapLastmod` (default: one timestamp shared across all pages).

### .watch() and .close()

`kiss.watch()` (meaningful only alongside `dev: true`) starts a file watcher plus a live-reload dev server on `port`. Editing a partial or layout re-renders only the pages that rendered it — learned while rendering, so a dynamic partial and a layout both count — without re-reading models or re-running controllers; a partial no page has rendered yet re-renders every page and logs a notice naming it. Every other change under `src/` — a page template, a model, or a controller — triggers a whole-site rebuild, so edited models and controllers take effect. Deleted partials, layouts and page templates are unregistered on the next rebuild; new ones are picked up automatically.

`await kiss.close()` stops the watcher and dev server, waiting for any in-flight rebuild to finish first, so it's always safe to clean or deploy the build folder once it resolves.

### Checking a build

`npx kiss-ssg check <script>` runs your site's own build script with the build staged and then discarded, so nothing published is touched — the build folder is neither emptied nor written — and what you get back is the verdict instead of the output:

```bash
npx kiss-ssg check build.js            # JSON, one report per Kiss instance
npx kiss-ssg check build.js --summary  # one line per instance instead
npx kiss-ssg check menu.js 2026-spring # arguments after the script go to the script
```

```json
[
  {
    "ok": true,
    "mode": "check",
    "buildDir": "./public",
    "duration": 160,
    "pages": [
      { "view": "index.hbs", "buildTo": "./public/index.html", "ok": true }
    ],
    "failures": [],
    "assets": [{ "source": "css/site.css", "target": "css/site.605b52d7.css" }],
    "sitemap": "./public/sitemap.xml"
  }
]
```

It exits **1** if any report is `ok: false`, if the script itself exits non-zero, or if no report was written at all — a script that never awaits `.complete()` reports nothing, which is itself the finding. `--summary` is the command's own flag, read wherever it appears in the argument list; a site that needs that word for itself takes it after a bare `--`, e.g. `kiss-ssg check menu.js -- --summary`. Everything else after the script is passed straight through to it, so a site that takes its own arguments is checked the way it's run.

You can drive the same thing yourself, without the command: `KISS_CHECK=1` turns any build into a check (`cleanBuild` becomes `'atomic'`, `dev` becomes `false`, and the staging folder is discarded once `.complete()` settles, whether the build passed or failed), and `KISS_REPORT=<file>` appends each settled build's report to a file as JSON Lines, one line per `Kiss` instance. Neither changes your script's exit code — that stays yours.

Two things a check can't make true: a site that reads its own build folder back after `.complete()` sees a folder nothing was published into, and a site with `cleanBuild: false` that relies on files an earlier build left behind starts from an empty staging folder, because a check stages everything.

### Other methods

- `.report()` — the last settled build as data: `{ ok, mode, buildDir, duration, pages, failures, assets, sitemap }`, or `null` before the first `.complete()` has settled. The same object is on the rejection as `err.report`, so a failed build can be read as data rather than parsed out of a log. See "Checking a build" above.
