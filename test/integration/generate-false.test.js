import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
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
})
