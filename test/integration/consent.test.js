import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
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
    expect(links).toEqual([
      ['https://site.example/site/privacy/', 'See your consent history'],
    ])
    // In the dialog's template, not the banner's.
    const banner = home.slice(
      home.indexOf('data-kiss-consent-banner'),
      home.indexOf('data-kiss-consent-settings'),
    )
    expect(/<a class="?kiss-consent__history/.test(banner)).toBe(false)
    expect(report.links.broken.map((b) => b.href)).not.toContain(
      'https://site.example/site/privacy/',
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

  // Its one reader is the server records go to; a site with no endpoint has
  // none (the operator, at the 2026-11-03 pulse).
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
    expect(errors.join('\n')).toMatch(/use \{\{consentEmbed\}\} for an iframe/)
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
