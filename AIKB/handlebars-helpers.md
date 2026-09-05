# handlebars-helpers.js

## Responsibility

Registers `kiss-ssg`'s built-in Handlebars helpers (`markdown`, `sass`, `offset`, `stringify`, `isActive`, `env`) onto a given Handlebars environment.

## Public interface

- `registerHandlebarsHelpers(hbs, config, { markdown, logger })` — registers all six helpers on `hbs` via `hbs.registerHelper(...)`; returns `hbs`.
  - `markdown` — block or string content, rendered through `markdown.render(trimLines(text))`, wrapped in `hbs.SafeString`.
  - `sass` — file path (string) and/or block; compiles via `sass.compile`/`sass.compileString` (`style` = `'expanded'` in dev, `'compressed'` otherwise; `loadPaths` from `config.sass.includePaths`); returns concatenated CSS as `hbs.SafeString`.
  - `offset(index)` — `index + 1`.
  - `stringify(obj)` — `JSON.stringify(obj, null, 3)`.
  - `isActive(pageOptions, options)` — block helper; renders `options.fn(context)` with `context.active` set to the configured active class (`options.hash.active`, default `'active'`) when `pageOptions.pageURL` matches `options.hash.href`.
  - `env(options)` — block helper gated on `options.hash.is` (`'dev'`/`'prod'`, case-insensitive substring match) against `config.dev`; renders `options.fn(this)` or `options.inverse(this)`.

## Depends on

`node:path`; `./sass.js` (the resolved sass binding); `./utils.js` (`trimLines`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Helpers register on whichever Handlebars environment (`hbs`) is passed in, not a global instance — each `Kiss` instance calls this against its own `this.handlebars`, so helpers never leak between instances.
- The `sass` helper's file mode resolves a _relative_ path against `process.cwd()`, not against the view or the assets folder; an **absolute** path is passed to `sass.compile` untouched (`path.isAbsolute(context)` — an unconditional `path.join(process.cwd(), context)` mangled a path a controller had resolved into `<cwd>/abs/path/main.scss` and failed the build, review finding C7). Block mode compiles the block content directly with `sass.compileString` (no `process.cwd()` involved).
- `isActive` strips the extension and a trailing `index` segment from `pageOptions.pageURL` before comparing it to `href`, so `/foo/index.html` and `/foo/index` both match `href: '/foo/'`.
- `env` reads `config.dev` at _render_ time (helpers close over the `config` object, not a snapshot), so `{{#env is="dev"}}`/`{{#env is="prod"}}` blocks reflect the live config.
- The sass compiler is imported from `./sass.js`, never from `sass` directly: which export carries the modern API depends on the installed sass version, and that detection lives in one place (see `AIKB/sass.md`).
