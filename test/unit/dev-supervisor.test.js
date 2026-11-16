import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { exitedLines, superviseDev } from '../../lib/dev-supervisor.js'

// The dev session's decisions, with a fake child, fake servers and a fake
// watcher: no process, port or file is touched.
const SCRIPT = path.resolve('/site/router.js')
const tick = () => new Promise((resolve) => setImmediate(resolve))

const harness = ({
  exitOnStop = true,
  platform = 'linux',
  stopWait = 20,
  bindFails = false,
} = {}) => {
  const children = []
  const servers = []
  const lines = []
  const killed = []
  const spawned = []
  const watcher = Object.assign(new EventEmitter(), {
    closed: false,
    close: async () => {
      watcher.closed = true
    },
  })
  const signals = new EventEmitter()
  const spawn = (command, args, options) => {
    spawned.push({ command, args, options })
    if (command === 'taskkill') return new EventEmitter()
    const child = Object.assign(new EventEmitter(), {
      pid: 1000 + children.length,
      connected: true,
      sent: [],
      send(message) {
        child.sent.push(message)
        if (message.stop && exitOnStop) setImmediate(() => child.end(0))
      },
      end(code, signal = null) {
        child.connected = false
        child.emit('exit', code, signal)
      },
    })
    children.push(child)
    return child
  }
  const startServer = (root, port, options) => {
    const server = {
      root,
      port,
      options,
      refreshed: [],
      closed: false,
      ready: bindFails
        ? Promise.reject(new Error('EADDRINUSE'))
        : Promise.resolve(),
      refresh: (p) => server.refreshed.push(p),
      close: async () => {
        server.closed = true
      },
    }
    servers.push(server)
    return server
  }
  const session = superviseDev({
    script: SCRIPT,
    args: ['production'],
    cwd: path.resolve('/site'),
    env: { PATH: 'x' },
    spawn,
    startServer,
    watch: () => watcher,
    signals,
    say: (line) => lines.push(line),
    platform,
    kill: (pid, signal) => killed.push([pid, signal]),
    stopWait,
  })
  const serve = (child, over = {}) =>
    child.emit('message', {
      serve: {
        root: path.resolve('/site/public'),
        port: 3001,
        host: '127.0.0.1',
        livereloadPort: 35729,
        ...over,
      },
    })
  return {
    ...session,
    children,
    servers,
    lines,
    killed,
    spawned,
    watcher,
    signals,
    serve,
  }
}

describe('exitedLines', () => {
  it('says what is still served and what starts another', () => {
    expect(
      exitedLines({
        name: 'router.js',
        code: 1,
        signal: null,
        served: ['./public at http://127.0.0.1:3001'],
      }),
    ).toBe(
      'kiss-ssg dev: router.js exited (code 1). Still serving ./public at http://127.0.0.1:3001.\nWaiting for the next change to router.js.',
    )
  })

  it('leaves the address out when nothing is served yet, and names a signal', () => {
    expect(
      exitedLines({
        name: 'router.js',
        code: null,
        signal: 'SIGKILL',
        served: [],
      }),
    ).toBe(
      'kiss-ssg dev: router.js exited (signal SIGKILL).\nWaiting for the next change to router.js.',
    )
  })
})

describe('the child', () => {
  it('starts as a dev request with a channel, the script and its own arguments', () => {
    const h = harness()
    const [{ args, options }] = h.spawned
    expect(args.at(-2)).toBe(SCRIPT)
    expect(args.at(-1)).toBe('production')
    const request = JSON.parse(
      decodeURIComponent(new URL(args[1]).searchParams.get('run')),
    )
    expect(request).toMatchObject({ mode: 'dev' })
    expect(request.restart).toBeUndefined()
    expect(options.stdio).toEqual(['inherit', 'inherit', 'inherit', 'ipc'])
    expect(options.cwd).toBe(path.resolve('/site'))
  })

  it('a restarted child asks for restart: true', async () => {
    const h = harness()
    h.watcher.emit('change')
    await tick()
    await tick()
    const request = JSON.parse(
      decodeURIComponent(new URL(h.spawned[1].args[1]).searchParams.get('run')),
    )
    expect(request.restart).toBe(true)
  })

  it('a child that ends by itself is reported with what is still served, and waits', async () => {
    const h = harness()
    h.serve(h.children[0])
    await tick()
    h.children[0].end(1)
    expect(h.lines).toEqual([
      `kiss-ssg dev: router.js exited (code 1). Still serving ./public at http://127.0.0.1:3001.\nWaiting for the next change to router.js.`,
    ])
    expect(h.children).toHaveLength(1)
  })

  it('before anything is served, the same report has no address', () => {
    const h = harness()
    h.children[0].end(1)
    expect(h.lines).toEqual([
      'kiss-ssg dev: router.js exited (code 1).\nWaiting for the next change to router.js.',
    ])
  })
})

describe('the servers', () => {
  it('serves what the child asks and answers serving, with the address it answers for', async () => {
    const h = harness()
    h.serve(h.children[0])
    await tick()
    expect(h.servers).toHaveLength(1)
    expect(h.servers[0].port).toBe(3001)
    expect(h.servers[0].options).toMatchObject({
      livereloadPort: 35729,
      host: '127.0.0.1',
    })
    expect(h.children[0].sent).toContainEqual({
      serving: true,
      host: '127.0.0.1',
      port: 3001,
    })
  })

  it('the same ask again changes nothing', async () => {
    const h = harness()
    h.serve(h.children[0])
    h.serve(h.children[0])
    await tick()
    expect(h.servers).toHaveLength(1)
    expect(h.children[0].sent.filter((m) => m.serving)).toHaveLength(2)
  })

  it('a different folder on a taken port is a failed bind', async () => {
    const h = harness()
    h.serve(h.children[0])
    h.serve(h.children[0], { root: path.resolve('/site/other') })
    await tick()
    expect(h.servers).toHaveLength(1)
    const failed = h.children[0].sent.find((m) => m.serveFailed)
    expect(failed.serveFailed).toContain('already serving')
  })

  it('a bind failure answers serveFailed and closes what it started', async () => {
    const h = harness({ bindFails: true })
    h.serve(h.children[0])
    await tick()
    await tick()
    const failed = h.children[0].sent.find((m) => m.serveFailed)
    expect(failed).toMatchObject({ serveFailed: 'EADDRINUSE', port: 3001 })
    expect(h.servers[0].closed).toBe(true)
  })

  it('a restart whose serve values changed closes the old pair, starts the new and says so', async () => {
    const h = harness()
    h.serve(h.children[0])
    await tick()
    h.watcher.emit('change')
    await tick()
    await tick()
    h.serve(h.children[1], { root: path.resolve('/site/dist') })
    await tick()
    await tick()
    expect(h.servers).toHaveLength(2)
    expect(h.servers[0].closed).toBe(true)
    expect(h.servers[1].closed).toBe(false)
    expect(h.lines.join('\n')).toContain(
      'router.js now serves ./dist at http://127.0.0.1:3001',
    )
  })

  it('a restart that asks for the same values leaves the servers alone', async () => {
    const h = harness()
    h.serve(h.children[0])
    await tick()
    h.watcher.emit('change')
    await tick()
    await tick()
    h.serve(h.children[1])
    await tick()
    expect(h.servers).toHaveLength(1)
    expect(h.servers[0].closed).toBe(false)
  })

  it('a reload reaches the servers, and the first one retires the servers the new child did not ask for', async () => {
    const h = harness()
    h.serve(h.children[0], { port: 3001 })
    await tick()
    h.watcher.emit('change')
    await tick()
    await tick()
    h.serve(h.children[1], { port: 3002 })
    await tick()
    expect(h.servers[0].closed).toBe(false)

    h.children[1].emit('message', { reload: '/' })

    expect(h.servers[0].closed).toBe(true)
    expect(h.servers[1].refreshed).toEqual(['/'])
  })
})

describe('two instances on two ports, built one after the other', () => {
  it('the second one’s server does not drop when the first reloads', async () => {
    const h = harness()
    h.serve(h.children[0], { port: 3001 })
    h.serve(h.children[0], { port: 3002 })
    await tick()
    h.watcher.emit('change')
    await tick()
    await tick()

    // The restarted child builds the first site, reloads it, and only then
    // constructs the second.
    h.serve(h.children[1], { port: 3001 })
    await tick()
    h.children[1].emit('message', { reload: '/' })
    expect(h.servers.map((s) => s.closed)).toEqual([false, false])

    h.serve(h.children[1], { port: 3002 })
    await tick()
    h.children[1].emit('message', { reload: '/' })
    expect(h.servers).toHaveLength(2)
    expect(h.servers.map((s) => s.closed)).toEqual([false, false])
  })

  it('a pair the restarted child no longer asks for is retired once it has asked for as many', async () => {
    const h = harness()
    h.serve(h.children[0], { port: 3001 })
    h.serve(h.children[0], { port: 3002 })
    await tick()
    h.watcher.emit('change')
    await tick()
    await tick()
    h.serve(h.children[1], { port: 3001 })
    h.serve(h.children[1], { port: 3003 })
    await tick()
    h.children[1].emit('message', { reload: '/' })
    expect(h.servers.map((s) => [s.port, s.closed])).toEqual([
      [3001, false],
      [3002, true],
      [3003, false],
    ])
  })
})

describe('an edit to the script', () => {
  it('stops the child with { stop: true }, waits for it, then starts the next', async () => {
    const h = harness()
    h.watcher.emit('change')
    await tick()
    expect(h.children[0].sent).toContainEqual({ stop: true })
    await tick()
    await tick()
    expect(h.children).toHaveLength(2)
    expect(h.lines.join('\n')).toContain('router.js changed. Restarting.')
    expect(h.lines.join('\n')).not.toContain('Waiting for the next change')
  })

  it('edits during a restart collapse into one more', async () => {
    const h = harness()
    h.watcher.emit('change')
    h.watcher.emit('change')
    h.watcher.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(h.children).toHaveLength(3)
  })

  it('a child that will not stop is killed after the wait: its tree by taskkill on Windows', async () => {
    const h = harness({ exitOnStop: false, platform: 'win32' })
    h.watcher.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const kill = h.spawned.find((s) => s.command === 'taskkill')
    expect(kill.args).toEqual(['/pid', '1000', '/T', '/F'])
    h.children[0].end(null, 'SIGKILL')
    await tick()
    await tick()
    expect(h.children).toHaveLength(2)
  })

  it('and by SIGKILL elsewhere', async () => {
    const h = harness({ exitOnStop: false })
    h.watcher.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(h.killed).toEqual([[1000, 'SIGKILL']])
    h.children[0].end(null, 'SIGKILL')
  })

  // A SIGKILL runs no exit guard, and each watch tool is in a process group
  // of its own: without this, one tool is left behind per restart.
  it('and with it each pipeline watch group the child reported still running', async () => {
    const h = harness({ exitOnStop: false })
    h.children[0].emit('message', { watchGroup: 2001 })
    h.children[0].emit('message', { watchGroup: 2002 })
    h.children[0].emit('message', { watchGroupEnded: 2002 })
    h.watcher.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(h.killed).toEqual([
      [1000, 'SIGKILL'],
      [-2001, 'SIGKILL'],
    ])
    h.children[0].end(null, 'SIGKILL')
  })

  it('a child that stops when asked leaves its watch groups to itself', async () => {
    const h = harness()
    h.children[0].emit('message', { watchGroup: 2001 })
    h.watcher.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(h.killed).toEqual([])
  })

  it('a watch error is logged and the session keeps going', () => {
    const h = harness()
    expect(() => h.watcher.emit('error', new Error('EPERM'))).not.toThrow()
    expect(h.lines.join('\n')).toContain('watching router.js failed (EPERM)')
  })
})

describe('stopping', () => {
  it('on SIGINT: stop the child, close the servers, resolve 0', async () => {
    const h = harness()
    h.serve(h.children[0])
    await tick()

    h.signals.emit('SIGINT')

    await expect(h.done).resolves.toBe(0)
    expect(h.children[0].sent).toContainEqual({ stop: true })
    expect(h.servers[0].closed).toBe(true)
    expect(h.watcher.closed).toBe(true)
    expect(h.signals.listenerCount('SIGINT')).toBe(0)
  })

  it('on SIGTERM the same', async () => {
    const h = harness()
    h.signals.emit('SIGTERM')
    await expect(h.done).resolves.toBe(0)
  })

  it('a child that exits first (a console Ctrl-C reaches it too) is not reported as still serving', async () => {
    const h = harness({ exitOnStop: false })
    h.serve(h.children[0])
    await tick()

    h.signals.emit('SIGINT')
    h.children[0].end(0)
    await h.done

    expect(h.lines.join('\n')).not.toContain('Still serving')
    expect(h.lines.join('\n')).not.toContain('Waiting for the next change')
  })

  it('a restart in progress when the stop comes starts no new child', async () => {
    const h = harness()
    h.watcher.emit('change')
    h.signals.emit('SIGINT')
    await h.done
    expect(h.children).toHaveLength(1)
  })
})
