import { isMainThread } from 'node:worker_threads'
import { runState } from './run-state.js'

// The child's first module (spec § 4.2, § 5.4): `kiss-ssg build` and its
// siblings start the site's script as `node --import <this file>?run=<JSON>
// <script>`. It runs before the script's first line, so the engine knows the
// mode before it empties a folder. Importing it does the work; the parts that
// decide are exported for the unit test, which imports it with no query and so
// changes nothing.

/**
 * The request in an `--import` URL's `run` query.
 *
 * @param {string} url
 * @returns {import('./run-state.js').RunRequest|null} `null` when the URL carries none, or not one that parses
 */
export function decodeRun(url) {
  const text = new URL(url).searchParams.get('run')
  if (!text) return null
  try {
    const request = JSON.parse(text)
    return request && typeof request === 'object' ? request : null
  } catch {
    return null
  }
}

/**
 * Whether an error is a kiss build failure: the engine marks the rejection of
 * a failed `complete()` with a global symbol, so another copy's is recognised.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isBuildFailure(err) {
  return Boolean(
    err &&
    typeof err === 'object' &&
    /** @type {Record<symbol, unknown>} */ (err)[
      Symbol.for('kiss-ssg.buildFailure')
    ],
  )
}

// How long a failed build's instances get to close before the process ends
// anyway: a pipeline tool that will not stop must not keep the build alive.
const CLOSE_DEADLINE_MS = 5000

// The listener behind `armed.uncaught`. A build failure was already logged by
// the engine and gets its verdict from the command, so Node's dump is
// withheld; in `dev` the child keeps serving. Outside dev the process ends the
// way Node ends one with no listener, with code 1, once every live instance
// has closed (bounded): a handle the script left open (a timer, a socket, a
// tool it spawned) must not keep a failed build alive. Anything else is a bug
// in the script: printed with its stack, and the process ends.
/**
 * @param {unknown} err
 */
function onUncaught(err) {
  if (isBuildFailure(err)) {
    if (runState().request?.mode === 'dev') return
    process.exitCode = 1
    endProcess(1)
    return
  }
  console.error(err)
  process.exit(1)
}

// Close every live instance, whichever copy made it, within the deadline, then
// end the process. The one bounded close: a failed build and the command's
// stop both use it.
/**
 * @param {number} code
 */
function endProcess(code) {
  const closing = Promise.allSettled(
    [...runState().live].map((instance) => instance.close()),
  )
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let deadline
  Promise.race([
    closing,
    new Promise((resolve) => {
      deadline = setTimeout(resolve, CLOSE_DEADLINE_MS)
    }),
  ]).then(() => {
    clearTimeout(deadline)
    process.exit(code)
  })
}

/**
 * The child's end of the dev channel (spec § 5.4): the command's `{ stop: true }`
 * and the channel closing both close every live instance and end the process
 * with 0. Then the channel is unref'd, so it does not keep the child alive: a
 * `message` listener otherwise holds the event loop open for ever and the
 * child could neither exit by itself nor reach `beforeExit`.
 *
 * @param {Pick<NodeJS.Process, 'on'> & { channel?: { unref?: () => void }, send?: unknown }} [proc]
 * @returns {boolean} whether the channel was wired by this call
 */
export function wireChannel(proc = process) {
  const state = runState()
  if (!proc.send || state.armed.channel) return false
  state.armed.channel = true
  proc.on('message', (message) => {
    if (/** @type {{ stop?: unknown }|null} */ (message)?.stop) endProcess(0)
  })
  proc.on('disconnect', () => endProcess(0))
  proc.channel?.unref?.()
  return true
}

/**
 * Store the request and take ownership of an uncaught build failure, in a
 * process the command owns and nowhere else: a `fork()` or a `Worker` the
 * script starts inherits `execArgv`, so it would otherwise take the mode too.
 *
 * @param {string} url this module's own `import.meta.url`
 * @param {{ ppid?: number, main?: boolean }} [where]
 * @returns {boolean} whether this process took the request
 */
export function activate(
  url,
  { ppid = process.ppid, main = isMainThread } = {},
) {
  const request = decodeRun(url)
  if (!request || !main || ppid !== request.owner) return false
  const state = runState()
  state.request = request
  if (!state.armed.uncaught) {
    state.armed.uncaught = true
    process.on('uncaughtException', onUncaught)
  }
  if (request.mode === 'dev') wireChannel()
  return true
}

activate(import.meta.url)
