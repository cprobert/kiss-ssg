import { describe, it, expect, afterEach } from 'vitest'
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
  it('maps build paths to site URLs, treating index as the folder root', () => {
    const urls = buildSitemapEntries(
      [
        entry('out/index.html'),
        entry('out/about/us.html'),
        entry('out/blog/index.html'),
      ],
      { siteUrl: 'https://e.com/', buildDir: 'out', now: 'T' },
    )
    expect(urls.map((u) => u.loc)).toEqual([
      'https://e.com/',
      'https://e.com/about/us',
      'https://e.com/blog',
    ])
    expect(urls[0]).toMatchObject({ lastmod: 'T', priority: '1.00' })
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
})

describe('renderSitemapXml', () => {
  it('emits changefreq only when set', () => {
    const xml = renderSitemapXml([
      { loc: 'a', lastmod: 'T', priority: '1.00' },
      { loc: 'b', lastmod: 'T', priority: '0.5', changefreq: 'weekly' },
    ])
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml.match(/<changefreq>/g)).toHaveLength(1)
    expect(xml).toContain('<loc>a</loc>')
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
