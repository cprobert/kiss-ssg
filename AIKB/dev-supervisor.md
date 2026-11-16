# dev-supervisor.js

## Responsibility

`kiss-ssg dev`'s session (spec § 5.3, § 5.4). The command owns what must outlive a restart: the dev servers (one HTTP and livereload pair per `host:port`), the chokidar watch on the script and the child's life. The child owns the build, the watch on `src`, assets and helpers, the rebuild queue and the pipeline's watch processes. Every effect (`spawn`, `startServer`, `watch`, `signals`, `say`, `kill`) is injected, so the unit test runs it with no child, port or watcher.

## Public interface

- `superviseDev({ script, args, cwd, env, spawn, startServer, watch, signals, say, platform, kill, stopWait })` → `{ done, stop }`. It starts the first child at once. `done` resolves 0 when everything has stopped; `stop()` runs the stop sequence (a SIGINT or SIGTERM on `signals` calls it). `bin/kiss-ssg.js dev` is the thin wrapper: parse, resolve the script, the engine gate, then `process.exit(await superviseDev(…).done)`.
- `exitedLines({ name, code, signal, served })` → the two lines printed when the child ends by itself (spec § 5.3), without the address clause when nothing is served.

## Depends on

`./run-script.js` (`spawnPlan`), `./dev-server.js` (`startDevServer`), `./watcher.js` (`WRITE_SETTLE`), `./logger.js`, `node:child_process`, and chokidar through a lazy `require`.

## Depended on by

`bin/kiss-ssg.js`.

## Non-obvious behavior

- **The messages.** Child to command: `{ serve: { root, port, host, livereloadPort } }` and `{ reload: path }`. Command to child: `{ serving: true, host, port }` or `{ serveFailed: message, host, port }`, and `{ stop: true }`. The reply echoes the address so a script with two instances, which hears both answers, takes its own (`linkDevServer`, `AIKB/dev-server.md`).
- **One pair per `host:port`.** The same root and livereload port answers `serving` and changes nothing. A different root on a taken port is `serveFailed` when the holder was asked for by the same child, and a replacement when the holder is an earlier child's: the old pair closes, the new starts and the command says `router.js now serves ./dist at http://…`. A restarted child's first `reload` retires earlier pairs it did not ask for again.
- **The stop sequence.** `{ stop: true }`, wait `stopWait` (5 s), then `taskkill /pid <pid> /T /F` on Windows or `SIGKILL` on the child's pid elsewhere. There is no process-group kill of the child (the parity rule, `AIKB/run-script.md`); the watch processes the engine owns are the engine's to stop (`AIKB/pipeline.md`).
- **One restart at a time.** Edits during a restart collapse into one more. A restart in progress when the stop comes starts no new child.
- **A child the command is ending is not news.** Its exit prints nothing, and neither does any exit once the stop has begun: a console Ctrl-C reaches the child directly too, so it can exit before the supervisor stops it. Only an exit nobody asked for prints the two lines and waits for a script edit.
- **The script watch uses the engine's `WRITE_SETTLE`**, exported from `lib/watcher.js`.
- **The watch has an `'error'` listener** that says so and keeps the session up: an unheard `'error'` would end the command.
- **Windows: the command killed outright ends the child with it, and not its pipeline watch process** (measured 2026-11-15, Node 22.23.4 and 24.14.0). No `exit` or `disconnect` event ran in the child, so the child's own close never ran; the watch process outlived both, as it does when `node router.js` is killed. Inferred, not measured: libuv's job object for non-detached children. In `AIKB/rebuild.md`'s Known knowns.
- **`child.kill('SIGINT')` on Windows ends a Node child outright**, handler or not (measured, Node 22.23.4 and 24.14.0). `test/integration/run-dev.test.js` therefore drives the graceful stop through `stop()` in-process, not by signalling the command.
