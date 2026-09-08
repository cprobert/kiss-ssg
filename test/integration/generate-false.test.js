import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  kiss = undefined
})

describe('generate: false', () => {
  it('does not claim its output path, so a real page registered later builds', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'skipped.hbs', slug: 'about', generate: false })
      .page({ view: 'real.hbs', slug: 'about' })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(await site.read('public/about.html')).toBe('REAL')
    expect(kiss.report().failures).toEqual([])
  })

  it('is dropped without a failure when a real page already holds the path', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'real.hbs', slug: 'about' })
      .page({ view: 'skipped.hbs', slug: 'about', generate: false })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(await site.read('public/about.html')).toBe('REAL')
    expect(kiss.report().failures).toEqual([])
  })

  it('is left out of sitemap.xml', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      siteUrl: 'https://example.com',
    })
      .page({ view: 'real.hbs' })
      .page({ view: 'skipped.hbs', generate: false })
      .sitemap()
      .generate()
    await kiss.complete()
    const xml = await site.read('public/sitemap.xml')
    expect(xml).toContain('https://example.com/real')
    expect(xml).not.toContain('skipped')
  })

  // A `generate: false` page wrote nothing, so a replay has no stale output of
  // its own to sweep: the `fs.remove` was always a no-op, but the log line it
  // printed said a file had been removed on every single rebuild.
  it('is not reported as stale output on a watch replay', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const calls = []
    const logger = {
      ...silentLogger,
      info: (...args) => calls.push(args.join(' ')),
    }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'real.hbs', slug: 'real' })
      .page({ view: 'skipped.hbs', slug: 'skipped', generate: false })
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })

    calls.length = 0
    await kiss._requestReplay()

    expect(await site.exists('public/real.html')).toBe(true)
    expect(
      calls.filter((line) => line.includes('Removed stale output')),
    ).toEqual([])
  })
})
