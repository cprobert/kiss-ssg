// The asset pipeline: the external commands a site runs before its assets are
// copied (a CSS toolchain, an icon sprite, anything with a command line), and
// the long-lived `--watch` processes their dev-mode equivalents leave running.
// kiss knows nothing about the tools themselves — this module spawns them,
// pipes their output through the injected logger, and reports what happened.
// Never throws: a step that fails resolves to a result carrying its error, so
// the build can record the failure and still copy assets and render pages.

import { spawn } from 'node:child_process'

/**
 * One step of `config.assets.pipeline`.
 *
 * @typedef {Object} PipelineStep
 * @property {string} [name] used in logs and in the `<pipeline: name>` failure; defaults to the first word of `run`
 * @property {string} run the shell command run before the asset copy, in order, awaited
 * @property {string} [watch] a long-lived command started once in `dev` mode, after `run` succeeded
 * @property {string} [cwd] the folder both commands run in; defaults to `process.cwd()`
 */

/**
 * What one step did. `error` is present exactly when `ok` is `false`.
 *
 * @typedef {Object} PipelineResult
 * @property {string} name
 * @property {boolean} ok
 * @property {number} duration ms the step's `run` took
 * @property {Error} [error]
 */

// How long a watch process gets to leave on a SIGTERM before it is killed.
// Long enough for a file-watching build tool to close its watchers, short
// enough that `close()` (which a test, a Ctrl-C handler or a deploy script
// awaits) is not perceptibly slower for a process that ignores the signal.
const KILL_GRACE = 2000

/**
 * The name a step is logged and reported under: its own `name`, or the first
 * word of its command (`npx`, `node`, `sass`), which is what an operator
 * reading a log would call it anyway.
 *
 * @param {PipelineStep} step
 * @returns {string}
 */
export function stepName(step) {
  const explicit = typeof step?.name === 'string' && step.name.trim()
  if (explicit) return explicit
  const first = String(step?.run ?? '')
    .trim()
    .split(/\s+/)[0]
  return first || 'pipeline'
}

// A child's stdout and stderr, line by line, through the injected logger.
// stderr is `warn` rather than `error`: build tools write progress there
// (tailwind reports every rebuild on stderr), so treating it as an error
// would paint a successful step red. What actually failed is the exit code,
// and that is reported once, as a build failure, by the caller.
function pipeOutput(child, name, logger) {
  const pump = (stream, log) => {
    if (!stream) return
    stream.setEncoding('utf8')
    let buffer = ''
    const emit = (line) => {
      if (line.trim()) log(`[${name}] ${line}`)
    }
    stream.on('data', (chunk) => {
      const lines = (buffer + chunk).split(/\r?\n/)
      // The last element is whatever came after the final newline — the start
      // of the next line, not a line of its own until more arrives.
      buffer = lines.pop() ?? ''
      lines.forEach(emit)
    })
    // A tool that ends without a trailing newline still said something.
    stream.on('end', () => {
      emit(buffer)
      buffer = ''
    })
  }
  pump(child.stdout, (line) => logger.info(line))
  pump(child.stderr, (line) => logger.warn(line))
}

// Every command runs through a shell so a step is written the way it would be
// typed into a terminal (`npx tailwindcss -i … -o … --minify`), not as an argv
// array. `detached` puts a *watch* command in a process group of its own —
// see `signalGroup` for why that is the only way to end one reliably.
function spawnStep(command, { cwd, env, detached = false }) {
  return spawn(command, {
    shell: true,
    cwd: cwd || process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: detached && process.platform !== 'win32',
  })
}

// **Killing the shell is not enough.** `shell: true` means the child is
// `/bin/sh -c "<command>"`, and a shell that forks rather than execs (dash
// does, for a command carrying quotes) leaves the real tool running as an
// orphan holding the pipes — so the child's `'close'` never fires and the
// process outlives the site. Spawning the watch command detached gives it a
// process group whose id is the child's pid, and signalling `-pid` reaches
// the shell and everything it started. Windows has no process groups to
// signal, and `child.kill()` there reaches only the `cmd.exe` this module
// spawned — the tool it started survives exactly as the orphan above does,
// holds the pipes, and the child's `'close'` never fires, so `close()` hangs
// until something times out. `taskkill /T` ends the whole tree instead. `/F`
// is not a choice: a console process owning no window cannot be asked to
// leave, and Windows has no graceful signal to offer it — `child.kill()` was
// already calling `TerminateProcess`, so nothing gracious is lost by it.
function signalGroup(child, signal) {
  try {
    if (child.pid === undefined) return
    if (process.platform === 'win32') {
      // Falls back to the direct kill if taskkill itself cannot start, so a
      // locked-down PATH degrades to the old behaviour rather than throwing.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      }).on('error', () => child.kill(signal))
    } else process.kill(-child.pid, signal)
  } catch {
    // ESRCH: it is already gone, which is the outcome being asked for.
  }
}

// Runs one command to completion. Resolves either way — a rejection here would
// have to be caught by every caller, and the whole point is that a failed step
// is data the build report carries rather than an exception mid-pipeline.
function runOnce(step, { logger, env }) {
  return new Promise((resolve) => {
    const name = stepName(step)
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let child
    try {
      child = spawnStep(step.run, { cwd: step.cwd, env })
    } catch (error) {
      // A synchronous throw out of spawn (an invalid cwd type, say) is the
      // same failure as an asynchronous 'error' event.
      return done({ ok: false, error: /** @type {Error} */ (error) })
    }
    pipeOutput(child, name, logger)
    child.on('error', (error) =>
      done({
        ok: false,
        error: new Error(
          `pipeline step "${name}" could not start: ${error.message}`,
        ),
      }),
    )
    child.on('close', (code, signal) => {
      if (code === 0) return done({ ok: true })
      const how = signal ? `signal ${signal}` : `exit code ${code}`
      done({
        ok: false,
        error: new Error(
          `pipeline step "${name}" failed (${how}): ${step.run}`,
        ),
      })
    })
  })
}

/**
 * The pipeline of one `Kiss` instance: the steps it runs before every asset
 * copy, and the watch processes it keeps for the session.
 *
 * @param {Object} options
 * @param {PipelineStep[]} [options.steps] `config.assets.pipeline`
 * @param {any} options.logger the injected logger
 * @param {boolean} [options.dev] `config.dev` — the only mode that starts watch processes
 * @returns {{
 *   run: (env?: Record<string, string>) => Promise<PipelineResult[]>,
 *   close: () => Promise<void>,
 *   watching: () => string[],
 * }}
 */
export function createPipeline({ steps = [], logger, dev = false }) {
  // Keyed by step name so a whole-site rebuild, which runs the steps again,
  // never starts a second copy of a watch process that is already running.
  /** @type {Map<string, import('node:child_process').ChildProcess>} */
  const watchers = new Map()
  let closed = false

  const startWatch = (step, env) => {
    const name = stepName(step)
    if (closed || watchers.has(name)) return
    let child
    try {
      child = spawnStep(step.watch, { cwd: step.cwd, env, detached: true })
    } catch (error) {
      logger.error(
        `pipeline watch "${name}" could not start: ${/** @type {Error} */ (error).message}`,
      )
      return
    }
    watchers.set(name, child)
    pipeOutput(child, name, logger)
    // A watch process is a convenience, not a build input: nothing waits for
    // it and nothing it does can fail the build, so its death is logged and
    // the entry dropped rather than recorded as a failure.
    child.on('error', (error) => {
      watchers.delete(name)
      logger.error(`pipeline watch "${name}" could not start: ${error.message}`)
    })
    child.on('close', (code, signal) => {
      watchers.delete(name)
      if (watchers.size === 0) unwatchSignals()
      if (closed) return
      const how = signal ? `signal ${signal}` : `code ${code}`
      const message = `pipeline watch "${name}" exited (${how})`
      if (code === 0) logger.info(message)
      else logger.error(message)
    })
    watchSignals()
    logger.info(`pipeline: watching with "${step.watch}" [${name}]`)
  }

  const stop = async (name, child) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      watchers.delete(name)
      return
    }
    const ended = new Promise((resolve) => child.once('close', () => resolve()))
    signalGroup(child, 'SIGTERM')
    // A tool that ignores SIGTERM would otherwise hold the event loop open for
    // ever and hang `close()` — which a test's afterEach, a deploy script or a
    // consumer's own shutdown awaits.
    const timer = setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE)
    if (typeof timer.unref === 'function') timer.unref()
    try {
      await ended
    } finally {
      clearTimeout(timer)
      watchers.delete(name)
    }
  }

  // A detached watch process is in its own process group, so it no longer dies
  // with the terminal when someone Ctrl-Cs a dev server — which is how a dev
  // session normally ends, and would otherwise leave a `--watch` compiler
  // running for ever. Listeners are attached only while something is actually
  // being watched, they end the group synchronously (all a signal handler can
  // do), and then get out of the way: ours is removed and the signal re-raised
  // so the process dies exactly as it would have. A consumer with its own
  // handler for the signal keeps it, and keeps control of the exit.
  /** @type {((signal: NodeJS.Signals) => void)|null} */
  let onSignal = null
  const SIGNALS = /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM'])
  const watchSignals = () => {
    if (onSignal) return
    onSignal = (signal) => {
      for (const [, child] of watchers) signalGroup(child, 'SIGTERM')
      watchers.clear()
      unwatchSignals()
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
    }
    for (const signal of SIGNALS) process.on(signal, onSignal)
  }
  const unwatchSignals = () => {
    if (!onSignal) return
    for (const signal of SIGNALS) process.removeListener(signal, onSignal)
    onSignal = null
  }

  return {
    /**
     * Runs every step's `run`, in order, awaiting each. Never rejects: a
     * failed step is a result carrying its error, and the steps after it are
     * still attempted so the report names every one that failed rather than
     * only the first.
     */
    async run(env = {}) {
      const childEnv = { ...process.env, ...env }
      /** @type {PipelineResult[]} */
      const results = []
      for (const step of steps) {
        const name = stepName(step)
        const startedAt = Date.now()
        logger.info(`pipeline: ${name} — ${step.run}`)
        const outcome = await runOnce(step, { logger, env: childEnv })
        const duration = Math.max(0, Date.now() - startedAt)
        if (outcome.ok) {
          logger.info(`pipeline: ${name} ok (${duration}ms)`)
          results.push({ name, ok: true, duration })
          if (dev && step.watch) startWatch(step, childEnv)
        } else {
          logger.error(outcome.error.message)
          results.push({ name, ok: false, duration, error: outcome.error })
        }
      }
      return results
    },

    /**
     * Ends every watch process this pipeline started — SIGTERM, then SIGKILL
     * after a short grace — and resolves once they have all gone. A closed
     * pipeline stays closed: a later `run()` runs its steps but starts no
     * watch process.
     */
    async close() {
      closed = true
      unwatchSignals()
      await Promise.all([...watchers].map(([name, child]) => stop(name, child)))
    },

    /** The names of the watch processes currently running. */
    watching() {
      return [...watchers.keys()]
    },
  }
}
