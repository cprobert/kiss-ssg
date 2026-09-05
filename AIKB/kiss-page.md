# kiss-page.js

## Responsibility

One page's render logic: resolving its title/slug/path/extension, compiling and rendering its Handlebars template, minifying the HTML, and writing the output file (plus a debug `.json` sibling in dev mode).

## Public interface

- `class KissPage`
  - `new KissPage(view, { hbs, logger } = {})` — `view` is a `.hbs` path (relative to `pagesDir`) or an inline template string.
  - `set path(path)` — sanitizes via `sanitizePath` (`./utils.js`); falsy values are ignored (default `''` kept).
  - `set slug(slug)` / `get slug()` — setter normalizes via `toSlug` (`./utils.js`); falsy values are ignored (default `'index'` kept).
  - `set ext(extension)` — strips a leading `.`, then slugifies via `toSlug` (`./utils.js`), like `path` and `slug`; falsy values are ignored (default `'html'` kept).
  - `set extLess(val)` / `set isDev(dev)` / `set debug(dev)` — each unconditionally coerces with `!!val` and assigns (`this._extLess = !!val`, etc.) — unlike `path`/`slug`/`ext`, these do **not** ignore falsy values; e.g. `page.debug = false` overwrites the existing value rather than being skipped.
  - `buildDir` / `pagesDir` / `livereloadPort` — plain fields `Kiss._preparePage` assigns from the resolved config (`folders.build`, `folders.pages`, `livereloadPort`); `livereloadPort` falls back to `DEFAULT_CONFIG.livereloadPort`.
  - `get buildTo()` — `${buildDir}/${pageURL()}`, the absolute-ish output path and the dedupe key `Kiss._preparePage` checks.
  - `pageURL()` — the page's URL/relative-path, honoring `extLess` (writes `slug/index.ext` instead of `slug.ext`, except for `slug === 'index'`).
  - `prepare()` — merges default options (`title`, `path`, `slug`, `generate: true`) under any already set on `this.options`; returns `this`.
  - `async generate()` — compiles the template, renders with `this.options`, injects the livereload script in dev, minifies (skipped in dev), asserts the resolved `buildTo` is inside the resolved `buildDir`, writes the file (and, in dev, the debug `.json`); returns `this.buildTo`. Logs _and rethrows_ render/minify/escape/output-write errors.

## Depends on

`fs-extra`, `node:path`, `html-minifier-terser`; `./utils.js` (`toSlug`, `toTitleCase`, `sanitizePath`), `./logger.js` (fallback logger only), `./config.js` (`DEFAULT_CONFIG.livereloadPort`, the fallback for a `KissPage` built outside `Kiss`).

## Depended on by

`lib/kiss.js` (`_preparePage` constructs and stacks a `KissPage`).

## Non-obvious behavior

- `_title` is computed from the _default_ slug (`'index'`) in the constructor, before any page-specific slug is set — so a page without an explicit title or model title falls back to `'Index'`, not a title derived from its own slug. This is a preserved v1 quirk, not a bug to fix.
- `buildTo` is the value `Kiss._preparePage` uses to detect duplicate pages (same output path) — a duplicate is a build failure there, not a skip.
- **Every part of `buildTo` is sanitised, `ext` included.** `ext` used to strip only the _first_ `.` (`replace('.', '')`) and never slugify, so unlike `path` (`sanitizePath`) and `slug` (`toSlug`) it carried `/` and `..` straight into the output path: `ext: './../../../escaped/pwned.html'` wrote three levels above the build folder, and the value is reachable from model data through the documented "controller derives the page's options" pattern (review finding C1). It now goes through `toSlug(extension.replace(/^\./, ''))` — `'.xml'` → `'xml'`, `'../x'` → `'x'`.
- **`generate()` refuses to write outside the build folder**: immediately before `fs.outputFile` it compares `path.resolve(buildTo)` against `path.resolve(buildDir)` and throws `Refusing to write outside the build folder: <buildTo>` otherwise. Belt-and-braces behind the sanitised setters — nothing reachable through them should trip it — and it throws inside `generate()`'s try, so it is logged and collected like any other render failure rather than being a silent write.
- `fs.outputFile`/`fs.outputJson` writes are `await`ed — `generate()` does not resolve until the file (and, in dev, the debug JSON) is actually on disk.
- The injected livereload `<script>` points at `livereloadPort`, a plain field `Kiss._preparePage` sets from `config.livereloadPort` (the same value `startDevServer` binds). It is a field rather than a render option deliberately: page options reach the template context and the dev-mode `.json` sibling, and the port is engine plumbing, not page data. The port used to be hardcoded, so a second site's pages polled the first site's livereload server (review finding D-01).
- Dev mode (`isDev`) injects the livereload `<script>` tag immediately before `</body>` and writes a sibling `.json` file (same path with only its _trailing_ extension swapped, via `/\.[^.]+$/` — a plain `replace(ext, 'json')` would also hit an earlier occurrence, e.g. a folder named `html`) containing the fully-resolved `options` — useful for inspecting what a page rendered with.
- `generate()` logs an error and then **rethrows** it, so `Kiss.generate()` can collect the failure and `Kiss.complete()` can reject with it (v1 logged and resolved, so a site could "build" with a page missing). Four failure paths rethrow: a render throw (e.g. `Missing helper`), a minify throw, the outside-the-build-folder assertion, and a failed write of the _output_ file (its inner `catch` logs `Error creating <buildTo>` and rethrows, so the error is logged twice — once specific, once by the outer `Error processing view <view>` handler). The dev-mode debug `.json` sibling is the exception: it is a debug artifact, so a failure to write it stays log-only and the page still counts as built.
- A view that ends with `.hbs` is a **filename** and must be read from `pagesDir`; anything else is an inline template string. When the read fails, `_getTemplate` throws `Error reading view: <path>` (with the fs error as `cause`), so the failure reaches `Kiss.generate()`'s catch, lands in `_failures` and makes `complete()` reject. It used to log the error and fall through with `viewText` still set to the view filename, which compiled the _filename_ as the page body — a deleted or misspelled view "built successfully" with `about.hbs` as its content (review finding B3).
- A template that fails to _compile_ is still log-only: `_getTemplate` returns `null` and `generate()` takes the "Skipping page generation" branch instead of throwing — so an unparseable template is a skipped page, not a build failure.
- HTML/CSS/JS minification is skipped in dev (`collapseWhitespace`/`minifyCSS`/`minifyJS` all `false`) so dev output stays readable and diffable.
