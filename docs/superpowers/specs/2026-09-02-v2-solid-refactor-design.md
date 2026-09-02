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

Accepted breaks (documented in a "Migrating from v1" note in README and
`llms.txt`):
- ESM-only package (`"type": "module"`). `import Kiss from 'kiss-ssg'` is
  the supported form. As a courtesy, `src/kiss.js` also does
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

Additive API (new in v2, non-breaking): `async close()` — stops file
watchers and the dev server. Needed for tests to exit and useful for
consumers embedding Kiss in a longer-lived process.

## Non-goals

- No new SSG features beyond the additive `close()`.
- No full dependency-injection framework. Testability comes from Vitest's
  `vi.mock()` on `fs-extra`/`glob`/`sass` at the module boundary, plus one
  injected `logger`, not from constructor-injecting every collaborator.
- No change to the build pipeline's shape (`.page()` → stack →
  `.generate()`); only where the logic lives and whether it is awaited.

## Architecture

### File layout

```
src/
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
  integration/           # real Kiss against temp dirs; fixtures shaped like examples/*
  unit/                  # one spec per src/ module
  aikb.test.js           # src/*.js ↔ AIKB/*.md ↔ CLAUDE.md table sync check
AIKB/                    # see "AIKB knowledge base"
```

`package.json`:
- `"version": "2.0.0-alpha.0"`, `"type": "module"`, `"main": "src/kiss.js"`,
  `"engines": { "node": ">=22.12.0" }`.
- Scripts: `test` (vitest run), `test:watch`, existing `docs`/`eg1..eg6`.
- Dependencies removed: `node-fetch` (native `fetch`), `pretty` (never
  referenced), `md5` (replaced by `node:crypto`; today `md5(model)` on an
  object hashes `"[object Object]"`, so every object model got the same id),
  `highlight.js` devDependency (`docs.js` imports it as `hljs` and never uses
  it; the docs layout loads highlight.js from a CDN).
- Dev dependencies added: `vitest`, `@vitest/coverage-v8`.

Removed files: root `kiss-ssg.js`, `kiss-serve.js`, the whole `libs/` folder
(including `libs/on-ice/`, already-dead shelved code). `.eslintrc.js` is CJS
and would break under `"type": "module"` → renamed `.eslintrc.cjs`; its
references to `babel-eslint` and `eslint-plugin-prettier` (not installed) are
fixed at the same time so `npx eslint .` actually runs.

`examples/*.js`, `examples/2-page/controllers/*.js`, and `docs.js` are
converted to ESM (`import` / `export default`); their behavior and output
are unchanged.

### Module responsibilities

- **`kiss.js`** — thin orchestrator. Owns `_stack`/`_promises`, the
  per-instance Handlebars and Remarkable environments, the watcher/dev-server
  handles, and composes the other modules. Exposes the public API listed
  above. `export default Kiss`, `export { Kiss as 'module.exports' }`,
  `export { utils }`.
- **`kiss-page.js`** — one page's render lifecycle: template compilation,
  slug/path/extension inference (`buildTo` / `pageURL()`), minification,
  livereload injection, and **awaited** writes of the output file and the
  dev-mode debug JSON.
- **`logger.js`** — wraps `console` + `colors` behind `info`/`warn`/
  `error`/`debug` (matching the severities used today). Default export is the
  coloured-console logger so runtime output is unchanged; tests inject a
  silent/spy logger. Injected into `Kiss` and passed down — the one real DI
  seam. No other module imports `colors` or uses the `'text'.red`
  prototype-extension style, so no module silently depends on that
  side-effect import having run.
- **`config.js`** — pure functions: default config, folder derivation from
  `config.folders.src`, merge with user config, and the list of folders to
  `ensureDir`. Fixes the copy-paste bug where layouts/partials/models/
  controllers are only created `if (folders.assets)`.
- **`handlebars-helpers.js`** — `registerHandlebarsHelpers(hbs, config,
  { markdown, logger })` registering `markdown`, `sass`, `offset`,
  `stringify`, `isActive`, `env` onto the **given** Handlebars environment.
- **`partials.js`** — registers `.hbs`/`.html`/`.md` partials and layouts
  from the configured folders onto the given Handlebars environment.
- **`assets.js`** — compiles `*.scss`/`*.sass` under the assets folder and
  copies the rest straight through to build, excluding raw Sass sources.
  Returns a promise resolving to `{ id, data }` so `generate(cb)`'s `data`
  keeps its v1 shape.
- **`model-resolver.js`** — resolves `options.model` (JSON filename / URL /
  plain object / folder-of-JSON). Native `fetch`. Returns an
  **already-handled** promise (see Behavior fixes).
- **`controller-resolver.js`** — resolves and runs `options.controller`:
  a function, or a filename loaded via `await import(pathToFileURL(p).href)`
  with `mod.default ?? mod`. Same title-from-model fallback as today.
- **`sitemap.js`** — builds and writes `sitemap.xml` from the page stack;
  same per-page overrides (`ignoreSitemap`, `sitemapPriority`,
  `sitemapChangefreq`, `sitemapLastmod`) and `overwrite` behavior. Write is
  awaited.
- **`dev-server.js`** — `connect` + `serve-static` + `livereload`; returns
  `{ close() }` that shuts both down.
- **`watcher.js`** — `chokidar` rebuild-on-change, including the
  entry-script-changed → full rebuild case; returns `{ close() }`.
- **`utils.js`** — pure `trimLines`, `toSlug`, `toTitleCase`, `trimPath`,
  `sanitizePath`. Dead alias-resolution code removed (confirmed unused
  anywhere except by itself).

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
   "log, skip that page, keep building". Fix: `_promises` only ever holds
   handled promises (`p.catch(err => ({ id, data: null, error }))`).
   Test: a site with one bad model still builds its other pages and exits 0.
2. **`generate()` is fire-and-forget.** `KissPage.generate()` is async but
   never awaited and uses callback-style `fs.outputFile`, so the
   `generate(cb)` callback runs before any file exists. Fix: page writes are
   awaited; `Kiss.generate()` awaits all page renders before invoking `cb`
   and still returns `this` for chaining; `complete()` also awaits any
   in-flight `generate()` so callers/tests can `await kiss.complete()`.
   Test: files exist when `cb` fires / after `await complete()`.
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
  script) does not exist under ESM → `process.argv[1]`, equivalent for the
  real usage (`node examples/1-scan.js`). Covered by an integration test that
  touches the entry file and asserts a full rebuild.
- `require.main.require(controllerPath)` → `await import(pathToFileURL(
  controllerPath).href)`, `mod.default ?? mod`. Controller loading becomes
  properly async, inside the already-async model chain.
- `export { Kiss as 'module.exports' }` for CJS consumers (see Compatibility).
- No `__dirname`/`__filename` usage exists, so nothing to shim.
- `colors` is imported for its `String.prototype` side effects in
  `logger.js` only.
- `.eslintrc.js` → `.eslintrc.cjs`; example controllers → `export default`.

## Testing (Vitest)

Order matters: characterization tests come **first**, before any
extraction, so every later step is checked against recorded behavior.

- **Integration / characterization** (`test/integration/`): a real `Kiss`
  against a temp directory, fixtures shaped like `examples/*`, asserting on
  the files actually written — covering `.page()`/`.pages()`/`.scan()`/
  `.generate()`/`.complete()`/`.sitemap()`/`.watch()`, the `generate(cb)`
  `data` shape, extension-less mode, dev-mode debug JSON, and the four
  behavior fixes above. `dev-server.js` is `vi.mock`ed; `close()` runs in
  `afterEach`.
- **Unit** (`test/unit/`), one spec per `src/` module: `utils`, `config`
  (pure, no mocking); `model-resolver` (fetch + fs mocked), `controller-
  resolver` (function / file / missing / `default ?? module`), `sitemap`
  (XML shape, overrides, `overwrite: false`), `handlebars-helpers` (each
  helper against a throwaway `Handlebars.create()`), `partials`, `assets`,
  `kiss-page` (slug/path/ext inference, extension-less, minifier invoked),
  `logger` (interface lock), `watcher` / `dev-server` (handles close).
- **`test/aikb.test.js`** — see below.
- `examples/*.js` remain as manual demos; not replaced by the suite.

## AIKB knowledge base

`AIKB/` at repo root, one doc per `src/` module (1:1 with the file layout)
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

Each module doc follows a fixed template: **Responsibility** (one
paragraph) · **Public interface** · **Depends on** · **Depended on by** ·
**Non-obvious behavior / gotchas** (the *why*, not the *what* — e.g. why
`watcher.js` uses `process.argv[1]`, why `_promises` must only hold handled
promises). Short by design: knowledge not derivable from the module's own
code.

`CLAUDE.md` gets an "Architecture knowledge base" section: one intro
sentence and a lookup table (module → file → AIKB doc, plus a
"Cross-cutting" row for `testing.md`). The existing narrative sections are
trimmed to the `src/` layout (the "Node 12–14 era syntax, no ESM" line
goes); the table supplements them.

**Enforcement:** `test/aikb.test.js` asserts every `src/*.js` has a
matching `AIKB/*.md`, and every AIKB doc appears as a row in the
`CLAUDE.md` table. This is what stops the knowledge base rotting.

`llms.txt` §Docs is rewritten for the `src/` layout (it currently describes a
"single-file engine" and links a `README.md` that does not exist at the repo
root — the docs source is `src/partials/readme.md`). A root `README.md` is
added (generated or copied from that source) so the link resolves, with the
"Migrating from v1" note.

## Rollout order

Each step leaves `npm test` and the six examples green.

1. Vitest harness + `package.json` scripts; **characterization tests
   against the current monolith** (`test/integration/`).
2. Behavior fixes 1 and 2 (handled `_promises`, awaited writes /
   `generate()` / `complete()`) — needed so those tests are deterministic.
3. ESM-convert the monolith in place: `kiss-ssg.js`, `libs/utils.js`,
   `kiss-serve.js`, `docs.js`, `examples/**`, `.eslintrc.cjs`; the
   `process.argv[1]`, `import()`, and `'module.exports'` substitutions;
   dependency pruning.
4. Extract modules **directly as ESM**, one batch at a time with unit
   tests: (a) `utils`, `logger`, `config` (+ fix 3); (b) `handlebars-
   helpers`, `partials`, `assets` with per-instance Handlebars/Remarkable;
   (c) `model-resolver`, `controller-resolver`, `sitemap`; (d) `kiss-page`
   (+ fix 4), `dev-server`, `watcher` with handles and `close()`.
5. Reduce `kiss.js` to the orchestrator; delete root `kiss-ssg.js`,
   `kiss-serve.js`, `libs/`; point `main` at `src/kiss.js`.
6. `AIKB/*.md`, `CLAUDE.md` table + trim, `test/aikb.test.js`, `llms.txt`,
   root `README.md`.

## Model delegation

Implementation is dispatched task-by-task to subagents with an explicit
`model`, following the superpowers subagent-driven-development pattern.
**Fable (the main session) writes no implementation code**: it reviews each
subagent's `git diff` + test output against this spec, then dispatches the
next task. Every task in the implementation plan carries a `model:` tag.

| Tier | Work items |
|---|---|
| **Sonnet** — mechanical, well-specified, pure | Vitest harness + scripts; dependency pruning; `.eslintrc.cjs` + fixing its plugin refs; `utils`, `logger`, `config` (+ fix 3), `sitemap` extractions with unit tests; ESM syntax conversion of `examples/**` and `docs.js`; AIKB docs from the template; `CLAUDE.md` table; `test/aikb.test.js`; `llms.txt` / `README.md` |
| **Opus** — judgment about current behavior, mocking design | Characterization test suite (fixtures, what to assert); ESM conversion of the engine (`process.argv[1]`, `import()` with `default ?? module`, `'module.exports'` export); `handlebars-helpers` / `partials` / `assets` with per-instance Handlebars+Remarkable; `model-resolver` / `controller-resolver`; `kiss-page` with awaited writes + fix 4 |
| **Fable** — async/lifecycle semantics, cross-cutting | Behavior fixes 1 and 2 (`_promises` handling, awaited `generate()`, `complete()` awaiting in-flight renders); `watcher` + `dev-server` handles and `close()`; final `kiss.js` orchestrator reduction with the full suite green |
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
