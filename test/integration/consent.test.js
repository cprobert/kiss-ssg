import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'fs-extra'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'
import {
  CONSENT_CONFIG,
  CONSENT_FILES,
  CONSENT_LAYOUT,
  consentPage,
} from '../helpers/consent-site.js'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))
const { default: Kiss } = await import('../helpers/kiss.js')

const SITE_URL = 'https://site.example'

/**
 * The `client` block of a page's inline config: the cached file's name, the
 * page's own file and the root to fall back to. Minified, its keys are bare.
 *
 * @param {string} html
 */
const clientOf = (html) => {
  const m =
    /"?client"?:\{"?name"?:"([^"]+)","?page"?:"([^"]*)","?root"?:"([^"]*)"\}/.exec(
      html,
    )
  return m ? { name: m[1], page: m[2], root: m[3] } : null
}

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

const warnings = []
const logger = { ...silentLogger, warn: (...a) => warnings.push(a.join(' ')) }

const config = (extra = {}) => ({
  folders: site.folders,
  siteUrl: SITE_URL,
  logger,
  consent: CONSENT_CONFIG,
  ...extra,
})

/** Build, and hand back the report, or the failure's messages. */
const build = async (cfg, { llms = false } = {}) => {
  kiss = new Kiss(cfg).scan().generate()
  if (llms) kiss.llms()
  try {
    await kiss.complete()
    return { report: kiss.report(), errors: [] }
  } catch (err) {
    const errors = (err.errors ?? [err]).map((e) => String(e?.message ?? e))
    return { report: kiss.report(), errors }
  }
}

describe('a consent site, built', () => {
  it('writes the head, the banner, the gated scripts, the embed and the table', async () => {
    site = await makeSite(CONSENT_FILES)
    const { report, errors } = await build(config())
    expect(errors).toEqual([])
    expect(report.ok).toBe(true)
    const home = await site.read('public/index.html')

    // The head comes after the meta tags, before anything else runs.
    expect(home.indexOf('<meta charset')).toBeLessThan(
      home.indexOf('data-kiss-consent-head'),
    )
    expect(home).toMatch(/<style data-kiss-consent-style>/)
    // The banner and dialog wait in templates, mounted by one inline call.
    expect(home).toMatch(
      /<template data-kiss-consent-banner data-kiss-consent-hash="?[0-9a-f]{12}"?>/,
    )
    expect(home).toMatch(/<template data-kiss-consent-settings>/)
    expect(home).toMatch(/kissConsent\.mount\(\)/)
    // GTM: the gated gtm.start push, then the gated loader, through the minifier.
    expect(home).toMatch(
      /<script type="?text\/plain"? data-kiss-service="?gtm"? data-kiss-consent="?marketing"?>window\.dataLayer/,
    )
    expect(home).toMatch(
      /data-src="?https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-TEST"?/,
    )
    expect(home).not.toMatch(
      /<script[^>]*\ssrc="?https:\/\/www\.googletagmanager/,
    )
    // The block form: async became data-async, the inline one stays text.
    expect(home).toMatch(
      /data-kiss-service="?stats"?[^>]*data-src="?\/js\/stats\.js"?[^>]*data-async/,
    )
    expect(home).toMatch(/data-kiss-service="?stats"?[^>]*>window\.statsReady/)
    // The embed: a notice, the watch link, the frame in a template.
    expect(home).toMatch(/data-kiss-embed="?youtube"?/)
    expect(home).toMatch(
      /<template data-kiss-embed-frame><iframe src="?https:\/\/www\.youtube-nocookie\.com\/embed\/abc123"?/,
    )
    expect(home).toMatch(
      /href="?https:\/\/www\.youtube\.com\/watch\?v=abc123"?/,
    )
    // The settings control in the footer.
    expect(home).toMatch(/data-kiss-consent-action="?settings"?/)

    const cookies = await site.read('public/cookies.html')
    expect(cookies).toMatch(/class="?kiss-consent-table"?/)
    expect(cookies).toContain('kiss_consent_closed')
    expect(cookies).toContain('_ga_*')
  })

  it('links the cookie page from the banner through the URL policy', async () => {
    site = await makeSite(CONSENT_FILES)
    const { errors } = await build(
      config({ extensionLess: true, links: { trailingSlash: false } }),
    )
    expect(errors).toEqual([])
    const home = await site.read('public/index.html')
    expect(home).toMatch(/class="?kiss-consent__policy"? href="?\/cookies"?>/)
  })

  // The round-8 P2 of the consent-manager branch: a site served from a path
  // prefix names it in `siteUrl` and links absolutely (`{{link absolute=true}}`,
  // as this repo's own docs do). The banner's links have no hash to ask for
  // that, so they take it from `siteUrl`: root-relative `/cookies/` is the
  // origin's root, a different site.
  it('carries siteUrl’s path prefix into the policy link and the logo', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/assets/img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    })
    const { report, errors } = await build(
      config({
        siteUrl: 'https://site.example/site/',
        consent: { ...CONSENT_CONFIG, ui: { logo: 'img/logo.svg' } },
      }),
    )
    expect(errors).toEqual([])
    // The link check reads the banner's links where the browser requests
    // them: they land. The fixture footer's plain `{{link "cookies"}}` does
    // not, on a prefixed site, and is the one finding per page.
    const brokenHrefs = new Set(report.links.broken.map((b) => b.href))
    expect([...brokenHrefs]).toEqual(['/cookies.html'])
    const home = await site.read('public/index.html')
    const hrefs = [...home.matchAll(/kiss-consent__policy"? href="?([^"> ]+)/g)]
    // The banner's and the dialog's.
    expect(hrefs.map((m) => m[1])).toEqual([
      'https://site.example/site/cookies.html',
      'https://site.example/site/cookies.html',
    ])
    expect(home).toMatch(
      /kiss-consent__logo"? src="?https:\/\/site\.example\/site\/img\/logo\.svg/,
    )
  })

  it('keeps the policy link and the logo root-relative on a site at its origin’s root', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/assets/img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    })
    const { errors } = await build(
      config({ consent: { ...CONSENT_CONFIG, ui: { logo: 'img/logo.svg' } } }),
    )
    expect(errors).toEqual([])
    const home = await site.read('public/index.html')
    expect(home).toMatch(/kiss-consent__policy"? href="?\/cookies\.html/)
    expect(home).toMatch(/kiss-consent__logo"? src="?\/img\/logo\.svg/)
  })

  // The history page: {{consentRecord}} on the privacy page, linked from the
  // settings dialog by ui.history (D12), through the same URL policy and
  // siteUrl prefix as the policy link (criterion 7).
  const HISTORY_FILES = {
    ...CONSENT_FILES,
    'src/pages/privacy.hbs': consentPage(
      '<h1>Privacy</h1><p>How we use your data.</p>{{consentRecord}}',
      'Privacy',
    ),
  }

  it('links the history page from the dialog only, through the URL policy and the prefix', async () => {
    site = await makeSite(HISTORY_FILES)
    const { report, errors } = await build(
      config({
        siteUrl: 'https://site.example/site/',
        extensionLess: true,
        consent: { ...CONSENT_CONFIG, ui: { history: 'privacy' } },
      }),
    )
    expect(errors).toEqual([])
    const home = await site.read('public/index.html')
    const links = [
      ...home.matchAll(/kiss-consent__history"? href="?([^"> ]+)"?>([^<]*)</g),
    ].map((m) => [m[1], m[2]])
    // To the section itself: the clean room's visitor landed at the top of a
    // long privacy page (2026-11-03).
    expect(links).toEqual([
      [
        'https://site.example/site/privacy/#kiss-consent-history',
        'See your consent history',
      ],
    ])
    expect(await site.read('public/privacy/index.html')).toMatch(
      /<section class="?kiss-consent-record"? id="?kiss-consent-history"?/,
    )
    // In the dialog's template, not the banner's.
    const banner = home.slice(
      home.indexOf('data-kiss-consent-banner'),
      home.indexOf('data-kiss-consent-settings'),
    )
    expect(/<a class="?kiss-consent__history/.test(banner)).toBe(false)
    expect(report.links.broken.map((b) => b.href)).not.toContain(
      'https://site.example/site/privacy/#kiss-consent-history',
    )
  })

  it('writes no history link without ui.history', async () => {
    site = await makeSite(HISTORY_FILES)
    const { errors } = await build(config())
    expect(errors).toEqual([])
    // The anchor, not the class: the theme's CSS names the class either way.
    const home = await site.read('public/index.html')
    expect(/<a class="?kiss-consent__history/.test(home)).toBe(false)
  })

  it('writes the viewer on its page, and keeps its statements but not its controls in the Markdown copy', async () => {
    site = await makeSite(HISTORY_FILES)
    const { errors } = await build(
      config({ consent: { ...CONSENT_CONFIG, endpoint: '/api/consent' } }),
      { llms: true },
    )
    expect(errors).toEqual([])
    const privacy = await site.read('public/privacy.html')
    expect(privacy).toMatch(/<section class="?kiss-consent-record"?/)
    expect(privacy).toMatch(/data-kiss-consent-record-script/)
    // Its own script, on this page alone (D3).
    expect(await site.read('public/index.html')).not.toMatch(
      /data-kiss-consent-record/,
    )
    const md = await site.read('public/privacy.md')
    expect(md).toContain('Your cookie choices')
    expect(md).toContain('Each choice is also sent to this site')
    expect(md).not.toMatch(/No cookie choice|Purposes version|JavaScript/)
  })

  it('writes consent-banners.json with an endpoint: each banner the pages carry, with the text its hash was taken from', async () => {
    site = await makeSite(HISTORY_FILES)
    const { report, errors } = await build(
      config({
        consent: {
          ...CONSENT_CONFIG,
          endpoint: '/api/consent',
          ui: { history: 'privacy' },
        },
      }),
    )
    expect(errors).toEqual([])
    const registry = JSON.parse(await site.read('public/consent-banners.json'))
    const pageHash = /data-kiss-consent-hash="?([0-9a-f]{12})/.exec(
      await site.read('public/index.html'),
    )?.[1]
    expect(registry.format).toBe(1)
    expect(registry.version).toBe(report.consent.version)
    expect(registry.banners.map((b) => b.hash)).toEqual([pageHash])
    expect(report.consent.banners.map((b) => b.hash)).toEqual([pageHash])
    const [banner] = registry.banners
    expect(banner.text).toMatch(/^Cookies on this site We use some cookies/)
    // The dialog's words are in it too: the history link among them.
    expect(banner.text).toContain('See your consent history')
    expect(
      createHash('sha256').update(banner.text).digest('hex').slice(0, 12),
    ).toBe(pageHash)
    expect(banner.categories.map((c) => c.key)).toEqual([
      'statistics',
      'marketing',
    ])
  })

  // The dialog names each category's services (the ICO: name every controller
  // relying on the consent), so the banner hash, taken over the banner and the
  // dialog, moves when a service's provider does: a record keeps naming the
  // words the visitor actually saw.
  it('names each service in the dialog, and a changed provider moves the banner hash', async () => {
    /** @param {string} provider */
    const hashWith = async (provider) => {
      site = await makeSite(HISTORY_FILES)
      const consent = {
        ...CONSENT_CONFIG,
        endpoint: '/api/consent',
        services: {
          ...CONSENT_CONFIG.services,
          stats: { ...CONSENT_CONFIG.services.stats, provider },
        },
      }
      const { errors } = await build(config({ consent }))
      expect(errors).toEqual([])
      const registry = JSON.parse(
        await site.read('public/consent-banners.json'),
      )
      const [banner] = registry.banners
      await kiss.close()
      kiss = null
      await site.cleanup()
      site = null
      return banner
    }
    const before = await hashWith('This site')
    const after = await hashWith('Counter Ltd')
    expect(before.text).toContain('Visit counter (This site)')
    // A linked provider reads "( Google )": the text a hash is taken over
    // turns every tag into a space, the policy link's included.
    expect(before.text).toContain('Google Tag Manager ( Google )')
    expect(before.text).toContain('YouTube ( Google )')
    expect(after.text).toContain('Visit counter (Counter Ltd)')
    expect(after.hash).not.toBe(before.hash)
  })

  // Its one reader is the server records go to; a site with no endpoint has
  // none (the operator, at the 2026-11-03 pulse).
  // The cached part of the client (spec, "the inline part and the cached
  // file"): written once at the build's root, minified, named by its hash,
  // and loaded by every consent page through its inline part.
  it('writes the cached client file, and every consent page loads it', async () => {
    site = await makeSite(CONSENT_FILES)
    const { report, errors } = await build(config())
    expect(errors).toEqual([])
    const files = await fs.readdir(site.build)
    const clients = files.filter((f) =>
      /^kiss-consent\.[0-9a-f]{10}\.js$/.test(f),
    )
    expect(clients).toHaveLength(1)
    const [name] = clients
    const code = await site.read(`public/${name}`)
    expect(code).toMatch(/^!?function|^\(function/)
    // Minified: no comments, and far smaller than its source.
    expect(code).not.toContain('// ')
    const home = await site.read('public/index.html')
    // No tag for it in the page: the inline part adds one, named here.
    expect(home).not.toMatch(/<script[^>]*data-kiss-consent-client/)
    expect(clientOf(home)?.name).toBe(name)
    expect(report.links.broken).toEqual([])
  })

  // The stopgap review (2026-11-03, P2): the split made every consent page
  // depend on fetching the client, and a root-relative or siteUrl-absolute
  // URL fetched it from the wrong place wherever a page is served from
  // anywhere but siteUrl itself (a prefixed site's --dev or local preview, a
  // deploy preview, a {{root}} site), leaving the banner's buttons dead. A
  // URL relative to the served path then missed it at /guide/ and
  // /guide/index.html under trailingSlash: false (Codex at the close,
  // 2026-11-04). So each page hands the inline part its own file and the
  // root siteUrl names, and the browser works the URL out from its address
  // (the unit and Chromium suites prove that half).
  const NESTED = {
    ...CONSENT_FILES,
    'src/pages/blog/post.hbs': consentPage('<h1>Post</h1>', 'Post'),
  }

  it('hands each page’s inline part its own file and the root siteUrl names', async () => {
    site = await makeSite(NESTED)
    const { errors } = await build(
      config({ siteUrl: 'https://site.example/site/' }),
    )
    expect(errors).toEqual([])
    const of = async (page) => clientOf(await site.read(page))
    expect(await of('public/index.html')).toMatchObject({
      page: 'index.html',
      root: '/site/',
    })
    expect(await of('public/blog/post.html')).toMatchObject({
      page: 'blog/post.html',
      root: '/site/',
    })
  })

  it('names the file the page was written to, whatever the trailingSlash policy', async () => {
    for (const trailingSlash of [true, false]) {
      site = await makeSite(NESTED)
      const built = await build(
        config({ extensionLess: true, links: { trailingSlash } }),
      )
      expect(built.errors).toEqual([])
      expect(
        clientOf(await site.read('public/blog/post/index.html')),
      ).toMatchObject({ page: 'blog/post/index.html', root: '/' })
      // Nothing in the page links the file, so the scan has nothing to
      // misread (Codex round 6 found it reporting the old relative URL).
      expect(built.report.links.broken).toEqual([])
      await kiss.close()
      kiss = null
      await site.cleanup()
      site = null
    }
  })

  it('writes no cached client without a consent manager', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<h1>Home</h1>' })
    const { errors } = await build(config({ consent: undefined }))
    expect(errors).toEqual([])
    const files = await fs.readdir(site.build)
    expect(files.filter((f) => f.startsWith('kiss-consent.'))).toEqual([])
  })

  it('writes no consent-banners.json without an endpoint', async () => {
    site = await makeSite(HISTORY_FILES)
    const { errors } = await build(config())
    expect(errors).toEqual([])
    await expect(site.read('public/consent-banners.json')).rejects.toThrow()
  })

  it('writes no consent-banners.json without a consent manager', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<h1>Home</h1>',
    })
    const { errors } = await build(config({ consent: undefined }))
    expect(errors).toEqual([])
    await expect(site.read('public/consent-banners.json')).rejects.toThrow()
  })

  it('keeps the banner out of the Markdown copy, and the embed as its link', async () => {
    site = await makeSite(CONSENT_FILES)
    const { errors } = await build(config(), { llms: true })
    expect(errors).toEqual([])
    const md = await site.read('public/index.md')
    expect(md).not.toMatch(/Cookies on this site|Accept all|Load it/)
    expect(md).toMatch(
      /Open it on YouTube\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123\)/,
    )
  })

  it('uses the site’s own banner partial, and keeps the behaviour attributes it gives', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/partials/consent-banner.hbs':
        '<section class="mine" role="region" aria-label="{{text.title}}"><p>{{text.body}}</p>{{#each categories}}<span>{{label}}</span>{{/each}}<a href="{{policyUrl}}">policy</a><button type="button" data-kiss-consent-action="accept">Yes</button><button type="button" data-kiss-consent-action="reject">No</button></section>',
    })
    const { errors } = await build(config())
    expect(errors).toEqual([])
    const home = await site.read('public/index.html')
    expect(home).toMatch(
      /<template data-kiss-consent-banner[^>]*><section class="?mine"?/,
    )
    expect(home).toMatch(/<span>Statistics<\/span><span>Marketing<\/span>/)
    expect(home).toMatch(/<a href="?\/cookies\.html"?>policy<\/a>/)
  })
})

describe('a consent site with nothing to ask', () => {
  it('builds when every service is necessary: no banner to show, and no wiring problem', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage('{{consentScript "lib"}}'),
    })
    const { errors } = await build(
      config({
        consent: {
          services: {
            lib: {
              category: 'necessary',
              src: 'https://cdn.example/lib.js',
              origins: ['https://cdn.example'],
            },
          },
        },
      }),
    )
    expect(errors).toEqual([])
    const home = await site.read('public/index.html')
    expect(home).toMatch(/<script src="?https:\/\/cdn\.example\/lib\.js"?>/)
    // The banner's template is there, and empty: nothing to ask.
    expect(home).toMatch(/<template data-kiss-consent-banner><\/template>/)
  })
})

describe('a consent site, wired wrongly', () => {
  it('fails a page that gates a service with no consentHead, naming the service', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/layouts/layout.hbs': CONSENT_LAYOUT.replace('{{consentHead}}', ''),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /consent: the page gates gtm, stats, youtube but has no \{\{consentHead\}\}/,
    )
  })

  it('fails a page with a script before consentHead', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/layouts/layout.hbs': CONSENT_LAYOUT.replace(
        '{{consentHead}}',
        '<script src="/js/early.js"></script>{{consentHead}}',
      ),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /\/js\/early\.js would run before \{\{consentHead\}\}/,
    )
  })

  it('allows JSON-LD before consentHead', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/layouts/layout.hbs': CONSENT_LAYOUT.replace(
        '{{consentHead}}',
        '<script type="application/ld+json">{"@type":"WebSite"}</script>{{consentHead}}',
      ),
    })
    const { errors } = await build(config())
    expect(errors).toEqual([])
  })

  it('fails a page with a head and no banner', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/layouts/layout.hbs': CONSENT_LAYOUT.replace('{{consentBanner}}', ''),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /has \{\{consentHead\}\} but no \{\{consentBanner\}\}/,
    )
  })

  it('fails a page that loads one service twice', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage(
        '{{consentScript "gtm"}}{{consentScript "gtm"}}',
      ),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /gtm loads https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-TEST 2 times/,
    )
  })

  it('fails an unknown service, and a missing placeholder value', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage('{{consentScript "hotjar"}}'),
      'src/pages/about.hbs': consentPage('{{consentScript "gtm" id=nothing}}'),
    })
    const { errors } = await build(
      config({
        consent: {
          services: { gtm: {}, stats: CONSENT_CONFIG.services.stats },
        },
      }),
    )
    const all = errors.join('\n')
    expect(all).toMatch(
      /consentScript: no service "hotjar" in config\.consent\.services \(asked by index\.hbs/,
    )
    expect(all).toMatch(
      /consentScript "gtm": no value for \{id\} \(asked by about\.hbs/,
    )
  })

  it('fails document.write in a gated script', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage(
        '{{#consentScript "stats"}}<script>document.write("x")</script>{{/consentScript}}',
      ),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /document\.write in a script that runs after consent wipes the page/,
    )
  })

  it('fails an iframe inside consentScript', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage(
        '{{#consentScript "stats"}}<iframe src="https://x.example"></iframe>{{/consentScript}}',
      ),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(/use \{\{embed\}\} for an iframe/)
  })

  it('fails when ui.policy names no page', async () => {
    const files = { ...CONSENT_FILES }
    delete files['src/pages/cookies.hbs']
    site = await makeSite(files)
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /ui\.policy names the page "cookies", and no page has that id/,
    )
  })

  it('fails when ui.history names no page (D12)', async () => {
    site = await makeSite(CONSENT_FILES)
    const { errors } = await build(
      config({ consent: { ...CONSENT_CONFIG, ui: { history: 'my-choices' } } }),
    )
    expect(errors.join('\n')).toMatch(
      /ui\.history names the page "my-choices", and no page has that id — add the page with \{\{consentRecord\}\}/,
    )
  })

  it('fails every consent helper when config.consent is not set', async () => {
    site = await makeSite(CONSENT_FILES)
    const { errors } = await build(config({ consent: undefined }))
    expect(errors.join('\n')).toMatch(/consentHead: config\.consent is not set/)
  })

  it('warns instead of failing in dev', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/layouts/layout.hbs': CONSENT_LAYOUT.replace('{{consentHead}}', ''),
    })
    warnings.length = 0
    const { errors } = await build(config({ dev: true }))
    expect(errors).toEqual([])
    expect(warnings.join('\n')).toMatch(/has no \{\{consentHead\}\}/)
  })
})

describe('consent on learning-package pages', () => {
  it('renders no head, banner or settings on a packaged page, and fails a gated script there', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': CONSENT_LAYOUT,
      'src/pages/cookies.hbs': consentPage('{{consentTable}}'),
      'src/pages/lesson.hbs': consentPage('<h1>Lesson</h1>'),
      'src/pages/tracked.hbs': consentPage('{{consentScript "gtm"}}'),
    })
    kiss = new Kiss(config())
      .page({ view: 'cookies.hbs' })
      .page({ view: 'lesson.hbs', package: 'course' })
      .page({ view: 'tracked.hbs', package: 'course' })
      .generate()
    let errors = []
    try {
      await kiss.complete()
    } catch (err) {
      errors = (err.errors ?? [err]).map((e) => String(e?.message ?? e))
    }
    expect(errors.join('\n')).toMatch(
      /consentScript "gtm": a learning package's pages carry no third-party scripts/,
    )
    const lesson = await site.read('public/lesson.html')
    expect(lesson).not.toMatch(/data-kiss-consent/)
  })
})

// The 2026-11-04 clean room: an agent asked to add a video to a site with no
// banner hand-built a facade, because the embed helper existed only under
// config.consent. {{embed}} works on any site.
describe('{{embed}} on a site with no config.consent', () => {
  const PLAIN_LAYOUT = [
    '<!doctype html><html lang="en"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>{{#block "name"}}{{/block}}</title>',
    '</head><body><main>{{#block "body"}}{{/block}}</main></body></html>',
  ].join('')

  it('writes a facade that needs no head, banner or cookie page, and the audit sees the frame as held back', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': PLAIN_LAYOUT,
      'src/pages/index.hbs': consentPage(
        [
          '<h1>Home</h1>',
          '{{embed "youtube" id="dQw4w9WgXcQ" title="Our video"}}',
          '{{embed "instagram" id="DfQCqMnhpsG" title="Our latest post"}}',
        ].join(''),
        'Home',
      ),
    })
    const { report, errors } = await build(config({ consent: undefined }))
    expect(errors).toEqual([])
    expect(report.ok).toBe(true)
    const home = await site.read('public/index.html')
    expect(home).toContain(
      '<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-embed-facade data-kiss-embed-autoplay style="display:flex;',
    )
    expect(home).toContain('data-kiss-embed-action="load"')
    expect(home).not.toContain('data-kiss-consent')
    // One wiring script per facade, and Instagram's height listener for its
    // own origin; minified, so read by what they do, not their names.
    expect(
      home.match(/hasAttribute\("data-kiss-embed-facade"\)/g),
    ).toHaveLength(2)
    expect(home).toContain('"MEASURE"')
    expect(home).toContain('(window,"https://www.instagram.com")</script>')
    // Nothing fetches before a click, so no consent finding, and the
    // inventory still names both providers as held-back frames.
    const checks = (report.audit?.findings ?? []).map((f) => f.check)
    expect(checks.filter((c) => c.startsWith('consent-'))).toEqual([])
    expect(report.thirdParty?.origins).toEqual([
      'https://www.instagram.com',
      'https://www.youtube-nocookie.com',
    ])
    expect(report.consent).toBeNull()
  })

  // a1k9training, 2026-11-05: the words could be changed only under
  // config.consent, so a site with no banner was stuck with "Load it".
  it('takes the site’s embeds.text with no config.consent, and one embed’s own load=, notice=, open= and autoplay=false', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': PLAIN_LAYOUT,
      'src/pages/index.hbs': consentPage(
        [
          '<h1>Home</h1>',
          '{{embed "youtube" id="a" title="Puppy class"}}',
          '{{embed "vimeo" id="b" title="Recall" load="Watch recall" notice="On {provider}." open="See it on {service}" autoplay=false}}',
        ].join(''),
        'Home',
      ),
    })
    const { report, errors } = await build(
      config({
        consent: undefined,
        embeds: {
          text: {
            embedPlay: 'Play the video',
            embedNotice: 'Hosted by {provider}.',
          },
        },
      }),
    )
    expect(errors).toEqual([])
    expect(report.ok).toBe(true)
    const home = await site.read('public/index.html')
    expect(home).toContain(
      'aria-label="Play the video: Puppy class">Play the video</button>',
    )
    expect(home).toContain('<p>Hosted by Google.</p>')
    expect(home).toContain(
      'aria-label="Watch recall: Recall">Watch recall</button>',
    )
    expect(home).toContain('<p>On Vimeo.</p>')
    expect(home).toContain('>See it on Vimeo</a>')
    const boxes = [...home.matchAll(/<div class="kiss-embed"[^>]*>/g)].map(
      (m) => m[0],
    )
    expect(boxes.map((b) => b.includes('data-kiss-embed-autoplay'))).toEqual([
      true,
      false,
    ])
  })

  it('refuses embeds beside config.consent, and a key that is not embed wording', () => {
    site = { cleanup: async () => {} }
    expect(
      () =>
        new Kiss({
          logger,
          consent: CONSENT_CONFIG,
          embeds: { text: { embedLoad: 'x' } },
        }),
    ).toThrow(
      'config.embeds: this site has config.consent, so its embed wording is config.consent.ui.text — set the same keys there',
    )
    expect(
      () => new Kiss({ logger, embeds: { text: { embedAllow: 'x' } } }),
    ).toThrow(
      'config.embeds.text.embedAllow is not embed wording — valid keys are embedNotice, embedLoad, embedPlay, embedWatch',
    )
  })

  // Codex, slice 4: `consent: false` is consent switched off, as
  // `resolveConsent` reads it, so it is no second home for the words.
  it('takes embeds beside consent: false or null, which are consent switched off', () => {
    site = { cleanup: async () => {} }
    for (const consent of [false, null]) {
      const kiss = new Kiss({
        logger,
        consent,
        embeds: { text: { embedLoad: 'Open' } },
      })
      expect(kiss.config.consent).toBeNull()
      expect(kiss.config.embeds?.text.embedLoad).toBe('Open')
    }
  })

  it('fails a name with no embed preset', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': PLAIN_LAYOUT,
      'src/pages/index.hbs': consentPage('{{embed "tiktok" id="x" title="T"}}'),
    })
    const { errors } = await build(config({ consent: undefined }))
    expect(errors.join('\n')).toMatch(
      /embed "tiktok": kiss has no embed preset "tiktok" — use one of youtube, vimeo, google-maps, instagram/,
    )
  })

  // The LMS deals with consent (2026-11-03), so a package page stores and
  // remembers nothing; a facade does neither, so it is allowed there, and is
  // always a facade, even on a consent site (the operator, 2026-11-04).
  it('writes a facade on a learning package’s page, with or without config.consent', async () => {
    for (const consent of [undefined, CONSENT_CONFIG]) {
      site = await makeSite({
        ...CONSENT_FILES,
        ...(consent ? {} : { 'src/layouts/layout.hbs': PLAIN_LAYOUT }),
        'src/pages/lesson.hbs': consentPage(
          '<h1>Lesson</h1>{{embed "youtube" id="x" title="The lesson video"}}',
        ),
      })
      kiss = new Kiss(config({ consent }))
      if (consent) kiss.page({ view: 'cookies.hbs' })
      kiss.page({ view: 'lesson.hbs', package: 'course' }).generate()
      await kiss.complete()
      const lesson = await site.read('public/lesson.html')
      expect(lesson).toContain('data-kiss-embed-facade')
      expect(lesson).toContain('data-kiss-embed-action="load"')
      expect(lesson).not.toContain('data-kiss-consent-action')
      expect(lesson).not.toContain('Always allow')
      await kiss.close()
      kiss = null
      await site.cleanup()
      site = null
    }
  })

  it('fails, under config.consent, an embed the site has not declared', async () => {
    site = await makeSite({
      ...CONSENT_FILES,
      'src/pages/index.hbs': consentPage('{{embed "vimeo" id="1" title="T"}}'),
    })
    const { errors } = await build(config())
    expect(errors.join('\n')).toMatch(
      /embed "vimeo": no service "vimeo" in config\.consent\.services — declare it there/,
    )
  })
})
