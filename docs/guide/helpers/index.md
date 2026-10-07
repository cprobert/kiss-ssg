# Helpers

The Handlebars helpers kiss-ssg registers for you, from link and asset to markdown, canonical and isActive, and how to add your own.

**Layouts come first, and they are not kiss's.** Every multi-page site is structured by three block helpers that `handlebars-layouts` registers on the same environment — they are not in the list below because kiss does not define them, which is exactly why they were previously impossible to find here. A layout in `config.folders.layouts` declares the slots:

```hbs
<html><head><title>{{title}}</title>{{#block 'head'}}{{/block}}</head>
  <body>{{#block 'body'}}<p>fallback shown when a page fills nothing</p>{{/block}}</body></html>
```

and a page view fills them:

```hbs
{{#extend 'layout'}}
  {{#content 'body'}}<h1>{{title}}</h1>{{/content}}
  {{#content 'head' mode='append'}}<link
      rel='stylesheet'
      href='/{{asset "css/site.css"}}'
    />{{/content}}
{{/extend}}
```

`{{#block}}` defines a named slot and renders its own body when no page fills it; `{{#extend}}` names the layout (the registered partial name, so `layouts/main.hbs` is `"main"`); `{{#content}}` fills one slot. `mode` is `"replace"` (the default), `"append"` or `"prepend"` — append is how a page adds its own stylesheet or JSON-LD to a shared `head` without discarding the layout's. Layouts and partials share one namespace and are registered together (see `.registerPartials()` under **Other methods**), so a layout can `{{> "partial"}}` like anything else, and editing one re-renders the pages that rendered it.

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

`isActive` **always renders its block**; the match is exposed as `{{active}}` inside it, so a nav item's label appears either way and only the class changes. There is no `{{else}}` branch — and the positional argument is the page context itself (`this`, or a bare `..` inside an `{{#each}}`), not a key called `page`. The block sees the surrounding context **plus** the hash you pass, the hash winning on a clash — so inside an `{{#each}}` the item's own keys are still in scope, and `active`, `href`, `folderMatch` and `pageURL` are always the helper's own:

```handlebars
<nav>
  <a class='{{#isActive this href="/about"}}{{active}}{{/isActive}}' href='/about'
    >About</a
  >
  {{#each config.nav}}
    <a class='{{#isActive .. href=href}}{{active}}{{/isActive}}' href='{{href}}'
      >{{label}}</a
    >
  {{/each}}
</nav>
```

Hash options: `href` (the link's path), `active` (the class name rendered as `{{active}}` inside the block on a match — default `'active'`), `folderMatch` (default `false` — when `true`, also matches pages below `href`, so `href="/blog"` matches `/blog/post-1` too). `href` and the page's own URL are both reduced to the same key first (no leading/trailing slash, no extension, no trailing `index` segment), so the same `href="/about"` matches whether the page built to `about.html` or, with `extensionLess: true`, `about/index.html` — and `/about` and `/about/` are always equivalent. An empty `href` under `folderMatch` matches the home page only.

Two things about `isActive` are easy to get wrong, and both are quiet. A page's context is exactly `title`, `path`, `slug`, `generate`, `view`, `config`, `model` and `pageURL`, so `{{#isActive page …}}` hands the helper `undefined` and logs `isActive received no page context` once per call, on every page; omitting the positional argument altogether is not an error, since Handlebars passes its own options object and the helper finds the block by shape. And because the block always renders, a literal `class="active"` written inside it prints on every page in the site: read the match from `{{active}}`, and put anything that should appear either way around it. An omitted or absent `href` is treated as `''`, not thrown on. A non-block usage, or a page context with no `pageURL`, logs a warning and renders the block as not-active rather than throwing. `canonical` is the current page's absolute URL, for a `<link rel="canonical">` — `siteUrl` joined to the page's own URL:

```handlebars
<link rel='canonical' href='{{canonical}}' />
```

It takes no arguments (`{{canonical this}}` — the shape a hand-rolled helper usually had — works too). It is built by the same code that writes `sitemap.xml`, so a page's canonical link and its `<loc>` are always the same string. A page whose real home is elsewhere sets `canonical: 'https://…'` in its options (or its controller does), and the helper renders that URL verbatim — see [Sitemap](../discovery/#sitemap) for what else that page option does. A page built to a file is the bare URL (`courses/bronze.html` → `https://example.com/courses/bronze`); **a page built to a directory index keeps a trailing slash** (`courses/index.html` → `https://example.com/courses/`), because that is the URL Netlify actually serves — it answers the bare `/courses` with a 301, and a canonical must be the URL that returns 200. That is host policy rather than a universal, and `links: { trailingSlash: false }` says the other convention — see [Host URL policy](../urls/#host-url-policy). The home page is `siteUrl` with one trailing slash. A `siteUrl` with a trailing slash is fine — you never get a double slash.

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

It renders `css/site.css`, `css/site.a1b2c3d4.css` or `css/site.css?v=1.4.5` depending on the config — see **Cache-busting asset URLs** above. There is no leading slash, so the template chooses the base: `/{{asset …}}`, `{{root}}{{asset …}}`, or `{{absUrl (asset …)}}` for an absolute URL. A path that is not in the build **fails the build** — the same shape as `{{link}}` on an id no page claims. In **dev** it warns once per page per path and renders the path exactly as written, since the file you are about to add legitimately is not there yet.

**What `asset` does not touch:** anything carrying a scheme (`https://…`, and also `data:` and `mailto:`, which have no `//`) or a protocol-relative `//cdn/x.css` is passed through unchanged — none of them names a file this build wrote. **A `?query` or `#fragment` is split off before the lookup and put back after it**, so `img/logo.svg#symbol` resolves the sprite file and keeps the fragment, and `css/site.css?v=2` keeps your query (and suppresses `assets.version`'s, since your query is the explicit one). The path under the suffix still has to be in the build, and the failure message names both the reference the template wrote and the path it looked up underneath it — `asset: '/img/logo.svg#a' is not in the build (asked by index.hbs) — no .copyAssets() emitted 'img/logo.svg'`; where the two are the same string it says `emitted it`. A space in a filename is fine end to end (manifest, helper and the broken-link scan), and a non-string path logs a warning and renders nothing. `env` renders one branch or the other depending on whether you're in dev mode:

```handlebars
{{#env is='dev'}}
  <script src='http://localhost:35729/livereload.js'></script>
{{else}}
  <!-- production only -->
{{/env}}
```

`is` must be a string containing `"dev"` or `"prod"` (case-insensitive) — checked against the Kiss instance's `dev` config option.

A missing or non-string `is` logs an error and renders neither branch. `markdown` given `undefined` logs a warning and renders nothing; a `null`, plain object or array also renders nothing, with a warning, rather than throwing. Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```

A site's own helpers belong in `helpers/` (see **The tiers, in full** above): `helpers/index.js` exports `registerHelpers(kiss)`, and kiss calls it with the instance, so the registrar has `kiss.handlebars` (and `kiss.handlebars.SafeString`) and `kiss.config`. Read config **at render time**, not at registration, from the page context the helper is rendered in, `options.data.root.config`: that is the page's own copy, including any per-page `config` override, and it is never stale under `.watch()`.

**JSON-LD** is the usual first such helper, because it states the facts the visible page states (a phone number, an address) for a machine. Keep the facts in one config key, build the object in a pure function, and escape `<` so a value containing `</script>` cannot end the script element early:

```js
// helpers/json-ld.js
export function localBusiness(business, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    name: business.name,
    telephone: business.telephone,
    url: siteUrl,
  }
}

export function registerJsonLdHelpers(kiss) {
  kiss.handlebars.registerHelper('jsonLd', function (options) {
    const { config } = options.data.root
    const json = JSON.stringify(
      localBusiness(config.business, config.siteUrl),
    ).replace(/</g, '\\u003c')
    return new kiss.handlebars.SafeString(
      `<script type="application/ld+json">${json}</script>`,
    )
  })
}
```

`{{jsonLd}}` in the layout's `head` then renders it, and a page adds its own block with `{{#content "head" mode="append"}}`.

**Link to a page by its identity**, so a template never guesses a URL:

```handlebars
<a href='{{link "about"}}'>About</a>
<a href='{{link "blog/post" slug=post.slug}}'>{{post.title}}</a>
<meta property='og:url' content='{{link "about" absolute=true}}' />
```

`{{link "about"}}` renders `/about.html`, or `/about/` on an `extensionLess` site — the path the host actually serves (`/`, `/courses/`, `/blog/the-cascara-experiment/`, `/data/index.json`). Every page has an `id` (see `.page()` above). It is **root-relative**: for a site served from a path prefix, or a link that has to be absolute, `absolute=true` gives `https://example.com/about.html`; for the pretty form the sitemap and `{{canonical}}` emit, `canonical=true` gives `/about` (add `absolute=true` for `https://example.com/about`). A site whose host serves the pretty form on every page sets `links: { canonical: true }` once instead of writing `canonical=true` at every call site; the per-call hash still wins either way, `canonical=false` included, and `canonical` and `absolute` compose — with both, the link is the absolute URL of the pretty path. **It fails the build** — as `{{asset}}` now does, on a path no copy emitted: an id no page claims, an id two pages' defaults both arrived at, or a page with `generate: false` (which claims no id) fails the page that linked it, naming the id and the view that asked — a link is a promise, and unlike a hand-written path it is checkable at render. Under `dev: true` it warns and renders `#` instead, so the live preview shows you both the page and the mistake.
