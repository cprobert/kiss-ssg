# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

Kiss-ssg uses [handlebar partials](https://handlebarsjs.com/guide/partials.html#partials) and [handlebar-layouts](https://www.npmjs.com/package/handlebars-layouts) to help you make DRY static websites.

Install with `npm install kiss-ssg --save-dev`.

## Requirements

Node 22.12 or newer. kiss-ssg v2 is an ES module: use `import Kiss from 'kiss-ssg'`. Plain `require('kiss-ssg')` also works on Node ≥22.12.

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
  folders: {
    src: './src',
    build: './public',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    partials: './src/partials',
    models: './src/models',
    controllers: './src/controllers'
  }
}
```

Partials: Cam be a .hbs, a .html file or a .md file, Note: .md files are automatically parsed

| Option     |  Default  |                                                                                                         Purpose                                                                                                          |
| ---------- | :-------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| dev        |   false   | Dev mode will start a local live-reload server and rebuild on file change. Model and controller changes are picked up too: a rebuild re-runs models and controllers, and edited controller files are reloaded from disk. |
| verbose    |   false   |                                                                               Enables additional output on the terminal, when set to true                                                                                |
| cleanBuild |   true    |                                                                                 Removed all files from the build dir before generating.                                                                                  |
| folders    | see above |                                                                                      A JSON object of alternative folder locations                                                                                       |
| siteUrl    | undefined |                                                                                The site's base URL, required by `.sitemap()` (see below)                                                                                 |

<br />

**Note**: All config settings are available in the view under "this.config"

### Assets

Any static files you have in the assets directory will be copied to the build directory

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
- path = the folder path to the page
- slug = the name of the file without the extension

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view

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

### .sitemap()

Generates a `sitemap.xml` in the root of the build folder from every page you've registered, so you don't need to hand-roll one yourself. Requires `siteUrl` to be set on the Kiss config; it logs an error and skips writing if it isn't.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ siteUrl: 'https://example.com' })
kiss.scan().generate().sitemap()
```

It can be called before or after `.generate()` — both just wait for all your pages to be registered before doing their own thing.

Any individual page can opt out with `ignoreSitemap: true`, and override the sitemap entry with `sitemapPriority` (default `'1.00'`), `sitemapChangefreq` (omitted unless set), and `sitemapLastmod` (default: the current time, shared across all pages):

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

### Waiting for the build

`.generate()` is chainable and returns immediately; its callback fires once every page has been attempted — including any that failed to render or write. Failures don't surface through this callback; they surface via `.complete()` (below). To wait for the whole build (including a `.sitemap()` call and anything queued from a callback):

```js
await kiss.scan().generate().sitemap().complete()
```

If any page fails to render or write, the other pages still build but `.complete()` **rejects** with an `AggregateError`; `err.failures` lists them as `{ view, buildTo, error }`. That makes a broken build fail your script instead of silently shipping a site with a page missing:

```js
try {
  await kiss.scan().generate().complete()
} catch (err) {
  console.error(err.message) // e.g. 1 page(s) failed to build: public/about.html
  process.exitCode = 1
}
```

A bad model or controller is not a build failure — it is logged, that page is skipped, and it appears in the resolved data as `{ id, data: null, error }`. A missing or misspelled view file _is_ a build failure: the page fails and `.complete()` rejects.

In dev mode, or after calling `.watch()`, call `await kiss.close()` to stop the watcher and server. It waits for a rebuild that is already running to finish, so once it resolves nothing more is written and it is safe to clean or deploy the build folder.

Editing a page template re-renders that page; deleting one, or creating any file under `src/`, rebuilds the whole site. Editing anything else under `src/` — a partial, layout, model JSON or controller — rebuilds the whole site by replaying every page you registered, so models are re-read and controllers re-run (edited controller files are reloaded from disk, whether they use `export default` or `module.exports`). A whole-site rebuild also tidies up after itself: output files the previous build wrote that the new one no longer produces — a page whose slug changed, one dropped from a `.pages()` fan-out, or a page `.scan()` had discovered whose template you deleted — are deleted, and `sitemap.xml` is regenerated if you called `.sitemap()`. A partial or layout you add mid-session is registered by that rebuild and usable straight away, and one you delete is unregistered — so a page still referencing a deleted partial fails the rebuild with `The partial <name> could not be found` rather than quietly rendering the deleted content until you restart. If you used `.scan()`, a rebuild scans your pages folder again, so a page template you create while watching is built without a restart; on a site where you registered pages by name with `.page()`, adding the file is not enough — add the call too. If a model or controller fails to resolve during a watch rebuild (e.g. a half-saved JSON file caught mid-write), that page's previous output is removed rather than left in place, so the dev server 404s on it until the next valid save instead of serving stale HTML.

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

Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```

## Migrating from v1

- v2 is ESM-only (`import Kiss from 'kiss-ssg'`). `require()` still works on Node ≥22.12.
- The `.generate()` callback now fires **after** the files are written (v1 fired it before). Use `await kiss.complete()` to await the whole build.
- Each `Kiss` instance has its own Handlebars environment. Register custom helpers on `kiss.handlebars` (as the docs always said), not on the global `handlebars` module. Partials live there too: a helper that reads `require('handlebars').partials` finds nothing in v2 — read `kiss.handlebars.partials`, or drop the helper and use Handlebars' native dynamic partial, `{{> (lookup this "partialName")}}`.
- `utils` moved from `kiss-ssg/libs/utils.js` to a named export: `import { utils } from 'kiss-ssg'`.
- Controller files may use `export default` (legacy `module.exports` still works).
- Duplicate output paths — including `.pages()` fan-out where a controller yields the same slug twice — are now skipped with a "Page already processed" log instead of being written twice.
- New: `kiss.close()` stops the dev server and file watcher.
