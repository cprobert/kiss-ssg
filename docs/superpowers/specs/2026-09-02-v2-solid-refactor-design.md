# kiss-ssg v2: SOLID refactor, Vitest, AIKB knowledge base

Status: approved design, ready for implementation planning
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
2. Add a Vitest test suite (unit + integration) so future changes have a
   safety net.
3. Migrate to ESM, since splitting into multiple files is the natural point
   to also drop CommonJS.
4. Introduce an `AIKB/` knowledge base — one doc per module — with a lookup
   table in `CLAUDE.md`, so future coding agents can find non-obvious
   architecture knowledge without it bloating `CLAUDE.md` itself.

## Non-goals

- No public API changes. `Kiss` keeps `.page()`, `.pages()`, `.scan()`,
  `.generate()`, `.complete()`, `.sitemap()`, `.watch()`, and the same config
  shape. Existing consumer code (and all `examples/*.js`, updated only for
  ESM syntax) keeps working unchanged.
- No new features. This is a structural refactor plus test coverage plus
  documentation, not new SSG capability.
- No full dependency-injection framework. Testability comes from Vitest's
  `vi.mock()` on `fs-extra`/`glob`/`sass` at the module boundary, plus one
  injected `logger`, not from constructor-injecting every collaborator.

## Architecture

### File layout

```
src/
  kiss.js               # orchestrator, public API (was kiss-ssg.js's Kiss class)
  kiss-page.js           # KissPage class (page-level render/write)
  logger.js              # injectable logger, wraps colors+console
  config.js              # default config + folder derivation/merge
  handlebars-helpers.js  # registerHandlebarsHelpers factory
  partials.js            # registerPartials / _registerPartials
  assets.js              # copyAssets + sass compilation
  model-resolver.js      # _processPageModel / _readModel / _prepareModelsFromFolder
  controller-resolver.js # _detectControllerType / _controllerRun
  sitemap.js             # sitemap.xml generation
  dev-server.js          # was kiss-serve.js
  watcher.js             # watch()
  utils.js               # was libs/utils.js; resolve.alias/deployAlias dropped (dead code, unused anywhere in the repo)
```

`package.json`:
- `"version": "2.0.0-alpha.0"`
- `"type": "module"` added
- `"main"` points to `src/kiss.js`
- root `kiss-ssg.js` is removed (consumers `require('kiss-ssg')` / `import
  Kiss from 'kiss-ssg'`, which resolves via `main` — no one depends on that
  filename directly)
- `node-fetch` dependency dropped (see ESM migration below)

`examples/*.js` and `docs.js` are updated to ESM `import` syntax; behavior
and output are unchanged. `libs/` folder is removed (`utils.js` moves to
`src/`, `libs/on-ice/` — already-dead shelved code per existing `CLAUDE.md`
note — is deleted, not migrated).

### Module responsibilities

- **`kiss.js`** — thin orchestrator. Owns `_stack`/`_promises`, composes the
  other modules, exposes the public API exactly as today. Holds no
  business logic of its own beyond wiring.
- **`kiss-page.js`** — one page's render lifecycle: template compilation,
  slug/path/extension inference, minification, livereload injection, writing
  output + dev debug JSON. Same responsibility as today's `KissPage`, just
  extracted.
- **`logger.js`** — wraps `console` + `colors` behind a small interface
  (`info`/`warn`/`error`/`debug`, matching current message severities).
  Default export is the colored-console logger (so runtime behavior is
  unchanged); tests inject a silent/spy logger. This is the one seam that's
  actually constructor-injected (into `Kiss`, then passed down), because
  every other module benefits from being able to assert on or silence it in
  tests.
- **`config.js`** — pure functions: default config object, folder derivation
  from `config.folders.src`, deep-merge with user config. No I/O.
- **`handlebars-helpers.js`** — factory `registerHandlebarsHelpers(handlebars,
  config, { markdownRenderer })` registering `markdown`, `sass`, `offset`,
  `stringify`, `isActive`, `env`. Same behavior as today.
- **`partials.js`** — registers `.hbs`/`.html`/`.md` partials and layouts
  into the shared Handlebars instance from configured folders.
- **`assets.js`** — compiles `*.scss`/`*.sass` under the assets folder and
  copies the rest straight through to build, excluding raw Sass sources.
  Same behavior as today's `copyAssets`.
- **`model-resolver.js`** — resolves `options.model` (JSON filename / URL /
  plain object / folder-of-JSON) to page data. Uses native `fetch` (see
  below) instead of `node-fetch`.
- **`controller-resolver.js`** — resolves and runs `options.controller`
  (function or filename), same title-auto-mapping fallback as today.
- **`sitemap.js`** — builds and writes `sitemap.xml` from the page stack,
  same per-page overrides (`ignoreSitemap`, `sitemapPriority`,
  `sitemapChangefreq`, `sitemapLastmod`) and `overwrite` behavior as today.
- **`dev-server.js`** — the `connect` + `serve-static` + `livereload` dev
  server (was `kiss-serve.js`), unchanged behavior.
- **`watcher.js`** — `chokidar`-based rebuild-on-change logic, including the
  entry-file-changed-so-rebuild-everything case (see ESM migration note on
  `process.argv[1]`).
- **`utils.js`** — pure string/path helpers (`trimLines`, `toSlug`,
  `toTitleCase`, `trimPath`, `sanitizePath`). Dead `resolve.alias` /
  `resolve.deployAlias` / `stripStartingSlash` code removed (confirmed
  unused anywhere in the repo other than by each other).

Data flow (`.page()` → stack → `.generate()`) is unchanged from today —
this refactor changes *where* the logic lives, not the pipeline shape or
its async/promise structure.

## ESM migration

- `node-fetch` → native `fetch` (Node ≥22 has it globally). Used directly in
  `model-resolver.js`. No behavior change.
- `module.parent.filename` (used in `watch()` to detect the caller's entry
  script and trigger a full rebuild when it changes) does not exist under
  ESM. Replaced with `process.argv[1]` (the script Node was invoked with) —
  equivalent for the actual usage pattern (`node examples/1-scan.js`).
  Covered by an integration test that touches the entry file and asserts a
  full rebuild fires.
- `require.main.require(controllerPath)` (dynamic controller loading by
  filename) becomes `await import(pathToFileURL(controllerPath).href)` —
  controller loading becomes properly async, which is fine since it already
  runs inside an async model-resolution promise chain. Public behavior
  (controller receives/returns the options object) is unchanged.
- No `__dirname`/`__filename` usage exists in the current codebase, so no
  shimming needed there.
- `colors` is imported for its `String.prototype` side effects (`import
  'colors'`) — same effect under ESM.

## Testing (Vitest)

- Dev dependencies: `vitest`, `@vitest/coverage-v8`.
- `package.json` scripts: `test` (single run), `test:watch`.
- **Unit tests**, one spec per `src/` module:
  - `utils.js` — pure functions, no mocking.
  - `config.js` — folder derivation/merge logic.
  - `model-resolver.js` — string/object/URL/folder branches; `fetch` and
    `fs-extra` mocked via `vi.mock()`.
  - `controller-resolver.js` — function / string / missing-file branches.
  - `sitemap.js` — XML shape, per-page overrides, `overwrite: false` skip.
  - `handlebars-helpers.js` — each helper exercised against a throwaway
    Handlebars instance.
  - `kiss-page.js` — slug/path/extension inference, extensionless mode,
    minification invocation (minifier itself not re-tested).
  - `logger.js` — locks the interface other modules code against.
- **Integration tests**: a small number of tests that instantiate a real
  `Kiss` against a temp directory (fixtures shaped like `examples/*`) and
  assert on actual files written to `public/`, covering
  `.page()`/`.pages()`/`.scan()`/`.generate()`/`.sitemap()`/`.watch()`
  end-to-end. These replace ad hoc `node examples/N` verification with
  automated coverage; `examples/*.js` remain as manual/demo scripts.

## AIKB knowledge base

New `AIKB/` folder at repo root, one doc per `src/` module (mirrors the file
layout 1:1):

```
AIKB/
  kiss.md
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
```

Each doc follows a fixed template:
- **Responsibility** — one paragraph.
- **Public interface** — what other modules call.
- **Depends on** — modules/packages it uses.
- **Depended on by** — modules that use it.
- **Non-obvious behavior/gotchas** — the *why*, not the *what*: things not
  derivable from reading the module's own code, or scattered across call
  sites (e.g. why `watcher.js` uses `process.argv[1]` instead of
  `module.parent`, why `sass` helper output style depends on `config.dev`).

`CLAUDE.md` gets a new "Architecture knowledge base" section: a short intro
sentence plus a lookup table (module → file → AIKB doc). The rest of
`CLAUDE.md`'s existing narrative (Requirements, Commands, Architecture
overview) is trimmed to match the new `src/` layout but stays — the table
supplements it rather than replacing it.

## Rollout order (for the implementation plan)

Suggested sequence — each step keeps the test/example suite green before
moving on:
1. Add Vitest + scripts, no source changes yet (establishes the harness).
2. Extract `utils.js`, `logger.js`, `config.js` (pure/simple, low risk),
   with unit tests.
3. Extract `handlebars-helpers.js`, `partials.js`, `assets.js`, with unit
   tests.
4. Extract `model-resolver.js`, `controller-resolver.js`, `sitemap.js`, with
   unit tests, including the `node-fetch` → native `fetch` swap.
5. Extract `kiss-page.js`, `dev-server.js`, `watcher.js` (including the
   `process.argv[1]` substitution), with unit tests.
6. Reduce `kiss.js` to the orchestrator composing all of the above; add
   integration tests.
7. Convert the whole repo (`src/`, `examples/*.js`, `docs.js`,
   `package.json`) to ESM in one pass (since intermediate mixed
   CommonJS/ESM state is awkward to keep working); re-run full suite +ex
   amples manually.
8. Delete root `kiss-ssg.js`, `libs/` folder; update `package.json` `main`.
9. Write `AIKB/*.md` docs and the `CLAUDE.md` lookup table + trimmed
   architecture section.
10. Update `llms.txt` if any file paths/examples it references changed.

## Open risks

- `process.argv[1]` as a substitute for `module.parent.filename` is a
  behavioral approximation, not an exact equivalent — flagged above and
  covered by an integration test rather than assumed correct by inspection.
- Converting the whole repo to ESM in one pass (step 7) is the single
  highest-blast-radius step; doing it after modules are already extracted
  and unit-tested (rather than as the first step) means each module's
  *logic* is already verified before the syntax migration, isolating ESM
  migration risk to import/export mechanics rather than mixing it with
  behavioral changes.
