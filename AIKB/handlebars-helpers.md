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

`node:path`, `sass`; `./utils.js` (`trimLines`).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Helpers register on whichever Handlebars environment (`hbs`) is passed in, not a global instance — each `Kiss` instance calls this against its own `this.handlebars`, so helpers never leak between instances.
- The `sass` helper's file mode resolves the given path relative to `process.cwd()` (`path.join(process.cwd(), context)`), not relative to the view or the assets folder; block mode compiles the block content directly with `sass.compileString` (no `process.cwd()` involved).
- `isActive` strips the extension and a trailing `index` segment from `pageOptions.pageURL` before comparing it to `href`, so `/foo/index.html` and `/foo/index` both match `href: '/foo/'`.
- `env` reads `config.dev` at _render_ time (helpers close over the `config` object, not a snapshot), so `{{#env is="dev"}}`/`{{#env is="prod"}}` blocks reflect the live config.
- `import * as sassModule from 'sass'` then `const sass = typeof sassModule.compile === 'function' ? sassModule : sassModule.default` — not a plain `import sass from 'sass'` or `sassModule.default ?? sassModule`. Sass releases before 1.45 only put the modern `compile`/`compileString` API on the ESM namespace's `default` export (no named exports), so a bare namespace import leaves `sass.compile` undefined and the `sass` helper throws `TypeError: sass.compile is not a function`. But current sass exports both, _and_ logs an `import sass from 'sass'` is deprecated" warning the moment `.default` is touched — so the fallback must prefer the named export (`sassModule.compile` present) and only reach for `.default` when it's missing, or every render on a modern sass would print that deprecation warning.
