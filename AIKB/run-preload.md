# run-preload.js

## Responsibility

The first module of a site's script when a command runs it. `kiss-ssg build` and its siblings start the script as `node --import <this file>?run=<encoded JSON> <script> [args…]`, so this runs before the script's first line and the engine knows its mode before `_setupFolders()` empties a folder. It stores the request and takes ownership of an uncaught build failure. Importing it does the work; the parts that decide are exported.

## Public interface

- `decodeRun(url)` → the `RunRequest` in the URL's `run` query, or `null` when there is none or it does not parse as an object.
- `isBuildFailure(err)` → whether the error carries `Symbol.for('kiss-ssg.buildFailure')`, which the engine sets (non-enumerable) on the `AggregateError` a failed `complete()` rejects with.
- `activate(url, { ppid, main })` → stores the request at `runState().request` and arms the `uncaughtException` listener behind `armed.uncaught`, only when the process is the command's direct child on the main thread; answers whether it did. The module calls it once with its own `import.meta.url`; the unit test calls it with a URL of its own. For a `dev` request it also calls `wireChannel`.
- `wireChannel(proc)` → wires the `{ stop }` message and `disconnect` handlers and unrefs the channel, once behind `armed.channel`; answers whether it did. Nothing when the process has no `send`.

## Depends on

`node:worker_threads` and `./run-state.js`.

## Depended on by

Nothing imports it. `lib/run-script.js` names it in the `--import` URL, and `bin/kiss-ssg.js` refuses an engine that lacks the file (`engineGate`).

## Non-obvious behavior

- **It does nothing unless `process.ppid === request.owner` and it is the main thread.** `fork()` and `new Worker` inherit `execArgv`, so a script's own fork would otherwise take the mode too. `test/integration/run-mode.test.js` pins that a forked grandchild reads `Kiss.mode` as `null`.
- **A query on the `--import` URL is the only synchronous channel.** The mode has to be known before the constructor empties a folder, and an IPC message cannot arrive before the script's first line. The request is a global symbol on `globalThis`, so the engine copy the script imports reads what the command's copy wrote.
- **The listener swallows a build failure and prints anything else.** A rejected top-level `await` in ESM, and an unhandled rejection in CommonJS, each reach `process.on('uncaughtException')` with origin `unhandledRejection` when that is the only listener, and the listener keeps Node from printing the dump (`AIKB/upstream.md`). A build failure (already logged by the engine, with the verdict printed by the command) sets `process.exitCode = 1`, except in `mode: 'dev'`, where the child keeps serving. Anything else is printed with its stack and the process exits 1. The mark is a `Symbol.for`, so a preload from one copy recognises an error another copy threw.
- **In `dev`, the channel is wired here and unref'd.** `wireChannel` (behind `armed.channel`, only when `process.send` exists) closes every live instance, whichever copy made it, and exits 0 on `{ stop: true }` and on `disconnect`, through the same bounded close a failed build uses (`CLOSE_DEADLINE_MS`). A process with an IPC `message` listener never drains its event loop, so it would neither exit nor reach `beforeExit`: the preload calls `process.channel.unref()` after wiring, and the child then lives exactly as long as something of its own does. Measured on Node 22.23.4 and 24.14.0: a `message` listener added _after_ the unref (the engine's link registers later) does not bring the loop back.
- **Killing the command on Windows never reaches `disconnect`**: the OS ends the child with it (`AIKB/dev-supervisor.md`), so the handler is covered by closing the channel from the test's side (`test/integration/run-dev.test.js`).
