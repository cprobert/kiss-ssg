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

// One hashed stylesheet, one unhashed image, and a `_headers` the site keeps
// for its security headers: the shape the fleet's Netlify sites have.
const CSP = '/*\n  Content-Security-Policy: default-src self\n'
const files = {
  'src/pages/index.hbs':
    '<link rel="stylesheet" href="/{{asset "css/site.css"}}"><img src="/img/a.png" alt="" width="1" height="1">',
  'src/assets/css/site.scss': 'body { color: red }',
  'src/assets/img/a.png': 'png',
  'src/assets/_headers': CSP,
}

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
})

const build = async (config = {}, { withoutHeaders = false } = {}) => {
  const tree = { ...files }
  if (withoutHeaders) delete tree['src/assets/_headers']
  site = await makeSite(tree)
  kiss = new Kiss({ folders: site.folders, logger: silentLogger, ...config })
    .scan()
    .generate()
  await kiss.complete()
  return kiss.report()
}

describe('cache headers', () => {
  it("host: 'netlify' appends kiss's block to the site's own _headers, keeping every line", async () => {
    const report = await build({ host: 'netlify', assets: { hash: true } })
    const headers = await site.read('public/_headers')
    expect(headers.startsWith(CSP)).toBe(true)
    expect(headers).toMatch(
      /\/css\/site\.[0-9a-f]{8}\.css\n {2}Cache-Control: public, max-age=31536000, immutable/,
    )
    expect(headers).not.toContain('/img/a.png')
    expect(report.cacheHeaders.merged).toBe(true)
    expect(report.cacheHeaders.formats).toEqual(['netlify'])
    expect(report.cacheHeaders.rules).toHaveLength(1)
    expect(report.outputs.collisions).toEqual([])
  })

  it('writes kiss’s block as the whole file when the site keeps none', async () => {
    await build(
      { host: 'netlify', assets: { hash: true } },
      { withoutHeaders: true },
    )
    const headers = await site.read('public/_headers')
    expect(headers.startsWith('# kiss-ssg: cache headers')).toBe(true)
  })

  it('reports null and writes nothing when no file was hashed', async () => {
    const report = await build({ host: 'netlify' })
    expect(report.cacheHeaders).toBeNull()
    expect(await site.exists('public/cache-headers.json')).toBe(false)
    expect(await site.read('public/_headers')).toBe(CSP)
  })

  it("host: 'firebase' writes the fragment beside the list, and leaves _headers as the site's", async () => {
    const report = await build({ host: 'firebase', assets: { hash: true } })
    expect(await site.exists('public/cache-headers.firebase.json')).toBe(true)
    expect(await site.exists('public/cache-headers.json')).toBe(true)
    expect(await site.read('public/_headers')).toBe(CSP)
    expect(report.cacheHeaders.formats).toEqual(['firebase'])
  })

  it('reports unset when hashed files exist and no host was chosen', async () => {
    const report = await build({ assets: { hash: true } })
    expect(report.cacheHeaders.unset).toBe(true)
    expect(report.cacheHeaders.formats).toEqual([])
    expect(await site.read('public/_headers')).toBe(CSP)
  })

  it('writes nothing in dev', async () => {
    const report = await build({
      host: 'netlify',
      assets: { hash: true },
      dev: true,
    })
    expect(report.cacheHeaders).toBeNull()
    expect(await site.exists('public/cache-headers.json')).toBe(false)
  })
})
