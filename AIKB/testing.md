# Testing

Cross-cutting notes on how tests in `test/` are organized and written — not a per-module doc, so it's free-form and not required to follow the five-heading template.

## Layout

- `test/unit/` — one file per `lib/` module _except the orchestrator_ (`lib/kiss.js` has no `test/unit/kiss.test.js`), exercising each in isolation (mostly pure functions, or a module with its dependencies passed in via DI). It also covers `scripts/` — the dev tooling the branch ritual runs (`base-branch`, `gates`, `check-staged-format`) is outside the engine, so nothing else exercises it. Those tests target the pure decision core each script exports; the I/O wrapper below it stays thin and untested.
- `test/integration/` — cross-module behavior driven through the public `Kiss` API: lifecycle (`generate`/`complete`), dedupe, config resolution, watch mode, ESM/CJS interop, and a broader "characterization" suite. This is where `lib/kiss.js` itself is covered — end-to-end through its public API rather than in a dedicated unit file.
- `test/helpers/site.js` — `makeSite(files)` creates an isolated temp-dir site (under `os.tmpdir()`) and returns `{ root, src, build, folders, read, exists, touch, cleanup }`; `waitFor(predicate, { timeout, interval })` polls until a predicate is true (used for watch-mode assertions) or throws after `timeout`. Paths are returned with forward slashes because the engine compares and slices paths as posix throughout (`utils.posixPath`).
- `test/helpers/kiss.js` — re-exports `Kiss`/`utils` from `lib/kiss.js` and `ENTRY` (`path.resolve('lib/kiss.js')`), so integration tests import one thing instead of reaching into `lib/` directly.
- `test/aikb.test.js` — the sync test covered by this doc's own CLAUDE.md table row: fails if a `lib/` module has no `AIKB/` doc, a doc isn't listed in `CLAUDE.md`'s lookup table, or a doc drops one of the five required headings.

## Commands

```bash
npm test                        # vitest run — full suite, single pass
npx vitest run <file>            # a single test file
npm run test:watch              # vitest, watch mode
npm run test:coverage           # vitest run --coverage
npm run lint                    # eslint . (flat config, eslint.config.js)
```

## Conventions

- Pass `logger: silentLogger` (from `lib/logger.js`) into `new Kiss(...)` in any test that doesn't specifically assert on log output — keeps `npm test` output clean.
- Dev-mode / watcher tests mock the dev server rather than binding a real port for every test: `vi.mock('../../lib/dev-server.js', () => ({ startDevServer: () => ({ ready: Promise.resolve(), close: async () => {} }) }))` before importing `Kiss`. The mock must include `ready` — the `Kiss` constructor does `this._devServer.ready.catch(...)`, and a mock without it throws a `TypeError` that the surrounding `try/catch` swallows into the (silent) logger, so the dev-mode test would pass for the wrong reason.
- Any test that calls `.watch()` (directly or via `{ dev: true }`) must `await kiss.close()` in `afterEach` — otherwise chokidar's open watchers keep the process/worker alive and can hang the test run.
- `watch({ entry: null })` is the standard way to disable the entry-script watcher in tests (see `lib/watcher.js` — there's no real "entry script" when `Kiss` is constructed from a test helper).
- `test/integration/esm.test.js` verifies `require('kiss-ssg')` still works from CommonJS by spawning a real `node` process on a generated `.cjs` file (via `execFile`) — this can't be tested in-process because Vitest itself runs under ESM.

## Gotchas

- `npm run lint`'s `@eslint/js` (v10) requires Node ≥22.13, even though the package's own runtime floor (`package.json`'s `engines.node`) is 22.12 — on Node 22.12.x exactly, `npm test` passes but `npm run lint` may refuse to run.
- Dev-mode examples (`examples/*.js` run via `npm run eg1` etc., when they pass `dev: true`) and `node docs` (`docs.js`) start a server and **never exit on their own** — don't run them bare in an automated/agent context. Use `timeout 10 node <script>` in Git Bash (or equivalent) to smoke-run them and let the timeout kill the process.
- `docs/` is emptied by `docs.js` on every run (`cleanBuild: true`, the default) — nothing hand-written can live there. Specs and implementation plans belong in `planning/` (`planning/specs/`, `planning/plans/`), never under `docs/`.
- The CJS interop test (`test/integration/esm.test.js`) spawns a real `node` binary on a `.cjs` file via `execFile` — a slow or misconfigured `node` on `PATH` shows up as a test timeout there, not an assertion failure.
