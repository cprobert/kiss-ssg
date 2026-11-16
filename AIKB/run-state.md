# run-state.js

## Responsibility

The process-wide state of a run: what the command that started this process asked of the engine, and which `Kiss` instances are live and which have never settled. It holds no state of its own. Everything lives in one object at `globalThis[Symbol.for('kiss-ssg.run')]`, made by whichever copy of kiss-ssg touches it first, because the command's copy (the preload) and the copy the site's script imports can be two folders, and a module's variables are per copy.

## Public interface

- `runState()` → the shared `{ v, request, live, unsettled, armed }`, created on first touch. A `v` other than `1` throws, naming both versions: two copies that disagree about the shape must not half-work.
- `currentRun(env = process.env)` → the `RunRequest` this process was started for: the preload's request when there is one, otherwise the same shape built from `KISS_CHECK`, `KISS_AIKB`, `KISS_REPORT`, `KISS_IMAGES` and `KISS_IMAGES_REFRESH` by the `CHECK_MODE_OFF` rule (`lib/check.js`), `mode: null` when neither says. The one place the engine reads process state to learn what it was asked to do: `lib/kiss.js`'s constructor, and `lib/build-finish.js` for the report file, the knowledge-base record and the image sweep.
- `register(instance)` → called at the end of the `Kiss` constructor. Adds to `live`, and to `unsettled` unless `config.dev`; the first unsettled instance arms the one `beforeExit` listener, behind `armed.beforeExit`. `live` is every instance that still has something for `close()` to do, because `endProcess` (`lib/run-preload.js`) is its only reader.
- `settled(instance)` → a `complete()` finished, resolved or rejected: leaves `unsettled`.
- `released(instance)` → the instance has nothing left for `close()`: leaves both sets without closing. `lib/kiss.js` calls it at the outermost `complete()` settle for a non-dev instance with no `_watcher`, `_devServer`, `_stagingDir` or `_oldDir`; the decision stays in `kiss.js` because those fields are its own. Without it a script that ends after `await kiss.complete()` (never `close()`) kept every instance, its pages and models, live for the life of the process. A failed atomic build keeps `_stagingDir`, so it stays live until closed.
- `track(instance)` → re-adds a released instance to `live` (never to `unsettled`). `Kiss.watch()` calls it, since a watcher is something for `close()` to stop.
- `closed(instance)` → `close()` was called: leaves both sets.
- `unsettledMessage(instance)` → the message of a build the process ended without settling.

## Depends on

`./check.js` (`checkModeRequested`, `aikbRecordRequested`) and `./images-sweep.js` (`sweepRequest`), for the alias half of `currentRun`. It takes instances as arguments and touches them only through `close()`, `logger` and `config`, with two private fields (`_buildTarget`, `_failures`) read for the message alone.

## Depended on by

`lib/kiss.js` (`currentRun`, `register`, `settled`, `released`, `track`, `closed`), `lib/build-finish.js` (`currentRun`) and `lib/run-preload.js` (`runState`).

## Non-obvious behavior

- **The `beforeExit` listener removes each instance from `unsettled` before anything else.** Awaiting `close()` re-arms the event loop, and `beforeExit` fires again when it drains; an instance still in the set would be reported twice. It then logs through that instance's own logger, sets `process.exitCode = 1` and awaits `close()`, which removes a staging folder nothing promoted.
- **`beforeExit` and not `exit`, deliberately.** A library that sets the exit code of whatever process loaded it is a hazard, and 50 test files construct `Kiss`. `beforeExit` fires only when the loop drains by itself, never after `process.exit()`, and a listener armed inside a vitest test never fires. `npm test` pins that: its output holds no `was built without complete()`. A script that calls `process.exit()` itself is caught by the command instead (`bin/kiss-ssg.js`: a run that exits 0 with no report line).
- **The predicate is "never settled, never closed, not dev", not "never called."** A `complete()` cut short by an exit verified nothing either. A nested `complete()` (inside a callback) does not mark the instance settled: the outer one is still draining.
- **Who arms what.** The engine copy that registers the first unsettled instance arms `beforeExit`; the preload alone arms `uncaughtException` (`lib/run-preload.js`). Without a preload nobody arms the second, so under plain `node router.js` Node prints a rejection and exits 1.
- **The alias half is a contract with an older command.** `check`, `aikb` and `images` still export the five variables, so an engine older than the preload keeps working; `build` exports none. `KISS_BUILD`, `KISS_ASSETS` and `KISS_DEV` are a different contract (the engine telling a pipeline step where it is) and are not read here.
