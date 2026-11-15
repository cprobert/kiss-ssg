import { aikbRecordRequested, checkModeRequested } from './check.js'
import { sweepRequest } from './images-sweep.js'

// The process-wide state of a run (spec § 4.6). The command's copy of kiss-ssg
// (the preload) and the copy the site's script imports can be two folders, and
// a module's variables are per copy, so nothing here is held in module scope:
// every function works over one object at a global symbol, made by whichever
// copy touches it first. A copy that finds a shape it does not know throws
// rather than half-work.
const KEY = Symbol.for('kiss-ssg.run')
const VERSION = 1

/**
 * What a command asks of the engine it runs (spec § 4.2). `mode` is `null`
 * when nothing says; `owner` is the command's pid, `null` for an alias.
 *
 * @typedef {Object} RunRequest
 * @property {'build'|'dev'|'check'|null} mode
 * @property {true} [aikb] record the site's knowledge base
 * @property {string} [report] the JSON Lines file each settled build appends to
 * @property {string} [images] the sweep file `kiss-ssg images` reads
 * @property {true} [imagesRefresh] re-encode the cache
 * @property {true} [restart] a dev restart, not the first start
 * @property {number|null} [owner] the pid of the command that started this process
 */

/**
 * What the run state needs of a `Kiss`, and no more: it is handed instances
 * made by any copy of kiss-ssg, so it asks for `close()`, `logger` and
 * `config`. The message also reads two private fields, and only reads them.
 *
 * @typedef {Object} RunInstance
 * @property {{ dev?: boolean, folders: { build: string } }} config
 * @property {{ error: (message: string) => void }} logger
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {Object} RunState
 * @property {number} v
 * @property {RunRequest|null} request
 * @property {Set<RunInstance>} live every instance, from construction until `close()`
 * @property {Set<RunInstance>} unsettled every non-dev instance whose build has not settled
 * @property {{ beforeExit: boolean, uncaught: boolean, channel: boolean }} armed
 */

/**
 * The shared state, created on first touch.
 *
 * @returns {RunState}
 * @throws if another copy of kiss-ssg wrote a shape this one does not read
 */
export function runState() {
  const found = globalThis[KEY]
  if (found === undefined) {
    const state = {
      v: VERSION,
      request: null,
      live: new Set(),
      unsettled: new Set(),
      armed: { beforeExit: false, uncaught: false, channel: false },
    }
    globalThis[KEY] = state
    return state
  }
  if (found.v !== VERSION)
    throw new Error(
      `kiss-ssg: this copy reads run state version ${VERSION}, but another copy of kiss-ssg in this process wrote version ${found.v}. Run one version of kiss-ssg: npm install the same one in the site and for the command.`,
    )
  return found
}

/**
 * The run this process was started for: the command's request when its
 * preload stored one, otherwise the same shape built from the `KISS_CHECK`,
 * `KISS_AIKB`, `KISS_REPORT`, `KISS_IMAGES` and `KISS_IMAGES_REFRESH` aliases
 * by the rule `CHECK_MODE_OFF` states. The one place the engine reads process
 * state to learn what it was asked to do.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {RunRequest}
 */
export function currentRun(env = process.env) {
  const { request } = runState()
  if (request) return request
  const sweep = sweepRequest(env)
  return {
    mode: checkModeRequested(env) ? 'check' : null,
    ...(aikbRecordRequested(env) ? { aikb: true } : {}),
    ...(env.KISS_REPORT ? { report: env.KISS_REPORT } : {}),
    ...(sweep ? { images: sweep.file } : {}),
    ...(sweep?.refresh ? { imagesRefresh: true } : {}),
    owner: null,
  }
}

/**
 * The message for a build the process ended without settling (spec § 4.5).
 *
 * @param {RunInstance} instance a `Kiss`
 * @returns {string}
 */
export function unsettledMessage(instance) {
  const peek =
    /** @type {{ _buildTarget?: string|null, _failures?: unknown[] }} */ (
      /** @type {unknown} */ (instance)
    )
  const folder = peek._buildTarget ?? instance.config.folders.build
  const failed = peek._failures?.length ?? 0
  const unreported =
    failed > 0
      ? `, and ${failed} page failure${failed === 1 ? '' : 's'} went unreported`
      : ''
  return (
    `kiss-ssg: ${folder} was built without complete(), so nothing was settled: no redirects, cache headers, link check, audit or report${unreported}.\n` +
    "Add `await kiss.complete()` as the script's last statement. Exiting with code 1."
  )
}

// When the event loop empties with a build still unsettled. Each instance
// leaves the set before anything is awaited: `close()` re-arms the loop, and
// `beforeExit` fires again when it drains.
async function onBeforeExit() {
  const { unsettled } = runState()
  for (const instance of [...unsettled]) {
    unsettled.delete(instance)
    instance.logger.error(unsettledMessage(instance))
    process.exitCode = 1
    await instance.close()
  }
}

/**
 * A new instance. A dev instance is live but never unsettled: it serves until
 * it is stopped. The first unsettled one arms the one `beforeExit` listener.
 *
 * @param {RunInstance} instance a `Kiss`
 */
export function register(instance) {
  const state = runState()
  state.live.add(instance)
  if (instance.config.dev) return
  state.unsettled.add(instance)
  if (!state.armed.beforeExit) {
    state.armed.beforeExit = true
    process.on('beforeExit', onBeforeExit)
  }
}

/**
 * An instance's build settled, resolved or rejected.
 *
 * @param {RunInstance} instance
 */
export function settled(instance) {
  runState().unsettled.delete(instance)
}

/**
 * An instance was closed.
 *
 * @param {RunInstance} instance
 */
export function closed(instance) {
  const state = runState()
  state.live.delete(instance)
  state.unsettled.delete(instance)
}
