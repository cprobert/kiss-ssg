# pipeline.js

## Responsibility

Runs the external commands of `config.assets.pipeline` — a CSS toolchain, an icon sprite, anything with a command line — before the asset copy, and owns the long-lived `watch` processes their dev-mode equivalents leave running. kiss knows nothing about the tools themselves: this module spawns them through a shell, pipes their output through the injected logger, reports what each one did, and can end the watch processes again. It never reads config, never touches the filesystem and never throws.

## Public interface

- `stepName(step)` → the name a step is logged and reported under: its own `name`, or the first word of its `run` (`npx`, `node`, `sass`), or `'pipeline'` if there is neither.
- `createPipeline({ steps, logger, dev })` → `{ run, close, watching }`. One per `Kiss` instance, created in the constructor and closed in `close()`.
  - `run(env)` → `Promise<PipelineResult[]>`, one `{ name, ok, duration, error? }` per step, in order. Each step's `run` is spawned with `shell: true` in `step.cwd` (default `process.cwd()`) with `{ ...process.env, ...env }`, and awaited before the next starts. **Never rejects**; a failed step is a result carrying its `error`. In `dev` mode a step that has a `watch` command and whose `run` succeeded also gets that watch process started, once.
  - `close()` → `Promise<void>`: SIGTERM to every watch process's process group, SIGKILL after `KILL_GRACE` (2s), resolving once they have all gone. A closed pipeline stays closed — a later `run()` runs its steps but starts no watch process.
  - `watching()` → the names of the watch processes currently running.
- `PipelineStep` (`{ name?, run, watch?, cwd? }`) and `PipelineResult` (`{ name, ok, duration, error? }`) typedefs; `lib/config.js` and `lib/build-report.js` both refer to them rather than restating the shape.

## Depends on

`node:child_process` (`spawn`) — nothing else, and nothing of kiss's own.

## Depended on by

`lib/kiss.js` (creates one per instance, runs it at construction and on every whole-site replay, closes it in `close()`); `lib/config.js` and `lib/build-report.js` for the two typedefs.

## Non-obvious behavior

- **Ordering is the whole feature, and `_assetQueue` is what provides it.** `Kiss._queuePipeline()` chains `run()` onto the same promise every `copyAssets()` chains onto, so "steps first, copy second" needs no second mechanism — a step writes a source file (`src/assets/css/site.css`) and the copy that follows picks it up. See `AIKB/kiss.md`.
- **`run()` never rejects, for the same reason `copyAssets` never does.** Its result is chained into `_assetQueue`, which every later copy is built on: one rejection there would reject each of them in turn, and an unhandled one would take the process down. A step that fails is a `{ ok: false, error }` result the caller turns into a `<pipeline: name>` build failure, and the build carries on so the whole site is still reported.
- **Every step is attempted, including the ones after a failure.** A report that names only the first broken tool is a report you have to run twice; a later step that depended on the earlier one fails on its own terms and says so.
- **stderr is logged as `warn`, not `error`.** Build tools narrate on stderr — tailwind writes a line per rebuild there — so treating it as an error would paint a successful step red. The exit code is what decides, and the caller reports that once.
- **Output is buffered into lines.** A chunk is not a line: without the split a progress bar and half a filename arrive as one log call, and a tool that ends without a trailing newline loses its last line entirely (the `'end'` handler flushes it).
- **Killing the shell is not enough, so a watch process gets its own process group.** `shell: true` means the child is `/bin/sh -c "<command>"`, and a shell that forks rather than execs — dash does, for a command carrying quotes — leaves the real tool running as an orphan _holding the pipes_, so the child's `'close'` never fires: `close()` hung for ever, and a `--watch` compiler outlived the site. Watch commands are therefore spawned `detached` (POSIX), and `signalGroup` signals `-pid`, which reaches the shell and everything it started. On Windows there are no process groups to signal, so the child is killed directly and a forked grandchild may survive — the platform's own limitation, not one this module can paper over.
- **Detaching creates a second problem, and the signal handlers answer it.** A process group of its own means the watch process no longer dies with the terminal, and Ctrl-C is how a dev session normally ends — one stray `tailwind --watch` per Ctrl-C otherwise. So while anything is being watched (and only then) the module listens for `SIGINT`/`SIGTERM`, ends the groups synchronously — all a signal handler can do — removes its own listener and re-raises the signal so the process dies exactly as it would have. A consumer with its own handler for that signal keeps it, and keeps control of the exit: the re-raise only happens when no other listener is left.
- **A watch process is not a build input.** Nothing awaits it, and nothing it does can fail a build: an exit is logged (`error` for a non-zero code, `info` for a clean one) and the entry dropped. It is started only after its step's `run` has succeeded — a tool that could not do a one-shot build has nothing useful to say in watch mode — and only once, however many times `run()` is called again by a rebuild.
- **`dev` is passed in, not read.** The module has no access to config, which is what lets a unit test drive both modes without constructing a `Kiss` (`test/unit/pipeline.test.js` runs `node -e` commands, so it needs no fixture tool and behaves the same on every platform).
- **The `KILL_GRACE` fallback exists for a tool that ignores SIGTERM.** Without it `close()` — which a test's `afterEach`, a deploy script and `Kiss.close()` all await — would wait for ever on one badly behaved process. The timer is `unref`'d so it never keeps the event loop alive on its own.

## Types

`PipelineStep` and `PipelineResult` are declared here and referred to from `lib/config.js` (`KissAssets.pipeline`) and `lib/build-report.js` (`buildReport`'s `pipeline` input), so the shape a site writes, the shape that is run and the shape that is reported cannot drift apart. `types/pipeline.d.ts` is emitted from this JSDoc like every other `lib/` module — `npm run types`, never hand-edited.

**Tools that watch stdin.** A watch child is spawned with stdin ignored. Tailwind's `--watch` exits as soon as stdin closes (exit code 0, logged as `pipeline watch "tailwind" exited (code 0)`); `--watch=always` is the flag that keeps it up. Found on a1k9training, the first real site to use the hook.
