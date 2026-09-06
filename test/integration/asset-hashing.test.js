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
import { makeSite, waitFor } from '../helpers/site.js'

// One page, one stylesheet, and a template that says which file it wants
// rather than which caching policy is on.
const files = {
  // The template owns the base — `/` here for a root-relative link.
  'src/pages/index.hbs':
    '<link rel="stylesheet" href="/{{asset "css/site.css"}}">',
  'src/assets/css/site.scss': '$c: red; body { color: $c }',
  'src/assets/robots.txt': 'User-agent: *',
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
  return site.read('public/index.html')
}

describe('{{asset}} cache busting', () => {
  it('links the plain path, unchanged, when no policy is set', async () => {
    const html = await build()
    expect(html).toContain('href="/css/site.css"')
    expect(await site.exists('public/css/site.css')).toBe(true)
  })

  it('links — and emits — a hashed filename when hashing is on', async () => {
    const html = await build({ assets: { hash: true } })
    const href = html.match(/href="([^"]+)"/)[1]
    expect(href).toMatch(/^\/css\/site\.[0-9a-f]{8}\.css$/)
    expect(await site.exists(`public${href}`)).toBe(true)
    expect(await site.read(`public${href}`)).toContain('color:red')
    expect(await site.exists('public/css/site.css')).toBe(false)
    // Only what a template links by name is renamed.
    expect(await site.exists('public/robots.txt')).toBe(true)
  })

  it('links the versioned query when a version is set', async () => {
    const html = await build({ assets: { version: '1.2.3' } })
    expect(html).toContain('href="/css/site.css?v=1.2.3"')
    expect(await site.exists('public/css/site.css')).toBe(true)
  })

  it('re-renders the pages and drops the old file when an asset changes', async () => {
    site = await makeSite(files)
    kiss = new Kiss({
      folders: site.folders,
      dev: true,
      assets: { hash: true },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    const before = (await site.read('public/index.html')).match(
      /href="([^"]+)"/,
    )[1]

    await site.touch('src/assets/css/site.scss', '$c: blue; body { color: $c }')
    await waitFor(
      async () => !(await site.read('public/index.html')).includes(before),
    )
    while (kiss._rebuildInFlight) await kiss._rebuildInFlight

    const after = (await site.read('public/index.html')).match(
      /href="([^"]+)"/,
    )[1]
    expect(after).not.toBe(before)
    // Dev mode compiles sass expanded, so the whitespace is the compiler's.
    expect(await site.read(`public${after}`)).toMatch(/color:\s*blue/)
    expect(await site.exists(`public${before}`)).toBe(false)
  })

  it('leaves the pages alone when the changed asset keeps its name', async () => {
    site = await makeSite(files)
    kiss = new Kiss({
      folders: site.folders,
      dev: true,
      assets: { hash: true },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    const before = await site.read('public/index.html')

    await site.touch('src/assets/robots.txt', 'User-agent: nobody')
    await waitFor(
      async () =>
        (await site.read('public/robots.txt')) === 'User-agent: nobody',
    )
    while (kiss._rebuildInFlight) await kiss._rebuildInFlight
    expect(await site.read('public/index.html')).toBe(before)
  })
})
