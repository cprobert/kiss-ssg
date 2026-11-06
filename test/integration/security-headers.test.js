import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// The fleet's shape: a hashed stylesheet, so the cache headers write their
// block, and a `_headers` the site keeps with a header of its own.
const SITE = '/*\n  X-Content-Type-Options: nosniff\n'
const files = {
  'src/pages/index.hbs':
    '<link rel="stylesheet" href="/{{asset "css/site.css"}}"><p>Hi</p>',
  'src/assets/css/site.scss': 'body { color: red }',
  'src/assets/_headers': SITE,
}

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
})

const build = async (config = {}) => {
  site = await makeSite(files)
  kiss = new Kiss({ folders: site.folders, logger: silentLogger, ...config })
    .scan()
    .generate()
  await kiss.complete()
  return kiss.report()
}

describe('security headers', () => {
  it('are off unless the site turns them on', async () => {
    await build({ host: 'netlify', assets: { hash: true } })
    expect(await site.read('public/_headers')).not.toContain('security headers')
    expect(await site.exists('public/security-headers.json')).toBe(false)
  })

  it("host: 'netlify' keeps the site's lines and the cache block, and adds its own block after them", async () => {
    const report = await build({
      host: 'netlify',
      assets: { hash: true },
      securityHeaders: true,
    })
    const headers = await site.read('public/_headers')
    expect(headers.startsWith(SITE)).toBe(true)
    const cache = headers.indexOf('# kiss-ssg: cache headers')
    const security = headers.indexOf('# kiss-ssg: security headers')
    expect(cache).toBeGreaterThan(-1)
    expect(security).toBeGreaterThan(cache)
    expect(headers).toContain('  Strict-Transport-Security: max-age=63072000\n')
    // The site already sets nosniff, so kiss does not set it again.
    expect(headers.split('X-Content-Type-Options').length).toBe(2)
    expect(report.outputs.collisions).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('turned off under cleanBuild: false, leave no block behind (Codex review, 2026-11-06)', async () => {
    // No site `_headers` and nothing hashed: nothing else rewrites the file.
    site = await makeSite({ 'src/pages/index.hbs': '<p>Hi</p>' })
    const run = async (securityHeaders) => {
      kiss = new Kiss({
        folders: site.folders,
        logger: silentLogger,
        host: 'netlify',
        cleanBuild: false,
        securityHeaders,
      })
        .scan()
        .generate()
      await kiss.complete()
      await kiss.close()
      kiss = null
    }
    await run(true)
    expect(await site.read('public/_headers')).toContain('security headers')
    await run(false)
    expect(await site.exists('public/_headers')).toBe(false)
    expect(await site.exists('public/security-headers.json')).toBe(false)
  })
})
