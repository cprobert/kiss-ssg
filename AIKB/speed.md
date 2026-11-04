# speed.js

## Responsibility

`kiss-ssg speed`: Lighthouse's performance KPIs for a built site or a URL, the median of several runs per page, and the change against an earlier measurement. Every decision is a pure function here; the orchestration (`measure`) takes Lighthouse and chrome-launcher as arguments, and `runSpeed` is the whole command for `bin/kiss-ssg.js` to print. Lighthouse is an **optional peer dependency** (`package.json` `peerDependencies` + `peerDependenciesMeta.optional`), loaded from the site's folder: kiss-ssg installs nothing for it, and a site without it hears nothing until it runs this command.

## Public interface

- `SPEED_HELP` — the command's help text.
- `parseSpeedArgs(argv)` → `{ target, pages, runs, out, against, help, error }`. `--page` repeats and must start with `/`; `pages` is `null` when none was given. `--runs` is a whole number from `MIN_RUNS` (1) to `MAX_RUNS` (9), `DEFAULT_RUNS` (3) when absent. One target.
- `resolveTarget(target, { cwd, isDirectory, isFile })` → `{ kind: 'url', base, page }` (an `http(s)` URL: `base` its origin, `page` its path and query, the default page), `{ kind: 'folder', folder }` (resolved against `cwd`), or `{ kind: 'error', error }` — a file (a site's build script) or a path that does not exist.
- `nodeAtLeast(version, floor = MIN_NODE)` — `MIN_NODE` is `22.19.0`, Lighthouse 13's own `engines.node`. kiss-ssg's floor stays 22.12.
- `kpisFrom(lhr)` → `{ version, values }` or `{ error }`. `values` has one entry per `METRICS` key: `score` (the performance category ×100, rounded, as Lighthouse prints it), the `numericValue` of `largest-contentful-paint`, `cumulative-layout-shift`, `total-blocking-time`, `first-contentful-paint`, `speed-index` and `total-byte-weight`, and `requests` (the length of `network-requests`' `details.items`).
- `METRICS` — `{ key, label, unit }` per KPI, in table order. The keys are Lighthouse's audit ids, so the JSON can be looked up against Lighthouse's docs.
- `median(values)`, `summarise(runs)` → `{ median, spread }`, a `{ min, max }` spread for every metric.
- `speedRecord({ lighthouse, runs, pages })` → `{ version: 1, lighthouse, runs, pages }`, the `--out` file; `readSpeedFile(text)` reads one back and throws on anything else.
- `diffSpeed(before, after)` → `{ pages, warnings }`: per page, every metric's `before`, `after`, `delta`, `noise` and `changed`; a page on one side only is `{ page, only: 'before'|'after' }`; a page that failed on either side is `{ page, error }`. A Lighthouse version change is a warning.
- `formatSpeed(record)`, `formatSpeedDiff(diff)`, `formatValue(unit, value)` — the stdout text.
- `speedExitCode(record)` — 1 when any page failed, else 0.
- `isChromeMissing(err)`, `chromeMissingMessage(err)` — chrome-launcher's `ERR_LAUNCHER_NOT_INSTALLED` and `ERR_LAUNCHER_PATH_NOT_SET`, and the line naming `CHROME_PATH`.
- `loadLighthouse(cwd, { nodeVersion })` → `{ lighthouse, chromeLauncher }` or `{ error }`. `INSTALL_LINE` is the one line printed when it is missing: `npm install -D lighthouse`.
- `serveFolder(root)` → `{ url, close }`: the folder as the site root on `127.0.0.1`, port 0.
- `measure({ base, pages, runs, lighthouse, chromeLauncher, progress })` → `{ lighthouse, pages, fatal }`.
- `runSpeed(argv, { cwd, progress, load, serve })` → `{ code, out, err }`, the whole command. `load` and `serve` are injectable for tests.

## Depends on

`node:fs`, `node:http`, `node:path`, `node:module`, `node:url`; `connect` and `serve-static` (already dependencies, required lazily in `serveFolder`). At run time, the site's own `lighthouse` and the `chrome-launcher` Lighthouse depends on — never imported statically.

## Depended on by

`bin/kiss-ssg.js` (`kiss-ssg speed`), and, through the command, the `kiss-performance` skill, which measures before and after its edits.

## Non-obvious behavior

- **A site script is refused, not run.** The spec asked for `speed <site-script>` to resolve the script's `folders.build` without building. There is no way to learn a script's config short of running it: `new Kiss(config)` is inside arbitrary code, and `kiss-ssg check` learns `buildDir` only from the report of a build it ran. So a file target exits 2 with the instruction to build and name the build folder (`kiss-ssg speed public`). Accepting the script would need a config-only mode in the engine, which is a decision for `lib/kiss.js`, not this module.
- **Lighthouse resolves from the site, chrome-launcher from Lighthouse.** `createRequire(<cwd>/package.json).resolve('lighthouse')`, then `createRequire(<that file>).resolve('chrome-launcher')`, then a dynamic `import()` of each file URL. kiss-ssg's own `node_modules` is never asked: the peer is the site's install. chrome-launcher is Lighthouse's dependency and need not be hoisted, so resolving it from the site's root could miss it. Both packages have `main` and no `exports` (measured on lighthouse 13.6.0, chrome-launcher 1.2.x, 2026-11-04), so `require.resolve` finds the ESM entry.
- **Order of the prerequisite checks:** the arguments, the target and the `--against` file first (a mistyped name costs nothing), then Lighthouse installed, then the Node version, then chrome-launcher. A site with no Lighthouse is told to install it whatever its Node; one that has it on an old Node is told about the Node.
- **Lighthouse's defaults are the measurement.** The flags are `port`, `output: 'json'`, `logLevel: 'error'` and `onlyCategories: ['performance']`, and no config: Lighthouse's default config is the mobile preset with simulated throttling (`configSettings.formFactor: 'mobile'`, `throttlingMethod: 'simulate'` in the real result the fixture is trimmed from).
- **Each run is a fresh Chrome** (`--headless`), killed in a `finally`; a kill that throws is ignored.
- **A page that did not load is a failure, never a score of 0.** Lighthouse still returns a result, with a `runtimeError` (`ERRORED_DOCUMENT_REQUEST` for a 404, measured) and a `null` score. A page stops at its first failed run and gets no median of the runs before it: a median of fewer runs would carry a smaller spread than it should.
- **No Chrome ends the whole command** (exit 2, naming `CHROME_PATH`); any other launch failure fails that page (exit 1).
- **The noise rule.** A metric is `changed` only when `|delta|` is strictly greater than the larger of the two measurements' spreads (max − min). With one run the spread is 0 and any change counts, so `--runs 1` is for a smoke test, not a comparison.
- **Served like the dev server, without its extras.** `serve-static` with `extensions: ['html', 'htm']` and `index.html`, no live reload, no request log, and connect's plain 404 for a missing page (not the site's `404.html`), so a mistyped `--page` fails rather than measuring the error page.
- **Never `folders.aikb`.** `--out` writes where it is told; only `kiss-ssg aikb` writes the knowledge base.
- **Windows, and handles still closing at `process.exit()`.** The bin exits with `process.exit(code)`. Node on Windows aborts (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, exit 3221226505) when that meets a socket still closing; the integration test's first fake Lighthouse fetched the page with `fetch`, whose keep-alive socket triggered it. The fake now uses `node:http` with no agent. A real Lighthouse 13.6.0 run through the bin exited cleanly (2026-11-04, Node 24.14, Windows 11).
- **Tests.** `test/unit/speed.test.js` covers every decision with fakes and a real result trimmed to what is read (`test/fixtures/lighthouse/blog-home.json`, example 11's home page). `test/integration/speed.test.js` drives the bin with a fake `lighthouse` (and a nested fake `chrome-launcher`) in a temp site's `node_modules`; a real Lighthouse is installed into a temp folder and run only with `KISS_LIGHTHOUSE_TESTS=1`.

## Types

`SpeedArgs`, `SpeedTarget`, `Metric`, `Spread`, `MeasuredPage`, `FailedPage`, `SpeedPage`, `SpeedRecord`, `MetricChange`, `PageChange`, `SpeedDiff` (JSDoc typedefs in the module).
