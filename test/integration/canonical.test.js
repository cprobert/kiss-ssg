// A page can name another URL as its canonical: `canonical: '<absolute URL>'`
// on the page. `{{canonical}}` renders it verbatim, and the page is withdrawn
// from sitemap.xml, llms.txt and the feed — a page that says another URL is
// the real one is asking not to be advertised. Measured need: learna-kiss has
// 104 pages (`/c/*`, `/profession/*`) whose canonical must point at
// diploma-msc.com, so it could not drop its hand-rolled helper on 2.5.0.
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../../lib/kiss.js'
import { formatReport } from '../../lib/build-report.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  await kiss?.close?.()
  await site?.cleanup()
  site = null
  kiss = null
})

const FILES = {
  'src/pages/index.hbs': 'home {{canonical}}',
  'src/pages/mirror.hbs': 'mirror {{canonical}}',
}

const build = async (mirrorOptions) => {
  site = await makeSite(FILES)
  kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com',
    logger: silentLogger,
  })
  kiss
    .page({ view: 'index.hbs', title: 'Home' })
    .page({
      view: 'mirror.hbs',
      title: 'Mirror',
      published: '2026-01-01',
      ...mirrorOptions,
    })
    .generate()
    .sitemap()
    .llms({ title: 'T', summary: 'S' })
    .feed({ title: 'T', description: 'D' })
  return kiss.complete()
}

describe('a page whose canonical is elsewhere', () => {
  it('renders the override verbatim and stays out of sitemap, llms and feed', async () => {
    await build({ canonical: 'https://elsewhere.example/mirror' })

    expect(await site.read('public/mirror.html')).toBe(
      'mirror https://elsewhere.example/mirror',
    )
    expect(await site.read('public/index.html')).toBe('home https://e.com/')
    expect(await site.read('public/sitemap.xml')).not.toContain('mirror')
    expect(await site.read('public/llms.txt')).not.toContain('mirror')
    expect(await site.read('public/feed.xml')).not.toContain('mirror')
  })

  it('is named in the report, per page and in the summary', async () => {
    await build({ canonical: 'https://elsewhere.example/mirror' })
    const report = kiss.report()

    expect(report.pages.map((p) => p.canonical)).toEqual([
      null,
      'https://elsewhere.example/mirror',
    ])
    expect(formatReport(report)).toContain(
      '  1 page canonical elsewhere — not in sitemap.xml, llms.txt or the feed',
    )
  })

  it.each(['https://?q=x', 'https://#foo', 'https://example.com:bad'])(
    'fails the page on %s, which has a scheme and no usable host',
    async (value) => {
      // Codex, reviewing the branch: a scheme-and-non-space regex accepted
      // these; every one registered, rendered, and withdrew the page from the
      // three discovery files. `new URL` throws on all three.
      const err = await build({ canonical: value }).catch((e) => e)
      expect(err).toBeInstanceOf(AggregateError)
      expect(err.failures[0].error.message).toBe(
        `canonical must be an absolute http(s) URL, got '${value}' (mirror.hbs)`,
      )
    },
  )

  it('fails the page, naming it and the value, when the URL is not absolute', async () => {
    const err = await build({ canonical: '/mirror' }).catch((e) => e)

    expect(err).toBeInstanceOf(AggregateError)
    expect(err.failures).toHaveLength(1)
    expect(err.failures[0].view).toBe('mirror.hbs')
    expect(err.failures[0].error.message).toBe(
      "canonical must be an absolute http(s) URL, got '/mirror' (mirror.hbs)",
    )
  })
})
