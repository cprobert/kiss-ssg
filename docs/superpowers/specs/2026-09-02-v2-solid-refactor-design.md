# kiss-ssg v2: SOLID refactor, Vitest, AIKB knowledge base

Status: approved design (revised after review), ready for implementation planning
Branch: `v2`

## Why

`kiss-ssg.js` is a single ~975-line file with two classes (`Kiss`, `KissPage`)
that mixes config resolution, Handlebars helper registration, asset/sass
compilation, model resolution, controller execution, page rendering, sitemap
generation, dev server bootstrapping, and file-watching — all with console
logging and filesystem side effects inlined throughout. There is no test
suite. This makes the engine hard to change safely and impossible to unit
test without mocking the whole world at once.

v2 goals:
1. Decompose into focused, independently testable modules (more SOLID —
   primarily SRP) without inventing an interface layer the codebase doesn't
   need.
2. Add a Vitest test suite (characterization/integration first, then unit
   per module) so every refactor step has a safety net.
3. Migrate to ESM, since splitting into multiple files is the natural point
   to also drop CommonJS.
4. Fix a small number of existing defects that make the build
   non-deterministic (unhandled rejections, fire-and-forget writes) — these
   block reliable tests and are bugs in their own right.
5. Introduce an `AIKB/` knowledge base — one doc per module — with a lookup
   table in `CLAUDE.md`, so future coding agents can find non-obvious
   architecture knowledge without it bloating `CLAUDE.md` itself.

## Compatibility stance

v2 is a major version: **breaking changes are acceptable**, `require` →
`import` in particular. The rule is *preserve the v1 API where it costs
nothing; break where the design is better for it; document every break.*

Preserved (cheap, and every example/`llms.txt` consumer depends on them):
- `Kiss` public methods: `.page()`, `.pages()`, `.scan()`, `.generate(cb)`,
  `.complete(cb)`, `.sitemap(opts, cb)`, `.watch()`, `.copyAssets(src, dest)`,
  `.registerPartials()`, `.viewStats()`, `.getModelByID(id, data)`.
- `kiss.handlebars` and `kiss.remarkable` instance properties (consumers
  register custom helpers on `kiss.handlebars`, per the docs).
- The config shape and folder-derivation rules exactly as documented in
  `llms.txt`.
- The `data` argument passed to `generate(cb)` / `complete(cb)`: an array of
  `{ id, data }` results (model resolutions and asset copies), which
  `getModelByID` reads.
- `utils` (slug/path helpers) stays reachable — as a named export
  (`import Kiss, { utils } from 'kiss-ssg'`) instead of the deep path
  `kiss-ssg/libs/utils.js`. `examples/3-pages.js` is updated accordingly.

Accepted breaks (documented in a "Migrating from v1" section in `README.md`
and a note in `llms.txt`):
- ESM-only package (`"type": "module"`). `import Kiss from 'kiss-ssg'` is
  the supported form. As a courtesy, `lib/kiss.js` also does
  `export { Kiss as 'module.exports' }` so `const Kiss = require('kiss-ssg')`
  keeps returning `Kiss` via Node's `require(esm)`; this needs
  `engines.node >= 22.12.0` (where `require(esm)` is unflagged), so the pin
  is bumped from `>=22`.
- User controller files are loaded with dynamic `import()`. Both
  `export default fn` and legacy `module.exports = fn` are accepted
  (`mod.default ?? mod`), but a CJS controller inside a consumer project
  that is itself `"type": "module"` is the consumer's problem, not ours.
- Deep imports of internal files (`kiss-ssg/kiss-ssg.js`, `kiss-ssg/libs/...`)
  no longer exist.
- `generate(cb)`'s callback now fires **after** the page files are written
  (v1 fired it before). No example depends on the old timing.

Additive API (new in v2, non-breaking): `async close()` — stops file
watchers and the dev server. Needed for tests to exit and useful for
consumers embedding Kiss in a longer-lived process. `watch()` gains an
optional `{ entry }` option (defaults to `process.argv[1]`) naming the
script whose change triggers a full rebuild.

## Non-goals

- No new SSG features beyond the additive `close()` / `watch({ entry })`.
- No full dependency-injection framework. Testability comes from Vitest's
  `vi.mock()` on `fs-extra`/`glob`/`sass` at the module boundary, plus one
  injected `logger`, not from constructor-injecting every collaborator.
- No change to the build pipeline's shape (`.page()` → stack →
  `.generate()`); only where the logic lives and whether it is awaited.

## Architecture

### File layout

The engine lives in **`lib/`**, not `src/`: in kiss-ssg's own vocabulary
`src` is *the user's site source* (`config.folders.src`, default `./src`),
and this repo's `src/` is exactly that — the docs site that `docs.js`
builds. Engine code must not squat on that name or `.watch()` in docs dev
mode would watch the engine.

```
lib/
  kiss.js               # orchestrator, public API (was kiss-ssg.js's Kiss class)
  kiss-page.js           # KissPage class (page-level render/write)
  logger.js              # injectable logger; the ONLY module that imports `colors`
  config.js              # default config + folder derivation/merge (pure)
  handlebars-helpers.js  # registerHandlebarsHelpers factory
  partials.js            # partial/layout registration
  assets.js              # copyAssets + sass compilation
  model-resolver.js      # options.model → data (json file / URL / object / folder)
  controller-resolver.js # options.controller → run (function / file via import())
  sitemap.js             # sitemap.xml generation
  dev-server.js          # was kiss-serve.js; returns a handle with close()
  watcher.js             # watch(); returns a handle with close()
  utils.js               # was libs/utils.js; resolve.alias/deployAlias/stripStartingSlash dropped (dead code)
test/
  helpers/               # temp-dir site fixture, waitFor, engine entry re-export
  integration/           # real Kiss against temp dirs; fixtures shaped like examples/*
  unit/                  # one spec per lib/ module
  aikb.test.js           # lib/*.js ↔ AIKB/*.md ↔ CLAUDE.md table sync check
AIKB/                    # see "AIKB knowledge base"
```

`package.json`:
- `"version": "2.0.0-alpha.0"`, `"type": "module"`, `"main": "lib/kiss.js"`,
  `"engines": { "node": ">=22.12.0" }`.
- Scripts: `test` (vitest run), `test:watch`, `test:coverage`, `lint`,
  existing `docs`/`eg1..eg6`.
- Dependencies removed: `node-fetch` (native `fetch`), `pretty` (never
  referenced), `md5` (replaced by `node:crypto`; today `md5(model)` on an
  object hashes `"[object Object]"`, so every object model got the same id),
  `highlight.js` devDependency (`docs.js` imports it as `hljs` and never uses
  it; the docs layout loads highlight.js from a CDN).
- Dev dependencies added: `vitest`, `@vitest/coverage-v8`, `eslint`,
  `@eslint/js`, `globals`, and `eslint-config-prettier` bumped to a
  flat-config-compatible version.

Removed files: root `kiss-ssg.js`, `kiss-serve.js`, the whole `libs/` folder
(including `libs/on-ice/`, already-dead shelved code). `.eslintrc.js` is CJS
(would break under `"type": "module"`) and references `babel-eslint` and
`eslint-plugin-prettier`, neither installed, so `npx eslint .` cannot run
today → replaced by a flat `eslint.config.js` (ESM) that actually works, with
an `npm run lint` script.

`examples/*.js`, `examples/2-page/controllers/*.js`, and `docs.js` are
converted to ESM (`import` / `export default`); their behavior and output
are unchanged.

### Module responsibilities

- **`kiss.js`** — thin orchestrator. Owns `_stack`/`_promises`/`_generating`,
  the per-instance Handlebars and Remarkable environments, the watcher and
  dev-server handles, and composes the other modules. Exposes the public API
  listed above. `export default Kiss`, `export { Kiss as 'module.exports' }`,
  `export { utils }`.
- **`kiss-page.js`** — one page's render lifecycle: template compilation on
  the instance's Handlebars environment, slug/path/extension inference
  (`buildTo` / `pageURL()`), minification, livereload injection, and
  **awaited** writes of the output file and the dev-mode debug JSON.
- **`logger.js`** — wraps `console` + `colors` behind `info`/`success`/
  `highlight`/`notice`/`warn`/`error`/`debug`/`banner`/`plain` (covering the
  colours used today). `createLogger({ verbose, silent })`; default export
  is the coloured-console logger so runtime output is unchanged; tests use
  `silentLogger` or a spy. Injected into `Kiss` via `config.logger` and
  passed down — the one real DI seam. No other module imports `colors` or
  uses the `'text'.red` prototype-extension style, so no module silently
  depends on that side-effect import having run.
- **`config.js`** — pure functions: `DEFAULT_CONFIG`, `DEFAULT_FOLDERS`,
  `resolveFolders`, `resolveConfig`, `foldersToEnsure`. Fixes the copy-paste
  bug where layouts/partials/models/controllers are only created
  `if (folders.assets)`.
- **`handlebars-helpers.js`** — `registerHandlebarsHelpers(hbs, config,
  { markdown, logger })` registering `markdown`, `sass`, `offset`,
  `stringify`, `isActive`, `env` onto the **given** Handlebars environment.
- **`partials.js`** — `registerPartials(hbs, config, { markdown, logger })`
  registers `.hbs`/`.html`/`.md` partials and layouts from the configured
  folders onto the given Handlebars environment; skips `null` folders.
- **`assets.js`** — `copyAssets(sourceDir, targetDir, { config, logger })`
  compiles `*.scss`/`*.sass` under the assets folder and copies the rest
  straight through, excluding raw Sass sources. Returns a promise that
  **always resolves** to `{ id, data }` (today an `fs.copy` error leaves the
  promise pending forever, hanging `generate()`), so `generate(cb)`'s `data`
  keeps its v1 shape.
- **`model-resolver.js`** — `resolveModel(model, { modelsDir, logger,
  fetchImpl })` resolves `options.model` (JSON filename / URL / plain object /
  folder-of-JSON). Native `fetch`. Rejects with an `Error` on failure; `Kiss`
  wraps it (see Behavior fixes).
- **`controller-resolver.js`** — `applyController(options, { controllersDir,
  logger })` resolves and runs `options.controller`: a function, or a
  filename loaded via `await import(pathToFileURL(p).href)` with
  `mod.default ?? mod`. Same title-from-model fallback as today.
- **`sitemap.js`** — `buildSitemapEntries`, `renderSitemapXml`,
  `writeSitemap(stack, { config, logger, overwrite })`; same per-page
  overrides (`ignoreSitemap`, `sitemapPriority`, `sitemapChangefreq`,
  `sitemapLastmod`) and `overwrite` behavior. Write is awaited.
- **`dev-server.js`** — `startDevServer(httpRoot, port, { logger })`:
  `connect` + `serve-static` + `livereload`; returns `{ close() }` that shuts
  both down.
- **`watcher.js`** — `createWatcher({ config, getStack, entry, rebuildSite,
  rebuildPage, assetsChanged, logger })`: `chokidar` rebuild-on-change,
  including the entry-script-changed → full rebuild case; returns
  `{ ready, close() }`.
- **`utils.js`** — pure `trimLines`, `toSlug`, `toTitleCase`, `trimPath`,
  `sanitizePath`, plus `hashId` (the `md5` replacement). Dead
  alias-resolution code removed (confirmed unused anywhere except by
  itself).

### Per-instance Handlebars / Remarkable

Today helpers and partials register onto the global `handlebars` singleton,
and `handlebars-layouts` is bolted on at import time. Two `Kiss` instances
in one process — or two Vitest files — leak partials/helpers into each
other. v2 creates `Handlebars.create()` and a `new Remarkable(...)` per
`Kiss` instance (applying `hbs.registerHelper(layouts(hbs))` per instance)
and exposes them as `kiss.handlebars` / `kiss.remarkable`. Consumers already
register helpers via `kiss.handlebars` per the docs, so this is compatible.

## Behavior fixes bundled into v2

Each is an existing defect, fixed deliberately with a test that proves it.

1. **Unhandled rejection on a bad model.** `_processPageModel` pushes the
   raw promise onto `_promises`; `page()` catches on *its* chain, but
   `generate()`/`complete()`/`sitemap()` call `Promise.all(this._promises)`
   with no catch. A missing `.json` model or failed fetch therefore ends the
   process with an unhandled rejection instead of the intended
   "log, skip that page, keep building". Fix: `_promises` holds the **whole
   `page()` chain** (model → controller → prepare), already caught and
   resolving to `{ id, data: null, error }` on failure. Tracking the whole
   chain also matters once controller loading is async (dynamic `import()`):
   the raw model promise alone would resolve before the page is stacked.
   Test: a site with one bad model still builds its other pages and exits 0.
2. **`generate()` is fire-and-forget.** `KissPage.generate()` is async but
   never awaited and uses callback-style `fs.outputFile`, so the
   `generate(cb)` callback runs before any file exists. Fix: page writes are
   awaited; `Kiss.generate()` awaits all page renders before invoking `cb`
   and still returns `this` for chaining; `complete()` drains both
   `_promises` and in-flight `generate()`/`sitemap()` work (re-checking until
   no new work was queued, since callbacks may queue more pages) so
   callers/tests can `await kiss.complete()`. Test: files exist when `cb`
   fires / after `await complete()`.
3. **Folder creation guard** (`_setupFolders` checks `folders.assets` for
   every folder) — fixed in `config.js`. Test: with `assets: null`, the
   partials/layouts/models/controllers folders are still created.
4. **Duplicate-page detection** in `page()` hardcodes
   `${path}/${slug}.html`, so it never matches extension-less pages or a
   non-html `ext`. Fix: compare against the prepared `KissPage.buildTo`.
   Test: registering the same extension-less page twice yields one stack
   entry.

## ESM migration

- `node-fetch` → native `fetch` in `model-resolver.js`.
- `module.parent.filename` (used in `watch()` to find the caller's entry
  script) does not exist under ESM → `process.argv[1]` by default,
  overridable via `watch({ entry })`. Covered by an integration test that
  touches the entry file and asserts a full rebuild.
- `require.main.require(controllerPath)` → `await import(pathToFileURL(
  controllerPath).href)`, `mod.default ?? mod`. Controller loading becomes
  properly async, inside the already-async (and now fully tracked) page
  chain. Note `require.main` is undefined under Vitest's ESM workers, so
  file-controller tests can only exist after this change.
- `export { Kiss as 'module.exports' }` for CJS consumers (see Compatibility).
- No `__dirname`/`__filename` usage exists, so nothing to shim.
- `colors` is imported for its `String.prototype` side effects in
  `logger.js` only.
- `.eslintrc.js` → `eslint.config.js` (flat, ESM); example controllers →
  `export default`.

## Testing (Vitest)

Order matters: characterization tests come **first**, before any
extraction, so every later step is checked against recorded behavior.

- **Integration / characterization** (`test/integration/`): a real `Kiss`
  against a temp directory (paths normalised to forward slashes — `glob` v7
  does not accept backslashes on Windows), fixtures shaped like
  `examples/*`, asserting on the files actually written — covering
  `.page()`/`.pages()`/`.scan()`/`.generate()`/`.complete()`/`.sitemap()`/
  `.watch()`, the `generate(cb)` `data` shape, extension-less mode, the four
  behavior fixes above, file controllers (both `export default` and legacy
  `module.exports`), and a spawned-`node` check that `require()` of the
  package still returns `Kiss`. `dev-server.js` is `vi.mock`ed; `close()`
  runs in `afterEach`. Dev-mode-only behaviour (livereload injection, debug
  JSON) is covered at the `KissPage` unit level rather than by starting a
  server.
- **Unit** (`test/unit/`), one spec per `lib/` module: `utils`, `config`
  (pure, no mocking); `model-resolver` (fetch + fs mocked), `controller-
  resolver` (function / file / missing / `default ?? module`), `sitemap`
  (XML shape, overrides, `overwrite: false`), `handlebars-helpers` (each
  helper against a throwaway `Handlebars.create()`), `partials`, `assets`,
  `kiss-page` (slug/path/ext inference, extension-less, minifier invoked,
  livereload injection, debug JSON), `logger` (interface lock), `watcher` /
  `dev-server` (handles close).
- **`test/aikb.test.js`** — see below.
- `examples/*.js` remain as manual demos; not replaced by the suite.

## AIKB knowledge base

`AIKB/` at repo root, one doc per `lib/` module (1:1 with the file layout)
plus exactly one cross-cutting doc:

```
AIKB/
  kiss.md                 # includes the .page() → stack → .generate() pipeline narrative
  kiss-page.md
  logger.md
  config.md
  handlebars-helpers.md
  partials.md
  assets.md
  model-resolver.md
  controller-resolver.md
  sitemap.md
  dev-server.md
  watcher.md
  utils.md
  testing.md              # cross-cutting: mocking conventions, temp-dir fixtures, running one spec
```

Each module doc follows a fixed template of five headings: **Responsibility**
(one paragraph) · **Public interface** · **Depends on** · **Depended on by** ·
**Non-obvious behavior** (the *why*, not the *what* — e.g. why `watcher.js`
uses `process.argv[1]`, why `_promises` must only hold handled promises).
Short by design: knowledge not derivable from the module's own code.

`CLAUDE.md` gets an "Architecture knowledge base" section: one intro
sentence and a lookup table (module → file → AIKB doc, plus a
"Cross-cutting" row for `testing.md`). The existing narrative sections are
trimmed to the `lib/` layout (the "Node 12–14 era syntax, no ESM" line
goes); the table supplements them.

**Enforcement:** `test/aikb.test.js` asserts every `lib/*.js` has a
matching `AIKB/*.md`, every AIKB doc appears as a row in the `CLAUDE.md`
table, and every module doc has the five template headings. This is what
stops the knowledge base rotting.

`llms.txt` is rewritten for the `lib/` layout and ESM (it currently describes
a "single-file engine", `kiss-ssg.js`, `libs/utils.js`, `kiss-serve.js`, and
says `generate(cb)` does not await writes). `README.md` (which exists at the
repo root and is what `llms.txt` links to) gets its `require` examples
switched to `import`, the "or just drop kiss-ssg.js somewhere" line removed,
and a "Migrating from v1" section.

## Rollout order

Each step leaves `npm test` and the six examples green.

1. Vitest harness + `package.json` scripts; **characterization tests
   against the current monolith** (`test/integration/`).
2. Behavior fixes 1 and 2 (tracked/handled page chains, awaited writes /
   `generate()` / `complete()`) — needed so those tests are deterministic.
3. ESM-convert the monolith in place: `kiss-ssg.js`, `libs/utils.js`,
   `kiss-serve.js`, `docs.js`, `examples/**`; the `process.argv[1]`,
   `import()`, and `'module.exports'` substitutions; then `eslint.config.js`
   and dependency pruning.
4. Extract modules into `lib/` **directly as ESM**, one batch at a time with
   unit tests: (a) `utils`, `logger`, `config` (+ fix 3) and route every
   log call through the logger; (b) `handlebars-helpers`, `partials`,
   `assets` with per-instance Handlebars/Remarkable; (c) `model-resolver`,
   `controller-resolver`; `sitemap`; (d) `kiss-page` (+ fix 4);
   `dev-server`, `watcher` with handles and `close()`.
5. Move the orchestrator to `lib/kiss.js`; delete root `kiss-ssg.js`,
   `kiss-serve.js`, `libs/`; point `main` at `lib/kiss.js`.
6. `AIKB/*.md`, `CLAUDE.md` table + trim, `test/aikb.test.js`, `llms.txt`,
   `README.md`.

## Model delegation

Implementation is dispatched task-by-task to subagents with an explicit
`model`, following the superpowers subagent-driven-development pattern.
**Fable (the main session) writes no implementation code**: it reviews each
subagent's `git diff` + test output against this spec, then dispatches the
next task. Every task in the implementation plan carries a `model:` tag.

| Tier | Work items |
|---|---|
| **Sonnet** — mechanical, well-specified, pure | Vitest harness + scripts; `eslint.config.js` + dependency pruning; `utils`, `logger`, `config` (+ fix 3) extraction and routing log calls through the logger; `sitemap` extraction; AIKB docs from the template; `CLAUDE.md` table; `test/aikb.test.js`; `llms.txt` / `README.md` |
| **Opus** — judgment about current behavior, mocking design | Characterization test suite (fixtures, what to assert); ESM conversion of the engine + examples (`process.argv[1]`, `import()` with `default ?? module`, `'module.exports'` export); `handlebars-helpers` / `partials` / `assets` with per-instance Handlebars+Remarkable; `model-resolver` / `controller-resolver`; `kiss-page` with awaited writes + fix 4 |
| **Fable** — async/lifecycle semantics, cross-cutting | Behavior fixes 1 and 2 (tracked page chains, awaited `generate()`, draining `complete()`); `watcher` + `dev-server` handles and `close()`; final `lib/kiss.js` orchestrator with the full suite green |
| **Fable — oversight** | Review every subagent result before the next dispatch; own this spec; final end-to-end check (`npm test` + all six examples) |

Token rules for the executor: one task per subagent; a self-contained
prompt (the relevant spec section, file paths, the test that must pass); no
repo re-exploration by subagents; Fable reviews from `git diff` and test
output rather than re-reading whole files.

## Open risks

- `process.argv[1]` approximates `module.parent.filename`; covered by an
  integration test rather than assumed.
- Awaiting page writes in `generate()` changes *when* `cb` fires (later,
  after files exist). This is the behavior `llms.txt` should have promised
  and no example depends on the earlier timing, but it is a semantic change
  and is called out in the migration note.
- Per-instance Handlebars breaks any consumer that registered helpers on
  the global `handlebars` module instead of `kiss.handlebars`. The docs have
  never suggested that; called out in the migration note anyway.
- Dynamic `import()` caches controller modules per URL, exactly as
  `require` did; controllers still do not hot-reload in watch mode. Not a
  regression, but worth an AIKB note.
