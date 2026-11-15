# run-script.js

## Responsibility

The command's side of running a site's script: find the script, decide whether the engine it will import can read the command's request, build the child's arguments and environment, start it and wait. `kiss-ssg build`, `check`, `aikb` and `images` all start the script this way, as `node --import <run-preload.js>?run=<request> <script> [args…]`, with the caller's cwd. Everything here but `runScript` is pure; `bin/kiss-ssg.js` supplies the cwd, the files and the printing.

## Public interface

- `resolveScript(name, cwd, command = 'build')` → `{ file, error }`. `file` is the absolute path of the name as typed, then with `.js`, `.mjs` and `.cjs` (`resolveEntry`, `lib/watcher.js`, the way Node resolves an entry point). A name that is none of them answers the error of spec § 4.4: `no script named production (looked for production, production.js, .mjs, .cjs). The script comes first: kiss-ssg build router.js production`.
- `engineGate(engine, { cwd, command, exists })` → a refusal string, or `null` to go ahead. `engine` is `describeEngine`'s answer. It refuses when the folder found holds no `lib/run-preload.js`: a capability, not a version, because a version test would refuse the branch's own tarball. No engine found is a pass, as `check` has always gone ahead.
- `spawnPlan({ command, script, args, reportFile, imagesFile, refresh, env, owner, preload })` → `{ execArgv, args, env, stdio }`. The request is `{ mode, report, aikb, images, imagesRefresh, owner }`, JSON in the `?run=` of this copy's `run-preload.js`, `owner` being this process's pid. `check`, `aikb` and `images` run staged, so their mode is `'check'`, and the five alias variables are exported beside the request for an engine that predates the preload; stdio is `[0, 2, 2]` so stdout carries only the report. `build` exports none, deletes exactly those five names from the environment it was given (`KISS_BUILD`, `KISS_ASSETS` and `KISS_DEV` are untouched), and inherits stdio.
- `runScript(plan, { spawn, cwd, platform, signals, kill, grace })` → `Promise<{ status, signal, error }>`. On the command's own SIGINT or SIGTERM the child is ended (`taskkill /pid <pid> /T /F` on Windows; elsewhere `SIGTERM` to the child's pid, then `SIGKILL` to it after `grace`, 5 s by default) and the run resolves with a non-zero status, so an interrupted build cannot let `&& firebase deploy` run. `signals` is where those are heard (the process); `kill` sends a signal to a pid. A test passes an emitter and a stub for each.

## Depends on

`node:fs`, `node:path`, `node:child_process` and `./watcher.js` (`resolveEntry`).

## Depended on by

`bin/kiss-ssg.js` (`build`, `check`, `aikb`, `images`); `lib/images-sweep.js` and `lib/check.js` hold the parse and the report decisions it feeds.

## Non-obvious behavior

- **Spawn, not import.** The script is a program: it reads `process.argv.slice(2)`, calls `process.exit()`, prompts on stdin, and in one site has a top-level `return`. As the child's main module each means what it means under `node router.js`. A fresh module graph per run is also what a restart needs, since Node cannot evict an ES module (`AIKB/upstream.md`).
- **The command's copy and the engine's copy can differ.** The preload URL names the command's copy; the script imports its own. They share only the global the run state lives at (`AIKB/run-state.md`), so nothing here may rely on module state reaching the engine.
- **A run that was interrupted resolves non-zero even when the child exited 0.** The child may have been killed after finishing its build; the verdict is "interrupted", not "built".
- **Under the command a process tree gets what it would get under `node router.js`, no more and no less.** The command's own duties are to return promptly and with the right exit code. The child stays in the command's process group, so a terminal's Ctrl-C reaches it and its descendants as it does without the command (spec § 5.4). A subprocess the script itself spawns is the script's: it outlives the command exactly as it outlives `node router.js` (measured on Windows, 2026-11-15: both exit 1 in about 1 s with a script-owned `stdio: 'ignore'` subprocess and a failing build). The stop escalates `SIGTERM` to `SIGKILL` on the child only, so on POSIX a forced kill can orphan what the script spawned. That is recorded, not chased. Windows is the exception only because `taskkill /T` is its one way to end a child.
- **`build` prints the verdict and `check` prints the report.** The command's reading of the report file and the exit code are `lib/check.js` (`exitCodeFor`) and `lib/build-report.js` (`formatVerdict`); this module only starts and stops the child.
