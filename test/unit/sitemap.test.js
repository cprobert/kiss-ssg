import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import {
  buildSitemapEntries,
  renderSitemapXml,
  writeSitemap,
} from '../../lib/sitemap.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const entry = (buildTo, options = {}) => ({
  view: 'v',
  buildTo,
  page: { options },
  runCount: 0,
})

describe('buildSitemapEntries', () => {
  // `out/blog/index.html` changed deliberately: its `<loc>` is now
  // `https://e.com/blog/`. A static host serves the directory index at the URL
  // with the trailing slash and answers the bare `/blog` with a 301, so the old
  // `<loc>` pointed every crawler at a redirect.
  it('maps build paths to site URLs, a directory index keeping its slash', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/index.html'),
        entry('out/about/us.html'),
        entry('out/blog/index.html'),
      ],
      { siteUrl: 'https://e.com/', buildDir: 'out' },
    )
    expect(urls.map((u) => u.loc)).toEqual([
      'https://e.com/',
      'https://e.com/about/us',
      'https://e.com/blog/',
    ])
  })

  it('honours per-page overrides and ignoreSitemap', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/a.html', {
          sitemapPriority: '0.2',
          sitemapChangefreq: 'daily',
          sitemapLastmod: 'L',
        }),
        entry('out/b.html', { ignoreSitemap: true }),
      ],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatchObject({
      priority: '0.2',
      changefreq: 'daily',
      lastmod: 'L',
    })
  })

  // Google uses `lastmod` only when it is "consistently and verifiably"
  // accurate and ignores `priority`; Bing warns against stamping the build
  // time. So an entry states a date only when the page knows one.
  it('states no lastmod and no priority for a page that carries no date', () => {
    const [url] = buildSitemapEntries([entry('out/a.html')], {
      siteUrl: 'https://e.com',
      buildDir: 'out',
    })
    expect(url).toEqual({ loc: 'https://e.com/a' })
  })

  it('takes lastmod from sitemapLastmod, then updated, then date', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/a.html', {
          sitemapLastmod: '2026-01-01',
          updated: '2026-02-02',
          date: '2026-03-03',
        }),
        entry('out/b.html', { updated: '2026-02-02', date: '2026-03-03' }),
        entry('out/c.html', { date: '2026-03-03' }),
      ],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(urls.map((u) => u.lastmod)).toEqual([
      '2026-01-01',
      '2026-02-02',
      '2026-03-03',
    ])
  })

  it("reads the date from the page's model when the options have none", () => {
    const [url] = buildSitemapEntries(
      [entry('out/a.html', { model: { updated: '2026-04-04' } })],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(url.lastmod).toBe('2026-04-04')
  })

  it('writes a Date or a timestamp as a W3C datetime, and keeps a date-only string', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/a.html', { date: new Date('2026-05-05T10:00:00Z') }),
        entry('out/b.html', { date: Date.UTC(2026, 5, 6) }),
        entry('out/c.html', { date: '2026-07-07' }),
      ],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(urls.map((u) => u.lastmod)).toEqual([
      '2026-05-05T10:00:00.000Z',
      '2026-06-06T00:00:00.000Z',
      '2026-07-07',
    ])
  })

  // Codex, 2026-11-01: a padded date-only string parses as local midnight, so
  // east of UTC in summer it read back as the day before and was rejected.
  // Checked on a machine on Europe/London; red there under BST for August.
  it('keeps a whitespace-padded date-only string as its own day', () => {
    const [url] = buildSitemapEntries(
      [entry('out/a.html', { updated: ' 2026-08-08 ' })],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(url.lastmod).toBe('2026-08-08')
  })

  it('does not write a date-only string for a day that does not exist', () => {
    const [url] = buildSitemapEntries(
      [entry('out/a.html', { updated: '2026-02-30', date: '2026-08-08' })],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(url.lastmod).toBe('2026-08-08')
  })

  it('passes over an out-of-range timestamp to the date rather than failing the sitemap', () => {
    const [url] = buildSitemapEntries(
      [entry('out/a.html', { updated: 1e20, date: '2026-08-08' })],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(url.lastmod).toBe('2026-08-08')
  })

  it('passes over an unreadable updated to the date, and warns', () => {
    const warnings = []
    const [url] = buildSitemapEntries(
      [entry('out/a.html', { updated: 'soon', date: '2026-08-08' })],
      {
        siteUrl: 'https://e.com',
        buildDir: 'out',
        logger: { ...silentLogger, warn: (m) => warnings.push(m) },
      },
    )
    expect(url.lastmod).toBe('2026-08-08')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('soon')
  })

  it('renders the same bytes on every build of an unchanged site', () => {
    const stack = [
      entry('out/a.html'),
      entry('out/b.html', { date: '2026-01-01' }),
    ]
    const opts = { siteUrl: 'https://e.com', buildDir: 'out' }
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    try {
      const first = renderSitemapXml(buildSitemapEntries(stack, opts))
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
      expect(renderSitemapXml(buildSitemapEntries(stack, opts))).toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips a page that is not generated', () => {
    const urls = buildSitemapEntries(
      [entry('out/a.html'), entry('out/b.html', { generate: false })],
      { siteUrl: 'https://example.com', buildDir: 'out' },
    )
    expect(urls.map((u) => u.loc)).toEqual(['https://example.com/a'])
  })
})

describe('renderSitemapXml', () => {
  it('emits lastmod, changefreq and priority only when set', () => {
    const xml = renderSitemapXml([
      { loc: 'a' },
      { loc: 'b', lastmod: 'T', priority: '0.5', changefreq: 'weekly' },
    ])
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
    expect(xml.match(/<changefreq>/g)).toHaveLength(1)
    expect(xml.match(/<priority>/g)).toHaveLength(1)
    expect(xml).toContain('<url>\n    <loc>a</loc>\n  </url>')
  })

  it('escapes every value it writes, so a siteUrl with & stays well-formed', () => {
    const xml = renderSitemapXml([
      {
        loc: 'https://example.com/a?x=1&y=2',
        lastmod: '2026<01',
        changefreq: 'weekly&daily',
        priority: '0.5>',
      },
    ])
    expect(xml).toContain('<loc>https://example.com/a?x=1&amp;y=2</loc>')
    expect(xml).toContain('<lastmod>2026&lt;01</lastmod>')
    expect(xml).toContain('<changefreq>weekly&amp;daily</changefreq>')
    expect(xml).toContain('<priority>0.5&gt;</priority>')
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })
})

describe('writeSitemap', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
  })

  it('reports no-site-url without writing', async () => {
    site = await makeSite({})
    const r = await writeSitemap([], {
      config: { folders: { build: site.build } },
      logger: silentLogger,
    })
    expect(r.status).toBe('no-site-url')
    expect(await site.exists('public/sitemap.xml')).toBe(false)
  })

  it('writes, and skips when overwrite is false and a file exists', async () => {
    site = await makeSite({ 'public/sitemap.xml': 'old' })
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    const skipped = await writeSitemap([entry(`${site.build}/index.html`)], {
      config,
      logger: silentLogger,
      overwrite: false,
    })
    expect(skipped.status).toBe('skipped')
    expect(await site.read('public/sitemap.xml')).toBe('old')
    const written = await writeSitemap([entry(`${site.build}/index.html`)], {
      config,
      logger: silentLogger,
    })
    expect(written.status).toBe('written')
    expect(written.urls[0].loc).toBe('https://e.com/')
    expect(await site.read('public/sitemap.xml')).toContain(
      '<loc>https://e.com/</loc>',
    )
  })

  it('rejects when sitemap.xml cannot be written, so the caller can report it', async () => {
    site = await makeSite({})
    await fs.ensureDir(`${site.build}/sitemap.xml`)
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    await expect(
      writeSitemap([entry(`${site.build}/index.html`)], {
        config,
        logger: silentLogger,
      }),
    ).rejects.toThrow()
  })
})

describe('a page whose canonical is elsewhere', () => {
  it('is left out of the sitemap', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/a.html'),
        entry('out/b.html', { canonical: 'https://other.example/b' }),
      ],
      { siteUrl: 'https://e.com', buildDir: 'out' },
    )
    expect(urls.map((u) => u.loc)).toEqual(['https://e.com/a'])
  })
})
