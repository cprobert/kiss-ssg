# kiss-page.js

## Responsibility

One page's render logic: resolving its title/slug/path/extension, compiling and rendering its Handlebars template, minifying the HTML, and writing the output file (plus a debug `.json` sibling in dev mode).

## Public interface

- `class KissPage`
  - `new KissPage(view, { hbs, logger } = {})` — `view` is a `.hbs` path (relative to `pagesDir`) or an inline template string.
  - `set path(path)` — sanitizes via `sanitizePath` (`./utils.js`); falsy values are ignored (default `''` kept).
  - `set slug(slug)` / `get slug()` — setter normalizes via `toSlug` (`./utils.js`); falsy values are ignored (default `'index'` kept).
  - `set ext(extension)` — strips a leading `.` inline (no `utils` call); falsy values are ignored (default `'html'` kept).
  - `set extLess(val)` / `set isDev(dev)` / `set debug(dev)` — each unconditionally coerces with `!!val` and assigns (`this._extLess = !!val`, etc.) — unlike `path`/`slug`/`ext`, these do **not** ignore falsy values; e.g. `page.debug = false` overwrites the existing value rather than being skipped.
  - `get buildTo()` — `${buildDir}/${pageURL()}`, the absolute-ish output path and the dedupe key `Kiss._preparePage` checks.
  - `pageURL()` — the page's URL/relative-path, honoring `extLess` (writes `slug/index.ext` instead of `slug.ext`, except for `slug === 'index'`).
  - `prepare()` — merges default options (`title`, `path`, `slug`, `generate: true`) under any already set on `this.options`; returns `this`.
  - `async generate()` — compiles the template, renders with `this.options`, injects the livereload script in dev, minifies (skipped in dev), writes the file (and, in dev, the debug `.json`); returns `this.buildTo`. Logs *and rethrows* render/minify/output-write errors.

## Depends on

`fs-extra`, `html-minifier-terser`; `./utils.js` (`toSlug`, `toTitleCase`, `sanitizePath`), `./logger.js` (fallback logger only).

## Depended on by

`lib/kiss.js` (`_preparePage` constructs and stacks a `KissPage`).

## Non-obvious behavior

- `_title` is computed from the *default* slug (`'index'`) in the constructor, before any page-specific slug is set — so a page without an explicit title or model title falls back to `'Index'`, not a title derived from its own slug. This is a preserved v1 quirk, not a bug to fix.
- `buildTo` is the value `Kiss._preparePage` uses to detect and reject duplicate pages (same output path).
- `fs.outputFile`/`fs.outputJson` writes are `await`ed — `generate()` does not resolve until the file (and, in dev, the debug JSON) is actually on disk.
- Dev mode (`isDev`) injects the livereload `<script>` tag immediately before `</body>` and writes a sibling `.json` file (same path with only its *trailing* extension swapped, via `/\.[^.]+$/` — a plain `replace(ext, 'json')` would also hit an earlier occurrence, e.g. a folder named `html`) containing the fully-resolved `options` — useful for inspecting what a page rendered with.
- `generate()` logs an error and then **rethrows** it, so `Kiss.generate()` can collect the failure and `Kiss.complete()` can reject with it (v1 logged and resolved, so a site could "build" with a page missing). Three failure paths rethrow: a render throw (e.g. `Missing helper`), a minify throw, and a failed write of the *output* file (its inner `catch` logs `Error creating <buildTo>` and rethrows, so the error is logged twice — once specific, once by the outer `Error processing view <view>` handler). The dev-mode debug `.json` sibling is the exception: it is a debug artifact, so a failure to write it stays log-only and the page still counts as built.
- A template that fails to *compile* (or a view file that can't be read) is still log-only: `_getTemplate` returns `null` and `generate()` takes the "Skipping page generation" branch instead of throwing — so a broken view is a skipped page, not a build failure.
- HTML/CSS/JS minification is skipped in dev (`collapseWhitespace`/`minifyCSS`/`minifyJS` all `false`) so dev output stays readable and diffable.
