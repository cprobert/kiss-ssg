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

  // The report says which pages were skipped, so a reader can tell a page
  // left out on purpose from one that was meant to be written and was not:
  // both have `ok: true` and no hash.
  it('is reported as skipped, and a written page as not', async () => {
    site = await makeSite({
      'src/pages/real.hbs': 'REAL',
      'src/pages/skipped.hbs': 'SKIPPED',
    })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'real.hbs' })
      .page({ view: 'skipped.hbs', generate: false })
      .generate()
    await kiss.complete()
    expect(
      kiss.report().pages.map(({ view, ok, hash, skipped }) => ({
        view,
        ok,
        written: hash !== null,
        skipped,
      })),
    ).toEqual([
      { view: 'real.hbs', ok: true, written: true, skipped: false },
      { view: 'skipped.hbs', ok: true, written: false, skipped: true },
    ])
  })

  // `generate: 0` (or '', or null) skipped the render but nothing else: the
  // page kept its id, so `{{link}}` resolved to a file that was never written,
  // and the build passed. Only `true` and `false` say what is meant.
  it.each([0, '', null, 'no'])(
    'fails the page when generate is %j, naming it',
    async (value) => {
      site = await makeSite({ 'src/pages/odd.hbs': 'ODD' })
      const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
        .page({ view: 'odd.hbs', generate: value })
        .generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(kiss.report().failures.map((f) => f.message)).toEqual([
        `generate must be true or false, got ${JSON.stringify(value)} (odd.hbs)`,
      ])
      expect(await site.exists('public/odd.html')).toBe(false)
    },
  )

  // A controller or record that spreads `generate: undefined` over the page
  // means "not said", which is the default: written.
  it('builds the page when generate is undefined', async () => {
    site = await makeSite({ 'src/pages/plain.hbs': 'PLAIN' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'plain.hbs', generate: undefined })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    expect(await site.read('public/plain.html')).toBe('PLAIN')
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
