# kiss-page.js

## Responsibility

One page's render logic: resolving its title/slug/path/extension, compiling and rendering its Handlebars template, minifying the HTML, and writing the output file (plus a debug `.json` sibling in dev mode).

## Public interface

- `class KissPage`
  - `new KissPage(view, { hbs, logger } = {})` — `view` is a `.hbs` path (relative to `pagesDir`) or an inline template string.
  - `set path(path)` / `set slug(slug)` / `get slug()` / `set ext(extension)` / `set extLess(val)` / `set isDev(dev)` / `set debug(dev)` — setters sanitize/normalize via `lib/utils.js`; falsy values are ignored (existing default kept).
  - `get buildTo()` — `${buildDir}/${pageURL()}`, the absolute-ish output path and the dedupe key `Kiss._preparePage` checks.
  - `pageURL()` — the page's URL/relative-path, honoring `extLess` (writes `slug/index.ext` instead of `slug.ext`, except for `slug === 'index'`).
  - `prepare()` — merges default options (`title`, `path`, `slug`, `generate: true`) under any already set on `this.options`; returns `this`.
  - `async generate()` — compiles the template, renders with `this.options`, injects the livereload script in dev, minifies (skipped in dev), writes the file (and, in dev, the debug `.json`); returns `this.buildTo`. Catches and logs its own errors — never throws.

## Depends on

`fs-extra`, `html-minifier-terser`; `./utils.js` (`toSlug`, `toTitleCase`, `sanitizePath`), `./logger.js` (fallback logger only).

## Depended on by

`lib/kiss.js` (`_preparePage` constructs and stacks a `KissPage`).

## Non-obvious behavior

- `_title` is computed from the *default* slug (`'index'`) in the constructor, before any page-specific slug is set — so a page without an explicit title or model title falls back to `'Index'`, not a title derived from its own slug. This is a preserved v1 quirk, not a bug to fix.
- `buildTo` is the value `Kiss._preparePage` uses to detect and reject duplicate pages (same output path).
- `fs.outputFile`/`fs.outputJson` writes are `await`ed — `generate()` does not resolve until the file (and, in dev, the debug JSON) is actually on disk.
- Dev mode (`isDev`) injects the livereload `<script>` tag immediately before `</body>` and writes a sibling `.json` file (same path, extension swapped to `json`) containing the fully-resolved `options` — useful for inspecting what a page rendered with.
- HTML/CSS/JS minification is skipped in dev (`collapseWhitespace`/`minifyCSS`/`minifyJS` all `false`) so dev output stays readable and diffable.
