import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest'
import net from 'node:net'

// The mock is hoisted and therefore file-wide, so the real-livereload block
// below flips this flag rather than trying to unmock a single describe.
const livereload = vi.hoisted(() => ({ useReal: false }))

vi.mock('livereload', async (importOriginal) => {
  const actual = await importOriginal()
  const createReal = actual.default?.createServer ?? actual.createServer
  return {
    default: {
      createServer: (config, callback) =>
        livereload.useReal
          ? createReal(config, callback)
          : { watch: vi.fn(), close: vi.fn(), on: vi.fn() },
    },
  }
})

import { startDevServer } from '../../lib/dev-server.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

const captureLogger = () => {
  const lines = []
  const record =
    (level) =>
    (...args) =>
      lines.push(`${level}: ${args.map(String).join(' ')}`)
  return {
    ...silentLogger,
    lines,
    info: record('info'),
    error: record('error'),
    warn: record('warn'),
    plain: () => {},
  }
}

describe('startDevServer', () => {
  it('listens, serves files from httpRoot, and closes cleanly', async () => {
    const handle = startDevServer('public', 0, {
      logger: silentLogger,
      livereloadPort: 35801,
      host: '127.0.0.1',
    })
    await handle.ready
    const { port } = handle.server.address()
    expect(port).toBeGreaterThan(0)
    const res = await fetch(`http://127.0.0.1:${port}/definitely-missing.html`)
    expect(res.status).toBe(404)
    await handle.close()
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })

  it('rejects ready (without crashing) when the port is already in use', async () => {
    const first = startDevServer('public', 0, {
      logger: silentLogger,
      livereloadPort: 35802,
      host: '127.0.0.1',
    })
    await first.ready
    const { port } = first.server.address()
    const second = startDevServer('public', port, {
      logger: silentLogger,
      livereloadPort: 35803,
      host: '127.0.0.1',
    })
    await expect(second.ready).rejects.toThrow()
    await expect(second.close()).resolves.toBeUndefined()
    await first.close()
  })
})

// No livereload mock in this block: D-01 (an EADDRINUSE on the livereload port
// killed the whole dev process) was invisible to a suite that mocked it away.
describe('startDevServer with a real livereload server', () => {
  const handles = []
  let site
  const start = ({ httpRoot = 'public', ...options } = {}) => {
    const handle = startDevServer(httpRoot, 0, {
      host: '127.0.0.1',
      ...options,
    })
    // livereload watches with chokidar's ignoreInitial, so a file written
    // before the initial scan finishes counts as pre-existing and never emits
    // 'add'. 'ready' is one-shot, so the listener is attached here — in the
    // same synchronous turn as chokidar.watch() — where it cannot be missed.
    handle.watching = new Promise((resolve) =>
      handle.livereload.watcher.once('ready', resolve),
    )
    handles.push(handle)
    return handle
  }

  beforeAll(() => {
    livereload.useReal = true
  })
  afterAll(() => {
    livereload.useReal = false
  })
  afterEach(async () => {
    while (handles.length) await handles.pop().close()
    if (site) {
      await site.cleanup()
      site = undefined
    }
  })

  it('survives a livereload port clash: logs it and keeps serving both sites', async () => {
    const loggerA = captureLogger()
    const loggerB = captureLogger()
    const a = start({ logger: loggerA, livereloadPort: 35811 })
    await a.ready
    const b = start({ logger: loggerB, livereloadPort: 35811 })
    await b.ready

    await waitFor(() => loggerB.lines.some((l) => l.includes('EADDRINUSE')))
    expect(loggerA.lines.some((l) => l.startsWith('error:'))).toBe(false)

    for (const handle of [a, b]) {
      const res = await fetch(
        `http://127.0.0.1:${handle.server.address().port}/definitely-missing.html`,
      )
      expect(res.status).toBe(404)
    }
  })

  it('starts two sites cleanly when each has its own livereload port', async () => {
    const loggerA = captureLogger()
    const loggerB = captureLogger()
    const a = start({ logger: loggerA, livereloadPort: 35812 })
    const b = start({ logger: loggerB, livereloadPort: 35813 })
    await Promise.all([a.ready, b.ready])

    for (const port of [35812, 35813]) {
      const res = await fetch(`http://127.0.0.1:${port}/livereload.js`)
      expect(res.status).toBe(200)
    }
    expect(loggerA.lines.some((l) => l.startsWith('error:'))).toBe(false)
    expect(loggerB.lines.some((l) => l.startsWith('error:'))).toBe(false)
  })

  it('watches with a write-settle delay and the extra asset extensions', async () => {
    const handle = start({ logger: silentLogger, livereloadPort: 35815 })
    await handle.ready
    const { config } = handle.livereload
    expect(config.delay).toBe(100)
    for (const ext of ['svg', 'webp', 'avif', 'ico', 'woff', 'woff2'])
      expect(config.exts).toContain(ext)
    // The dev-mode debug .json siblings and sitemap.xml are written on every
    // build, so watching them would reload the browser on every build.
    expect(config.exts).not.toContain('json')
    expect(config.exts).not.toContain('xml')
  })

  it('refreshes on an extra-extension asset but not on a debug .json sibling', async () => {
    site = await makeSite({ 'public/index.html': '<p>x</p>' })
    const handle = start({
      httpRoot: `${site.root}/public`,
      logger: silentLogger,
      livereloadPort: 35816,
    })
    await handle.ready
    await handle.watching
    const refresh = vi.spyOn(handle.livereload, 'refresh')

    // The .json is written first, so its refresh — were it watched — would be
    // queued on the same delay ahead of the .svg's. Seeing the .svg refresh is
    // therefore proof the .json's was never queued, with nothing to sleep for.
    await site.touch('public/x.json', '{}')
    await site.touch('public/x.svg', '<svg></svg>')
    const refreshed = () =>
      refresh.mock.calls.map(([f]) => f.replace(/\\/g, '/'))
    await waitFor(() => refreshed().some((f) => f.endsWith('x.svg')))

    expect(refreshed().some((f) => f.endsWith('x.json'))).toBe(false)
  })

  it('prints the Serving line only once the server is listening', async () => {
    const logger = captureLogger()
    const handle = start({ logger, livereloadPort: 35818 })
    expect(logger.lines.some((l) => l.includes('Serving'))).toBe(false)
    await handle.ready
    expect(logger.lines.some((l) => l.includes('Serving (public)'))).toBe(true)
  })

  it('rejects with one message naming the port, logs nothing, and still closes', async () => {
    const logger = captureLogger()
    const blocker = net.createServer()
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const { port } = blocker.address()
    const handle = startDevServer('public', port, {
      logger,
      livereloadPort: 35819,
      host: '127.0.0.1',
    })
    try {
      await expect(handle.ready).rejects.toThrow(
        new RegExp(`127\\.0\\.0\\.1:${port}.*not being served`),
      )
      // The message is reported once, by whoever owns `ready` — the module
      // that raises it must not log a second copy of the same fault.
      expect(logger.lines.filter((l) => l.startsWith('error:'))).toEqual([])
      expect(logger.lines.some((l) => l.includes('Serving'))).toBe(false)
      await expect(handle.close()).resolves.toBeUndefined()
    } finally {
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('binds the configured host and names it in the log line', async () => {
    const logger = captureLogger()
    const handle = start({ logger, livereloadPort: 35814 })
    await handle.ready
    const { address, port } = handle.server.address()
    expect(address).toBe('127.0.0.1')
    expect(logger.lines.some((l) => l.includes('http://127.0.0.1:'))).toBe(true)
    const res = await fetch(`http://127.0.0.1:${port}/definitely-missing.html`)
    expect(res.status).toBe(404)
  })
})
