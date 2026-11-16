import fs from 'node:fs'
import path from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'
import { resolveEntry } from './watcher.js'

// The command's side of running a site's script (spec § 4.1, § 4.2, § 4.4):
// `kiss-ssg build`, `check`, `aikb` and `images` start the script as a child,
// `node --import <run-preload.js>?run=<request> <script> [args…]`, and wait.
// Everything here but `runScript` is pure; `bin/kiss-ssg.js` supplies the cwd
// and the files.

// The five variables the request replaces. `KISS_BUILD`, `KISS_ASSETS` and
// `KISS_DEV` are the engine telling a pipeline step where it is, a different
// contract, and are never touched.
const ALIASES = [
  'KISS_CHECK',
  'KISS_AIKB',
  'KISS_REPORT',
  'KISS_IMAGES',
  'KISS_IMAGES_REFRESH',
]

// How long a POSIX child's process group gets to end after SIGTERM, in ms.
const STOP_GRACE_MS = 5000

const PRELOAD = new URL('./run-preload.js', import.meta.url).href

/**
 * The script a command was asked to run, resolved the way Node resolves an
 * entry point: the name as given, then with `.js`, `.mjs` and `.cjs`.
 *
 * @param {string} name the script as typed
 * @param {string} cwd the folder the person is standing in
 * @param {string} [command] named in the message, which says the script comes first
 * @returns {{ file: string, error: null }|{ file: null, error: string }}
 */
export function resolveScript(name, cwd, command = 'build') {
  const found = resolveEntry(path.resolve(cwd, name))
  if (found) return { file: found, error: null }
  return {
    file: null,
    error: `no script named ${name} (looked for ${name}, ${name}.js, .mjs, .cjs). The script comes first: \`kiss-ssg ${command} router.js ${name}\``,
  }
}

/**
 * Whether the engine a site resolves can read the command's request: a
 * capability, not a version. `check`, `aikb` and `images` also export the
 * alias variables, so an older engine still serves them; `build` exports none,
 * and an engine that ignored the request would build for real in the wrong mode.
 *
 * @param {ReturnType<typeof import('./check.js').describeEngine>} engine
 * @param {{ cwd: string, command?: string, exists?: (file: string) => boolean }} where
 * @returns {string|null} a refusal, or `null` to go ahead. No engine found is a pass, as `check` has always gone ahead.
 */
export function engineGate(
  engine,
  { cwd, command = 'build', exists = fs.existsSync },
) {
  if (!engine) return null
  const preload = path.join(cwd, engine.dir, 'lib', 'run-preload.js')
  if (exists(preload)) return null
  return `kiss-ssg ${command}: the kiss-ssg this site resolves (${engine.version} from ${engine.dir}) cannot read the command's request, so nothing was run. Install a current one with npx kiss-ssg@latest upgrade, then run it again.`
}

/**
 * Everything `runScript` needs to start the child.
 *
 * @typedef {Object} SpawnPlan
 * @property {string[]} execArgv node's own arguments: the preload, with the request in its URL
 * @property {string[]} args the script, then its arguments
 * @property {Record<string, string|undefined>} env
 * @property {'inherit'|[number, number, number]|['inherit', 'inherit', 'inherit', 'ipc']} stdio
 */

/**
 * The request and the child's environment for one command.
 *
 * `check`, `aikb` and `images` run staged and discarded, so their request is
 * `mode: 'check'`, and the five aliases are exported beside it for an engine
 * that predates the preload. `build` runs for real, exports none and removes
 * them from the caller's environment. `dev` is `build`'s request with a
 * channel to the command, and `restart` when it is not the first start.
 *
 * @param {Object} input
 * @param {'build'|'dev'|'check'|'aikb'|'images'} input.command
 * @param {boolean} [input.restart] `dev`: this child replaces one the edit stopped
 * @param {string} input.script
 * @param {string[]} [input.args]
 * @param {string} [input.reportFile] the JSON Lines file each settled build appends to
 * @param {string} [input.imagesFile] the sweep file, for `images`
 * @param {boolean} [input.refresh] `images --refresh`
 * @param {Record<string, string|undefined>} [input.env]
 * @param {number} [input.owner] this command's pid
 * @param {string} [input.preload] the `--import` URL of this copy's `run-preload.js`
 * @returns {SpawnPlan}
 */
export function spawnPlan({
  command,
  script,
  args = [],
  reportFile,
  imagesFile,
  refresh = false,
  restart = false,
  env = process.env,
  owner = process.pid,
  preload = PRELOAD,
}) {
  const building = command === 'build' || command === 'dev'
  /** @type {import('./run-state.js').RunRequest} */
  const request = {
    mode: command === 'dev' ? 'dev' : building ? 'build' : 'check',
    ...(command === 'dev' && restart ? { restart: true } : {}),
    ...(reportFile ? { report: reportFile } : {}),
    ...(command === 'aikb' ? { aikb: true } : {}),
    ...(imagesFile ? { images: imagesFile } : {}),
    ...(imagesFile && refresh ? { imagesRefresh: true } : {}),
    owner,
  }
  const childEnv = { ...env }
  for (const name of ALIASES) delete childEnv[name]
  if (!building) {
    childEnv.KISS_CHECK = '1'
    if (reportFile) childEnv.KISS_REPORT = reportFile
    if (request.aikb) childEnv.KISS_AIKB = '1'
    if (imagesFile) childEnv.KISS_IMAGES = imagesFile
    if (request.imagesRefresh) childEnv.KISS_IMAGES_REFRESH = '1'
  }
  return {
    execArgv: [
      '--import',
      `${preload}?run=${encodeURIComponent(JSON.stringify(request))}`,
    ],
    args: [script, ...args],
    env: childEnv,
    // The site's own build log goes to the command's stderr (fd 2 at the
    // child's stdout too) for the commands whose stdout is a report; `build`
    // has no report on stdout, so the child keeps its own streams.
    stdio:
      command === 'dev'
        ? ['inherit', 'inherit', 'inherit', 'ipc']
        : building
          ? 'inherit'
          : [0, 2, 2],
  }
}

/**
 * @typedef {Object} RunResult
 * @property {number|null} status the child's exit code; `null` when it never started or ended by signal
 * @property {string|null} signal
 * @property {Error|null} error the spawn's own error
 */

/**
 * Start the script and wait for it. On the command's own SIGINT or SIGTERM the
 * child is ended (SIGTERM, then SIGKILL after the grace, on POSIX; the tree by
 * `taskkill` on Windows) and the run resolves with a non-zero status: an
 * interrupted build must not let `&& firebase deploy` run.
 *
 * @param {SpawnPlan} plan
 * @param {{ spawn?: typeof nodeSpawn, cwd?: string, platform?: string, signals?: NodeJS.EventEmitter, kill?: (pid: number, signal: string) => void, grace?: number }} [options]
 * `signals` is where SIGINT and SIGTERM are heard: the process. `kill` sends a
 * signal to the child's pid, and `grace` is how long the child gets after
 * SIGTERM before SIGKILL on POSIX, in ms.
 * @returns {Promise<RunResult>}
 */
export function runScript(
  plan,
  {
    spawn = nodeSpawn,
    cwd = process.cwd(),
    platform = process.platform,
    signals = process,
    kill = (pid, signal) => process.kill(pid, signal),
    grace = STOP_GRACE_MS,
  } = {},
) {
  return new Promise((resolve) => {
    const posix = platform !== 'win32'
    // The caller's cwd, not the script's folder: a site resolves `folders`
    // against the cwd it is normally run from. The child stays in the
    // command's own process group, so a terminal's Ctrl-C reaches it and its
    // descendants as it does under `node router.js`.
    const child = spawn(process.execPath, [...plan.execArgv, ...plan.args], {
      cwd,
      env: plan.env,
      stdio: plan.stdio,
    })
    /** @type {string|null} */
    let interrupted = null
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let escalation
    // The child only; a pid that is already gone is the goal.
    const signalChild = (/** @type {string} */ signal) => {
      try {
        kill(/** @type {number} */ (child.pid), signal)
      } catch {
        /* nothing left to signal */
      }
    }
    const stop = (/** @type {string} */ signal) => {
      interrupted = signal
      if (child.pid === undefined) return
      if (!posix)
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        }).on('error', () => child.kill())
      else {
        signalChild('SIGTERM')
        clearTimeout(escalation)
        escalation = setTimeout(() => signalChild('SIGKILL'), grace)
      }
    }
    const onInt = () => stop('SIGINT')
    const onTerm = () => stop('SIGTERM')
    signals.on('SIGINT', onInt)
    signals.on('SIGTERM', onTerm)
    const done = (/** @type {RunResult} */ result) => {
      clearTimeout(escalation)
      signals.off('SIGINT', onInt)
      signals.off('SIGTERM', onTerm)
      resolve(result)
    }
    child.on('error', (error) => done({ status: null, signal: null, error }))
    child.on('close', (status, signal) =>
      done({
        status: interrupted && !status ? 1 : status,
        signal: signal ?? interrupted,
        error: null,
      }),
    )
  })
}
