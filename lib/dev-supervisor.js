import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn as nodeSpawn } from 'node:child_process'
import { spawnPlan } from './run-script.js'
import { startDevServer } from './dev-server.js'
import { WRITE_SETTLE } from './watcher.js'
import logger from './logger.js'

// `kiss-ssg dev`'s session (spec § 5.3, § 5.4). The command owns what must
// outlive a restart: the dev servers, the watch on the script and the child's
// life. The child owns the build. Every effect is injected, so the unit test
// runs it with no child, port or watcher.
const require = createRequire(import.meta.url)

// How long a child gets to close its instances after `{ stop: true }`, in ms,
// before its tree is killed.
const STOP_WAIT_MS = 5000

/**
 * @typedef {Object} Served
 * @property {string} root
 * @property {number} livereloadPort
 * @property {number} gen the child generation that last asked for it
 * @property {{ ready: Promise<void>, refresh: (path?: string) => void, close: () => Promise<void> }} handle
 */

/**
 * @typedef {Object} ChildRecord
 * @property {import('node:child_process').ChildProcess} proc
 * @property {number} gen
 * @property {boolean} expected the command is ending it: its exit is not news
 * @property {boolean} exited
 * @property {boolean} swept earlier children's unclaimed servers are retired
 * @property {Set<string>} asked the `host:port` pairs it has asked for
 * @property {number} before how many servers were up when it started
 * @property {Promise<void>} gone resolves on its exit
 */

/**
 * The two lines printed when the child ends by itself: what happened, what is
 * still served, and what starts another.
 *
 * @param {{ name: string, code: number|null, signal: string|null, served: string[] }} input `served` is one `./folder at address` per server
 * @returns {string}
 */
export function exitedLines({ name, code, signal, served }) {
  const how = signal ? `signal ${signal}` : `code ${code}`
  const still = served.length ? ` Still serving ${served.join('; ')}.` : ''
  return `kiss-ssg dev: ${name} exited (${how}).${still}\nWaiting for the next change to ${name}.`
}

/**
 * Run the dev session.
 *
 * @param {Object} options
 * @param {string} options.script the resolved script file
 * @param {string[]} [options.args] the script's own arguments
 * @param {string} [options.cwd]
 * @param {Record<string, string|undefined>} [options.env]
 * @param {typeof nodeSpawn} [options.spawn]
 * @param {typeof startDevServer} [options.startServer]
 * @param {(file: string, options: object) => { on: Function, close: () => Promise<void> }} [options.watch] chokidar's `watch`
 * @param {NodeJS.EventEmitter} [options.signals] where SIGINT and SIGTERM are heard
 * @param {(line: string) => void} [options.say] the command's own lines
 * @param {string} [options.platform]
 * @param {(pid: number, signal: string) => void} [options.kill]
 * @param {number} [options.stopWait]
 * @returns {{ done: Promise<number>, stop: () => Promise<void> }} `done` resolves 0 once everything has stopped
 */
export function superviseDev({
  script,
  args = [],
  cwd = process.cwd(),
  env = process.env,
  spawn = nodeSpawn,
  startServer = startDevServer,
  watch = (file, options) => require('chokidar').watch(file, options),
  signals = process,
  say = (line) => console.error(line),
  platform = process.platform,
  kill = (pid, signal) => process.kill(pid, signal),
  stopWait = STOP_WAIT_MS,
}) {
  const name = path.basename(script)
  /** @type {Map<string, Served>} */
  const servers = new Map()
  /** @type {ChildRecord|null} */
  let child = null
  let generation = 0
  let closing = false
  /** @type {Promise<void>|null} */
  let running = null
  let again = false
  /** @type {Promise<void>|null} */
  let stopped = null

  const relative = (root) => {
    const rel = path.relative(cwd, root).split(path.sep).join('/')
    return rel === '' ? '.' : rel.startsWith('..') ? root : `./${rel}`
  }
  const closeServer = async (/** @type {Served} */ served) => {
    try {
      await served.handle.close()
    } catch {
      /* already closed */
    }
  }
  const send = (/** @type {ChildRecord} */ record, message) => {
    if (!record.proc.connected) return
    try {
      record.proc.send(message)
    } catch {
      /* the channel is closing */
    }
  }

  // One server pair per host:port. A repeat of the same ask answers `serving`
  // and changes nothing; a different folder on a taken port is a failed bind,
  // unless the holder is an earlier child's, which the edit replaced.
  const serve = async (
    /** @type {ChildRecord} */ record,
    /** @type {{ root: string, port: number, host: string, livereloadPort: number }} */ ask,
  ) => {
    const { root, port, host, livereloadPort } = ask
    const key = `${host}:${port}`
    let held = servers.get(key)
    if (
      held &&
      (held.root !== root || held.livereloadPort !== livereloadPort)
    ) {
      if (held.gen === record.gen)
        return {
          serveFailed: `${key} is already serving ${held.root}, so ${root} cannot be served there`,
        }
      say(`kiss-ssg dev: ${name} now serves ${relative(root)} at http://${key}`)
      servers.delete(key)
      await closeServer(held)
      held = undefined
    }
    if (!held) {
      try {
        held = {
          root,
          livereloadPort,
          gen: record.gen,
          handle: startServer(root, port, {
            logger,
            livereloadPort,
            host,
          }),
        }
      } catch (error) {
        return { serveFailed: /** @type {Error} */ (error).message }
      }
      servers.set(key, held)
    }
    held.gen = record.gen
    try {
      await held.handle.ready
      return { serving: true }
    } catch (error) {
      if (servers.get(key) === held) servers.delete(key)
      await closeServer(held)
      return { serveFailed: /** @type {Error} */ (error).message }
    }
  }

  const onMessage = (/** @type {ChildRecord} */ record, message) => {
    if (record !== child || !message || typeof message !== 'object') return
    if (message.serve) {
      const { host, port } = message.serve
      record.asked.add(`${host}:${port}`)
      serve(record, message.serve).then((reply) =>
        send(record, { ...reply, host, port }),
      )
    } else if ('reload' in message) {
      // An earlier child's servers that this one did not ask for again are
      // done, once it has asked for as many as were being served: a script
      // that builds its sites one after another asks for the second only after
      // the first has reloaded, and that one must not drop in between.
      if (!record.swept && record.asked.size >= record.before) {
        record.swept = true
        for (const [key, held] of [...servers])
          if (held.gen !== record.gen) {
            servers.delete(key)
            closeServer(held)
          }
      }
      for (const held of servers.values())
        try {
          held.handle.refresh(message.reload)
        } catch {
          /* a socket that went away never fails the build */
        }
    }
  }

  const startChild = (/** @type {boolean} */ restart) => {
    const plan = spawnPlan({ command: 'dev', script, args, restart, env })
    const proc = spawn(process.execPath, [...plan.execArgv, ...plan.args], {
      cwd,
      env: plan.env,
      stdio: /** @type {import('node:child_process').StdioOptions} */ (
        plan.stdio
      ),
    })
    /** @type {ChildRecord} */
    const record = {
      proc,
      gen: ++generation,
      expected: false,
      exited: false,
      swept: false,
      asked: new Set(),
      before: servers.size,
      gone: Promise.resolve(),
    }
    record.gone = new Promise((resolve) => {
      proc.once('error', (error) => {
        record.exited = true
        say(`kiss-ssg dev: could not start ${name} (${error.message})`)
        resolve()
      })
      proc.once('exit', (code, signal) => {
        record.exited = true
        resolve()
        if (record !== child || record.expected || closing) return
        say(
          exitedLines({
            name,
            code,
            signal,
            served: [...servers].map(
              ([key, held]) => `${relative(held.root)} at http://${key}`,
            ),
          }),
        )
      })
    })
    proc.on('message', (message) => onMessage(record, message))
    child = record
  }

  // `{ stop: true }`, then a bounded wait, then the tree.
  const stopChild = async (/** @type {ChildRecord|null} */ record) => {
    if (!record || record.exited) return
    record.expected = true
    send(record, { stop: true })
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer
    const late = await Promise.race([
      record.gone.then(() => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(true), stopWait)
      }),
    ])
    clearTimeout(timer)
    if (!late) return
    const pid = /** @type {number} */ (record.proc.pid)
    if (platform === 'win32')
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      }).on('error', () => record.proc.kill())
    else
      try {
        kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    await record.gone
  }

  // One restart at a time; edits during it collapse into one more.
  const restart = () => {
    if (closing) return
    if (running) {
      again = true
      return
    }
    running = (async () => {
      do {
        again = false
        say(`kiss-ssg dev: ${name} changed. Restarting.`)
        await stopChild(child)
        if (closing) return
        startChild(true)
      } while (again)
    })().finally(() => {
      running = null
    })
  }

  const watcher = watch(script, WRITE_SETTLE)
  watcher.on('change', restart)
  // An unheard 'error' ends the command; the session outlives a watch fault.
  watcher.on('error', (/** @type {Error} */ error) =>
    say(`kiss-ssg dev: watching ${name} failed (${error.message})`),
  )

  /** @type {(value: number) => void} */
  let finish = () => {}
  const done = new Promise((resolve) => {
    finish = resolve
  })
  const stop = () => {
    if (stopped) return stopped
    closing = true
    signals.off('SIGINT', stop)
    signals.off('SIGTERM', stop)
    stopped = (async () => {
      await watcher.close()
      await running
      await stopChild(child)
      await Promise.all([...servers.values()].map(closeServer))
      servers.clear()
      finish(0)
    })()
    return stopped
  }
  signals.on('SIGINT', stop)
  signals.on('SIGTERM', stop)

  startChild(false)
  return { done, stop }
}
