import { describe, it, expect, afterEach, vi } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  vi.unstubAllEnvs()
  site = null
  kiss = null
})

// One small site with every rule in it: two dated posts under `blog/`, an
// undated page in the same section, and a dated page outside it.
const FILES = {
  'src/pages/index.hbs': 'home',
  'src/pages/blog/first.hbs': '{{title}}',
  'src/pages/blog/second.hbs': '{{title}}',
  'src/pages/blog/about.hbs': 'about the blog',
}

const buildSite = async (config = {}, feedOptions = {}) => {
  site = await makeSite(FILES)
  kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com/',
    logger: silentLogger,
    ...config,
  })
    .page({ view: 'index.hbs', title: 'Home', date: '2026-03-01' })
    .page({
      view: 'blog/first.hbs',
      title: 'First post',
      description: 'Cats & dogs',
      date: '2026-01-02',
    })
    .page({
      view: 'blog/second.hbs',
      title: 'Second post',
      model: { date: '2026-02-03' },
    })
    .page({ view: 'blog/about.hbs', title: 'About the blog' })
    .generate()
    .sitemap()
    .feed({ title: 'A1K9 posts', section: 'blog', ...feedOptions })
  await kiss.complete()
  return kiss
}

const linksOf = (xml) =>
  [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1])

describe('.feed()', () => {
  it('writes the section feed, newest first, with the sitemap’s URLs', async () => {
    await buildSite()
    const xml = await site.read('public/feed.xml')

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss')).toBe(
      true,
    )
    // The channel link, then one item per dated page in the section, newest
    // first. `index.hbs` is dated but outside the section; `blog/about.hbs` is
    // in the section but undated.
    expect(linksOf(xml)).toEqual([
      'https://e.com/',
      'https://e.com/blog/second',
      'https://e.com/blog/first',
    ])
    expect(xml).not.toContain('/blog/about')
    expect(xml).toContain(
      '<atom:link href="https://e.com/feed.xml" rel="self" type="application/rss+xml"/>',
    )
    expect(xml).toContain('<description>Cats &amp; dogs</description>')
    // The newest item's date, not the wall clock.
    expect(xml).toContain(
      '<lastBuildDate>Tue, 03 Feb 2026 00:00:00 GMT</lastBuildDate>',
    )
    // Every URL it lists is one the sitemap lists too, character for character.
    const locs = (await site.read('public/sitemap.xml')).match(
      /<loc>[^<]+<\/loc>/g,
    )
    for (const link of linksOf(xml).slice(1))
      expect(locs).toContain(`<loc>${link}</loc>`)
  })

  it('records the file in the build report, after redirects', async () => {
    await buildSite()
    const report = kiss.report()
    expect(report.feed).toBe(`${site.build}/feed.xml`)
    // Appended after `redirects`, so a consumer diffing two reports sees one
    // new key rather than a reshuffle — relative, like the llms.txt assertion.
    const keys = Object.keys(report)
    expect(keys.indexOf('feed')).toBe(keys.indexOf('redirects') + 1)
  })

  it('names the real build folder under cleanBuild: atomic', async () => {
    await buildSite({ cleanBuild: 'atomic' })
    const report = kiss.report()
    expect(report.feed).toBe(`${site.build}/feed.xml`)
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    expect(await site.exists('public/feed.xml')).toBe(true)
  })

  it('names the real build folder under check mode, having published nothing', async () => {
    vi.stubEnv('KISS_CHECK', '1')
    await buildSite()
    const report = kiss.report()
    expect(report.mode).toBe('check')
    expect(report.feed).toBe(`${site.build}/feed.xml`)
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    // Staged and discarded: the report names where the file would be, and
    // nothing was published.
    expect(await site.exists('public/feed.xml')).toBe(false)
  })

  it('honours filename, limit, dateField and ignoreFeed', async () => {
    site = await makeSite({
      'src/pages/a.hbs': 'a',
      'src/pages/b.hbs': 'b',
      'src/pages/c.hbs': 'c',
    })
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
      .page({ view: 'a.hbs', title: 'A', published: '2026-01-01' })
      .page({ view: 'b.hbs', title: 'B', published: '2026-02-01' })
      .page({
        view: 'c.hbs',
        title: 'C',
        published: '2026-03-01',
        ignoreFeed: true,
      })
      .generate()
      .feed({
        title: 'T',
        filename: 'rss.xml',
        dateField: 'published',
        limit: 1,
      })
    await kiss.complete()

    const xml = await site.read('public/rss.xml')
    expect(await site.exists('public/feed.xml')).toBe(false)
    expect(kiss.report().feed).toBe(`${site.build}/rss.xml`)
    expect(linksOf(xml)).toEqual(['https://e.com/', 'https://e.com/b'])
  })

  it('hands the rendered document to the callback', async () => {
    const seen = []
    site = await makeSite(FILES)
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
      .page({ view: 'blog/first.hbs', title: 'First post', date: '2026-01-02' })
      .generate()
      .feed({ title: 'T' }, (text) => seen.push(text))
    await kiss.complete()

    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(await site.read('public/feed.xml'))
  })

  it('logs an error and skips without a siteUrl, leaving the build ok', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const errors = []
    kiss = new Kiss({
      folders: site.folders,
      logger: { ...silentLogger, error: (msg) => errors.push(String(msg)) },
    })
      .scan()
      .generate()
      .feed({ title: 'T' })
    await kiss.complete()

    expect(await site.exists('public/feed.xml')).toBe(false)
    expect(kiss.report().ok).toBe(true)
    expect(kiss.report().feed).toBeNull()
    expect(errors.join('\n')).toContain('config.siteUrl is not set')
  })

  it('is re-run by a whole-site replay, against the new stack', async () => {
    site = await makeSite({
      'src/pages/post.hbs': '{{title}}',
      'src/controllers/post.mjs':
        "export default () => ({ slug: 's1', date: '2026-01-01' })",
    })
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
      .page({ view: 'post.hbs', title: 'Post', controller: 'post.mjs' })
      .generate()
      .feed({ title: 'T' })
    await kiss.complete()
    expect(await site.read('public/feed.xml')).toContain(
      '<link>https://e.com/s1</link>',
    )

    await site.touch(
      'src/controllers/post.mjs',
      "export default () => ({ slug: 's2', date: '2026-01-01' })",
    )
    await kiss._requestReplay()

    const xml = await site.read('public/feed.xml')
    expect(xml).toContain('<link>https://e.com/s2</link>')
    expect(xml).not.toContain('/s1<')
    expect(kiss.report().feed).toBe(`${site.build}/feed.xml`)
  })

  it('is byte-identical across two identical builds', async () => {
    await buildSite()
    const first = await site.read('public/feed.xml')
    await kiss.close()
    kiss = null

    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com/',
      logger: silentLogger,
    })
      .page({
        view: 'blog/first.hbs',
        title: 'First post',
        description: 'Cats & dogs',
        date: '2026-01-02',
      })
      .page({
        view: 'blog/second.hbs',
        title: 'Second post',
        model: { date: '2026-02-03' },
      })
      .generate()
      .feed({ title: 'A1K9 posts', section: 'blog' })
    await kiss.complete()

    expect(await site.read('public/feed.xml')).toBe(first)
  })
})
