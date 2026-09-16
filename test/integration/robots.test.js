import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// `.robots()` exists for its last line. The crawler blocks above it are
// boilerplate a site hand-writes and copies from `src/assets/` — which is
// exactly what this repo's own examples do, in a file that never mentioned
// the sitemap those examples generate. The `Sitemap:` line is the part a
// hand-written file cannot keep in step with the build.

let site
/** @type {any[]} */
let instances = []
afterEach(async () => {
  for (const kiss of instances) await kiss.close()
  if (site) await site.cleanup()
  site = null
  instances = []
})

const FILES = { 'src/pages/index.hbs': 'home' }

const build = async ({
  robots,
  sitemap = true,
  order = 'robots-first',
  over = {},
} = {}) => {
  site = await makeSite(FILES)
  const notices = []
  const kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com',
    logger: { ...silentLogger, notice: (line) => notices.push(line) },
    ...over,
  })
  instances.push(kiss)
  kiss.page({ view: 'index.hbs' })
  // Both orders are recorded synchronously on the chain, so both must give
  // the same file — the sitemap check runs after the queue drains.
  if (order === 'robots-first') {
    kiss.robots(robots)
    if (sitemap) kiss.sitemap()
  } else {
    if (sitemap) kiss.sitemap()
    kiss.robots(robots)
  }
  kiss.generate()
  await kiss.complete()
  return { kiss, notices }
}

describe('.robots()', () => {
  it('writes the default file and advertises this build’s sitemap', async () => {
    const { kiss } = await build()

    expect(await site.read('public/robots.txt')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://e.com/sitemap.xml\n',
    )
    expect(kiss.report().robots).toEqual({
      file: `${site.build}/robots.txt`,
      agents: 1,
      disallowAll: false,
      sitemaps: ['https://e.com/sitemap.xml'],
    })
  })

  it('gives the same file whichever side of .sitemap() it is called on', async () => {
    await build({ order: 'robots-first' })
    const first = await site.read('public/robots.txt')
    await site.cleanup()
    site = null

    await build({ order: 'sitemap-first' })
    expect(await site.read('public/robots.txt')).toBe(first)
  })

  it('advertises no sitemap when the build writes none', async () => {
    // Pointing a crawler at a sitemap.xml that does not exist is a fetch
    // error, so the line is gated on `.sitemap()` rather than on the option.
    const { kiss } = await build({ sitemap: false })

    expect(await site.read('public/robots.txt')).toBe(
      'User-agent: *\nAllow: /\n',
    )
    expect(kiss.report().robots.sitemaps).toEqual([])
  })

  it('reports null when the method was never called', async () => {
    site = await makeSite(FILES)
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
    instances.push(kiss)
    kiss.page({ view: 'index.hbs' }).generate()
    await kiss.complete()

    expect(kiss.report().robots).toBe(null)
    expect(await site.exists('public/robots.txt')).toBe(false)
  })

  it('says out loud, every build, when it disallows the whole site', async () => {
    // One staging config promoted to production removes a site from search,
    // and nothing else about the build looks wrong.
    const { kiss, notices } = await build({ robots: { disallow: '/' } })

    expect(notices).toContain(
      'robots.txt disallows the whole site (Disallow: /) — no crawler will index it',
    )
    expect(kiss.report().robots.disallowAll).toBe(true)
    expect(await site.read('public/robots.txt')).toContain('Disallow: /')
  })

  it('does not infer a Disallow from ignoreSitemap', async () => {
    // Blocking a crawler stops it fetching the page, which stops it seeing a
    // noindex — so the URL can stay indexed with no snippet. Excluded from the
    // sitemap and blocked from crawling are different intents.
    site = await makeSite({ ...FILES, 'src/pages/secret.hbs': 'shh' })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
    instances.push(kiss)
    kiss
      .page({ view: 'index.hbs' })
      .page({ view: 'secret.hbs', ignoreSitemap: true })
      .sitemap()
      .robots()
      .generate()
    await kiss.complete()

    const text = await site.read('public/robots.txt')
    expect(text).not.toContain('Disallow: /secret')
    expect(text).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://e.com/sitemap.xml\n',
    )
  })

  it('leaves a robots.txt copied from src/assets alone under overwrite:false', async () => {
    site = await makeSite({
      ...FILES,
      'src/assets/robots.txt': 'User-agent: *\nDisallow: /tmp\n',
    })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
    instances.push(kiss)
    kiss
      .page({ view: 'index.hbs' })
      .sitemap()
      .robots({ overwrite: false })
      .generate()
    await kiss.complete()

    expect(await site.read('public/robots.txt')).toBe(
      'User-agent: *\nDisallow: /tmp\n',
    )
  })

  it('follows links.trailingSlash in its Sitemap line', async () => {
    const { kiss } = await build({
      robots: { sitemap: '/maps/index.html' },
      over: { links: { trailingSlash: false } },
    })

    expect(kiss.report().robots.sitemaps).toEqual(['https://e.com/maps'])
    expect(await site.read('public/robots.txt')).toContain(
      'Sitemap: https://e.com/maps\n',
    )
  })
})
