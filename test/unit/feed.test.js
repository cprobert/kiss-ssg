import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import { buildFeedItems, renderRss, writeFeed } from '../../lib/feed.js'
import { buildSitemapEntries } from '../../lib/sitemap.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const entry = (buildTo, options = {}) => ({
  view: 'v',
  buildTo,
  page: { options: { slug: 'index', path: '', ...options } },
  runCount: 0,
})

const context = { siteUrl: 'https://e.com/', buildDir: 'out' }
const titles = (result) => result.items.map((i) => i.title)

describe('buildFeedItems', () => {
  it('keeps dated pages, counts undated ones, and says nothing about them', () => {
    const warn = vi.fn()
    const result = buildFeedItems(
      [
        entry('out/blog/a.html', {
          slug: 'a',
          path: 'blog',
          date: '2026-01-02',
        }),
        entry('out/blog/b.html', { slug: 'b', path: 'blog' }),
        entry('out/about.html', { slug: 'about' }),
      ],
      { ...context, logger: { ...silentLogger, warn } },
    )
    expect(titles(result)).toEqual(['A'])
    expect(result.undated).toBe(2)
    // A page with no date is an ordinary page, not a mistake.
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts a Date, epoch milliseconds and a parsable string', () => {
    const when = Date.UTC(2026, 0, 2, 3, 4, 5)
    const result = buildFeedItems(
      [
        entry('out/a.html', { slug: 'a', date: new Date(when) }),
        entry('out/b.html', { slug: 'b', date: when }),
        entry('out/c.html', { slug: 'c', date: '2026-01-02T03:04:05Z' }),
      ],
      context,
    )
    expect(result.items).toHaveLength(3)
    for (const item of result.items) expect(item.date.getTime()).toBe(when)
  })

  it('warns once for an unreadable date and treats the page as undated', () => {
    const warn = vi.fn()
    const result = buildFeedItems(
      [
        entry('out/a.html', { slug: 'a', date: 'last Thursday-ish' }),
        entry('out/b.html', { slug: 'b' }),
      ],
      { ...context, logger: { ...silentLogger, warn } },
    )
    expect(result.items).toEqual([])
    expect(result.undated).toBe(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('out/a.html')
  })

  it('reads the date from the resolved model, and from the named dateField', () => {
    const result = buildFeedItems(
      [
        entry('out/a.html', { slug: 'a', model: { published: '2026-01-01' } }),
        entry('out/b.html', { slug: 'b', published: '2026-02-01' }),
        // A page with no model, and one handed an array model: both undated,
        // neither an error.
        entry('out/c.html', { slug: 'c' }),
        entry('out/d.html', {
          slug: 'd',
          model: [{ published: '2026-03-01' }],
        }),
        entry('out/e.html', { slug: 'e', model: null }),
      ],
      { ...context, dateField: 'published' },
    )
    expect(titles(result)).toEqual(['B', 'A'])
    expect(result.undated).toBe(3)
  })

  it('prefers the page option over the model for the same field', () => {
    const result = buildFeedItems(
      [
        entry('out/a.html', {
          slug: 'a',
          date: '2026-05-05',
          model: { date: '2020-01-01' },
        }),
      ],
      context,
    )
    expect(result.items[0].date.toUTCString()).toContain('05 May 2026')
  })

  it('filters to one section, sanitising both sides', () => {
    const stack = [
      entry('out/blog/a.html', { slug: 'a', path: 'blog', date: '2026-01-01' }),
      entry('out/news/b.html', { slug: 'b', path: 'news', date: '2026-01-01' }),
      entry('out/blog/2026/c.html', {
        slug: 'c',
        path: 'blog/2026',
        date: '2026-01-01',
      }),
      entry('out/d.html', { slug: 'd', date: '2026-01-01' }),
    ]
    // Every page is dated the same day, so the url is the tie-break:
    // `/blog/2026/c` sorts before `/blog/a`.
    expect(
      titles(buildFeedItems(stack, { ...context, section: 'blog' })),
    ).toEqual(['C', 'A'])
    expect(
      titles(buildFeedItems(stack, { ...context, section: '/Blog/' })),
    ).toEqual(['C', 'A'])
    // No section: every page, whatever its path.
    expect(titles(buildFeedItems(stack, context))).toEqual(['C', 'A', 'D', 'B'])
  })

  it('leaves out ignoreFeed, ignoreSitemap and generate: false pages', () => {
    const result = buildFeedItems(
      [
        entry('out/a.html', { slug: 'a', date: '2026-01-01' }),
        entry('out/b.html', {
          slug: 'b',
          date: '2026-01-01',
          ignoreFeed: true,
        }),
        entry('out/c.html', {
          slug: 'c',
          date: '2026-01-01',
          ignoreSitemap: true,
        }),
        entry('out/d.html', {
          slug: 'd',
          date: '2026-01-01',
          generate: false,
        }),
      ],
      context,
    )
    expect(titles(result)).toEqual(['A'])
    // An excluded page is not an undated one — it was never a candidate.
    expect(result.undated).toBe(0)
  })

  it('sorts newest first and breaks a tie on the url', () => {
    const result = buildFeedItems(
      [
        entry('out/z.html', { slug: 'z', date: '2026-01-01' }),
        entry('out/a.html', { slug: 'a', date: '2026-01-01' }),
        entry('out/m.html', { slug: 'm', date: '2026-06-01' }),
      ],
      context,
    )
    expect(titles(result)).toEqual(['M', 'A', 'Z'])
  })

  it('truncates to limit, keeping the newest', () => {
    const stack = ['2026-01-01', '2026-02-01', '2026-03-01'].map((date, i) =>
      entry(`out/p${i}.html`, { slug: `p${i}`, date }),
    )
    expect(titles(buildFeedItems(stack, { ...context, limit: 2 }))).toEqual([
      'P2',
      'P1',
    ])
    expect(buildFeedItems(stack, { ...context, limit: 0 }).items).toEqual([])
  })

  it('derives title, description and url the way llms.txt and the sitemap do', () => {
    const stack = [
      entry('out/index.html', { date: '2026-01-03' }),
      entry('out/about.html', {
        slug: 'about',
        title: 'About  us',
        description: 'Who\n  we are',
        date: '2026-01-02',
      }),
      entry('out/courses/index.html', {
        slug: 'index',
        path: 'courses',
        date: '2026-01-01',
      }),
    ]
    const result = buildFeedItems(stack, context)
    expect(result.items.map((i) => i.url)).toEqual([
      'https://e.com/',
      'https://e.com/about',
      'https://e.com/courses/',
    ])
    // Character for character the sitemap's <loc> — a home page, a file page
    // and a directory index alike.
    expect(result.items.map((i) => i.url).sort()).toEqual(
      buildSitemapEntries(stack, context)
        .map((u) => u.loc)
        .sort(),
    )
    expect(result.items[1].title).toBe('About us')
    expect(result.items[1].description).toBe('Who we are')
    // An untitled page falls back to its slug, title-cased, exactly as in
    // llms.txt — `index` is what `KissPage` leaves behind.
    expect(result.items[0].title).toBe('Index')
  })
})

describe('renderRss', () => {
  const channel = {
    title: 'A1K9 & Co',
    link: 'https://e.com/',
    description: 'Dog <training>',
    feedUrl: 'https://e.com/feed.xml',
  }
  const item = (over = {}) => ({
    title: 'One',
    url: 'https://e.com/one',
    description: '',
    date: new Date(Date.UTC(2026, 0, 2)),
    ...over,
  })

  it('renders RSS 2.0 with an atom self link and per-item fields', () => {
    const xml = renderRss(channel, [
      item({ description: 'The first one' }),
      item({
        title: 'Two',
        url: 'https://e.com/two',
        date: new Date(Date.UTC(2025, 11, 25)),
      }),
    ])
    expect(xml).toContain(
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    )
    expect(xml).toContain(
      '<atom:link href="https://e.com/feed.xml" rel="self" type="application/rss+xml"/>',
    )
    expect(xml).toContain('<guid isPermaLink="true">https://e.com/one</guid>')
    expect(xml).toContain('<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('<description>The first one</description>')
    // No description, no element — an empty one is noise in every reader.
    expect(xml.match(/<description>/g)).toHaveLength(2) // channel + item one
    expect(xml.endsWith('</rss>\n')).toBe(true)
  })

  it('XML-escapes titles, descriptions and URLs', () => {
    const xml = renderRss(channel, [
      item({
        title: 'Cats & <dogs>',
        description: 'He said "no" & left',
        url: 'https://e.com/a?x=1&y=2',
      }),
    ])
    expect(xml).toContain('<title>Cats &amp; &lt;dogs&gt;</title>')
    expect(xml).toContain(
      '<description>He said &quot;no&quot; &amp; left</description>',
    )
    expect(xml).toContain('<link>https://e.com/a?x=1&amp;y=2</link>')
    expect(xml).toContain('<title>A1K9 &amp; Co</title>')
    expect(xml).toContain('<description>Dog &lt;training&gt;</description>')
    // Nothing unescaped survives: every `&` in the document opens an entity.
    expect(xml.match(/&(?!amp;|lt;|gt;|quot;|apos;)/g)).toBeNull()
  })

  it('dates the channel from the newest item, and omits it when there are none', () => {
    const items = [item(), item({ date: new Date(Date.UTC(2025, 11, 25)) })]
    expect(renderRss(channel, items)).toContain(
      `<lastBuildDate>${items[0].date.toUTCString()}</lastBuildDate>`,
    )
    expect(renderRss(channel, [])).not.toContain('lastBuildDate')
  })

  it('is byte-identical for identical input — no wall clock anywhere', () => {
    const first = renderRss(channel, [item()])
    const second = renderRss(channel, [item()])
    expect(second).toBe(first)
  })
})

describe('writeFeed', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
    site = null
  })

  const opts = { title: 'A1K9', description: 'Posts' }

  it('reports a missing siteUrl and a missing title without writing', async () => {
    site = await makeSite({})
    const errors = []
    const logger = { ...silentLogger, error: (m) => errors.push(String(m)) }
    const folders = { build: site.build }

    expect(
      await writeFeed([], { config: { folders }, logger, options: opts }),
    ).toEqual({ status: 'no-site-url', text: null })
    expect(
      await writeFeed([], {
        config: { siteUrl: 'https://e.com', folders },
        logger,
        options: {},
      }),
    ).toEqual({ status: 'no-title', text: null })
    expect(await site.exists('public/feed.xml')).toBe(false)
    expect(errors.join('\n')).toContain('config.siteUrl is not set')
    expect(errors.join('\n')).toContain('options.title is not set')
  })

  it('writes, honours filename, and skips when overwrite is false', async () => {
    site = await makeSite({ 'public/rss.xml': 'old' })
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    const stack = [
      entry(`${site.build}/a.html`, { slug: 'a', date: '2026-01-02' }),
    ]
    const options = { ...opts, filename: 'rss.xml' }

    const skipped = await writeFeed(stack, {
      config,
      logger: silentLogger,
      options,
      overwrite: false,
    })
    expect(skipped).toEqual({ status: 'skipped', text: null })
    expect(await site.read('public/rss.xml')).toBe('old')

    const written = await writeFeed(stack, {
      config,
      logger: silentLogger,
      options,
    })
    expect(written.status).toBe('written')
    expect(await site.read('public/rss.xml')).toBe(written.text)
    expect(written.text).toContain(
      '<atom:link href="https://e.com/rss.xml" rel="self"',
    )
    expect(written.text).toContain('<link>https://e.com/a</link>')
  })

  it('refuses a filename that escapes the build folder', async () => {
    site = await makeSite({})
    // `../escaped.xml` from `public/` lands in the site root: the sibling of the
    // build folder, and under `'atomic'` or check the sibling of a staging
    // folder that was promised to be the only thing written.
    await expect(
      writeFeed([], {
        config: { siteUrl: 'https://e.com', folders: { build: site.build } },
        logger: silentLogger,
        options: { ...opts, filename: '../escaped.xml' },
      }),
    ).rejects.toThrow(/outside the build folder/)
    expect(await site.exists('escaped.xml')).toBe(false)
  })

  it('rejects when the feed cannot be written, so the caller can report it', async () => {
    site = await makeSite({})
    await fs.ensureDir(`${site.build}/feed.xml`)
    await expect(
      writeFeed([], {
        config: { siteUrl: 'https://e.com', folders: { build: site.build } },
        logger: silentLogger,
        options: opts,
      }),
    ).rejects.toThrow()
  })
})
