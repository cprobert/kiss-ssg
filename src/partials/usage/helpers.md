## Helpers

Kiss-ssg registers a few useful helpers by default: `markdown`, `sass`, `offset`, `stringify`, `isActive` and `env`.

You can parse markdown like this:

```handlebars
<div>
  \{{#markdown}} # Heading > this is markdown foo bar baz
  \{{/markdown}} or

  \{{markdown model.introduction}}
</div>
```

An `undefined`, `null`, object or array value logs a warning and renders nothing, rather than throwing and failing the page.

If you want to take a peek at whats properties you have available to to in a handlebars file you can use this helper:

```handlebars
\{{{stringify this}}}
```

You can compile Sass, either from a file or an inline block:

```handlebars
\{{{sass 'src/assets/main.scss'}}}

\{{#sass}} $color: red; body { color: $color; }
\{{/sass}}
```

A relative file path is resolved against `process.cwd()` — not the assets folder or the current view — so pass a path relative to where you run the build, or pass an absolute path. Output is `'expanded'` in `dev: true` and `'compressed'` otherwise; `config.sass.includePaths` is passed through as `loadPaths` for `@use`/`@import`.

`offset` turns a zero-based `@index` into a one-based number:

```handlebars
\{{#each items}}
\{{offset @index}}:
\{{this}}
\{{/each}}
```

`isActive` renders its block only when the current page matches `href`, handy for highlighting the current nav item:

```handlebars
<nav>
  \{{#isActive page href='/about'}}<a
    class='active'
    href='/about'
  >About</a>\{{else}}<a href='/about'>About</a>\{{/isActive}}
</nav>
```

Hash options: `href` (the link's path), `active` (the class name rendered as `\{{active}}` inside the block on a match — default `'active'`), `folderMatch` (default `false` — when `true`, also matches pages below `href`, so `href="/blog"` matches `/blog/post-1` too). `href` and the page's own URL are both reduced to the same key first — no leading/trailing slash, no extension, no trailing `index` segment — so the same `href="/about"` matches whether the page built to `about.html` or, with `extensionLess: true`, `about/index.html`, and `/about`/`/about/` are always the same page.

`env` renders one branch or the other depending on whether you're in dev mode:

```handlebars
\{{#env is='dev'}}
<script src='http://localhost:35729/livereload.js'></script>
\{{else}}
<!-- production only -->
\{{/env}}
```

`is` must be a string containing `"dev"` or `"prod"` (case-insensitive) — checked against the Kiss instance's `dev` config option.

Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
//  Extending handlebars
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```
