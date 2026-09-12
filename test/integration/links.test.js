import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// A dev build is one of the three cases that must report `links: null`, and
// binding a real livereload port to prove it would be neither necessary nor
// kind to the test run.
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))
const { default: Kiss } = await import('../helpers/kiss.js')

const SITE_URL = 'https://site.example'

// One layout over three pages, carrying every accepted shape at once: an
// absolute `{{canonical}}`, a root-relative `{{asset}}` under `assets.hash`,
// and a root-relative nav. The pages add a relative link from a nested page,
// one broken `href` and one broken `src`.
const LAYOUT = [
  '<!doctype html><html><head>',
  '<link rel="canonical" href="{{canonical}}">',
  `<link rel="stylesheet" href="/{{asset 'css/site.css'}}">`,
  '</head><body>',
  '<nav>',
  '<a href="/">Home</a>',
  '<a href="/about.html">About</a>',
  '<a href="/shelf/item.html">Item</a>',
  '</nav>',
  '{{#block "body"}}{{/block}}',
  '</body></html>',
].join('')

const page = (body) =>
  `{{#extend "layout"}}{{#content "body"}}${body}{{/content}}{{/extend}}`

const FILES = {
  'src/layouts/layout.hbs': LAYOUT,
  'src/assets/css/site.css': 'body{color:red}',
  // The broken `href`.
  'src/pages/index.hbs': page('<a href="/news/gone.html">Gone</a>'),
  'src/pages/about.hbs': page('<p>About</p>'),
  // A valid relative link out of a nested page, and the broken `src`.
  'src/pages/shelf/item.hbs': page(
    '<a href="../about.html">Back</a><img src="../img/missing.png" alt="">',
  ),
}

// Every page carries the layout's five references (canonical, stylesheet, and
// the three nav links); index adds its broken one, item adds two. None of them
// collide as strings, so nothing is deduplicated away: 6 + 5 + 7.
const CHECKED = 18

const siteConfig = (site, extra = {}) => ({
  folders: site.folders,
  siteUrl: SITE_URL,
  assets: { hash: true },
  logger: silentLogger,
  ...extra,
})

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

describe('broken internal links', () => {
  it('reports exactly the references that resolve to nothing', async () => {
    site = await makeSite(FILES)
    kiss = new Kiss(siteConfig(site)).scan().generate()
    await kiss.complete()

    const report = kiss.report()
    expect(report.links.broken).toEqual([
      { page: `${site.build}/index.html`, href: '/news/gone.html' },
      { page: `${site.build}/shelf/item.html`, href: '../img/missing.png' },
    ])
    expect(report.links.checked).toBe(CHECKED)
  })

  it('resolves the shapes the engine own helpers emit', async () => {
    site = await makeSite(FILES)
    kiss = new Kiss(siteConfig(site)).scan().generate()
    await kiss.complete()

    // The proof that none of these were reported: the two findings above are
    // the whole list, and this is what the pages actually contain.
    const item = await site.read('public/shelf/item.html')
    // `{{canonical}}` — an absolute URL on the site's own origin, resolved
    // against a page this build wrote rather than against a file name.
    expect(item).toContain(`href="${SITE_URL}/shelf/item"`)
    // `{{asset}}` under `assets.hash` — the emitted name, not the source.
    expect(item).toMatch(/href="\/css\/site\.[0-9a-f]{8}\.css"/)
    expect(await site.exists('public/css/site.css')).toBe(false)
    const report = kiss.report()
    expect(report.links.broken.map((b) => b.href)).not.toContain(
      '../about.html',
    )
  })

  it('reports a hardcoded asset source as broken under assets.hash', async () => {
    site = await makeSite({
      ...FILES,
      'src/pages/index.hbs': page(
        '<link rel="stylesheet" href="/css/site.css">',
      ),
    })
    kiss = new Kiss(siteConfig(site)).scan().generate()
    await kiss.complete()

    expect(kiss.report().links.broken).toContainEqual({
      page: `${site.build}/index.html`,
      href: '/css/site.css',
    })
  })

  // Both "reports null" cases carry their own control: the same site, built
  // the ordinary way, has two findings. Without it the assertion would pass
  // against an engine that never scans anything at all.
  const control = async () => {
    const built = new Kiss(siteConfig(site)).scan().generate()
    await built.complete()
    const broken = built.report().links.broken
    await built.close()
    return broken
  }

  it('reports null when config.links.check is false', async () => {
    site = await makeSite(FILES)
    expect(await control()).toHaveLength(2)

    kiss = new Kiss(siteConfig(site, { links: { check: false } }))
      .scan()
      .generate()
    await kiss.complete()

    expect(kiss.report().links).toBeNull()
  })

  it('reports null for a dev build', async () => {
    site = await makeSite(FILES)
    expect(await control()).toHaveLength(2)

    kiss = new Kiss(siteConfig(site, { dev: true }))
    kiss.watch({ entry: null })
    kiss.scan().generate()
    await kiss.complete()

    // A scoped re-render has not rewritten every page, so a dev build has
    // nothing it could honestly scan.
    expect(kiss.report().links).toBeNull()
  })

  it('still finds them under KISS_CHECK, with the page named in the real folder', async () => {
    site = await makeSite(FILES)
    process.env.KISS_CHECK = '1'
    try {
      kiss = new Kiss(siteConfig(site)).scan().generate()
      await kiss.complete()
    } finally {
      delete process.env.KISS_CHECK
    }

    const report = kiss.report()
    expect(report.mode).toBe('check')
    // The whole point: the pages are scanned before the staging folder is
    // discarded, and the finding names the folder the site asked for.
    expect(report.links.broken).toEqual([
      { page: `${site.build}/index.html`, href: '/news/gone.html' },
      { page: `${site.build}/shelf/item.html`, href: '../img/missing.png' },
    ])
    expect(report.links.checked).toBe(CHECKED)
    expect(await site.exists('public')).toBe(false)
  })

  it("still finds them under cleanBuild: 'atomic', after the promotion", async () => {
    site = await makeSite(FILES)
    kiss = new Kiss(siteConfig(site, { cleanBuild: 'atomic' }))
      .scan()
      .generate()
    await kiss.complete()

    const report = kiss.report()
    expect(report.links.broken).toEqual([
      { page: `${site.build}/index.html`, href: '/news/gone.html' },
      { page: `${site.build}/shelf/item.html`, href: '../img/missing.png' },
    ])
    expect(await site.exists('public/index.html')).toBe(true)
    expect(
      fs.readdirSync(site.root).filter((name) => name.includes('.kiss-')),
    ).toEqual([])
  })

  it('accepts the files the build itself wrote beside the pages', async () => {
    site = await makeSite({
      ...FILES,
      'src/pages/index.hbs': page(
        '<a href="/sitemap.xml">Sitemap</a><a href="/llms.txt">llms</a>',
      ),
    })
    kiss = new Kiss(siteConfig(site))
      .scan()
      .llms({ title: 'Site', summary: 'A site.' })
      .sitemap()
      .generate()
    await kiss.complete()

    // Neither is a page and neither is an asset: they resolve because they are
    // on disk when the scan runs, which is the reason it runs where it does.
    // The nested page's missing image is still reported, so this is not the
    // scan having given up.
    expect(kiss.report().links.broken.map((b) => b.href)).toEqual([
      '../img/missing.png',
    ])
  })

  it('reports a failed build own pages too, without touching ok', async () => {
    site = await makeSite({
      ...FILES,
      'src/pages/index.hbs': page('<a href="/news/gone.html">Gone</a>'),
    })
    kiss = new Kiss(siteConfig(site))
      .scan()
      .page({ view: 'missing.hbs' })
      .generate()
    const err = await kiss.complete().catch((e) => e)

    expect(err.report.ok).toBe(false)
    expect(err.report.links.broken.map((b) => b.href)).toContain(
      '/news/gone.html',
    )
  })
})
