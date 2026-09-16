import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  collectRobotsAgents,
  collectSitemapUrls,
  disallowsEverything,
  normaliseRobotsPath,
  renderRobotsTxt,
  writeRobots,
} from '../../lib/robots.js'
import { silentLogger } from '../../lib/logger.js'

let temp
afterEach(async () => {
  if (temp) await fs.remove(temp)
  temp = null
})

describe('normaliseRobotsPath', () => {
  it('adds a leading slash and leaves a wildcard alone', () => {
    expect(normaliseRobotsPath('admin')).toBe('/admin')
    expect(normaliseRobotsPath('/admin/')).toBe('/admin/')
    expect(normaliseRobotsPath('*.json')).toBe('*.json')
  })

  it('drops a path that would write more than one line', () => {
    // There is no escape for a newline in this format, so a value carrying one
    // would write a rule nobody asked for — the same injection `normaliseAlias`
    // drops an alias for. Writing a different rule is worse than writing none.
    expect(normaliseRobotsPath('/a\nDisallow: /')).toBe(null)
    expect(normaliseRobotsPath('/a b')).toBe(null)
    expect(normaliseRobotsPath('')).toBe(null)
    expect(normaliseRobotsPath(null)).toBe(null)
  })
})

describe('collectRobotsAgents', () => {
  it('defaults to one wildcard block allowing everything', () => {
    expect(collectRobotsAgents()).toEqual([
      { userAgent: '*', allow: ['/'], disallow: [], crawlDelay: null },
    ])
  })

  it('takes the single-block shorthand', () => {
    expect(collectRobotsAgents({ disallow: ['/admin', '/tmp'] })).toEqual([
      {
        userAgent: '*',
        allow: [],
        disallow: ['/admin', '/tmp'],
        crawlDelay: null,
      },
    ])
    // A bare string is a list of one, like `aliases`.
    expect(collectRobotsAgents({ disallow: '/admin' })[0].disallow).toEqual([
      '/admin',
    ])
  })

  it('takes explicit blocks, and keeps their order', () => {
    const agents = collectRobotsAgents({
      agents: [
        { userAgent: 'Googlebot', allow: '/' },
        { userAgent: 'BadBot', disallow: '/', crawlDelay: 10 },
      ],
    })
    expect(agents.map((a) => a.userAgent)).toEqual(['Googlebot', 'BadBot'])
    expect(agents[1].crawlDelay).toBe(10)
  })

  it('drops a non-finite crawlDelay rather than writing NaN', () => {
    expect(
      collectRobotsAgents({ agents: [{ crawlDelay: Number.NaN }] })[0]
        .crawlDelay,
    ).toBe(null)
    expect(
      collectRobotsAgents({ agents: [{ crawlDelay: '10' }] })[0].crawlDelay,
    ).toBe(null)
  })
})

describe('disallowsEverything', () => {
  it('sees Disallow: / in any block, and does not confuse it with a prefix', () => {
    expect(disallowsEverything(collectRobotsAgents({ disallow: '/' }))).toBe(
      true,
    )
    expect(
      disallowsEverything(collectRobotsAgents({ disallow: '/admin' })),
    ).toBe(false)
    expect(disallowsEverything(collectRobotsAgents())).toBe(false)
  })
})

describe('collectSitemapUrls', () => {
  const site = { siteUrl: 'https://e.com', hasSitemap: true }

  it("advertises this build's sitemap when there is one", () => {
    expect(collectSitemapUrls(true, site)).toEqual([
      'https://e.com/sitemap.xml',
    ])
    expect(collectSitemapUrls(undefined, site)).toEqual([
      'https://e.com/sitemap.xml',
    ])
  })

  it('advertises nothing when the build writes no sitemap', () => {
    // Pointing a crawler at a sitemap.xml that was never written is a fetch
    // error in every crawler that reads the line.
    expect(collectSitemapUrls(true, { ...site, hasSitemap: false })).toEqual([])
    expect(collectSitemapUrls(false, site)).toEqual([])
    expect(collectSitemapUrls(true, { siteUrl: '', hasSitemap: true })).toEqual(
      [],
    )
  })

  it('takes a named sitemap at its word, absolute or relative', () => {
    expect(
      collectSitemapUrls('https://cdn.example/sitemap-index.xml', site),
    ).toEqual(['https://cdn.example/sitemap-index.xml'])
    expect(collectSitemapUrls(['/a.xml', 'b.xml'], site)).toEqual([
      'https://e.com/a.xml',
      'https://e.com/b.xml',
    ])
    // A named one is honoured even with no sitemap of our own: it may be
    // written by something else entirely.
    expect(
      collectSitemapUrls('/a.xml', { ...site, hasSitemap: false }),
    ).toEqual(['https://e.com/a.xml'])
  })
})

describe('renderRobotsTxt', () => {
  it('writes the default file, with the sitemap last', () => {
    expect(
      renderRobotsTxt(collectRobotsAgents(), ['https://e.com/sitemap.xml']),
    ).toBe('User-agent: *\nAllow: /\n\nSitemap: https://e.com/sitemap.xml\n')
  })

  it('separates blocks with a blank line and keeps the sitemap out of them', () => {
    const text = renderRobotsTxt(
      collectRobotsAgents({
        agents: [
          { userAgent: 'Googlebot', allow: '/' },
          { userAgent: 'BadBot', disallow: '/', crawlDelay: 10 },
        ],
      }),
      ['https://e.com/sitemap.xml'],
    )
    expect(text).toBe(
      [
        'User-agent: Googlebot',
        'Allow: /',
        '',
        'User-agent: BadBot',
        'Disallow: /',
        'Crawl-delay: 10',
        '',
        'Sitemap: https://e.com/sitemap.xml',
        '',
      ].join('\n'),
    )
  })

  it('writes a bare Disallow: for a block with no rules', () => {
    // `Disallow:` means "nothing is disallowed" and is one character from
    // `Disallow: /`, which means the opposite. A `User-agent:` with no
    // directive under it is undefined in the spec, so the empty case is
    // written explicitly rather than left out.
    expect(
      renderRobotsTxt(collectRobotsAgents({ agents: [{ userAgent: 'X' }] })),
    ).toBe('User-agent: X\nDisallow:\n')
  })
})

describe('writeRobots', () => {
  const build = async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-robots-'))
    return {
      folders: { build: temp.replace(/\\/g, '/') },
      siteUrl: 'https://e.com',
      links: { trailingSlash: true },
    }
  }

  it('writes the file and reports what it says', async () => {
    const config = await build()
    const result = await writeRobots({
      config,
      logger: silentLogger,
      hasSitemap: true,
    })

    expect(result.status).toBe('written')
    expect(result.agents).toBe(1)
    expect(result.disallowAll).toBe(false)
    expect(result.sitemaps).toEqual(['https://e.com/sitemap.xml'])
    expect(
      await fs.readFile(`${config.folders.build}/robots.txt`, 'utf8'),
    ).toBe('User-agent: *\nAllow: /\n\nSitemap: https://e.com/sitemap.xml\n')
  })

  it('reports disallowAll so the site-killing case is visible', async () => {
    const config = await build()
    const result = await writeRobots({
      config,
      logger: silentLogger,
      options: { disallow: '/' },
      hasSitemap: true,
    })

    expect(result.disallowAll).toBe(true)
  })

  it('leaves a robots.txt copied from src/assets alone under overwrite:false', async () => {
    const config = await build()
    const file = `${config.folders.build}/robots.txt`
    await fs.outputFile(file, 'hand written\n')

    const result = await writeRobots({
      config,
      logger: silentLogger,
      hasSitemap: true,
      overwrite: false,
    })

    expect(result.status).toBe('skipped')
    expect(result.text).toBe(null)
    expect(await fs.readFile(file, 'utf8')).toBe('hand written\n')
  })

  it('follows links.trailingSlash, like every other emitted URL', async () => {
    const config = await build()
    config.links.trailingSlash = false
    const result = await writeRobots({
      config,
      logger: silentLogger,
      options: { sitemap: '/courses/index.html' },
      hasSitemap: true,
    })

    // The same `toAbsoluteUrl` join `<loc>` makes — a fifth copy of this
    // arithmetic that disagreed would point a crawler at a redirect.
    expect(result.sitemaps).toEqual(['https://e.com/courses'])
  })
})
