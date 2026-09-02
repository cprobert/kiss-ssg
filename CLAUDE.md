# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node. The entire engine lives in one file, `kiss-ssg.js` (~975 lines, two classes: `Kiss` and `KissPage`); there is no build step, bundler, or transpilation — it runs directly on Node.

`llms.txt` at the repo root is an LLM-oriented API cheat-sheet (per the [llmstxt.org](https://llmstxt.org) convention) — it ships automatically in the published npm package (no `files`/`.npmignore` config needed) so an agent working in a project that depends on `kiss-ssg` can read `node_modules/kiss-ssg/llms.txt` instead of the full source. Keep it in sync with `kiss-ssg.js` when the public API changes — it duplicates method signatures/config shape by design, for exactly the cases where reading source would be slower.

## Requirements

`package.json` pins `engines.node` to `>=22` (anything older is EOL). Written originally against Node 12–14 era syntax (public class fields, no ESM), but verified working end-to-end on Node 24.

Dependencies are kept at their latest in-range (`^`) versions and currently audit clean (`npm audit` → 0 vulnerabilities). `html-minifier` was swapped for its maintained fork `html-minifier-terser` (same options, but `minify()` is async — `KissPage.generate()` is `async` and `await`s it). Sass compilation uses the modern `sass.compile`/`compileString` API (not the deprecated legacy `renderSync`); the `config.sass.includePaths` option name is kept as the public config key for backwards compatibility and mapped internally to the modern API's `loadPaths`.

## Commands

There is no test suite and no `lint`/`build`/`start` script defined in `package.json`. What exists:

```bash
node docs                              # regenerate docs/ (dev mode, verbose) — see docs.js
cd examples && node 1-scan             # run example 1 (or 2-page, 3-pages, 4-layouts-and-partials, 5-helpers)
npm run eg1                            # same, via package.json script (eg1..eg5)
```

Each example under `examples/*.js` is a minimal, runnable `Kiss` config — the fastest way to manually exercise a change end-to-end. Prettier config is in `.prettierrc` (no semicolons, single quotes, double quotes in `.hbs`); ESLint config is in `.eslintrc.js` (extends `prettier`) but no npm script invokes it — run `npx eslint .` directly if needed.

## Architecture

**Two-class core** (`kiss-ssg.js`):
- `Kiss` — the orchestrator. Holds config, a `_stack` of pages to build, and a `_promises` queue for async model loading. Public chainable API: `.page()`, `.pages()`, `.scan()`, `.generate()`, `.complete()`, `.sitemap()`, `.watch()`.
- `KissPage` — one page's render logic (title/slug/path/extension handling, template compilation, HTML minification, writing the output file).

**Build pipeline**: calling `.page()`/`.pages()`/`.scan()` does *not* render immediately — it resolves the page's model (see below) asynchronously and pushes a prepared `KissPage` onto `_stack`. `.generate()` waits on `Promise.all(this._promises)`, then calls `.generate()` on every stacked page exactly once (`runCount` guards against double-render). `.complete()` is the same wait without triggering render — used when you need all promises settled before doing something else.

**Model resolution** (`_processPageModel`) — `options.model` can be:
- a `.json` filename → read from `config.folders.models`
- an `http(s)://` URL → fetched with `node-fetch`
- a plain object → used as-is
- a folder name (no extension) → every `*.json` in that folder is loaded and returned as an array (used with `.pages()` for one-page-per-model fan-out, via `_prepareMultiplePages`, which appends `-N` to the slug per item)

**Controller resolution** (`_detectControllerType`) — `options.controller` can be a function, or a filename resolved against `config.folders.controllers`. Runs after the model resolves and can rewrite any page option (commonly used to derive `slug` from model data, or to sort/transform the model).

**Slug/path inference**: if not explicit, `slug` and `path` are derived from the view's file path (`utils.toSlug`, `utils.sanitizePath`). `.scan()` auto-discovers every `.hbs` under `config.folders.pages` and calls `.page()` for any not already in the stack.

**Folders**: everything is driven by `config.folders` (`src`, `pages`, `partials`, `layouts`, `models`, `controllers`, `assets`, `build`). Setting `config.folders.src` re-derives all the other subfolders from it unless they're individually overridden too — see the constructor in `kiss-ssg.js`. Defaults assume `./src/...` in and `./public` out.

**Partials/layouts**: registered globally into the shared `handlebars` instance from `config.folders.partials` and `config.folders.layouts`, supporting `.hbs`, `.html`, and `.md` (Markdown is rendered to HTML via `remarkable` at registration time, not render time). Layout composition uses `handlebars-layouts`.

**Built-in Handlebars helpers** (registered per-`Kiss`-instance in `registerHandlebarsHelpers`, not global): `markdown`, `sass` (inline or file, compiled via `sass.compile`/`compileString`, compressed outside dev), `offset`, `stringify`, `isActive` (nav active-state matching against `pageOptions.pageURL`), `env` (`{{#env is="dev"}}`/`"prod"` blocks). The `Kiss` instance also exposes `.handlebars` directly so consumers can register their own helpers.

**Assets**: `copyAssets()` compiles every `*.scss`/`*.sass` under `assets` to a sibling `.css` (via `sass`) and copies everything else straight through to `build`, excluding raw Sass sources.

**`.sitemap(options, callback)`**: writes `sitemap.xml` to `config.folders.build`, built from `_stack` — no need for consumers to hand-roll it (a pattern several downstream sites used to do themselves). Requires `config.siteUrl`; logs an error and skips (no crash) if unset. Waits on the same `Promise.all(this._promises)` as `.generate()`/`.complete()`, so it can be called before or after `.generate()` in the chain with identical results. Per-page opt-out via `ignoreSitemap: true`; per-page `sitemapPriority` (default `'1.00'`), `sitemapChangefreq` (omitted if unset), `sitemapLastmod` (default: one build-time timestamp shared across all pages) overrides. `options.overwrite` (default `true`) — set `false` to skip writing if a `sitemap.xml` already exists at the build path, though this only has any effect when `cleanBuild: false` too, since default `cleanBuild: true` already empties the whole build dir (including any prior `sitemap.xml`) in the constructor, before `.sitemap()` ever runs. See `examples/6-sitemap.js`.

**Dev mode** (`config.dev: true`): starts `kiss-serve.js` (a `connect` + `serve-static` static server plus `livereload`) on `config.port` (default `3001`), injects the livereload `<script>` tag before `</body>`, skips HTML/CSS/JS minification, and writes a sibling `.json` debug file per page with its fully-resolved options. `.watch()` uses `chokidar` on `config.folders.src` (assets watched separately) to rebuild just the affected page(s), or the whole site if the changed file can't be matched to a stacked view.

**`libs/on-ice/`** is shelved/experimental code (an abandoned assets-bundler and some commented-out helper drafts, per recent commit history) — not wired into `kiss-ssg.js`. Don't treat it as live behavior; `libs/utils.js` is the only actively-used lib file.

**`docs/`** is the generated output of `docs.js` (which runs `Kiss` in dev mode against `src/`, writing to `build: 'docs'`) — treat it as build output, not hand-edited source.
