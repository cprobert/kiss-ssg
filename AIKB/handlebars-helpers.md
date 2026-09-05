# handlebars-helpers.js

## Responsibility

Registers `kiss-ssg`'s built-in Handlebars helpers (`markdown`, `sass`, `offset`, `stringify`, `isActive`, `env`) onto a given Handlebars environment.

## Public interface

- `registerHandlebarsHelpers(hbs, config, { markdown, logger })` — registers all six helpers on `hbs` via `hbs.registerHelper(...)`; returns `hbs`.
  - `markdown` — block or string content, rendered through `markdown.render(trimLines(text))`, wrapped in `hbs.SafeString`.
  - `sass` — file path (string) and/or block; compiles via `sass.compile`/`sass.compileString` (`style` = `'expanded'` in dev, `'compressed'` otherwise; `loadPaths` from `config.sass.includePaths`); returns concatenated CSS as `hbs.SafeString`.
  - `offset(index)` — `index + 1`.
  - `stringify(obj)` — `JSON.stringify(obj, null, 3)`.
  - `isActive(pageOptions, options)` — block helper; renders the block with `context.active` set to the configured active class (`options.hash.active`, default `'active'`) when `pageOptions.pageURL` matches `options.hash.href`. Exact match by default; `folderMatch=true` also matches pages below the href.
  - `env(options)` — block helper gated on `options.hash.is` (`'dev'`/`'prod'`, case-insensitive substring match) against `config.dev`; renders `options.fn(this)` or `options.inverse(this)`. A missing or non-string `is` is an error: it logs and returns `''` (neither branch).

## Depends on

`node:path`; `./sass.js` (the resolved sass binding); `./utils.js` (`trimLines`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Helpers register on whichever Handlebars environment (`hbs`) is passed in, not a global instance — each `Kiss` instance calls this against its own `this.handlebars`, so helpers never leak between instances.
- The `sass` helper's file mode resolves a _relative_ path against `process.cwd()`, not against the view or the assets folder; an **absolute** path is passed to `sass.compile` untouched (`path.isAbsolute(context)` — an unconditional `path.join(process.cwd(), context)` mangled a path a controller had resolved into `<cwd>/abs/path/main.scss` and failed the build, review finding C7). Block mode compiles the block content directly with `sass.compileString` (no `process.cwd()` involved).
- `isActive` compares **normalised keys**, not raw strings: `toURLKey()` drops leading and trailing slashes, the file extension and a trailing `index` segment from both `pageOptions.pageURL` and `href`, so the home page is `''` and `/about`, `/about/` and `about/index.html` are one key. That is what makes a nav `href` survive an `extensionLess` flip — with a raw comparison, `href="/about"` matched only with the flag off and `href="/about/"` only with it on (review finding D-03). The key is exposed to the block as `{{pageURL}}`.
- The match is by **path segment**: active iff `pageKey === hrefKey` or, under `folderMatch=true`, `pageKey.startsWith(hrefKey + '/')`. It was a bare `pageURL.includes(href)`, which lit `/blog` on `my-blog-post.html` and — because `''.includes()` is always true — lit every item of a nav that omitted `href` (D-02). An empty `href` under `folderMatch` now matches the home page only, which falls out of the same rule.
- Helpers **degrade rather than throw**: a page dropped from the build is a worse answer to a template mistake than a missing highlight. `isActive` coalesces (`hash.href ?? ''`) instead of spreading over a default, because `{{#isActive page href=href}}` on a model with no `href` key passes an explicit `undefined` that wins a spread; a missing or non-string `pageURL` logs a warning and renders the block as not-active; and when the page argument is omitted altogether Handlebars passes its own options object as the first parameter, so the block is located by shape (`options ?? pageOptions`) rather than by position (D-05). `markdown` gates its block branch on `typeof obj.fn === 'function'` rather than `typeof obj === 'object'` so a `null`, object or array model field takes the warn-and-render-nothing path, and `env` requires `is` to be a string before calling `.toLowerCase()` (D-04).
- `env` reads `config.dev` at _render_ time (helpers close over the `config` object, not a snapshot), so `{{#env is="dev"}}`/`{{#env is="prod"}}` blocks reflect the live config.
- The sass compiler is imported from `./sass.js`, never from `sass` directly: which export carries the modern API depends on the installed sass version, and that detection lives in one place (see `AIKB/sass.md`).
