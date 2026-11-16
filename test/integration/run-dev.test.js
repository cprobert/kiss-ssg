import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { superviseDev } from '../../lib/dev-supervisor.js'
import { startDevServer } from '../../lib/dev-server.js'
import { makeSite, waitFor } from '../helpers/site.js'

// `kiss-ssg dev` end to end (spec § 5.3, § 5.4), with real children, servers
// and watchers on ports the OS handed out. The graceful stop is driven through
// the supervisor's own `stop()` in this process: on Windows `child.kill('SIGINT')`
// ends a Node process outright (measured, Node 22 and 24), so a signal sent to
// the command would only ever exercise the "killed outright" row. The command
// itself, `bin/kiss-ssg.js dev`, is run for real in the first and last cases.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const engine = pathToFileURL(path.join(repoRoot, 'lib', 'kiss.js')).href

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const canBind = (port) =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A read that tolerates the one fault a rewrite in place causes: the served
// file replaced mid-response. The build folder is rebuilt in place, so a poll
// can land on that; the poll asks again.
const peek = (port, pathname) =>
  get(port, pathname).catch(() => ({ status: 0, text: null }))

// `node:http` with `agent: false`: one new connection per request, so a socket
// the server's idle timeout closes at the moment of reuse cannot read as a
// failure. (`fetch`'s `connection: close` header was not shown to be honoured.)
const get = (port, pathname = '/') =>
  new Promise((resolve, reject) => {
    http
      .get(
        { host: '127.0.0.1', port, path: pathname, agent: false },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => (text += chunk))
          response.on('end', () =>
            resolve({ status: response.statusCode, text }),
          )
          response.on('error', reject)
        },
      )
      .on('error', reject)
  })

// The site script. It records its pid, then writes the views from its own
// constants, so editing the script is how a test changes what is built.
const router = ({
  version = 1,
  breakB = false,
  throwAtLoad = false,
  exitLater = false,
  blockLater = false,
  port,
  livereloadPort,
}) => `import fs from 'node:fs'
import Kiss from '${engine}'
fs.appendFileSync('pids.txt', process.pid + '\\n')
${throwAtLoad ? "throw new Error('broken at load')" : ''}
fs.writeFileSync('src/pages/index.hbs', 'v${version}')
fs.writeFileSync('src/pages/b.hbs', ${breakB ? `'{{> "nope"}}'` : "'b-ok'"})
const kiss = new Kiss({
  folders: { src: './src', build: './public' },
  port: ${port},
  livereloadPort: ${livereloadPort},
  devHost: '127.0.0.1',
  assets: { pipeline: [{ name: 'w', run: 'node -e 0', watch: 'node watch.js' }] },
})
kiss.scan().generate()
await kiss.complete()
${exitLater ? 'await new Promise((resolve) => setTimeout(resolve, 1500))\nprocess.exit(3)' : ''}
${blockLater ? 'setTimeout(() => { for (;;); }, 500)' : ''}
`

const WATCH = `import fs from 'node:fs'
fs.appendFileSync('watch-pids.txt', process.pid + '\\n')
setInterval(() => {}, 1000)
`

const pidsIn = async (site, file) =>
  (await site.exists(file))
    ? (await site.read(file))
        .split('\n')
        .filter(Boolean)
        .map((line) => Number(line))
    : []

let site
let session = null
let commandProc = null
let blocker = null
let sockets = []
let ports = []

const makeDevSite = async (overrides = {}) => {
  const port = await freePort()
  const livereloadPort = await freePort()
  ports = [port, livereloadPort]
  site = await makeSite({
    'src/pages/c.hbs': 'c-ok',
    'watch.js': WATCH,
    'router.js': router({ port, livereloadPort, ...overrides }),
  })
  return { port, livereloadPort }
}

const rewrite = (overrides, ports2) =>
  site.touch('router.js', router({ ...ports2, ...overrides }))

// The supervisor in this process, with every real effect and a fake signal bus.
// What the supervisor did to its servers, with times, so a failed request can
// be placed against it: was the server down, or was the request unlucky?
let serverEvents = []

const startSession = () => {
  const lines = []
  serverEvents = []
  session = superviseDev({
    script: path.join(site.root, 'router.js'),
    cwd: site.root,
    signals: new EventEmitter(),
    say: (line) => lines.push(line),
    startServer: (...args) => {
      const handle = startDevServer(...args)
      serverEvents.push(['server-start', Date.now()])
      const close = handle.close
      handle.close = () => {
        serverEvents.push(['server-close', Date.now()])
        return close()
      }
      return handle
    },
  })
  return lines
}

// A livereload client: it counts the `reload` commands the server sends.
const livereloadClient = async (livereloadPort) => {
  // The first build sends one reload once it has settled, and a client that
  // joins later does not see it: wait it out, so the count starts at the edit.
  await sleep(1500)
  const reloads = []
  const socket = new WebSocket(`ws://127.0.0.1:${livereloadPort}/livereload`)
  sockets.push(socket)
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.command === 'reload') reloads.push(message.path)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  socket.send(
    JSON.stringify({
      command: 'hello',
      protocols: ['http://livereload.com/protocols/official-7'],
    }),
  )
  await sleep(100)
  return reloads
}

afterEach(async () => {
  for (const socket of sockets) socket.close()
  sockets = []
  await session?.stop()
  session = null
  if (commandProc && commandProc.exitCode === null) commandProc.kill()
  commandProc = null
  await new Promise((resolve) => blocker?.close(resolve) ?? resolve())
  blocker = null
  if (site) {
    // Whatever a case left running is a failure of the stop sequence, and is
    // ended here so the next case starts clean.
    const stray = [
      ...(await pidsIn(site, 'pids.txt')),
      ...(await pidsIn(site, 'watch-pids.txt')),
    ].filter(alive)
    for (const pid of stray) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
    expect(stray).toEqual([])
    for (const port of ports) expect(await canBind(port)).toBe(true)
    // Retried: Windows holds a folder a just-ended process had as its cwd.
    await rm(site.root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    })
    site = null
  }
}, 30000)

describe('kiss-ssg dev, end to end', () => {
  it('the channel closing ends the child: its instances close and its pipeline watch goes', async () => {
    // This process plays the command. Killing the real command cannot reach the
    // child's `disconnect` handler on Windows, where the OS ends the child with
    // it (see the next case), so the channel is closed from this side instead.
    const { port, livereloadPort } = await makeDevSite()
    const request = { mode: 'dev', owner: process.pid }
    const preload = pathToFileURL(
      path.join(repoRoot, 'lib', 'run-preload.js'),
    ).href
    const child = spawn(
      process.execPath,
      [
        '--import',
        `${preload}?run=${encodeURIComponent(JSON.stringify(request))}`,
        'router.js',
      ],
      { cwd: site.root, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    )
    const served = []
    child.on('message', (message) => {
      if (message.serve) {
        served.push(message.serve)
        child.send({
          serving: true,
          host: message.serve.host,
          port: message.serve.port,
        })
      }
    })
    await waitFor(
      async () => (await pidsIn(site, 'watch-pids.txt')).length === 1,
      {
        timeout: 30000,
      },
    )
    const [watcher] = await pidsIn(site, 'watch-pids.txt')
    expect(served).toEqual([
      {
        root: path.join(site.root, 'public').replace(/\//g, path.sep),
        port,
        host: '127.0.0.1',
        livereloadPort,
      },
    ])
    expect(alive(child.pid)).toBe(true)

    child.disconnect()

    await waitFor(() => !alive(child.pid) && !alive(watcher), {
      timeout: 30000,
    })
  }, 90000)

  it('serves the built page on the port, and when the command is killed outright the child goes with it', async () => {
    const { port } = await makeDevSite()
    commandProc = spawn(process.execPath, [bin, 'dev', 'router.js'], {
      cwd: site.root,
      stdio: 'ignore',
    })

    await waitFor(
      async () => (await get(port).catch(() => ({}))).text === 'v1',
      {
        timeout: 30000,
      },
    )
    await waitFor(
      async () => (await pidsIn(site, 'watch-pids.txt')).length === 1,
      {
        timeout: 30000,
      },
    )
    const [child] = await pidsIn(site, 'pids.txt')
    const [watcher] = await pidsIn(site, 'watch-pids.txt')
    expect(alive(child)).toBe(true)

    commandProc.kill()

    // The child ends. On Windows the OS ends it with the command at once
    // (measured: no `exit` or `disconnect` event ran in it), so nothing of the
    // child's own closes, and its pipeline watch process is left behind, as it
    // is when `node router.js` is killed. Recorded in AIKB/rebuild.md; ended
    // here so the case leaves nothing.
    await waitFor(() => !alive(child), { timeout: 30000 })
    try {
      process.kill(watcher, 'SIGKILL')
    } catch {
      /* it went with the child */
    }
  }, 90000)

  it('an edit to the script starts a new child, and a request loop never meets a refused connection', async () => {
    const ports2 = await makeDevSite()
    const lines = startSession()
    await waitFor(
      async () => (await get(ports2.port).catch(() => ({}))).text === 'v1',
      {
        timeout: 30000,
      },
    )
    const reloads = await livereloadClient(ports2.livereloadPort)

    const refused = []
    const succeeded = []
    let loop = true
    const requests = (async () => {
      while (loop) {
        await get(ports2.port).then(
          () => succeeded.push(Date.now()),
          // A refused or reset connection is a server that was down. Anything
          // after the connection was made is a file read while a rebuild
          // rewrote it (`aborted`, `Data after Connection: close`, and an
          // `ECONNRESET` when serve-static destroys the socket on a read
          // error): measured, the server was never closed in a run that saw
          // one (see `serverEvents` below), and it is not what this case is
          // about.
          (error) =>
            ['ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)
              ? refused.push(`${error.code} at ${Date.now()}`)
              : null,
        )
        await sleep(15)
      }
    })()
    const [first] = await pidsIn(site, 'pids.txt')
    const editedAt = Date.now()
    await rewrite({ version: 2 }, ports2)
    // When the old child was gone, to the millisecond-ish.
    let oldGoneAt = 0
    await waitFor(
      () => {
        if (!alive(first)) oldGoneAt = Date.now()
        return oldGoneAt > 0
      },
      { timeout: 30000, interval: 5 },
    )
    await waitFor(async () => (await pidsIn(site, 'pids.txt')).length === 2, {
      timeout: 30000,
    })
    await waitFor(async () => (await peek(ports2.port)).text === 'v2', {
      timeout: 30000,
    })
    await waitFor(() => reloads.length === 1, { timeout: 30000 })
    const reloadedAt = Date.now()
    loop = false
    await requests

    const [, second] = await pidsIn(site, 'pids.txt')
    expect(second).not.toBe(first)
    expect(alive(first)).toBe(false)
    // The loop must have been asking throughout: requests between the edit and
    // the reload, and some after the old child had gone, before the new one
    // had reloaded the browser.
    expect(
      succeeded.filter((at) => at >= editedAt && at <= reloadedAt).length,
    ).toBeGreaterThanOrEqual(10)
    expect(
      succeeded.filter((at) => at >= oldGoneAt && at <= reloadedAt).length,
    ).toBeGreaterThanOrEqual(3)
    expect(
      refused,
      JSON.stringify({ serverEvents, editedAt, oldGoneAt, reloadedAt }),
    ).toEqual([])
    // The command's servers were started once and never closed by the restart:
    // a reset is then a socket, not a server that was down.
    expect(serverEvents.map(([event]) => event)).toEqual(['server-start'])
    expect(reloads).toHaveLength(1)
    expect(lines.join('\n')).toContain('router.js changed. Restarting.')
  }, 90000)

  it('a script that fails to load: every old file is still served, nothing reloads, and the command says so', async () => {
    const ports2 = await makeDevSite()
    const lines = startSession()
    await waitFor(
      async () => (await get(ports2.port).catch(() => ({}))).text === 'v1',
      {
        timeout: 30000,
      },
    )
    const reloads = await livereloadClient(ports2.livereloadPort)

    await rewrite({ version: 2, throwAtLoad: true }, ports2)
    await waitFor(() => lines.some((line) => line.includes('Still serving')), {
      timeout: 30000,
    })
    await sleep(500)

    expect((await peek(ports2.port)).text).toBe('v1')
    expect(reloads).toHaveLength(0)
    const said = lines.join('\n')
    expect(said).toContain(
      `router.js exited (code 1). Still serving ./public at http://127.0.0.1:${ports2.port}.`,
    )
    expect(said).toContain('Waiting for the next change to router.js.')

    // The next edit that runs starts another, and then the browser reloads once.
    await rewrite({ version: 3 }, ports2)
    await waitFor(async () => (await peek(ports2.port)).text === 'v3', {
      timeout: 30000,
    })
    await waitFor(() => reloads.length === 1, { timeout: 30000 })
  }, 90000)

  it('an edit that breaks one page of three: no reload, the old file is served, and a later fix reloads once', async () => {
    const ports2 = await makeDevSite()
    startSession()
    await waitFor(
      async () => (await get(ports2.port).catch(() => ({}))).text === 'v1',
      {
        timeout: 30000,
      },
    )
    const reloads = await livereloadClient(ports2.livereloadPort)

    await rewrite({ version: 2, breakB: true }, ports2)
    await waitFor(async () => (await peek(ports2.port)).text === 'v2', {
      timeout: 30000,
    })
    await sleep(1500)

    expect(reloads).toHaveLength(0)
    expect((await peek(ports2.port, '/b')).text).toBe('b-ok')
    expect((await peek(ports2.port, '/c')).text).toBe('c-ok')

    // The child is alive with a failing page: a fix to the view rebuilds.
    await site.touch('src/pages/b.hbs', 'b-fixed')
    await waitFor(
      async () => (await peek(ports2.port, '/b')).text === 'b-fixed',
      {
        timeout: 30000,
      },
    )
    await waitFor(() => reloads.length === 1, { timeout: 30000 })
    await sleep(300)
    expect(reloads).toHaveLength(1)
    expect(await pidsIn(site, 'pids.txt')).toHaveLength(2)
  }, 90000)

  it('a script whose port is taken: the child exits by itself and the command reports it', async () => {
    const ports2 = await makeDevSite()
    blocker = net.createServer()
    await new Promise((resolve) =>
      blocker.listen(ports2.port, '127.0.0.1', resolve),
    )
    const lines = startSession()

    await waitFor(() => lines.some((line) => line.includes('exited')), {
      timeout: 30000,
    })

    expect(lines.join('\n')).toContain('router.js exited (code ')
    expect(lines.join('\n')).not.toContain('Still serving')
    expect((await pidsIn(site, 'pids.txt')).filter(alive)).toEqual([])
  }, 90000)

  it('a child that ends by process.exit() leaves no pipeline watch process: the exit guard runs', async () => {
    const ports2 = await makeDevSite({ exitLater: true })
    const lines = startSession()

    await waitFor(() => lines.some((line) => line.includes('exited')), {
      timeout: 30000,
    })

    expect(lines.join('\n')).toContain('router.js exited (code 3)')
    const [watcher] = await pidsIn(site, 'watch-pids.txt')
    expect(watcher).toBeDefined()
    await waitFor(() => !alive(watcher), { timeout: 10000 })
    // What the command was serving is still served.
    expect((await peek(ports2.port)).text).toBe('v1')
  }, 90000)

  // The child cannot hear `{ stop: true }`, so it is killed, and a kill runs no
  // exit guard. On POSIX each watch tool has a process group of its own, so
  // only the command can end it: one was left behind per restart (Codex,
  // slice 3, measured in WSL 2026-11-16).
  it('a child too busy to stop is killed after the wait, and its pipeline watch process goes with it', async () => {
    const ports2 = await makeDevSite({ blockLater: true })
    startSession()
    await waitFor(
      async () => (await pidsIn(site, 'watch-pids.txt')).length === 1,
      { timeout: 30000 },
    )
    const [first] = await pidsIn(site, 'watch-pids.txt')
    await sleep(1000)

    await rewrite({ version: 2, blockLater: true }, ports2)
    await waitFor(
      async () => (await pidsIn(site, 'watch-pids.txt')).length === 2,
      { timeout: 30000 },
    )

    await waitFor(() => !alive(first), { timeout: 5000 })
  }, 90000)

  it('after a stop no child and no pipeline watch process is alive, and the ports are free', async () => {
    const ports2 = await makeDevSite()
    const lines = startSession()
    await waitFor(
      async () => (await get(ports2.port).catch(() => ({}))).text === 'v1',
      {
        timeout: 30000,
      },
    )
    await waitFor(
      async () => (await pidsIn(site, 'watch-pids.txt')).length === 1,
      {
        timeout: 30000,
      },
    )
    const [child] = await pidsIn(site, 'pids.txt')
    const [watcher] = await pidsIn(site, 'watch-pids.txt')
    expect(alive(watcher)).toBe(true)

    const started = Date.now()
    await session.stop()
    session = null

    expect(alive(child)).toBe(false)
    expect(alive(watcher)).toBe(false)
    expect(await canBind(ports2.port)).toBe(true)
    expect(await canBind(ports2.livereloadPort)).toBe(true)
    // The graceful path ended it: well inside the five seconds before a kill.
    expect(Date.now() - started).toBeLessThan(4500)
    expect(lines.join('\n')).not.toContain('Still serving')
  }, 90000)
})
