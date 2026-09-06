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

  it('exposes refresh, which broadcasts through the livereload server', async () => {
    const handle = start({ logger: silentLogger, livereloadPort: 35815 })
    await handle.ready
    const refresh = vi.spyOn(handle.livereload, 'refresh')
    handle.refresh('/css/main.css')
    expect(refresh).toHaveBeenCalledWith('/css/main.css')
  })

  it('does not watch the build folder: a file written there refreshes nothing', async () => {
    // Flips the W3-9 test it replaces (finding F-E4). Watching httpRoot meant
    // one reload per file written, so a whole-site rebuild reached the browser
    // while it was still writing; Kiss now calls refresh once, when the
    // rebuild has settled. `delay` and `extraExts` were options of this
    // watcher and went with it.
    site = await makeSite({ 'public/index.html': '<p>x</p>' })
    const handle = start({
      httpRoot: `${site.root}/public`,
      logger: silentLogger,
      livereloadPort: 35816,
    })
    await handle.ready
    const refresh = vi.spyOn(handle.livereload, 'refresh')
    expect(handle.livereload.watcher).toBeUndefined()
    expect(handle.livereload.config.delay).toBeUndefined()

    await site.touch('public/x.svg', '<svg></svg>')
    await site.touch('public/index.html', '<p>y</p>')
    // Longer than the 100ms write-settle the old watcher applied, so a
    // surviving watcher would have refreshed by now.
    await new Promise((r) => setTimeout(r, 300))
    expect(refresh).not.toHaveBeenCalled()
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
