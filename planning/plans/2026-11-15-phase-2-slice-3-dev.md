# Work order: Phase 2, slice 3 — `kiss-ssg dev`

One of five orders for [the approved spec](../specs/2026-11-15-command-runs-build.md) (`fad6eeb`).
Read this order, spec § 4.6, § 5.3 and § 5.4, and `CLAUDE.md`. It follows slices 1 and 2: it uses
`lib/run-state.js`, `lib/run-preload.js` and `lib/run-script.js` as slice 1 left them.

Everything spec § 5.3 and § 5.4 mark [I] was designed without being run. **This slice measures
it**, on Windows here; CI measures POSIX. A measurement that contradicts the spec is a finding to
report, not something to code around.

## Rules for the implementer

- **You do not commit, stage, branch or push.** The operator's diff review is the checkpoint.
- **No text reaches a file through the shell.** Write and Edit only, scratch files included.
- **Before every run that binds a port** (every test in this order does), in PowerShell, and read
  the answer before starting:
  `Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen`. Any row: stop and ask; never
  stop a process you did not start.
- **Never leave a server running.** Every dev run is inside a test with a timeout, or is bounded
  (`timeout 30 node bin/kiss-ssg.js dev …` from Git Bash). Tests use ports they ask the OS for
  (listen on 0, read the port, close), never 3001 or 35729.
- **After every dev run**, confirm nothing is left: the port check above shows no row for the
  ports the run used, and
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,CommandLine`
  shows no process whose command line names the test's temp folder. One left over: stop it only
  if this run started it, and report it as a failure of the stop sequence.
- Do not run `npm run gates` or `node scripts/budgets.mjs --record`.
- Change nothing outside "Paths in scope".

## Objective

`kiss-ssg dev [script] [args…]` builds, serves and watches; the command owns the servers and
restarts the child when the script is edited; stopping leaves no process behind.

## Paths

**In scope:** `lib/dev-supervisor.js` (new); `lib/dev-server.js`, `lib/kiss.js`,
`lib/run-preload.js`, `lib/run-script.js`, `lib/run-state.js`, `lib/check.js`, `lib/pipeline.js`;
`bin/kiss-ssg.js`; `test/unit/dev-supervisor.test.js`, `test/unit/dev-server.test.js`,
`test/unit/run-preload.test.js`, `test/unit/run-script.test.js`, `test/unit/check.test.js`,
`test/unit/pipeline.test.js`, `test/integration/run-dev.test.js`,
`test/integration/two-copies.test.js`, `test/integration/run-mode.test.js`; `types/**`
(generated only); `AIKB/dev-supervisor.md`, `AIKB/dev-server.md`, `AIKB/kiss.md`,
`AIKB/run-preload.md`, `AIKB/run-script.md`, `AIKB/run-state.md`, `AIKB/pipeline.md`,
`AIKB/rebuild.md`, `AIKB/check.md`; `CLAUDE.md`, `GUIDE.md`, `llms.txt`, `README.md`.

**Out of scope:** `lib/watcher.js`, `lib/rebuild.js`, `lib/staging.js` (a need to change one is a
stop-and-ask), `lib/init.js`, `starter/**`, `examples/**`, `package.json`, `plugins/**`,
`CHANGELOG.md`, `scripts/**`, `planning/**`.

## Assumptions

Measured at `fad6eeb` unless marked.

- [M] In dev the constructor starts the server at `lib/kiss.js:875-883`, handles a failed bind
  with `devServerFailed` (`:864-873`), calls `this.watch()` (`:887`) and sends the first reload
  at `:888-892` without looking at failures. `close()` closes `_devServer` at `:2092`.
- [M] `watch({ entry = process.argv[1] })` is `lib/kiss.js:2070`; `resolveEntry(null)` watches
  nothing and prints nothing (`lib/watcher.js:68`, `:116-122`).
- [M] The constructor empties the build folder at `lib/kiss.js:928-934`.
- [M] `startDevServer(root, port, { logger, livereloadPort, host })` returns
  `{ server, livereload, refresh, ready, close }` (`lib/dev-server.js:16-87`).
- [M] The engine's entry watch uses `WRITE_SETTLE` (`lib/watcher.js:42-44`) and an `'error'`
  listener (`:136-138`).
- [M] Pipeline watch processes: detached except on Windows (`lib/pipeline.js:101-109`), ended by
  `signalGroup` (`:126-136`), grace 2 s (`:36`), signal handlers for SIGINT and SIGTERM only
  (`:270-279`).
- [M, Node 24, by the main session] A child with an IPC `message` listener does not exit;
  after `process.channel.unref()` it does, and `beforeExit` fires.
- [I] Everything else about a running session: the IPC handle, the restart, `taskkill /T` on the
  child's tree, that a `spawn` started inside an `exit` listener still runs, that the browser's
  socket survives a restart.

## Steps

1. **Parse and plan.** `lib/check.js` `parseArgs` accepts `'dev'` (spec § 4.4; `dev` takes only
   `--help`). `spawnPlan` for `dev`: stdio `['inherit', 'inherit', 'inherit', 'ipc']`, request
   `{ mode: 'dev', owner }`, plus `restart: true` when asked; the five alias names deleted from
   the env. `engineGate` applies to `dev` as to `build`.
   - verify: `npx vitest run test/unit/check.test.js test/unit/run-script.test.js` → pass.

2. **The child's side of the channel** (spec § 4.6, § 5.3, § 5.4). In `lib/run-preload.js`,
   when the request's mode is `dev` and `process.send` exists, behind `armed.channel`: on
   `{ stop: true }` close every instance in `runState().live`, then `process.exit(0)`; on
   `disconnect` do the same; then `process.channel.unref()`.
   In `lib/dev-server.js` add `linkDevServer({ root, port, host, livereloadPort }, { send, onMessage })`
   returning `{ ready, refresh, close }`: it sends `{ serve: … }`; `ready` resolves on
   `{ serving: true }` and rejects on `{ serveFailed: message }`; `refresh(path)` sends
   `{ reload: path }`; `close()` resolves at once and sends nothing.
   - verify: `npx vitest run test/unit/dev-server.test.js test/unit/run-preload.test.js` → pass
     (fake `send` and `onMessage`; no port bound).

3. **The engine in command dev.** In `lib/kiss.js`, when `currentRun().mode === 'dev'` and
   `process.send` exists: take `linkDevServer` where `startDevServer` is called; call
   `this.watch({ entry: null })`; send the first reload only when `this._failures.length === 0`
   after the first settle; with `restart: true`, skip the `emptyDirSync` at `:928-934`. Without
   a command, nothing changes.
   - verify: `npx vitest run test/integration/run-mode.test.js` → pass, with a new case: a child
     forked with the preload and a `dev` request sends one `serve` message and, after a build
     with no failure, one `reload`; with one failing page, no `reload`.

4. **`lib/dev-supervisor.js`** (spec § 5.3, § 5.4). The dev session in the command. Keep the
   decisions pure and injectable (`spawn`, `startDevServer`, `watch`, a clock):
   - one server pair per `host:port`; a `serve` for a pair already serving the same root
     answers `serving` and changes nothing; a different root on a taken port answers
     `serveFailed`; a restart whose `serve` values changed closes the old pair, starts the new
     and says so;
   - `reload` calls the server's `refresh`;
   - a chokidar watch on the resolved script with `WRITE_SETTLE` and an `'error'` listener that
     logs; a change queues a restart; one restart at a time, further changes collapse into one;
   - the stop sequence: send `{ stop: true }`; wait 5 s for exit; then
     `taskkill /pid <pid> /T /F` on Windows, `SIGKILL` elsewhere;
   - a child that exits by itself: print the two lines of spec § 5.3 (or, when nothing is
     served yet, the same without the address) and wait for a script change;
   - SIGINT or SIGTERM: stop sequence, close the servers, exit 0.
     `bin/kiss-ssg.js` gets a thin `dev` wrapper.
   - verify: `npx vitest run test/unit/dev-supervisor.test.js` → pass (no real child, port or
     watcher).

5. **The pipeline's exit guard.** In `lib/pipeline.js`, while watch processes are alive, a
   `process.on('exit')` listener calls `signalGroup(child, 'SIGTERM')` for each; it is removed
   with the signal listeners.
   - verify: `npx vitest run test/unit/pipeline.test.js` → pass.

6. **Measure it: `test/integration/run-dev.test.js`.** Real children, OS-assigned ports, each
   test with a timeout and an `afterEach` that stops the command and asserts the port is free.
   Cases:
   - the port answers with the built page;
   - editing the script starts a new child (a new pid in a file the script writes) and a request
     loop running throughout never gets a refused connection;
   - an edit that makes the script throw at load: every old file is still served, no `reload`
     reaches a livereload client, the command prints "Still serving";
   - an edit that breaks one page of three: no `reload`; the broken page's old file is served;
     a later fix to that page's view (the child is alive) rebuilds and sends one `reload`;
   - a script whose port is taken: the child exits by itself and the command reports it;
   - after the stop, no child and no pipeline watch process is alive (give the fixture a
     pipeline step whose `watch` is `node -e "setInterval(()=>{},1000)"` and check its pid);
   - the command killed outright: the child exits.
   - verify: `npx vitest run test/integration/run-dev.test.js` → pass on this machine, then the
     leftover-process check from the Rules shows nothing.
   - verify: `npx vitest run test/integration/two-copies.test.js` → pass, with the new case: a
     stop closes an instance made by the second copy.

7. **Report the measurements.** For each [I] in spec § 5.3 and § 5.4 say: measured true,
   measured false (with the output), or not measurable here (POSIX). Put what is accepted and
   not fixed into `AIKB/rebuild.md`'s Known knowns, in its four-part form: stale output of a
   removed page after a restart; the mixed folder after a partly failed restart (spec § 9.8);
   orphaned pipeline watch processes after a forced kill on POSIX, if CI shows them.

8. **Docs and checks.** `AIKB/dev-supervisor.md` with the five template headings, its row in
   `CLAUDE.md`'s table and a `npx kiss-ssg dev` line in Commands; the other `AIKB/` docs in
   scope. `GUIDE.md`: `kiss-ssg dev`, what a restart keeps (spec § 5.3's table), that only a
   script edit restarts; correct `:1766`'s paragraph on `.watch({ entry })`. `llms.txt`: add the
   `dev` clause to slice 1's sentence. `README.md`: one line. `npm run types`.
   - verify: `node scripts/budgets.mjs` → `llmsTxtChars` is 15997 or less.
   - verify: `npm test` → exit 0. `npm run lint`, `npm run typecheck`, `npm run format:check` →
     exit 0. `node scripts/scope-check.mjs` → exit 0. `node docs` → exit 0.
   - verify: the leftover-process check shows nothing.

## Red-first

`node scripts/red-first.mjs test/integration/run-dev.test.js` → exit 0 wanted; report the line.
At the base `kiss-ssg dev` is an unknown command, so it fails for that reason: say so.

## Expected size

`lib/` and `bin/`: 300 to 450 lines added. Tests: 300 to 500. Docs: 100 to 180.

## Stop and ask

- Any port in the check is in use, or a process this run started will not stop.
- A measurement contradicts spec § 5.3 or § 5.4: for example the port stops answering during a
  restart, `taskkill /T` leaves the pipeline's tool alive, the `exit` guard's `taskkill` does
  not run, or the child does not exit after `channel.unref()`.
- The gated reload or the skipped empty needs a change in `lib/rebuild.js`, `lib/watcher.js` or
  `lib/staging.js`.
- A watch-only quirk appears that Ctrl-C and a fresh start clears: record it in Known knowns and
  go on. Ask only if it touches a source file or anything outside the build folder.
- The `dev` clause does not fit `llms.txt`.
- `test/integration/run-dev.test.js` is flaky (passes and fails across three runs).

## Single-test command

```
npx vitest run test/unit/dev-supervisor.test.js
```
