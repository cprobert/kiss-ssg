# Pages and data

Registering pages with .page() and .pages(), shaping their data with controllers, fetching remote models, and Markdown options.

## `.page()`

Instead of (or in conjunction with) using the .scan() method you can pass a model to the view using the .page() method. This allows you to name the view and pass a model to that view. The model is then available in the handlebar template under the model property, e.g. {{model.name}}

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

Views: can se a .hbs file or a string Models: can be a .json file, a http api endpoint, or a JSON object Controllers: can be a .js file or a function that returns a page option JSON to be merged into the page options

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

-   view = A handlebars view.
-   model = A json object, the name of the json file relative to the models folder or a URL for an API endpoint.
-   controller = A function that returns a page options object - used for manipulating data in the model.
-   title = The page title. Unset, it is the model's `title`; with neither, the page's slug, title-cased (`about-us` → `About Us`, and a home page → `Index`)
-   description = The page's description. kiss sets no fallback: the layout prints it from wherever the site keeps it, this option (`{{description}}`) or a model field (`{{model.description}}`)
-   config = Config overrides for this page only, merged over the global config
-   path = the folder path to the page
-   slug = the name of the file without the extension
-   generate = whether to build this page at all (default `true`); set to `false` to skip it entirely — e.g. a fanned-out `.pages()` item that fails a check in its controller. Nothing is written for that page, and `.generate()`/`.complete()` still resolve normally.

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view — but only when the view is a `.hbs` filename. A view passed as a template string has no file path to infer from, so it gets a generated `snippet-N` slug and no folder; pass a `slug` (and a `path`, if you want one) yourself.

_Note:_ Slugs and path segments are slugified: accented Latin letters are transliterated (`Über uns` → `uber-uns`), anything else outside `a-z0-9` becomes a `-`, and leading/trailing dashes are trimmed. A title written in a script with no Latin equivalent (Japanese, Korean, Cyrillic…) has nothing to transliterate, so it falls back to a short stable hash such as `p-9736ca69` — not pretty, but unique, which keeps each page in its own file. Pass an explicit `slug` when you want a readable URL for such a page. If two pages end up with the same output path the build fails and names the path — only one of them could ever exist on disk.

What the option list above leaves implicit:

-   A `model` given as a folder name loads every `*.json` in it as an array. A URL model whose response is not 2xx fails that page.
-   `title` defaults to the page's own slug, title-cased with hyphens as spaces (`about-us` → `About Us`).
-   `ext` defaults to `html`. A leading `.` is stripped and the rest slugified, so an `ext` derived from model data cannot steer the output path (`'.xml'` → `xml`, `'../x'` → `x`).
-   `aliases` lists old URL paths this page now answers, each emitted as a `301` (see **Redirects**). On a `.pages()` fan-out the aliases belong to each **record**, never to the registration.
-   `config` overrides settings for this page only, including `extensionLess`: on an `extensionLess` site, `config: { extensionLess: false }` with `slug: '404'` writes `404.html` rather than `404/index.html`, which is the filename Netlify and Cloudflare Pages look for and will not fall back from.

## `.pages()`

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

**Identity.** Every page has an `id` — what `{{link "<id>"}}` resolves (see **Helpers**). It defaults to the view's route without its extension (`blog/listing.hbs` → `blog/listing`). Only `.hbs` is removed: `menu/index.hbs` is `menu/index`, not `menu`, and the home page `index.hbs` is `index` — set `id` yourself when you want the shorter name, so most pages need nothing; set `id` when you want a stable name (`id: 'blog'`), or when two `.page()` calls render one view (pagination), where **neither** page gets the default id and a notice says so. On a `.pages()` fan-out an item's default id is the registration's route — or the registration's own `id`, used as a **prefix** — plus the item's slug (`blog/post/the-cascara-experiment`), and a _record_ may carry its own `id`, which wins outright; the registration's `id` is never broadcast to the items, the same rule `aliases` follows. A controller may return one. An explicit id is kept exactly as written, but the page is written under `utils.toSlug` of its slug, so an id built from a slug the data gives (`` id: `blog/${slug}` ``) should slug it the same way (`utils.toSlug(slug)`). Otherwise a slug with a trailing space or a leading `-` gives an id that names a page kiss did not write, and the audit's `id-slug-mismatch` says so. Two pages claiming one explicit id fail the build (`Page id already claimed: <id>`), an explicit id beats a colliding default one, and a `generate: false` page claims no id at all.

**Ids from where a page is served: `ids: 'path'`.** On a site whose pages share views (pagination, or a catalog that picks the view per item), the view's route names no single page, so most pages need an explicit id. `ids: 'path'` in the config makes the default id where the page is served instead: its output path with `.html` removed, then a trailing `/index` removed. So `c/acute-medicine-courses.html` is `c/acute-medicine-courses`, `courses/index.html` and `about/index.html` (under `extensionLess`) are `courses` and `about`, and the home page is `index`. Every other extension stays, so `feed.xml` is `feed.xml`, and on an `extensionLess` site, where a non-HTML page is written to `feed/index.xml`, it is `feed/index.xml`. A fan-out item gets its path too, so a `.pages()` registration's own `id` is not used as a prefix (a notice says so). Its id follows the slug it is written under, so set `slug` in its controller (otherwise it is the view's name plus `-N`, as everywhere). `{{link "blog" slug=post.slug}}` reaches the item written under `blog/`, and slugs its `slug=` with `utils.toSlug` as the page's file name is, so the slug the data gives works as it is. A catalog that picks the view per item does it in the controller, which may return `view` like any other page option. Explicit ids still win, and two outputs that reduce to one id (`courses.html` and `courses/index.html`) are both withdrawn, with a notice. An inline template with no `slug` (whose slug kiss makes up) gets no id. The setting is site-wide: a page's own `config: { ids }` is ignored.

**Switching an existing site to `'path'`** changes every default id that differs and nothing else: no page moves. Check, before shipping:

-   every `{{link}}` that names a view route which is not also the page's path. The build fails on each one, so that list is the worklist.
-   `config.consent.ui.policy` and `ui.history`, including the default policy page id `cookies`, and the privacy page the audit finds by the id `privacy` (or `audit.privacyPage`), when those pages are written under a `path`.
-   any learning-package page relying on a default id. Its LMS identifier changes, and its learners' records with it, so give it an explicit id first.
-   `AIKB/` notes citing old ids, which the next record reports as `dangling`.

The report carries `ids`, and the next build's rename finding (`moved`) pairs pages by id only when the last record used the same setting, so a switch reports no false moves.

Each item's slug gets `-N` appended unless the controller sets an explicit `slug`.

## Controller

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

## Remote models

A model can be a URL, and `config.fetch` is how you make that usable against a real API. It applies to every `http(s)` model of that site (it is per instance — there is no per-page override):

```js
const kiss = new Kiss({
  fetch: {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    timeout: 15000,
    retries: 2,
    cache: './.kiss-cache/fetch',
  },
})
```

-   **headers** — sent with every URL-model request. This is where an API token or an `Accept` header goes. Keep the token itself in an environment variable, not in the config you commit. Templates and controllers see the header names with every value reading `'[redacted]'` (`{{config.fetch.headers.Authorization}}` renders `[redacted]`), except one that is `undefined`, `null` or empty, which reads as it is; only the fetch itself sends the real values.
-   **timeout** — milliseconds, per attempt, covering the response's headers and its body; `0` turns the timeout off. The attempt is aborted and that page fails, naming the URL and the timeout. It defaults to 10 seconds: an API that accepts your connection and then goes quiet, before or after its headers, no longer hangs your build for ever.
-   **retries** — extra attempts, a whole number of 0 or more, after a network error or a 5xx, with a short backoff. A 4xx is never retried: the server has already told you the request itself is wrong, so asking again only risks locking a key. If every attempt fails, the error says how many were made.
-   **cache** — `false`, or a directory. A successful body is written there under a hash of the URL **and** the headers you sent (a different token is a different entry), and every later build reads the file instead of fetching: later in the same build, on the next `dev`/`.watch()` rebuild, and in tomorrow's build in a new process. That is what stops a watch rebuild paying a network round trip for every remote model, and it lets you build offline. An error response is never cached. A cache folder that cannot be written is a warning, not a failure: the model is used and the next build fetches again. There is no expiry — delete the directory (or one file inside it) when you want fresh data — and it is build output, so add it to `.gitignore`. Ignore that folder alone, never the whole of `.kiss-cache/`: the image encode cache beside it (`.kiss-cache/images`, under **Responsive images**) is committed.

Each of the four is checked when `new Kiss` runs: a `retries` or `timeout` that is not a number of the right shape (`retries: Number(process.env.RETRIES)` with the variable unset is `NaN`), `headers` that is not an object, or a `cache` that is neither a folder nor `false` stops the build with a message naming the setting, never its value. A URL that cannot be parsed, or that holds `user:pass@`, is refused before any request is made. A failure kiss has no safe words for ends `→ an error kiss cannot describe (<name>)`: the error's name is kept, and nothing of its text.

```
.kiss-cache/fetch/
```

A cached model is a build input, exactly like a `.json` file in your models folder: what is in that directory is what your site is built from. A response with a non-2xx status fails that page: an error body is never used as the model, and never cached.

A credential belongs in `headers`, not in the model URL. Wherever kiss records or prints a model URL — the site map and `last-build.json` that `kiss-ssg aikb` writes into your committed `AIKB/` folder, `kiss-ssg check`'s output, a log line, an error message — it drops any `user:pass@` and the fragment, and replaces the whole query, parameter names included, with `?[redacted]`: `https://cdn.example.com/entries?access_token=SECRET&type=course` is shown as `https://cdn.example.com/entries?[redacted]`. A URL the platform cannot parse is shown with everything between its scheme and its last `@` dropped and its query cut to `?[redacted]`, or as only its scheme and `[redacted]` when that `@` comes after a `?` or `#`. The request itself, the cache entry, and the `id` that `.generate()`, `.complete()` and `.getModelByID()` give back to you all keep the URL as you wrote it. A secret in the URL's path cannot be told from a path segment and is recorded as written, so put a credential in `fetch.headers`. Two URL models that differ only in their query share one row of the site map.

## Markdown options

`config.markdown` is handed to this instance's [Remarkable (opens in a new tab)](https://github.com/jonschlinkert/remarkable) — the renderer behind both `.md` partials and the `{{markdown}}` helper, so the two can never disagree:

```js
new Kiss({
  markdown: { breaks: true, typographer: true },
})
```

The three defaults (`html: true`, `xhtmlOut: true`, `breaks: false`) are the keys kiss has an opinion about, **not** the keys it accepts — the block is passed through as-is, so any other Remarkable option reaches the renderer without kiss knowing its name. It is merged one level deep, like `sass`, `fetch` and `assets`, so setting one key keeps the rest at their defaults.

**`breaks: false` is deliberate.** With `breaks: true`, every newline inside a paragraph becomes a `<br />` — so a paragraph you hard-wrapped in your editor renders with a line break at each of the source's wrap points, mid-sentence. Turn it on only if your `.md` sources genuinely treat a newline as a line break.

**`html: true` renders HTML in Markdown as written.** That is right for your own files and wrong for Markdown a CMS or a feed serves: a model string holding `<script>alert(1)</script>` passed to `{{markdown}}` is written into the page as that `<script>`. A site that renders Markdown it did not write sets `markdown: { html: false }`, and the same string is written as the text `&lt;script&gt;alert(1)&lt;/script&gt;`. Every tag is escaped then, harmless ones such as `<b>` too, while the Markdown itself (`**bold**`, links) still renders.

Set it in config rather than reaching for `kiss.remarkable` afterwards: `.md` partials are rendered to HTML **when they are registered**, which happens in the constructor, so a later mutation would change the `{{markdown}}` helper but silently miss every partial unless you also called `kiss.registerPartials()`.
