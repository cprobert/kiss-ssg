import { describe, it, expect, vi } from 'vitest'

vi.mock('livereload', () => ({
  default: { createServer: () => ({ watch: vi.fn(), close: vi.fn() }) },
}))

import { startDevServer } from '../../lib/dev-server.js'
import { silentLogger } from '../../lib/logger.js'

describe('startDevServer', () => {
  it('listens, serves files from httpRoot, and closes cleanly', async () => {
    const handle = startDevServer('public', 0, { logger: silentLogger })
    await handle.ready
    const { port } = handle.server.address()
    expect(port).toBeGreaterThan(0)
    const res = await fetch(`http://127.0.0.1:${port}/definitely-missing.html`)
    expect(res.status).toBe(404)
    await handle.close()
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
  })

  it('rejects ready (without crashing) when the port is already in use', async () => {
    const first = startDevServer('public', 0, { logger: silentLogger })
    await first.ready
    const { port } = first.server.address()
    const second = startDevServer('public', port, { logger: silentLogger })
    await expect(second.ready).rejects.toThrow()
    await expect(second.close()).resolves.toBeUndefined()
    await first.close()
  })
})
