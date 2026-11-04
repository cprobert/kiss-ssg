import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { silentLogger } from '../../lib/logger.js'
import { launchChromium, serveFolder } from '../../scripts/screenshot.mjs'
import { makeSite } from '../helpers/site.js'
import {
  CONSENT_CONFIG,
  CONSENT_FILES,
  consentPage,
} from '../helpers/consent-site.js'
import Kiss from '../helpers/kiss.js'

// The consent manager in a real browser (contract §8): what the unit tests
// can only simulate. Every request off the test host is answered by a stub,
// so nothing leaves the machine; a stub script records that it ran.
//
// Chromium comes from `npx playwright-core install chromium`. In CI a missing
// browser fails the suite; locally the suite is skipped, and says why.

const HOST = 'www.kiss.test'
const ARGS = ['--host-resolver-rules=MAP *.kiss.test 127.0.0.1']

/** @type {import('playwright-core').Browser|null} */
let browser = null
/** @type {Error|null} */
let launchError = null
try {
  browser = await launchChromium({ args: ARGS })
} catch (err) {
  launchError = /** @type {Error} */ (err)
}
if (!browser && process.env.CI) throw launchError
if (!browser)
  console.warn(`consent browser suite skipped: ${launchError?.message}`)

afterAll(async () => {
  await browser?.close()
})

// Extra pages for the browser only: the order of revived scripts, and a long
// page to tab through under the bottom banner.
const ORDER_PAGE = consentPage(
  '<h1>Order</h1>' +
    '{{#consentScript "stats"}}' +
    '<script src="/js/a.js"></script>' +
    "<script>window.__order.push('B')</script>" +
    '<script type="module">window.__order.push(\'C\')</script>' +
    '<script src="/js/e.js"></script>' +
    '{{/consentScript}}',
  'Order',
)
// An inline module has no load event, and a revived one runs later than the
// code that inserted it: a classic script after it must still wait for it.
const MODULE_ORDER_PAGE = consentPage(
  '<h1>Module order</h1>' +
    '{{#consentScript "stats"}}' +
    '<script type="module">window.__order.push(\'M\')</script>' +
    "<script>window.__order.push('N')</script>" +
    '{{/consentScript}}',
  'Module order',
)
const LONG_PAGE = consentPage(
  '<h1>Long</h1>' +
    Array.from(
      { length: 30 },
      (_, i) =>
        `<p>Paragraph ${i}. <a href="#p${i}" id="p${i}">Link ${i}</a></p>`,
    ).join(''),
  'Long',
)
const FILES = {
  ...CONSENT_FILES,
  'src/pages/order.hbs': ORDER_PAGE,
  'src/pages/module-order.hbs': MODULE_ORDER_PAGE,
  'src/pages/long.hbs': LONG_PAGE,
  'src/assets/js/a.js': "window.__order.push('A')",
  'src/assets/js/e.js': "window.__order.push('E')",
}

/** Build a site and serve it; hand back its base URL and a closer. */
async function serve(files, consent, siteUrl = `https://${HOST}`, extra = {}) {
  const site = await makeSite(files)
  const kiss = new Kiss({
    folders: site.folders,
    siteUrl,
    logger: silentLogger,
    consent,
    ...extra,
  })
    .scan()
    .generate()
  await kiss.complete()
  await kiss.close()
  const server = await serveFolder(site.build)
  const port = new URL(server.url).port
  return {
    base: `http://${HOST}:${port}`,
    // localhost is a secure context, where `__Secure-` and `__Host-` cookies
    // can be set over http
    local: `http://localhost:${port}`,
    close: async () => {
      await server.close()
      await site.cleanup()
    },
  }
}

const STUBS = {
  'www.googletagmanager.com':
    "window.__loaded.push('gtm');window.__gtmSaw=JSON.stringify(Array.from(window.dataLayer,function(e){return e&&typeof e.length==='number'&&typeof e!=='string'?Array.from(e):e}))",
}

// Frames that report their height, as Instagram's does (measured 2026-11-04):
// Instagram's is the one `{{embed}}` listens to; YouTube's sends the same
// message to show that a frame from another origin is not followed.
const measuring = (/** @type {number} */ height) =>
  `<p>embedded</p><script>parent.postMessage(JSON.stringify({type:'MEASURE',details:{height:${height}}}),'*')</script>`
const DOCUMENT_STUBS = {
  'www.instagram.com': measuring(777),
  'www.youtube-nocookie.com': measuring(1234),
}

/**
 * A fresh context and page: every off-host request recorded and stubbed,
 * `/js/a.js` held back 300 ms so the order test can see a slow external.
 */
async function open(options = {}, { holdClient = false } = {}) {
  if (!browser) throw new Error('no browser')
  const context = await browser.newContext({
    viewport: { width: 900, height: 600 },
    ...options,
  })
  // `holdClient`: the consent client's cached file waits until `release()`,
  // the way it would on a slow connection.
  /** @type {() => void} */
  let release = () => {}
  const held = holdClient
    ? new Promise((resolve) => (release = () => resolve(undefined)))
    : Promise.resolve()
  await context.addInitScript(() => {
    // @ts-ignore
    window.__loaded = []
    // @ts-ignore
    window.__order = []
  })
  /** @type {{ host: string, path: string, method: string, body: string|null, type: string|null }[]} */
  const offHost = []
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.hostname.endsWith('.kiss.test') || url.hostname === 'localhost') {
      if (url.pathname === '/js/a.js')
        await new Promise((r) => setTimeout(r, 300))
      if (/^\/kiss-consent\.[0-9a-f]+\.js$/.test(url.pathname)) await held
      if (url.pathname === '/consent-log') {
        offHost.push({
          host: url.hostname,
          path: url.pathname,
          method: req.method(),
          body: req.postData(),
          type: req.headers()['content-type'] ?? null,
        })
        return route.fulfill({ status: 204 })
      }
      return route.continue()
    }
    offHost.push({
      host: url.hostname,
      path: url.pathname,
      method: req.method(),
      body: null,
      type: null,
    })
    const stub = STUBS[url.hostname]
    if (stub)
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: stub,
      })
    if (req.resourceType() === 'document')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: DOCUMENT_STUBS[url.hostname] ?? '<p>embedded</p>',
      })
    return route.fulfill({ status: 204 })
  })
  const page = await context.newPage()
  return { context, page, offHost, release }
}

const cookieNames = async (context) =>
  (await context.cookies()).map((c) => `${c.name}@${c.domain}`).sort()
const stored = async (context) => {
  const c = (await context.cookies()).find((x) => x.name === 'kiss_consent')
  return c ? JSON.parse(decodeURIComponent(c.value)) : null
}
const bannerShown = (page) =>
  page
    .locator('[data-kiss-consent-root]')
    .isVisible()
    .catch(() => false)

// The fixture's counter also declares the two prefixed cookie names, which a
// browser deletes only with `Secure` (and `__Host-` only with no Domain).
const CONFIG = {
  ...CONSENT_CONFIG,
  services: {
    ...CONSENT_CONFIG.services,
    stats: {
      ...CONSENT_CONFIG.services.stats,
      cookies: [
        ...CONSENT_CONFIG.services.stats.cookies,
        '__Secure-st',
        '__Host-st',
      ],
    },
  },
}

describe.skipIf(!browser)('consent in Chromium', () => {
  /** @type {{ base: string, local: string, close: () => Promise<void> }} */
  let site
  beforeAll(async () => {
    site = await serve(FILES, CONFIG)
  }, 60000)
  afterAll(async () => {
    await site?.close()
  })

  // The split on a slow connection: the inline part shows the banner before
  // the cached file arrives, and an Accept made in between takes effect when
  // it does, with nothing gated running before.
  it('shows the banner before the cached file arrives, and keeps an early Accept', async () => {
    const { context, page, release } = await open({}, { holdClient: true })
    await page.goto(`${site.base}/`, { waitUntil: 'commit' })
    await expect.poll(() => bannerShown(page)).toBe(true)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await page.waitForTimeout(200)
    expect(await stored(context)).toBeNull()
    expect(await page.evaluate(() => window.__loaded)).toEqual([])
    release()
    await expect
      .poll(async () => (await stored(context))?.c ?? null)
      .toEqual({ statistics: true, marketing: true })
    await expect
      .poll(() => page.evaluate(() => window.__loaded.includes('gtm')))
      .toBe(true)
    await context.close()
  })

  it('loads nothing gated and stores nothing before a choice', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    await page.waitForTimeout(500)
    expect(await bannerShown(page)).toBe(true)
    expect(offHost).toEqual([])
    expect(await cookieNames(context)).toEqual([])
    expect(await page.evaluate(() => window.__loaded)).toEqual([])
    expect(await page.locator('iframe').count()).toBe(0)
    await context.close()
  })

  it('stores only the choice after Reject, then loads nothing, now or on the next page', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
    )
    await expect
      .poll(() => page.locator('[data-kiss-consent-confirmation]').isVisible())
      .toBe(true)
    expect(await cookieNames(context)).toEqual([`kiss_consent@${HOST}`])
    expect((await stored(context)).c).toEqual({
      statistics: false,
      marketing: false,
    })
    await page.goto(`${site.base}/cookies.html`)
    await page.waitForTimeout(300)
    expect(await bannerShown(page)).toBe(false)
    expect(offHost).toEqual([])
    await context.close()
  })

  it('after Accept, sets Consent Mode before GTM loads, starts every service and reveals the embed', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await expect
      .poll(() => page.evaluate(() => window.__loaded))
      .toEqual(['gtm'])
    const saw = JSON.parse(await page.evaluate(() => window.__gtmSaw))
    const index = (pred) => saw.findIndex(pred)
    const def = index(
      (e) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'default',
    )
    const upd = index(
      (e) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update',
    )
    const start = index((e) => e && e.event === 'gtm.js')
    expect(def).toBe(0)
    expect(upd).toBeGreaterThan(def)
    expect(start).toBeGreaterThan(upd)
    expect(saw[upd][2].ad_storage).toBe('granted')
    expect(await page.evaluate(() => window.statsReady)).toBe(true)
    await expect
      .poll(() => page.locator('iframe[src*="youtube-nocookie"]').count())
      .toBe(1)
    expect(offHost.map((r) => r.host)).toEqual(
      expect.arrayContaining([
        'www.googletagmanager.com',
        'www.youtube-nocookie.com',
      ]),
    )
    await context.close()
  })

  it('a returning visitor: the update runs in the head, the services start, and no banner shows', async () => {
    const { context, page } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await expect
      .poll(() => page.evaluate(() => window.__loaded))
      .toEqual(['gtm'])
    await page.goto(`${site.base}/`)
    await expect
      .poll(() => page.evaluate(() => window.__loaded))
      .toEqual(['gtm'])
    expect(await bannerShown(page)).toBe(false)
    const saw = JSON.parse(await page.evaluate(() => window.__gtmSaw))
    expect(saw[1][0] === 'set' || saw[1][0] === 'consent').toBe(true)
    expect(
      saw.findIndex((e) => Array.isArray(e) && e[1] === 'update'),
    ).toBeLessThan(saw.findIndex((e) => e && e.event === 'gtm.js'))
    await context.close()
  })

  it('revives scripts in document order, an external one holding the queue', async () => {
    const { context, page } = await open()
    await page.goto(`${site.base}/order.html`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await expect
      .poll(() => page.evaluate(() => window.__order.length), { timeout: 5000 })
      .toBe(4)
    expect(await page.evaluate(() => window.__order)).toEqual([
      'A',
      'B',
      'C',
      'E',
    ])
    await context.close()
  })

  it('holds the queue for an inline module, which runs after the code that inserts it', async () => {
    const { context, page } = await open()
    await page.goto(`${site.base}/module-order.html`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await expect
      .poll(() => page.evaluate(() => window.__order.length), { timeout: 5000 })
      .toBe(2)
    expect(await page.evaluate(() => window.__order)).toEqual(['M', 'N'])
    await context.close()
  })

  it('shows a focus outline on the footer settings button and the cookie table', async () => {
    const { context, page } = await open()
    await page.goto(`${site.base}/cookies.html`)
    const outline = (selector) =>
      page.evaluate((s) => {
        const el = /** @type {HTMLElement} */ (document.querySelector(s))
        el.focus()
        const style = getComputedStyle(el)
        return `${style.outlineStyle} ${style.outlineWidth}`
      }, selector)
    expect(await outline('footer .kiss-consent-settings')).toBe('solid 3px')
    expect(await outline('.kiss-consent-table-wrap')).toBe('solid 3px')
    await context.close()
  })

  it('withdrawal deletes a declared __Secure- and __Host- cookie', async () => {
    const { context, page } = await open()
    await page.goto(`${site.local}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await page.evaluate(() => {
      document.cookie = '__Secure-st=1; Path=/; Secure'
      document.cookie = '__Host-st=2; Path=/; Secure'
    })
    const names = async () => (await context.cookies()).map((c) => c.name)
    expect(await names()).toEqual(
      expect.arrayContaining(['__Secure-st', '__Host-st']),
    )
    await page.click('footer [data-kiss-consent-action="settings"]')
    await page.uncheck('dialog input[data-kiss-consent-category="statistics"]')
    await Promise.all([
      page.waitForEvent('load'),
      page.click('dialog [data-kiss-consent-action="save"]'),
    ])
    await page.waitForTimeout(300)
    const left = await names()
    expect(left).not.toContain('__Secure-st')
    expect(left).not.toContain('__Host-st')
    await context.close()
  })

  it('statistics only: the first-party counter runs, GTM and the embed do not', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="settings"]',
    )
    await page.check('dialog input[data-kiss-consent-category="statistics"]')
    await page.click('dialog [data-kiss-consent-action="save"]')
    await expect.poll(() => page.evaluate(() => window.statsReady)).toBe(true)
    await page.waitForTimeout(300)
    expect(offHost).toEqual([])
    expect(await page.evaluate(() => window.__loaded)).toEqual([])
    await context.close()
  })

  it('withdrawal deletes first-party cookies on the host and the parent domain, reloads, and loads nothing gated', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
    )
    await expect
      .poll(() => page.evaluate(() => window.__loaded))
      .toEqual(['gtm'])
    await page.evaluate(() => {
      document.cookie = '_st=1; path=/'
      document.cookie = '_st_session=2; path=/; domain=kiss.test'
      document.cookie = '_ga=3; path=/; domain=kiss.test'
      document.cookie = 'keep=4; path=/'
    })
    await page.click('footer [data-kiss-consent-action="settings"]')
    await page.uncheck('dialog input[data-kiss-consent-category="statistics"]')
    await page.uncheck('dialog input[data-kiss-consent-category="marketing"]')
    offHost.length = 0
    await Promise.all([
      page.waitForEvent('load'),
      page.click('dialog [data-kiss-consent-action="save"]'),
    ])
    await page.waitForTimeout(500)
    expect(await cookieNames(context)).toEqual([
      `keep@${HOST}`,
      `kiss_consent@${HOST}`,
    ])
    expect((await stored(context)).c).toEqual({
      statistics: false,
      marketing: false,
    })
    expect(offHost).toEqual([])
    expect(await page.evaluate(() => window.__loaded)).toEqual([])
    await context.close()
  })

  it('a choice from another version asks again', async () => {
    const { context, page } = await open()
    const stale = encodeURIComponent(
      JSON.stringify({
        f: 1,
        t: Date.now(),
        u: Date.now(),
        v: 'old',
        c: { statistics: true, marketing: true },
        s: {},
      }),
    )
    await context.addCookies([
      { name: 'kiss_consent', value: stale, domain: HOST, path: '/' },
    ])
    await page.goto(`${site.base}/`)
    expect(await bannerShown(page)).toBe(true)
    expect(await page.evaluate(() => window.__loaded)).toEqual([])
    await context.close()
  })

  it('Close hides the banner for the session and stores no choice', async () => {
    const { context, page } = await open()
    await page.goto(`${site.base}/`)
    await page.click(
      '[data-kiss-consent-root] [data-kiss-consent-action="close"]',
    )
    expect(await bannerShown(page)).toBe(false)
    expect(await stored(context)).toBeNull()
    await page.goto(`${site.base}/cookies.html`)
    expect(await bannerShown(page)).toBe(false)
    const closed = (await context.cookies()).find(
      (c) => c.name === 'kiss_consent_closed',
    )
    expect(closed?.expires).toBe(-1)
    await context.close()
  })

  it('an embed loads on its own click, and nothing else does', async () => {
    const { context, page, offHost } = await open()
    await page.goto(`${site.base}/`)
    expect(await page.locator('iframe').count()).toBe(0)
    await page.click('[data-kiss-embed] [data-kiss-consent-action="load"]')
    await expect
      .poll(() => page.locator('iframe[src*="youtube-nocookie"]').count())
      .toBe(1)
    await expect
      .poll(() => offHost.map((r) => r.host))
      .toEqual(['www.youtube-nocookie.com'])
    expect(await stored(context)).toBeNull()
    await context.close()
  })

  it('never hides the focused element under the bottom banner', async () => {
    const { context, page } = await open({
      viewport: { width: 800, height: 500 },
    })
    await page.goto(`${site.base}/long.html`)
    expect(await bannerShown(page)).toBe(true)
    /** @type {string[]} */
    const hidden = []
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => {
        const el = document.activeElement
        const banner = document.querySelector('[data-kiss-consent-root]')
        if (!el || !banner || banner.contains(el) || el === document.body)
          return null
        const r = el.getBoundingClientRect()
        const b = banner.getBoundingClientRect()
        return {
          label: el.textContent?.trim() ?? el.tagName,
          bottom: r.bottom,
          top: r.top,
          bannerTop: b.top,
        }
      })
      if (where && where.bottom > where.bannerTop + 1)
        hidden.push(`${where.label} (${where.bottom} > ${where.bannerTop})`)
    }
    expect(hidden).toEqual([])
    // The end of the page scrolls clear of the bar: the footer's settings
    // control is clickable while the banner is still showing.
    await page
      .locator('footer [data-kiss-consent-action="settings"]')
      .click({ timeout: 3000 })
    expect(await page.locator('dialog[open]').count()).toBe(1)
    await context.close()
  })

  it('with JavaScript off: no banner, nothing gated, nothing third-party', async () => {
    const { context, page, offHost } = await open({ javaScriptEnabled: false })
    await page.goto(`${site.base}/`)
    await page.waitForTimeout(300)
    expect(await bannerShown(page)).toBe(false)
    expect(offHost).toEqual([])
    expect(await page.locator('iframe').count()).toBe(0)
    await context.close()
  })
})

describe.skipIf(!browser)('consent in Chromium: other configurations', () => {
  it('posts each choice to the endpoint as text/plain', async () => {
    const site = await serve(FILES, {
      ...CONSENT_CONFIG,
      endpoint: '/consent-log',
    })
    try {
      const { context, page, offHost } = await open()
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
      )
      await expect
        .poll(() => offHost.filter((r) => r.path === '/consent-log').length)
        .toBe(1)
      const post = offHost.find((r) => r.path === '/consent-log')
      expect(post?.method).toBe('POST')
      expect(post?.type).toMatch(/^text\/plain/)
      const body = JSON.parse(post?.body ?? '{}')
      expect(body).toMatchObject({
        categories: { statistics: false, marketing: false },
        page: '/',
      })
      expect(body.id).toMatch(/[0-9a-f-]{16,}/)
      expect(body.bannerHash).toMatch(/^[0-9a-f]{12}$/)
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // The spec's captured history (planning/specs/2026-11-03-kiss-consent.md):
  // consent, a withdrawal that reloads, partial consent again. The browser's
  // log holds all three, before each POST and before the reload, in the
  // format it posts.
  it('keeps the browser’s log of every choice, across a withdrawal’s reload, as posted', async () => {
    const site = await serve(FILES, {
      ...CONSENT_CONFIG,
      endpoint: '/consent-log',
    })
    try {
      const { context, page, offHost } = await open()
      const posts = () =>
        offHost
          .filter((r) => r.path === '/consent-log')
          .map((r) => JSON.parse(r.body ?? '{}'))
      const log = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('kiss_consent_log') ?? 'null'),
        )
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="accept"]',
      )
      await expect.poll(() => posts().length).toBe(1)
      // Withdraw everything from the dialog: the page reloads.
      await page.click('footer [data-kiss-consent-action="settings"]')
      await Promise.all([
        page.waitForEvent('load'),
        page.click('dialog [data-kiss-consent-action="reject"]'),
      ])
      await expect.poll(() => posts().length).toBe(2)
      // Back, and statistics only.
      await page.click('footer [data-kiss-consent-action="settings"]')
      await page.check('dialog input[data-kiss-consent-category="statistics"]')
      await page.click('dialog [data-kiss-consent-action="save"]')
      await expect.poll(() => posts().length).toBe(3)
      const entries = await log()
      expect(entries.map((e) => e.action)).toEqual(['accept', 'reject', 'save'])
      expect(entries.map((e) => e.categories)).toEqual([
        { statistics: true, marketing: true },
        { statistics: false, marketing: false },
        { statistics: true, marketing: false },
      ])
      expect(new Set(entries.map((e) => e.id)).size).toBe(1)
      expect(entries.every((e) => e.format === 2)).toBe(true)
      expect(entries).toEqual(posts())
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // The history page in a real browser: the dialog's link to it, the rows
  // from the log newest first in the page's locale, and a choice made on the
  // page itself appearing without a reload.
  it('shows the visitor’s history on the page ui.history names, linked from the dialog', async () => {
    const site = await serve(
      {
        ...FILES,
        'src/pages/privacy.hbs': consentPage(
          '<h1>Privacy</h1>{{consentRecord}}',
          'Privacy',
        ),
      },
      { ...CONSENT_CONFIG, ui: { history: 'privacy' } },
    )
    try {
      const { context, page } = await open({ locale: 'en-GB' })
      const rows = () =>
        page.$$eval('[data-kiss-consent-record] tbody tr', (trs) =>
          trs.map((tr) =>
            Array.from(tr.querySelectorAll('th, td'), (c) => c.textContent),
          ),
        )
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
      )
      await page.click('footer [data-kiss-consent-action="settings"]')
      await Promise.all([
        // On the section itself, not the top of the page.
        page.waitForURL(/\/privacy\.html#kiss-consent-history$/),
        page.click('dialog a.kiss-consent__history'),
      ])
      expect(await page.isVisible('[data-kiss-consent-record-empty]')).toBe(
        false,
      )
      expect(await rows()).toEqual([
        [
          expect.stringMatching(/\d{4}.*\d{2}:\d{2}:\d{2}/),
          'Rejected all',
          'Refused',
          'Refused',
          '—',
          // Every service the choice covered, named (2026-11-04).
          'Google Tag Manager, Visit counter, YouTube',
          expect.stringMatching(/^[0-9a-f]{12}$/),
        ],
      ])
      // A choice made here, from the footer, shows at once, newest first.
      await page.click('footer [data-kiss-consent-action="settings"]')
      await page.check('dialog input[data-kiss-consent-category="statistics"]')
      await page.click('dialog [data-kiss-consent-action="save"]')
      await expect.poll(async () => (await rows()).length).toBe(2)
      expect((await rows()).map((r) => r.slice(1, 6))).toEqual([
        [
          'Saved choices',
          'Allowed',
          'Refused',
          'Visit counter',
          'Google Tag Manager, YouTube',
        ],
        [
          'Rejected all',
          'Refused',
          'Refused',
          '—',
          'Google Tag Manager, Visit counter, YouTube',
        ],
      ])
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // Codex round 2 (P1), in the browser: a Reject queued while the cached
  // file is held back must apply before an objection category starts.
  it('applies a Reject made before the cached file arrives before an objection category runs', async () => {
    const site = await serve(FILES, {
      ...CONSENT_CONFIG,
      categories: { statistics: { mode: 'objection' } },
    })
    try {
      const { context, page, release } = await open({}, { holdClient: true })
      await page.goto(`${site.base}/`, { waitUntil: 'commit' })
      await expect.poll(() => bannerShown(page)).toBe(true)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
      )
      // A marker that a reload would wipe.
      await page.evaluate(() => {
        // @ts-ignore
        window.__sameDocument = true
      })
      release()
      await expect
        .poll(async () => (await stored(context))?.c?.statistics ?? null)
        .toBe(false)
      await page.waitForTimeout(300)
      // @ts-ignore
      expect(await page.evaluate(() => window.statsLoaded ?? null)).toBeNull()
      // @ts-ignore
      expect(await page.evaluate(() => window.__sameDocument ?? null)).toBe(
        true,
      )
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // Codex round 5 (P2), in the browser: on the history page itself the
  // dialog's link is a same-page jump; the dialog closes and the history is
  // what the visitor sees.
  it('closes the dialog when its history link jumps within the history page', async () => {
    const site = await serve(
      {
        ...FILES,
        'src/pages/privacy.hbs': consentPage(
          '<h1>Privacy</h1><div style="height:3000px"></div>{{consentRecord}}',
          'Privacy',
        ),
      },
      { ...CONSENT_CONFIG, ui: { history: 'privacy' } },
    )
    try {
      const { context, page } = await open()
      await page.goto(`${site.base}/privacy.html`)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
      )
      await page.click('footer [data-kiss-consent-action="settings"]')
      await page.click('dialog a.kiss-consent__history')
      await expect.poll(() => page.locator('dialog[open]').count()).toBe(0)
      expect(await page.evaluate(() => location.hash)).toBe(
        '#kiss-consent-history',
      )
      expect(await page.locator('#kiss-consent-history h2').isVisible()).toBe(
        true,
      )
      // Focus is on the history, not back on the footer's settings button.
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.id ?? null))
        .toBe('kiss-consent-history')
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // The stopgap review (P2), in the browser: a prefixed siteUrl on another
  // origin, the build served locally (a --dev or preview of a GitHub Pages
  // project site). The cached client must still load from here, or the
  // banner shows and its buttons do nothing.
  it('loads the cached client from wherever the build is served, whatever siteUrl says', async () => {
    const site = await serve(
      FILES,
      CONSENT_CONFIG,
      'https://elsewhere.example/project/',
    )
    try {
      const { context, page } = await open()
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
      )
      await expect
        .poll(async () => (await stored(context))?.c ?? null)
        .toEqual({ statistics: false, marketing: false })
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  // Codex at the close (P2, 2026-11-04): a page is reached at more than one
  // address. Under `trailingSlash: false`, `guide/index.html` is linked as
  // /guide, but serve-static (as kiss's dev server) redirects that to
  // /guide/, and anyone can open /guide/index.html. A URL written at build
  // time, relative to one of them, missed the file at the others. A 404 page
  // is served at any address at all.
  it('loads the cached client at every address a page is reached by', async () => {
    const site = await serve(
      {
        ...FILES,
        'src/pages/guide/index.hbs': consentPage('<h1>Guide</h1>', 'Guide'),
        'src/pages/404.hbs': consentPage('<h1>Not found</h1>', 'Not found'),
      },
      CONSENT_CONFIG,
      undefined,
      { links: { trailingSlash: false } },
    )
    try {
      for (const at of [
        '/guide',
        '/guide/',
        '/guide/index.html',
        '/missing/deep/page',
      ]) {
        const { context, page } = await open()
        await page.goto(`${site.base}${at}`)
        await page.click(
          '[data-kiss-consent-root] [data-kiss-consent-action="reject"]',
        )
        await expect
          .poll(async () => (await stored(context))?.c ?? null, {
            message: at,
          })
          .toEqual({ statistics: false, marketing: false })
        await context.close()
      }
    } finally {
      await site.close()
    }
  }, 60000)

  it('a site’s own banner partial keeps the behaviour', async () => {
    const site = await serve(
      {
        ...FILES,
        'src/partials/consent-banner.hbs':
          '<section class="mine" role="region" aria-label="Cookies"><p>{{text.body}}</p><button type="button" data-kiss-consent-action="accept">Yes please</button><button type="button" data-kiss-consent-action="reject">No thanks</button></section>',
      },
      CONSENT_CONFIG,
    )
    try {
      const { context, page } = await open()
      await page.goto(`${site.base}/`)
      expect(await page.locator('section.mine').isVisible()).toBe(true)
      // The partial is not fixed to the bottom, so nothing is added to make
      // room for it: no spacer, no scroll padding.
      expect(
        await page.evaluate(() => ({
          spacer: document.querySelectorAll('[data-kiss-consent-spacer]')
            .length,
          padding: document.documentElement.style.scrollPaddingBottom,
        })),
      ).toEqual({ spacer: 0, padding: '' })
      await page.click('section.mine [data-kiss-consent-action="accept"]')
      await expect
        .poll(() => page.evaluate(() => window.__loaded))
        .toEqual(['gtm'])
      expect((await stored(context)).c).toEqual({
        statistics: true,
        marketing: true,
      })
      await expect
        .poll(() =>
          page.locator('[data-kiss-consent-confirmation]').isVisible(),
        )
        .toBe(true)
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)

  it('the top position sits in the flow, first in the body, and shifts nothing after paint', async () => {
    const site = await serve(FILES, {
      ...CONSENT_CONFIG,
      ui: { position: 'top' },
    })
    try {
      const { context, page } = await open()
      await page.addInitScript(() => {
        // @ts-ignore
        window.__shift = 0
        new PerformanceObserver((list) => {
          // @ts-ignore
          for (const e of list.getEntries()) window.__shift += e.value
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(`${site.base}/`)
      await page.waitForTimeout(300)
      const info = await page.evaluate(() => {
        const b = document.querySelector('[data-kiss-consent-root]')
        return {
          first: document.body.firstElementChild === b,
          position: b ? getComputedStyle(b).position : null,
          // @ts-ignore
          shift: window.__shift,
        }
      })
      expect(info).toEqual({ first: true, position: 'relative', shift: 0 })
      await context.close()
    } finally {
      await site.close()
    }
  }, 60000)
})

// `{{embed}}` on a site with no config.consent: the facade wires itself, with
// no head and no banner (the 2026-11-04 clean room).
describe.skipIf(!browser)(
  '{{embed}} without config.consent, in Chromium',
  () => {
    const PLAIN_LAYOUT = [
      '<!doctype html><html lang="en"><head>',
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>{{#block "name"}}{{/block}}</title>',
      '</head><body><main>{{#block "body"}}{{/block}}</main></body></html>',
    ].join('')
    /** @type {{ base: string, local: string, close: () => Promise<void> }} */
    let site
    beforeAll(async () => {
      site = await serve(
        {
          'src/layouts/layout.hbs': PLAIN_LAYOUT,
          'src/pages/index.hbs': consentPage(
            [
              '<h1>Home</h1>',
              '{{embed "youtube" id="abc" title="Our video"}}',
              '{{embed "instagram" id="DfQCqMnhpsG" title="Our post"}}',
            ].join(''),
            'Home',
          ),
        },
        undefined,
      )
    }, 60000)
    afterAll(async () => {
      await site?.close()
    })

    it('fetches nothing and stores nothing before a click', async () => {
      const { context, page, offHost } = await open()
      await page.goto(`${site.base}/`)
      await page.waitForTimeout(300)
      expect(await page.locator('iframe').count()).toBe(0)
      expect(offHost).toEqual([])
      expect(await cookieNames(context)).toEqual([])
      expect(await page.evaluate(() => localStorage.length)).toBe(0)
      await context.close()
    })

    it('loads one embed on its own Load button, hides its notice and focuses the frame', async () => {
      const { context, page, offHost } = await open()
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-embed="youtube"] [data-kiss-embed-action="load"]',
      )
      await expect
        .poll(() => page.locator('iframe[src*="youtube-nocookie"]').count())
        .toBe(1)
      expect(await page.locator('iframe[src*="instagram"]').count()).toBe(0)
      await expect
        .poll(() => [...new Set(offHost.map((r) => r.host))])
        .toEqual(['www.youtube-nocookie.com'])
      expect(
        await page
          .locator('[data-kiss-embed="youtube"] .kiss-embed__notice')
          .isVisible(),
      ).toBe(false)
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
        'IFRAME',
      )
      // Its 16:9 size, with nothing from the provider: the height it reports
      // is not followed, since only Instagram's origin is listened to.
      const box = await page
        .locator('iframe[src*="youtube-nocookie"]')
        .boundingBox()
      expect(Math.round(((box?.width ?? 0) / (box?.height ?? 1)) * 9)).toBe(16)
      expect(await cookieNames(context)).toEqual([])
      await context.close()
    })

    it('sizes an Instagram frame from the height it reports', async () => {
      const { context, page } = await open()
      await page.goto(`${site.base}/`)
      await page.click(
        '[data-kiss-embed="instagram"] [data-kiss-embed-action="load"]',
      )
      await expect
        .poll(() =>
          page
            .locator('iframe[src*="instagram"]')
            .evaluate((f) => /** @type {HTMLElement} */ (f).style.height),
        )
        .toBe('777px')
      const width = await page
        .locator('iframe[src*="instagram"]')
        .evaluate((f) => f.getBoundingClientRect().width)
      expect(width).toBeLessThanOrEqual(540)
      await context.close()
    })

    it('with JavaScript off: the notice and the link to the provider, and no frame', async () => {
      const { context, page, offHost } = await open({
        javaScriptEnabled: false,
      })
      await page.goto(`${site.base}/`)
      expect(await page.locator('iframe').count()).toBe(0)
      expect(
        await page
          .locator('a[href="https://www.youtube.com/watch?v=abc"]')
          .count(),
      ).toBe(1)
      expect(offHost).toEqual([])
      await context.close()
    })
  },
)
