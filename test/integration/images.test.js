import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const dev = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: dev.refresh,
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'
import { readZipEntries } from '../helpers/zip.js'

sharp.cache(false)

const PAGE = (body) =>
  `<!doctype html><html><head><title>t</title></head><body><main><h1>h</h1>${body}</main></body></html>`
const HERO = `{{image "img/hero.jpg" alt="A swan" sizes="100vw"}}`

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

// A site whose assets hold one 1200×800 JPEG, made by sharp.
async function makeImageSite(files = {}, { width = 1200, height = 800 } = {}) {
  site = await makeSite({ 'src/pages/index.hbs': PAGE(HERO), ...files })
  await photo('src/assets/img/hero.jpg', width, height)
  return site
}
const photo = (rel, width, height, background = '#3a6') => {
  fs.mkdirSync(path.dirname(path.join(site.root, rel)), { recursive: true })
  return sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toFile(path.join(site.root, rel))
}

// Every log line, by level, so a test can read the one about the cache.
function recording() {
  const lines = []
  const logger = { ...silentLogger }
  for (const [name, fn] of Object.entries(silentLogger)) {
    if (typeof fn !== 'function') continue
    logger[name] = (...args) => {
      lines.push([name, args.map(String).join(' ')])
      fn(...args)
    }
  }
  return { logger, lines }
}

async function build(config = {}, register = (k) => k.scan()) {
  kiss = new Kiss({
    folders: site.folders,
    logger: silentLogger,
    ...config,
    assets: {
      ...(config.assets ?? {}),
      images: {
        cache: `${site.root}/.kiss-cache/images`,
        ...(config.assets?.images ?? {}),
      },
    },
  })
  register(kiss).generate()
  await kiss.complete()
  return kiss.report()
}

const variantsOnDisk = () =>
  fs
    .readdirSync(`${site.build}/img`)
    .filter((f) => f !== 'hero.jpg')
    .sort()

describe('{{image}} in a build', () => {
  it('writes the <picture> and the variants it names, claimed by the build', async () => {
    await makeImageSite()
    const report = await build()
    const html = await site.read('public/index.html')
    const named = [
      ...html.matchAll(/\/(img\/hero-\d+\.[0-9a-f]{8}\.\w+)/g),
    ].map((m) => m[1])
    expect(new Set(named).size).toBe(12)
    for (const file of new Set(named)) {
      expect(await site.exists(`public/${file}`)).toBe(true)
      expect(kiss._outputs.kind(`${site.build}/${file}`)).toBe('generated')
    }
    expect(variantsOnDisk()).toEqual(
      [...new Set(named)].map((f) => f.slice(4)).sort(),
    )
    expect(report.images).toEqual({
      requested: 12,
      encoded: 12,
      cached: 0,
      cache: `${site.root}/.kiss-cache/images`,
    })
    expect(report.links.broken).toEqual([])
  })

  it('names the variants the same on a second run, and copies them from the cache', async () => {
    await makeImageSite()
    await build()
    const first = await site.read('public/index.html')
    await kiss.close()
    const { logger, lines } = recording()
    const report = await build({ logger })
    expect(await site.read('public/index.html')).toBe(first)
    expect(report.images).toMatchObject({ encoded: 0, cached: 12 })
    expect(
      lines.filter(([, l]) => /not in the committed cache/.test(l)),
    ).toEqual([])
  })

  it('says when a build had to encode what the committed cache lacks', async () => {
    await makeImageSite()
    const { logger, lines } = recording()
    await build({ logger })
    expect(lines).toContainEqual([
      'warn',
      `12 image variants were encoded that are not in the committed cache. Run \`npx kiss-ssg images <script>\` and commit ${site.root}/.kiss-cache/images`,
    ])
  })

  it('renames a variant when the source bytes change', async () => {
    await makeImageSite()
    await build()
    const before = await site.read('public/index.html')
    await kiss.close()
    await photo('src/assets/img/hero.jpg', 1200, 800, '#a63')
    await build()
    expect(await site.read('public/index.html')).not.toBe(before)
  })

  it('marks every variant immutable for Netlify and matches them for Firebase', async () => {
    await makeImageSite()
    await build({ host: ['netlify', 'firebase'] })
    const headers = await site.read('public/_headers')
    const firebase = JSON.parse(
      await site.read('public/cache-headers.firebase.json'),
    )
    const pattern = new RegExp(firebase.headers[0].regex)
    for (const file of variantsOnDisk()) {
      expect(headers).toContain(
        `/img/${file}\n  Cache-Control: public, max-age=31536000, immutable`,
      )
      expect(pattern.test(`/img/${file}`)).toBe(true)
    }
    // The original is not hashed and gets no year.
    expect(headers).not.toContain('/img/hero.jpg')
    expect(pattern.test('/img/hero.jpg')).toBe(false)
  })

  it('packs the variants a package page names', async () => {
    await makeImageSite({
      'src/pages/lesson.hbs': PAGE(HERO.replace('"100vw"', '"100vw" root=""')),
    })
    await build({}, (k) =>
      k.page({ view: 'lesson.hbs', id: 'lesson', title: 'L', package: 'l1' }),
    )
    const zip = readZipEntries(
      fs.readFileSync(`${site.build}/packages/l1.imscp.zip`),
    )
    const packed = [...zip.keys()].filter((k) => /^img\/hero-/.test(k))
    expect(packed.sort()).toEqual(variantsOnDisk().map((f) => `img/${f}`))
  })

  it('removes a variant no page asks for any more, at the next build of the instance', async () => {
    await makeImageSite()
    await build()
    const before = variantsOnDisk()
    expect(before).toHaveLength(12)
    await site.touch('src/pages/index.hbs', PAGE('<p>no image</p>'))
    await kiss._replay()
    expect(variantsOnDisk()).toEqual([])
    for (const file of before)
      expect(kiss._outputs.kind(`${site.build}/img/${file}`)).toBeNull()
  })

  it('fails the build naming the source and the pages when it cannot encode', async () => {
    await makeImageSite({
      'src/pages/about.hbs': PAGE(HERO),
    })
    // A JPEG whose frame header is intact and whose scan is garbage: the
    // header reader names its size, the decoder refuses it.
    const good = fs.readFileSync(
      path.join(site.root, 'src/assets/img/hero.jpg'),
    )
    const scan = good.indexOf(Buffer.from([0xff, 0xda]))
    const broken = Buffer.concat([
      good.subarray(0, scan),
      Buffer.from([0xff, 0xda, 0, 2]),
      Buffer.alloc(400, 0x55),
      Buffer.from([0xff, 0xd9]),
    ])
    fs.writeFileSync(path.join(site.root, 'src/assets/img/hero.jpg'), broken)
    const err = await build().catch((e) => e)
    expect(err).toBeInstanceOf(AggregateError)
    const failure = err.failures.find(
      (f) => f.view === '<images: img/hero.jpg>',
    )
    expect(failure).toBeDefined()
    expect(failure.error.message).toMatch(
      /asked for by about\.html, index\.html/,
    )
  })

  it('fails the page on a missing alt, a missing sizes, an SVG, a GIF and an unknown path', async () => {
    const cases = {
      'no-alt.hbs': '{{image "img/hero.jpg" sizes="1px"}}',
      'no-sizes.hbs': '{{image "img/hero.jpg" alt=""}}',
      'svg.hbs': '{{image "img/logo.svg" alt="" sizes="1px"}}',
      'gif.hbs': '{{image "img/a.gif" alt="" sizes="1px"}}',
      'missing.hbs': '{{image "img/nope.jpg" alt="" sizes="1px"}}',
      'own.hbs': '{{image "img/hero.jpg" alt="" sizes="1px" width=3}}',
    }
    await makeImageSite(
      Object.fromEntries(
        Object.entries(cases).map(([k, v]) => [`src/pages/${k}`, PAGE(v)]),
      ),
    )
    const err = await build().catch((e) => e)
    const messages = err.failures.map((f) => f.error.message).join('\n')
    expect(messages).toMatch(/image: alt= is required/)
    expect(messages).toMatch(/image: sizes= is required/)
    expect(messages).toMatch(/'img\/logo\.svg' is a vector/)
    expect(messages).toMatch(/'img\/a\.gif' is a GIF/)
    expect(messages).toMatch(/'img\/nope\.jpg' is not in the build/)
    expect(messages).toMatch(/width= is written by \{\{image\}\}/)
  })

  it('refuses an animated source', async () => {
    await makeImageSite({
      'src/pages/index.hbs': PAGE('{{image "img/a.webp" alt="" sizes="1px"}}'),
    })
    const frame = (background) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background } })
        .png()
        .toBuffer()
    await sharp([await frame('#f00'), await frame('#00f')], {
      join: { animated: true },
    })
      .webp()
      .toFile(path.join(site.root, 'src/assets/img/a.webp'))
    const err = await build().catch((e) => e)
    expect(err.failures.map((f) => f.error.message).join()).toMatch(
      /is animated/,
    )
  })

  it("turns the <picture> into ![alt](fallback) in the page's Markdown copy", async () => {
    await makeImageSite()
    await build({ siteUrl: 'https://e.com/' }, (k) =>
      k.scan().llms({ title: 'T', summary: 'S' }),
    )
    const md = await site.read('public/index.md')
    const fallback = (await site.read('public/index.html')).match(
      /<img src="([^"]+)"/,
    )[1]
    expect(fallback).toMatch(/^\/img\/hero-768\.[0-9a-f]{8}\.jpg$/)
    expect(md).toContain(`![A swan](${fallback})`)
  })

  it('encodes into the cache under KISS_CHECK, and writes no build', async () => {
    await makeImageSite()
    process.env.KISS_CHECK = '1'
    try {
      const report = await build()
      expect(report.mode).toBe('check')
      expect(report.images).toMatchObject({ requested: 12, encoded: 12 })
    } finally {
      delete process.env.KISS_CHECK
    }
    expect(fs.existsSync(site.build)).toBe(false)
    expect(fs.readdirSync(`${site.root}/.kiss-cache/images`)).toHaveLength(12)
  })
})

// `{{embed … poster=}}` draws its still through this pipeline: a self-hosted
// image only, since fetching the provider's thumbnail would make the request
// the click-to-load box exists to prevent (a1k9training, 2026-11-05).
describe('{{embed}} with poster=', () => {
  const EMBED = (extra = '') =>
    PAGE(
      `{{embed "youtube" id="abc" title="Puppy class" poster="img/hero.jpg"${extra}}}`,
    )

  it('writes the poster as the pipeline’s <picture>, lazy, decorative, cover-fitted, and encodes its variants', async () => {
    await makeImageSite({ 'src/pages/index.hbs': EMBED() })
    const report = await build()
    const html = await site.read('public/index.html')
    const poster = html.match(
      /<div class="kiss-embed__poster"[^>]*>(<picture>.*?<\/picture>)<\/div>/,
    )?.[1]
    expect(poster).toMatch(/<source type="image\/avif"/)
    expect(poster).toMatch(/ sizes="auto, 100vw"/)
    expect(poster).toMatch(/ alt="" loading="lazy" decoding="async"/)
    expect(poster).toContain(
      'style="display:block;width:100%;height:100%;object-fit:cover"',
    )
    expect(report.images.requested).toBe(12)
    expect(report.ok).toBe(true)
  })

  it('takes sizes= and eager=true for the poster', async () => {
    await makeImageSite({
      'src/pages/index.hbs': EMBED(
        ' sizes="(min-width: 48rem) 48rem, 100vw" eager=true',
      ),
    })
    await build()
    const html = await site.read('public/index.html')
    expect(html).toContain('sizes="(min-width: 48rem) 48rem, 100vw"')
    expect(html).toMatch(/kiss-embed__poster[\s\S]*fetchpriority="high"/)
  })

  // Codex, slice 3: a site under a subpath or a learning package's page
  // passes `root=`, as it does to {{image}}; the poster must follow it.
  it('writes the poster against root=, as {{image}} does', async () => {
    await makeImageSite({ 'src/pages/index.hbs': EMBED(' root="../"') })
    await build()
    const poster = (await site.read('public/index.html')).match(
      /<div class="kiss-embed__poster"[^>]*>(<picture>.*?<\/picture>)<\/div>/,
    )?.[1]
    expect(poster).toMatch(/<img src="\.\.\/img\/hero/)
    expect(poster).not.toMatch(/="\/img\//)
  })

  it('refuses a poster from another site, saying why, and an unknown path', async () => {
    await makeImageSite({
      'src/pages/index.hbs': PAGE(
        '{{embed "youtube" id="abc" title="T" poster="https://i.ytimg.com/vi/abc/sddefault.jpg"}}',
      ),
      'src/pages/two.hbs': PAGE(
        '{{embed "youtube" id="abc" title="T" poster="img/nope.jpg"}}',
      ),
    })
    const err = await build().catch((e) => e)
    const messages = err.failures.map((f) => f.error.message).join('\n')
    expect(messages).toMatch(
      /embed "youtube": poster= must be an image in your site, not 'https:\/\/i\.ytimg\.com\/vi\/abc\/sddefault\.jpg'/,
    )
    expect(messages).toMatch(
      /embed "youtube" poster=: 'img\/nope\.jpg' is not in the build/,
    )
  })
})

describe('{{image}} in dev', () => {
  it('writes the original as one <img> at its own size, and encodes nothing', async () => {
    await makeImageSite()
    const report = await build({ dev: true })
    const html = await site.read('public/index.html')
    expect(html).toContain(
      '<img src="/img/hero.jpg" width="1200" height="800" alt="A swan" loading="lazy" decoding="async">',
    )
    expect(html).not.toContain('<picture')
    expect(variantsOnDisk()).toEqual([])
    expect(fs.existsSync(`${site.root}/.kiss-cache`)).toBe(false)
    expect(report.images).toBeNull()
  })

  it('warns, and renders, where a build would fail', async () => {
    await makeImageSite({
      'src/pages/index.hbs': PAGE('{{image "img/hero.jpg" sizes="1px"}}'),
    })
    const { logger, lines } = recording()
    const report = await build({ dev: true, logger })
    expect(report.ok).toBe(true)
    expect(
      lines.some(
        ([level, l]) => level === 'warn' && /alt= is required/.test(l),
      ),
    ).toBe(true)
    expect(await site.read('public/index.html')).toContain(
      '<img src="/img/hero.jpg" width="1200"',
    )
  })

  it('re-renders the pages that use an image when its source is saved', async () => {
    await makeImageSite({ 'src/pages/other.hbs': PAGE('<p>none</p>') })
    await build({ dev: true })
    const other = await site.read('public/other.html')
    await photo('src/assets/img/hero.jpg', 600, 900)
    kiss._pendingAssets.set(`${site.src}/assets/img/hero.jpg`, 'change')
    await kiss._runRebuildQueue()
    while (kiss._rebuildInFlight) await kiss._rebuildInFlight
    expect(await site.read('public/index.html')).toContain(
      'width="600" height="900"',
    )
    expect(await site.read('public/other.html')).toBe(other)
  })
})
