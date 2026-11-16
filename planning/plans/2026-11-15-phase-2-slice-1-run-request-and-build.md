# Work order: Phase 2, slice 1 — the run request and `kiss-ssg build`

One of five orders for [the approved spec](../specs/2026-11-15-command-runs-build.md) (`fad6eeb`).
Read this order, the spec sections it cites and `CLAUDE.md`. Nothing else is needed. This is the
first engine slice: it ends with a stop for a Codex review.

## Rules for the implementer

- **You do not commit, stage, branch or push.** The operator's diff review is the checkpoint.
- **No text reaches a file through the shell.** Write and Edit only: no heredoc into a file, no
  `echo >`, `sed -i` or `node -e` that writes. Scratch files too.
- **Before any build or test run**, check nothing is listening, in PowerShell, and read the answer
  before starting anything:

  ```
  Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen
  ```

  Expected: no rows (PowerShell reports no matching objects). Any row: stop and ask.

- Do not run `npm run gates`. The `budgets` gate will fail on `coreLines` and `claudeMdBytes`
  from this slice on; that is expected, and slice 5 re-records them. Never run
  `node scripts/budgets.mjs --record`.
- Start no dev server and no watcher in this slice.
- Change nothing outside "Paths in scope". Mention an unrelated problem; do not fix it.

## Objective

`kiss-ssg build [script] [args…]` runs a site's script as a child and sets the exit code; the
mode reaches the engine through a preload, with the `KISS_*` variables kept as aliases; a build
that exits without `complete()` warns and exits 1; `check`, `aikb` and `images` run on the same
runner.

## Paths

**In scope:** `lib/run-state.js`, `lib/run-preload.js`, `lib/run-script.js` (new);
`lib/kiss.js`, `lib/check.js`, `lib/images-sweep.js`, `lib/build-finish.js`,
`lib/build-report.js`; `bin/kiss-ssg.js`; `test/unit/run-state.test.js`,
`test/unit/run-preload.test.js`, `test/unit/run-script.test.js`, `test/unit/check.test.js`,
`test/unit/images-sweep.test.js`, `test/unit/build-report.test.js`,
`test/integration/run-build.test.js`, `test/integration/no-complete.test.js`,
`test/integration/run-mode.test.js`, `test/integration/two-copies.test.js`,
`test/integration/check.test.js`, `test/integration/images-sweep.test.js`; `types/**` (generated
only); `AIKB/run-state.md`, `AIKB/run-preload.md`, `AIKB/run-script.md`, `AIKB/kiss.md`,
`AIKB/check.md`, `AIKB/images-sweep.md`, `AIKB/build-finish.md`, `AIKB/build-report.md`,
`AIKB/upstream.md`; `CLAUDE.md`, `GUIDE.md`, `llms.txt`, `README.md`.

**Out of scope:** `lib/dev-server.js`, `lib/pipeline.js`, `lib/watcher.js`, `lib/rebuild.js`
(slice 3); `lib/kiss-page.js`, `lib/page-registry.js`, `lib/links.js`, `lib/model-resolver.js`,
`lib/controller-resolver.js`, `lib/handlebars-helpers.js` (slice 2); `lib/init.js`, `starter/**`,
`examples/**`, `package.json` (slice 4); `plugins/**`, `CHANGELOG.md`, `scripts/**`,
`planning/budgets.json` (slice 5); `planning/**` always.

## Assumptions

Measured at `fad6eeb` unless marked. `git diff --stat acc73dd fad6eeb -- lib bin test scripts`
is empty, so the spec's `file:line` references hold.

- [M] The engine reads the run from the environment in four places: `lib/kiss.js:777`,
  `lib/build-finish.js:85`, `:252`, `:651`.
- [M] Check mode overrides the config at `lib/kiss.js:782-785`; `_setupFolders()` is first called
  at `:799`; whether a config key was given is read from the constructor's argument at `:721`.
- [M] `complete()` builds its rejection at `lib/kiss.js:1668-1689`.
- [M] `bin/kiss-ssg.js` spawns at `:133` (`images`) and `:558` (`check`, `aikb`); the "no build
  report" line is `:611-614`; `test/integration/check.test.js:423` asserts it.
- [M] `parseArgs` is `lib/check.js:237`; `parseImagesArgs` reads its script at
  `lib/images-sweep.js:140-170`; `resolveEntry` is `lib/watcher.js:68`.
- [M] `formatReport` is `lib/build-report.js:681-696`; `exitCodeFor` is `lib/check.js:708`.
- [M] Tests make a site under the OS temp with `makeSite` (`test/helpers/site.js`) and import
  the engine by file URL (`test/integration/check.test.js:13-18`). `scripts/red-first.mjs` copies
  only the test file to the base, so a new test must build its own fixtures inline.
- [M, Node 24 only] The four probes of step 1. On 22.23.4 they are [I] until step 1 runs.
- [M] `npx -y -p node@22.23.4 node --version` prints `v22.23.4`, exit 0 (main session,
  2026-11-15).
- [I] A second copy of the engine can be made for the two-copy test by copying `lib/` and
  `package.json` to `<temp>/node_modules/kiss-ssg/` and linking that folder's `node_modules` to
  the repo's with `fs.symlinkSync(target, link, 'junction')`.

## Steps

1. **Floor probes, before any code.** Get Node 22.23.4: `npx -y -p node@22.23.4 node --version`.
   Write, with the Write tool, under the OS temp: a preload `preload.mjs` that stores
   `Object.fromEntries(new URL(import.meta.url).searchParams)` on
   `globalThis[Symbol.for('probe')]`, and on `?handle=1` adds only
   `process.on('uncaughtException', (err, origin) => { console.error('caught', origin, err.message); process.exitCode = 1 })`,
   and on `?before=1` adds `process.on('beforeExit', () => { console.error('beforeExit'); process.exitCode = 1 })`;
   an ESM entry (folder with `{"type":"module"}`) and a CommonJS entry (folder with no `type`),
   each printing `process.argv.slice(2)`, the global and `process.ppid`, the CommonJS one also
   `require.main === module`. Give each a mode chosen by `argv[2]`: reject (ESM: a rejected
   top-level `await`; CommonJS: an unhandled `Promise.reject`), `return` (CommonJS top-level
   `return`), `exit0` (`process.exit(0)`). Run each with
   `npx -y -p node@22.23.4 node --import "file:///<abs>/preload.mjs?mode=check&x=a%20b" <entry> one --two`.
   - verify: version prints `v22.23.4`. Query values arrive (`x` is `a b`); `argv` is
     `["one","--two"]` in both; the entry run as `node cjs/entry` (no extension) resolves;
     `require.main === module` is `true`; `return` mode exits 0 without `?before` and prints
     `beforeExit` and exits 1 with it; `exit0` with `?before=1` prints no `beforeExit` and exits
     0; both reject modes with `?handle=1` print `caught unhandledRejection …`, no stack dump,
     exit 1; `process.ppid` equals the pid of the process that spawned it when spawned from a
     Node parent with no shell.
   - Any difference: **stop and ask.** Delete the scratch files afterwards.

2. **`lib/run-state.js`** (spec § 4.2, § 4.5, § 4.6). No module-level state. Functions over one
   object at `globalThis[Symbol.for('kiss-ssg.run')]`, created on first touch:
   `{ v: 1, request, live: Set, unsettled: Set, armed: { beforeExit, uncaught, channel } }`.
   Export: `runState()`; `currentRun(env = process.env)` (the request when set, else the same
   shape from `KISS_CHECK`, `KISS_AIKB`, `KISS_REPORT`, `KISS_IMAGES`, `KISS_IMAGES_REFRESH` by
   `CHECK_MODE_OFF`'s rule, `mode: null` when neither says); `register(instance)`,
   `settled(instance)`, `closed(instance)`; `unsettledMessage(instance)`. A `v` other than 1
   throws, naming both. `register` adds to `live`, and to `unsettled` unless `config.dev`; the
   first unsettled instance arms one `beforeExit` listener behind `armed.beforeExit`. The
   listener removes each instance from the set **before** anything else, logs § 4.5's message
   through `instance.logger.error`, sets `process.exitCode = 1`, then awaits `instance.close()`.
   Only `lib/logger.js` imports `colors`.
   - verify: `npx vitest run test/unit/run-state.test.js` → all pass. Cover: request only; alias
     only; both (the request wins); unknown `v` throws; a dev instance is never unsettled;
     `settled` and `closed` remove; the listener is armed once for two instances.

3. **`lib/run-preload.js`** (spec § 4.2, § 5.4). Side effects on import, guarded: do nothing
   unless `isMainThread` and `process.ppid === request.owner`. Decode `?run=` from
   `import.meta.url`, store it as `runState().request`. Install one `uncaughtException` listener
   behind `armed.uncaught`: an error carrying `Symbol.for('kiss-ssg.buildFailure')` sets
   `process.exitCode = 1` and returns (in `mode: 'dev'` it only returns); anything else is
   printed with `console.error(err)` and the process exits 1. Export the pure parts
   (`decodeRun(url)`, `isBuildFailure(err)`) for the unit test. No IPC in this slice.
   - verify: `npx vitest run test/unit/run-preload.test.js` → all pass.

4. **The engine reads the request** (spec § 4.2, § 4.3, § 4.5). In `lib/kiss.js`:
   - `:777` reads `currentRun()`; `lib/build-finish.js:85`, `:252`, `:651` read it too. Leave
     `checkModeRequested`, `aikbRecordRequested` and `sweepRequest` exported; `currentRun` may
     call them for the alias half.
   - Apply § 4.3's table exactly, before `_setupFolders()`. The two refusals throw the two
     messages quoted in § 4.3, with the script's basename from `process.argv[1]`.
   - Mark the rejection built at `:1668` with `Symbol.for('kiss-ssg.buildFailure')` set to `true`.
   - `register(this)` at the end of the constructor; `settled(this)` when `complete()`'s settle
     path finishes, resolved or rejected; `closed(this)` in `close()`.
   - Add `static get mode()` returning `currentRun().mode`, with JSDoc.
   - verify: `npx vitest run test/integration/run-mode.test.js` → all pass. It spawns
     `node --import <preload URL> build.js` with every `KISS_*` alias removed from the env and
     asserts a staged check; spawns with `KISS_CHECK=1` and no preload and asserts the same;
     `KISS_REPORT` and `KISS_AIKB` likewise on both paths; each row of § 4.3's table; each
     refusal exits 1 and leaves the build folder absent.
   - verify: `npx vitest run test/integration/no-complete.test.js` → all pass. A script with a
     failing page and no `complete()`, run as `node build.js`: exit 1, the warning once, ESM and
     CommonJS; under `cleanBuild: 'atomic'` no `*.kiss-staging-*` sibling is left; a script that
     awaits `complete()` prints no warning.

5. **`lib/run-script.js`, and the parse** (spec § 4.1, § 4.2, § 4.4, § 5.1).
   - `lib/check.js` `parseArgs`: add `'build'` to the commands; apply § 4.4 (default
     `router.js`; how an option is told from the script; `build` keeps no word after the
     script). `lib/images-sweep.js` `parseImagesArgs`: the default script. Update `HELP`.
     `'dev'` stays unknown until slice 3.
   - `run-script.js` exports, all pure except the last: `resolveScript(name, cwd)` (through
     `resolveEntry`; the error text of § 4.4); `engineGate(engine)` (refuse `build` when the
     folder `describeEngine` found has no `lib/run-preload.js`; pass when it found none);
     `spawnPlan({ command, script, args, reportFile, … })` → `{ execArgv, args, env, stdio }`
     (the `--import` URL of this copy's `run-preload.js` with `?run=`; `owner: process.pid`;
     aliases exported for `check`, `aikb`, `images`; for `build` exactly the five alias names
     deleted from the env; stdio `[0, 2, 2]` for `check`, `aikb`, `images`, inherited for
     `build`); `runScript(plan, { spawn })` → a promise of `{ status, signal, error }`, which on
     the command's SIGINT or SIGTERM ends the child (`taskkill /pid <pid> /T /F` on Windows,
     `SIGTERM` elsewhere) and resolves with a non-zero status.
   - `lib/build-report.js`: `formatVerdict(report)` — `formatReport`'s first line, then one line
     per failure holding only `buildTo ?? view` (spec § 5.1 step 3).
   - verify: `npx vitest run test/unit/run-script.test.js test/unit/check.test.js test/unit/images-sweep.test.js test/unit/build-report.test.js`
     → all pass.

6. **`bin/kiss-ssg.js`.** A `build` wrapper: parse, resolve, engine line, gate, run, read the
   reports, print `formatVerdict` per report on stderr, `process.exitCode = exitCodeFor(…)`.
   `check`, `aikb` and `images` call `runScript` where they called `spawnSync`. The "no build
   report was written" line prints only when the child exited 0; for `build` the same condition
   prints "the script exited without settling a build". No decision lives in `bin/`.
   - verify: `npx vitest run test/integration/run-build.test.js` → all pass. An ESM and a
     CommonJS site; arguments arrive as `process.argv.slice(2)`; exit 0 with one verdict line; a
     failing page gives exit 1, its message exactly once in stderr, its path once in the
     verdict, and no `AggregateError` in the output; no script named → `router.js`;
     `build production` is a usage error; `build --atomic` is a usage error naming
     `kiss-ssg build router.js --atomic`; a `node_modules/kiss-ssg` without `lib/run-preload.js`
     is refused.
   - verify: `npx vitest run test/integration/check.test.js test/integration/images-sweep.test.js`
     → all pass, with `:423`'s assertion moved to the engine's warning.
   - verify: `npx vitest run test/integration/two-copies.test.js` → all pass. The command from
     this repo, the engine from a copy in the fixture's `node_modules`, no aliases in the env
     for the direct-path cases: a check is staged; a no-`complete()` script warns exactly once;
     a failed `build` prints no dump.

7. **Docs, same change.**
   - `AIKB/run-state.md`, `AIKB/run-preload.md`, `AIKB/run-script.md`, each with the headings
     `## Responsibility`, `## Public interface`, `## Depends on`, `## Depended on by`,
     `## Non-obvious behavior`; three rows in `CLAUDE.md`'s table; one line for
     `npx kiss-ssg build` in its Commands block. Update the other `AIKB/` docs in scope;
     `AIKB/upstream.md` gains the ESM cache (nodejs/node#61767, how to re-check) and how Node
     routes a rejected top-level `await`.
   - `GUIDE.md` § The build script and § Checking a build: `kiss-ssg build`, the default script,
     `Kiss.mode`, § 4.3's refusals, the no-`complete()` exit. Add no new `##` or `###`.
   - `llms.txt`: make the three cuts of spec § 7 (line 13's `.catch(reportBuildFailure)`; line
     13's words after "`kiss-ssg init` writes them" inside the brackets; line 139's clause
     listing three audit findings "until fixed"), then add one sentence on line 139 for `build`,
     the default script and `Kiss.mode`, **leaving at least 45 characters** under 15,997 for
     slice 3's `dev` clause.
   - `README.md`: one line for `kiss-ssg build` beside `kiss-ssg check`'s (`:86`).
   - `npm run types`.
   - verify: `npx vitest run test/aikb.test.js test/unit/types.test.js test/unit/skill-coverage.test.js`
     → all pass.
   - verify: `node scripts/budgets.mjs` → the `llmsTxtChars` row reads 15952 or less.
   - verify: `node docs` → exits 0 (check the ports first).

8. **Whole-slice checks.**
   - verify: `npm test` → exits 0, and its output contains no `was built without complete()`.
   - verify: `npm run lint` → exit 0. `npm run typecheck` → exit 0. `npm run format:check` →
     exit 0.
   - verify: `node scripts/scope-check.mjs` → exit 0.
   - verify: `node scripts/budgets.mjs` → `privateReach`, `anyAnnotations` and
     `testPrivateReach` are `same` or `better`. `coreLines` and `claudeMdBytes` are `worse`:
     expected, report the numbers.

9. **Stop.** Report the diff's size per file. The main session runs the Codex review and puts
   the largest diff to the operator. Do not start slice 2.

## Red-first

Run `node scripts/red-first.mjs <file>` for each and report the printed line; exit 0 is wanted:
`test/integration/run-build.test.js`, `test/integration/no-complete.test.js`,
`test/integration/run-mode.test.js`, `test/integration/two-copies.test.js`. Read the output: a
failure for a missing import proves less than a failed assertion, so say which it was.

## Expected size

`lib/` and `bin/`: 550 to 750 lines added, about 60 removed. Tests: 500 to 800. `AIKB/`,
`CLAUDE.md`, `GUIDE.md`, `README.md`: 200 to 300. Report the real numbers
(`git diff --stat`); more than half as much again is a reason to stop and ask.

## Stop and ask

- Any step 1 probe differs on 22.23.4, or that Node cannot be had.
- `beforeExit` fires inside `npm test` (the warning text appears, or the exit code changes).
- The `llms.txt` sentence does not fit with 45 characters to spare.
- A unit test of an existing module must change for a reason this order does not name.
- The two-copy fixture cannot resolve the engine's dependencies through a junction.
- § 4.3 needs a case the table does not have (for example `dev` given as a non-boolean).
- Anything needs a file outside "Paths in scope".

## Single-test command

```
npx vitest run test/unit/run-state.test.js
```
