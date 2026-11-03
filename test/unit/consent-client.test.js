import { describe, it, expect, beforeAll } from 'vitest'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { minify } from 'terser'
import { createHash } from 'node:crypto'
import {
  consentClientName,
  consentClientSource,
  consentHeadScript,
} from '../../lib/consent-client.js'
import { clientConfig, resolveConsent } from '../../lib/consent.js'

const require = createRequire(import.meta.url)
const domino = require('@mixmark-io/domino')

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)
const DAY = 86400000

/** @param {any} input @param {Record<string, any>} [extra] */
function configFor(input, extra = {}) {
  const resolved = resolveConsent(input)
  if (!resolved) throw new Error('no consent')
  return clientConfig(resolved, { bannerHash: 'abcdef012345', ...extra })
}

const SITE = {
  categories: { statistics: { mode: 'consent' } },
  services: {
    gtm: { id: 'GTM-X' },
    stats: {
      category: 'statistics',
      src: '/js/stats.js',
      cookies: ['_st', '_st_*'],
      storage: ['st_key'],
    },
    youtube: {},
  },
}

const BODY = `
<template data-kiss-consent-banner data-kiss-consent-hash="abcdef012345"><div class="kiss-consent" data-kiss-consent-root data-position="bottom" role="region" aria-label="Cookies"><button type="button" data-kiss-consent-action="accept">Accept all</button><button type="button" data-kiss-consent-action="reject">Reject all</button><button type="button" data-kiss-consent-action="settings">Choose</button><button type="button" data-kiss-consent-action="close">x</button></div></template>
<template data-kiss-consent-settings><dialog class="kiss-consent-dialog"><button type="button" data-kiss-consent-action="reject">Reject all</button><input type="checkbox" data-kiss-consent-category="statistics"><input type="checkbox" data-kiss-consent-category="marketing"><label data-kiss-consent-grant="youtube" hidden><input type="checkbox" data-kiss-consent-service="youtube"> YouTube</label><button type="button" data-kiss-consent-action="save">Save</button><button type="button" data-kiss-consent-action="close-dialog">Close</button></dialog></template>
<p id="first">page</p>
<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing">window.__ran.push('gtm-inline')</script>
<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing" data-src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>
<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics" data-src="/js/stats.js" data-async></script>
<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics">window.__ran.push('stats-inline')</script>
<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing"><div data-kiss-consent-ui><button type="button" data-kiss-consent-action="load">Load</button><button type="button" data-kiss-consent-action="allow">Always</button></div><template data-kiss-embed-frame><iframe src="https://www.youtube-nocookie.com/embed/a" title="A"></iframe></template></div>
<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing"><div data-kiss-consent-ui><button type="button" data-kiss-consent-action="load">Load</button></div><template data-kiss-embed-frame><iframe src="https://www.youtube-nocookie.com/embed/b" title="B"></iframe></template></div>
<footer><button type="button" class="kiss-consent-settings" data-kiss-consent-action="settings">Cookie settings</button></footer>`

/** A cookie jar keyed by name and domain, as a browser keeps one. */
function cookieJar(host) {
  /** @type {Map<string, { name: string, value: string, domain: string }>} */
  const jar = new Map()
  const writes = []
  return {
    jar,
    writes,
    get() {
      return [...jar.values()].map((c) => `${c.name}=${c.value}`).join('; ')
    },
    set(line) {
      writes.push(line)
      const [pair, ...attrs] = line.split(/;\s*/)
      const at = pair.indexOf('=')
      const name = pair.slice(0, at)
      const value = pair.slice(at + 1)
      let domain = host
      let remove = false
      for (const a of attrs) {
        const [k, v] = a.split('=')
        if (/^domain$/i.test(k)) domain = v.replace(/^\./, '')
        if (/^max-age$/i.test(k) && Number(v) <= 0) remove = true
      }
      const key = `${name}@${domain}`
      if (remove) jar.delete(key)
      else jar.set(key, { name, value, domain })
    },
    put(name, value, given = host) {
      // A browser drops a Domain attribute's leading dot.
      const domain = given.replace(/^\./, '')
      jar.set(`${name}@${domain}`, { name, value, domain })
    },
  }
}

function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

/**
 * Build a page, run the client in it, and hand back the handles a test needs.
 *
 * @param {string} source the script body
 * @param {{ cookies?: Record<string, string>, extraCookies?: [string, string, string][], local?: Record<string, string>, storageThrows?: boolean, now?: number, extraBody?: string }} [opts]
 */
function page(source, opts = {}) {
  const host = 'www.example.com'
  const dwin = domino.createWindow(
    `<!doctype html><html><head></head><body>${BODY}${opts.extraBody ?? ''}</body></html>`,
    `https://${host}/a/`,
  )
  const doc = dwin.document
  // domino answers a selector that matches nothing with undefined, a browser with null.
  const find = (selector) => doc.querySelector(selector) ?? null
  const jar = cookieJar(host)
  for (const [k, v] of Object.entries(opts.cookies ?? {})) jar.put(k, v)
  for (const [k, v, d] of opts.extraCookies ?? []) jar.put(k, v, d)
  Object.defineProperty(doc, 'cookie', {
    get: () => jar.get(),
    set: (line) => {
      jar.set(line)
    },
    configurable: true,
  })
  const beacons = []
  const timers = []
  let reloads = 0
  const clock = { now: opts.now ?? NOW }
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.now)
      else super(...args)
    }
    static now() {
      return clock.now
    }
  }
  const events = []
  doc.addEventListener('kiss-consent:ready', (e) =>
    events.push(['ready', e.detail]),
  )
  doc.addEventListener('kiss-consent:change', (e) =>
    events.push(['change', e.detail]),
  )
  const win = {
    document: doc,
    location: {
      protocol: 'https:',
      hostname: host,
      pathname: '/a/',
      reload: () => reloads++,
    },
    navigator: {
      sendBeacon: (url, blob) => {
        beacons.push({ url, type: blob.type, body: blob.parts.join('') })
        return true
      },
    },
    Blob: class {
      constructor(parts, o) {
        this.parts = parts
        this.type = o.type
      }
    },
    localStorage: opts.storageThrows ? null : storage(opts.local),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    crypto: { randomUUID: () => 'uuid-1' },
    CustomEvent: dwin.CustomEvent,
    __ran: [],
  }
  // Storage a browser refuses (blocked site data, some private windows):
  // reading `localStorage` itself throws a SecurityError.
  if (opts.storageThrows)
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('SecurityError')
      },
    })
  vm.runInNewContext(source, { window: win, Date: FakeDate })
  const fire = (target, type) => {
    const e = doc.createEvent('Event')
    e.initEvent(type, true, true)
    target.dispatchEvent(e)
  }
  return {
    win,
    doc,
    find,
    // More code into the same window, later: the cached file arriving.
    run: (more) => vm.runInNewContext(more, { window: win, Date: FakeDate }),
    jar,
    beacons,
    timers,
    events,
    clock,
    reloads: () => reloads,
    ready: () => fire(doc, 'DOMContentLoaded'),
    click: (selector, index = 0) =>
      fire(doc.querySelectorAll(selector)[index], 'click'),
    fire,
    gated: () =>
      [...doc.querySelectorAll('script[type="text/plain"][data-kiss-service]')]
        .length,
    live: () =>
      [...doc.querySelectorAll('script[data-kiss-done]')].map(
        (s) => s.getAttribute('src') || 'inline',
      ),
    stored: () => {
      const c = [...jar.jar.values()].find((x) => x.name === 'kiss_consent')
      return c ? JSON.parse(decodeURIComponent(c.value)) : null
    },
    layer: () =>
      win.dataLayer.map((e) => (e.length !== undefined ? Array.from(e) : e)),
  }
}

/** @param {Record<string, any>} c */
function storedCookie(c) {
  return encodeURIComponent(JSON.stringify(c))
}

const CLIENT_URL = '/kiss-consent.abcdef0123.js'
// The split's measurement (2026-11-03, gtm + youtube + vimeo): the inline
// part 4,839 bytes minified, 2,092 gzipped, config included; the cached file
// 8,939, 3,421 gzipped. About 10% headroom each; see the size block below.
const INLINE_CEILING = 5376
const FILE_CEILING = 9728

/** The inline part's code, from what `{{consentHead}}` writes. */
const scriptOf = (html) =>
  /^<script data-kiss-consent-head>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

describe('consentHeadScript', () => {
  it('writes the inline part with its config, then the cached file, deferred', () => {
    const html = consentHeadScript(configFor(SITE), CLIENT_URL)
    expect(
      html.startsWith(
        '<script data-kiss-consent-head>(function kissConsentHead(win, cfg)',
      ),
    ).toBe(true)
    expect(
      html.endsWith(
        `<script src="${CLIENT_URL}" defer data-kiss-consent-client></script>`,
      ),
    ).toBe(true)
  })

  it('escapes < and line separators in the config, so no site text can end the script', () => {
    const cfg = configFor(SITE)
    cfg.text.confirmation = 'Saved </script><script>alert(1)</script> x '
    const html = consentHeadScript(cfg, CLIENT_URL)
    // The inline part's end, and the cached file's.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).not.toContain(' ')
    expect(html).not.toContain(' ')
    const p = page(`${scriptOf(html)};\n${consentClientSource()}`)
    p.win.kissConsent.mount()
    p.click('[data-kiss-consent-action="reject"]')
    expect(p.find('[data-kiss-consent-confirmation]').textContent).toContain(
      'Saved </script><script>alert(1)</script>',
    )
  })
})

describe('consentClientSource and consentClientName', () => {
  it('holds no site config, and is named by its own hash', () => {
    const source = consentClientSource()
    expect(source.startsWith('(function kissConsentClient(win)')).toBe(true)
    expect(source).not.toContain('GTM-X')
    const hash = createHash('sha256').update(source).digest('hex')
    expect(consentClientName()).toBe(`kiss-consent.${hash.slice(0, 10)}.js`)
  })
})

describe('size', () => {
  // Inlined into every page. 10,932 bytes minified (4,047 gzipped) for
  // gtm + youtube + vimeo when first measured, and 12,600 (4,618) on
  // 2026-11-03 before the split, under a 13,312 ceiling the operator raised
  // twice that day. The split moved everything but Consent Mode, the stored
  // choice, `has()`, the banner's mount and the stub into a cached file (spec
  // planning/specs/2026-11-03-kiss-consent.md); the ceilings are the split's
  // measurements with headroom, and moving one is a decision, not a fix.
  const cfg = () =>
    configFor({ services: { gtm: { id: 'GTM-X' }, youtube: {}, vimeo: {} } })

  it('keeps the inline part under its ceiling for a three-service site', async () => {
    const min =
      (await minify(scriptOf(consentHeadScript(cfg(), CLIENT_URL)))).code ?? ''
    expect(min.length).toBeLessThan(INLINE_CEILING)
  })

  it('keeps the cached file under its ceiling', async () => {
    const min = (await minify(consentClientSource())).code ?? ''
    expect(min.length).toBeLessThan(FILE_CEILING)
  })
})

/**
 * What a browser runs: the inline part, then (deferred) the cached file.
 *
 * @param {(code: string) => Promise<string>} shape
 */
const both = (shape) => async (cfg) =>
  `${await shape(scriptOf(consentHeadScript(cfg, CLIENT_URL)))};${SPLIT}${await shape(consentClientSource())}`
// Between the two parts, so a test can run them apart.
const SPLIT = '\n/* the cached file */\n'
const forms = [
  ['as rendered', both(async (code) => code)],
  ['minified', both(async (code) => (await minify(code)).code ?? '')],
]

describe.each(forms)('the client, %s', (_, build) => {
  /** @type {string} */
  let plain
  /** @type {string} */
  let withEndpoint
  /** @type {string} */
  let withObjection
  beforeAll(async () => {
    plain = await build(configFor(SITE))
    withEndpoint = await build(configFor({ ...SITE, endpoint: '/consent-log' }))
    withObjection = await build(
      configFor({ ...SITE, categories: { statistics: { mode: 'objection' } } }),
    )
  })

  const valid = (c, extra = {}) => ({
    kiss_consent: storedCookie({
      f: 1,
      t: NOW - DAY,
      u: NOW - DAY,
      v: configFor(SITE).v,
      c,
      s: {},
      ...extra,
    }),
  })

  describe('in the head', () => {
    it('sets the Consent Mode default before anything, then the settings', () => {
      const p = page(plain)
      const layer = p.layer()
      expect(layer[0]).toEqual([
        'consent',
        'default',
        configFor(SITE).google.defaults,
      ])
      expect(layer[1]).toEqual(['set', 'ads_data_redaction', true])
      expect(layer[2]).toEqual(['set', 'url_passthrough', false])
      expect(layer).toHaveLength(3)
      expect(typeof p.win.gtag).toBe('function')
    })

    it('updates from a stored choice, synchronously', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      expect(p.layer()[3]).toEqual([
        'consent',
        'update',
        {
          analytics_storage: 'granted',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
          functionality_storage: 'denied',
          personalization_storage: 'denied',
        },
      ])
    })

    it('runs once per window', () => {
      const p = page(plain)
      const api = p.win.kissConsent
      vm.runInNewContext(plain, { window: p.win })
      expect(p.win.kissConsent).toBe(api)
      expect(p.layer()).toHaveLength(3)
    })

    it('deletes what denied services left behind, on every load', () => {
      const p = page(plain, {
        cookies: {
          ...valid({ statistics: 0, marketing: 0 }),
          _st: '1',
          _st_a: '2',
          _ga: '3',
          keep: '4',
        },
        extraCookies: [['_ga', 'x', '.example.com']],
        local: { st_key: 'v', other: 'w' },
      })
      const names = [...p.jar.jar.values()].map((c) => c.name).sort()
      expect(names).toEqual(['keep', 'kiss_consent'])
      expect([...p.win.localStorage.map.keys()]).toEqual(['other'])
    })

    it('treats a choice from another version, or older than the lifetime, as none', () => {
      const old = page(plain, {
        cookies: valid({ statistics: 1, marketing: 1 }, { v: 'other' }),
      })
      expect(old.win.kissConsent.choice).toBeNull()
      const expired = page(plain, {
        cookies: valid({ statistics: 1, marketing: 1 }, { u: NOW - 183 * DAY }),
      })
      expect(expired.win.kissConsent.choice).toBeNull()
      expired.win.kissConsent.mount()
      expect(expired.find('[data-kiss-consent-root]')).not.toBeNull()
    })

    it('treats an always-allow grant in an expired record as none', () => {
      const expired = page(plain, {
        cookies: valid(
          { statistics: 0, marketing: 0 },
          { u: NOW - 183 * DAY, s: { youtube: 1 } },
        ),
      })
      expect(expired.win.kissConsent.has('youtube')).toBe(false)
      const grantOnly = page(plain, {
        cookies: valid(null, { u: NOW - 183 * DAY, s: { youtube: 1 } }),
      })
      expect(grantOnly.win.kissConsent.has('youtube')).toBe(false)
      // a grant-only record inside its lifetime still counts
      const fresh = page(plain, { cookies: valid(null, { s: { youtube: 1 } }) })
      expect(fresh.win.kissConsent.has('youtube')).toBe(true)
      expect(fresh.win.kissConsent.choice).toBeNull()
    })
  })

  describe('the banner', () => {
    it('mounts first in <body> with no choice', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      expect(p.doc.body.firstChild.getAttribute('data-kiss-consent-root')).toBe(
        '',
      )
    })

    it('does not mount with a valid choice, or after Close in this session', () => {
      const p = page(plain, { cookies: valid({ statistics: 0, marketing: 0 }) })
      p.win.kissConsent.mount()
      expect(p.find('[data-kiss-consent-root]')).toBeNull()
      const q = page(plain, { cookies: { kiss_consent_closed: '1' } })
      q.win.kissConsent.mount()
      expect(q.find('[data-kiss-consent-root]')).toBeNull()
    })

    it('Close sets a session cookie, removes the banner and writes no choice', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="close"]')
      expect(p.find('[data-kiss-consent-root]')).toBeNull()
      expect(p.stored()).toBeNull()
      const line = p.jar.writes.find((w) =>
        w.startsWith('kiss_consent_closed='),
      )
      expect(line).toMatch(/Path=\/; SameSite=Lax; Secure$/)
      expect(line).not.toMatch(/Max-Age/)
    })
  })

  describe('activation', () => {
    it('starts nothing with no choice', () => {
      const p = page(plain)
      p.ready()
      expect(p.gated()).toBe(4)
      expect(p.live()).toEqual([])
    })

    it('replaces allowed scripts in document order, holding the queue for an external one', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 1 }) })
      p.ready()
      expect(p.live()).toEqual([
        'inline',
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
      ])
      const gtm = p.find('script[src*="gtm.js"]')
      expect(gtm.async).toBe(false)
      p.fire(gtm, 'load')
      // the data-async external does not hold the inline after it
      expect(p.live()).toEqual([
        'inline',
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
        '/js/stats.js',
        'inline',
      ])
      expect(p.gated()).toBe(0)
    })

    it('moves on when an external script never answers, after 10 seconds', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 1 }) })
      p.ready()
      expect(p.live()).toHaveLength(2)
      const timer = p.timers.find((t) => t.ms === 10000)
      expect(timer).toBeTruthy()
      timer.fn()
      expect(p.live()).toHaveLength(4)
    })

    it('starts only what the choice allows', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      p.ready()
      expect(p.live()).toEqual(['/js/stats.js', 'inline'])
      expect(p.gated()).toBe(2)
    })

    it('fires ready after the queue has started, and replays it to a late listener', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      p.ready()
      expect(p.events[0][0]).toBe('ready')
      let late = null
      p.win.kissConsent.on('ready', (d) => (late = d))
      expect(late.choice.categories).toEqual({
        statistics: true,
        marketing: false,
      })
    })
  })

  describe('a choice', () => {
    it('Accept all writes the cookie, updates Consent Mode, starts the services and confirms', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.ready()
      let ran = 0
      p.win.kissConsent.when('gtm', () => ran++)
      p.click('[data-kiss-consent-action="accept"]')
      const stored = p.stored()
      expect(stored).toMatchObject({
        f: 1,
        u: NOW,
        t: NOW,
        c: { statistics: true, marketing: true },
        s: {},
      })
      // Made whether or not there is an endpoint (D1): the browser's log and
      // the history page carry it.
      expect(stored.id).toBe('uuid-1')
      const line = p.jar.writes.find((w) => w.startsWith('kiss_consent='))
      expect(line).toMatch(/; Path=\/; Max-Age=15724800; SameSite=Lax; Secure$/)
      const layer = p.layer()
      expect(layer.find((e) => e[1] === 'update')[2].ad_storage).toBe('granted')
      expect(layer.at(-1)).toEqual({
        event: 'kiss_consent',
        kiss_consent: { statistics: true, marketing: true },
      })
      expect(p.live()).toContain(
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
      )
      const box = p.find('[data-kiss-consent-confirmation]')
      expect(box.getAttribute('role')).toBe('status')
      expect(box.getAttribute('tabindex')).toBe('-1')
      expect(p.find('[data-kiss-consent-root]')).toBeNull()
      expect(p.events.at(-1)[0]).toBe('change')
      expect(ran).toBe(1)
      expect(p.beacons).toEqual([])
      expect(p.reloads()).toBe(0)
    })

    it('Reject all with nothing running confirms without a reload', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.stored().c).toEqual({ statistics: false, marketing: false })
      expect(p.reloads()).toBe(0)
      expect(p.live()).toEqual([])
      expect(p.find('[data-kiss-consent-confirmation]')).not.toBeNull()
    })

    it('Hide removes the confirmation', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="reject"]')
      p.click('[data-kiss-consent-action="hide"]')
      expect(p.find('[data-kiss-consent-confirmation]')).toBeNull()
    })

    it('posts each choice to the endpoint as text/plain, with an id', () => {
      const p = page(withEndpoint)
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="accept"]')
      expect(p.stored().id).toBe('uuid-1')
      expect(p.beacons).toHaveLength(1)
      expect(p.beacons[0].url).toBe('/consent-log')
      expect(p.beacons[0].type).toBe('text/plain')
      expect(JSON.parse(p.beacons[0].body)).toEqual({
        format: 2,
        action: 'accept',
        id: 'uuid-1',
        version: configFor(SITE).v,
        timestamp: new Date(NOW).toISOString(),
        categories: { statistics: true, marketing: true },
        services: {},
        bannerHash: 'abcdef012345',
        page: '/a/',
      })
    })
  })

  // The split: the inline part runs first and alone, the cached file arrives
  // later (`defer`). What a visitor does in between must not be lost, and if
  // the file never arrives nothing gated may run.
  describe('before the cached file arrives', () => {
    const split = async (cfg) => {
      const [head, client] = (await build(cfg)).split(SPLIT)
      return [head, client]
    }

    it('shows the banner and answers has() and choice from the inline part alone', async () => {
      const [head] = await split(configFor(SITE))
      const p = page(head, { cookies: valid({ statistics: 1, marketing: 0 }) })
      expect(p.win.kissConsent.has('stats')).toBe(true)
      expect(p.win.kissConsent.has('gtm')).toBe(false)
      expect(p.win.kissConsent.choice.categories).toEqual({
        statistics: true,
        marketing: false,
      })
      const q = page(head)
      q.win.kissConsent.mount()
      expect(q.find('[data-kiss-consent-root]')).not.toBeNull()
      // Consent Mode's default is set before any file arrives.
      expect(q.layer()[0]).toEqual(['consent', 'default', expect.any(Object)])
    })

    it('replays a click and the stub’s calls, in order, when the file arrives', async () => {
      const [head, client] = await split(configFor(SITE))
      const p = page(head)
      p.win.kissConsent.mount()
      const seen = []
      p.win.kissConsent.when('gtm', () => seen.push('when gtm'))
      p.win.kissConsent.on('change', () => seen.push('change'))
      p.click('[data-kiss-consent-action="accept"]')
      // Nothing written yet: only the cached file writes.
      expect(p.stored()).toBeNull()
      p.run(client)
      p.ready()
      expect(p.stored().c).toEqual({ statistics: true, marketing: true })
      expect(p.find('[data-kiss-consent-confirmation]')).not.toBeNull()
      expect(seen).toEqual(['change', 'when gtm'])
      expect(p.live()).toContain(
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
      )
    })

    // Codex round 2 (P1): the queued Reject was replayed after start() had
    // activated an objection category, so its script ran and the page
    // reloaded to withdraw it. A choice made before the file arrived applies
    // before anything starts, and so before any queued when() callback.
    it('applies a Reject made before the file arrived before anything starts', async () => {
      const [head, client] = await split(
        configFor({
          ...SITE,
          categories: { statistics: { mode: 'objection' } },
        }),
      )
      const p = page(head)
      p.win.kissConsent.mount()
      const ran = []
      p.win.kissConsent.when('stats', () => ran.push('stats'))
      p.click('[data-kiss-consent-action="reject"]')
      p.run(client)
      p.ready()
      expect(p.stored().c.statistics).toBe(false)
      expect(p.live()).toEqual([])
      expect(ran).toEqual([])
      expect(p.reloads()).toBe(0)
    })

    // Codex round 3 (P2): a script that kept `window.kissConsent`, or one of
    // its methods, from before the file arrived kept the stub, and its later
    // calls were queued after the queue had been drained, forever.
    it('keeps one window.kissConsent, whose methods reach the client once it has started', async () => {
      const [head, client] = await split(configFor(SITE))
      const p = page(head)
      const kept = p.win.kissConsent
      const { when, show } = kept
      p.run(client)
      p.ready()
      expect(p.win.kissConsent).toBe(kept)
      const ran = []
      when('necessary', () => ran.push('detached'))
      kept.when('necessary', () => ran.push('kept'))
      kept.on('ready', () => ran.push('ready'))
      expect(ran).toEqual(['detached', 'kept', 'ready'])
      show()
      expect(p.find('[data-kiss-consent-dialog]')).not.toBeNull()
    })

    it('runs nothing gated and writes nothing if the file never arrives', async () => {
      const [head] = await split(configFor(SITE))
      const p = page(head)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="accept"]')
      expect(p.stored()).toBeNull()
      expect(p.live()).toEqual([])
      expect(p.gated()).toBeGreaterThan(0)
    })

    it('runs once: a second copy of either part does nothing', async () => {
      const [head, client] = await split(configFor(SITE))
      const p = page(head)
      p.run(client)
      p.ready()
      p.win.kissConsent.mount()
      p.run(head)
      p.run(client)
      p.click('[data-kiss-consent-action="reject"]')
      expect(
        p.jar.writes.filter((w) => w.startsWith('kiss_consent=')),
      ).toHaveLength(1)
    })
  })

  // `kiss_consent_log`: the browser's own dated copy of every record it
  // made, in the format it posts (spec planning/specs/2026-11-03-kiss-consent.md,
  // D1, D8, D10, D13).
  describe('the browser log', () => {
    const LOG = 'kiss_consent_log'
    const logOf = (p) => JSON.parse(p.win.localStorage.getItem(LOG) ?? 'null')

    it('logs each choice, oldest first, exactly as it posts it', () => {
      const p = page(withEndpoint)
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="accept"]')
      p.clock.now = NOW + 1000
      p.click('[data-kiss-consent-action="settings"]')
      const boxes = p
        .find('dialog')
        .querySelectorAll('input[data-kiss-consent-category]')
      boxes[1].checked = false
      p.click('[data-kiss-consent-action="save"]')
      const log = logOf(p)
      expect(log.map((r) => r.action)).toEqual(['accept', 'save'])
      expect(log.map((r) => r.format)).toEqual([2, 2])
      expect(log[1].categories).toEqual({ statistics: true, marketing: false })
      expect(log[1].timestamp).toBe(new Date(NOW + 1000).toISOString())
      expect(log).toEqual(p.beacons.map((b) => JSON.parse(b.body)))
    })

    it('logs with no endpoint, and always makes the id (D1)', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.beacons).toEqual([])
      expect(p.stored().id).toBe('uuid-1')
      expect(p.win.kissConsent.choice.id).toBe('uuid-1')
      expect(logOf(p)).toEqual([
        {
          format: 2,
          action: 'reject',
          id: 'uuid-1',
          version: configFor(SITE).v,
          timestamp: new Date(NOW).toISOString(),
          categories: { statistics: false, marketing: false },
          services: {},
          bannerHash: 'abcdef012345',
          page: '/a/',
        },
      ])
    })

    it('logs an Always allow made before the banner was answered', () => {
      const p = page(plain)
      p.ready()
      p.click('[data-kiss-consent-action="allow"]')
      const [entry] = logOf(p)
      expect(entry.action).toBe('allow')
      expect(entry.categories).toBeNull()
      expect(entry.services).toEqual({ youtube: 1 })
    })

    it('never logs a page load, a Close, the settings or a plain Load', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      p.ready()
      p.click('[data-kiss-consent-action="settings"]')
      p.click('[data-kiss-consent-action="close-dialog"]')
      p.click('[data-kiss-consent-action="load"]')
      const q = page(plain)
      q.win.kissConsent.mount()
      q.click('[data-kiss-consent-action="close"]')
      expect(p.win.localStorage.getItem(LOG)).toBeNull()
      expect(q.win.localStorage.getItem(LOG)).toBeNull()
    })

    it('is written before a withdrawal reloads, and never deleted by a service’s pattern (D8)', async () => {
      const greedy = await build(
        configFor({
          ...SITE,
          categories: { statistics: { mode: 'objection' } },
          services: {
            ...SITE.services,
            stats: { ...SITE.services.stats, storage: ['st_key', 'kiss_*'] },
          },
        }),
      )
      const p = page(greedy, { local: { kiss_other: 'x' } })
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.reloads()).toBe(1)
      // The pattern ran: it took the key it matched, and left the log.
      expect(p.win.localStorage.getItem('kiss_other')).toBeNull()
      expect(logOf(p).map((r) => r.action)).toEqual(['reject'])
    })

    it('keeps the last 50 records, dropping the oldest', () => {
      const old = Array.from({ length: 50 }, (_, n) => ({ n }))
      const p = page(plain, { local: { [LOG]: JSON.stringify(old) } })
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="accept"]')
      const log = logOf(p)
      expect(log).toHaveLength(50)
      expect(log[0]).toEqual({ n: 1 })
      expect(log[49].action).toBe('accept')
    })

    it('starts again from a log that is not a list', () => {
      const p = page(plain, { local: { [LOG]: '{not json' } })
      p.win.kissConsent.mount()
      p.click('[data-kiss-consent-action="accept"]')
      expect(logOf(p).map((r) => r.action)).toEqual(['accept'])
    })

    it('makes the choice as before when storage is unavailable (D10)', () => {
      const p = page(withEndpoint, { storageThrows: true })
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="accept"]')
      expect(p.stored().c).toEqual({ statistics: true, marketing: true })
      expect(p.beacons).toHaveLength(1)
      // The queue started: GTM first, holding it until it loads.
      expect(p.live()).toContain(
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
      )
    })
  })

  describe('withdrawal', () => {
    it('Reject all switches off a running objection category, deletes its cookies and reloads', () => {
      const p = page(withObjection, {
        cookies: { _st: '1' },
        extraCookies: [['_st_b', '2', '.example.com']],
        local: { st_key: 'x' },
      })
      p.win.kissConsent.mount()
      p.ready()
      expect(p.live()).toEqual(['/js/stats.js', 'inline'])
      p.jar.put('_st', '1')
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.stored().c.statistics).toBe(false)
      expect([...p.jar.jar.values()].map((c) => c.name)).toEqual([
        'kiss_consent',
      ])
      // The service's key is gone; the consent log, written before the
      // reload, is all that is left.
      expect([...p.win.localStorage.map.keys()]).toEqual(['kiss_consent_log'])
      expect(p.reloads()).toBe(1)
    })

    it('saving the dialog with a granted category unticked withdraws it', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 1 }) })
      p.ready()
      p.click('[data-kiss-consent-action="settings"]')
      const dlg = p.find('dialog')
      const boxes = dlg.querySelectorAll('input[data-kiss-consent-category]')
      expect([...boxes].map((b) => b.checked)).toEqual([true, true])
      boxes[1].checked = false
      p.click('[data-kiss-consent-action="save"]')
      expect(p.stored().c).toEqual({ statistics: true, marketing: false })
      expect(p.reloads()).toBe(1)
    })

    it('denying a category clears the always-allow grants of its services', () => {
      const p = page(plain, {
        cookies: valid({ statistics: 0, marketing: 1 }, { s: { youtube: 1 } }),
      })
      p.ready()
      p.win.kissConsent.show()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.stored().s).toEqual({})
    })

    it('Reject all clears always-allow grants even when their category was already refused', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="allow"]')
      expect(p.win.kissConsent.has('youtube')).toBe(true)
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.stored().s).toEqual({})
      expect(p.win.kissConsent.has('youtube')).toBe(false)
      // the revealed video is withdrawn the only way a running frame can be
      expect(p.reloads()).toBe(1)
    })

    it('withdraws a granted service that site code started with when(), with no embed on the page', async () => {
      const cfg = configFor({
        ...SITE,
        services: { ...SITE.services, vimeo: { cookies: ['vm_first'] } },
      })
      const source = await build(cfg)
      const p = page(source, {
        cookies: {
          // a new service is a new version: the record must carry this one
          ...valid(
            { statistics: 0, marketing: 0 },
            { v: cfg.v, s: { vimeo: 1 } },
          ),
          vm_first: '1',
        },
      })
      let ran = 0
      p.win.kissConsent.when('vimeo', () => ran++)
      expect(ran).toBe(1)
      p.ready()
      p.win.kissConsent.show()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.win.kissConsent.has('vimeo')).toBe(false)
      expect(p.reloads()).toBe(1)
      expect([...p.jar.jar.values()].map((c) => c.name)).not.toContain(
        'vm_first',
      )
    })

    it('keeps a cookie an allowed service also declares, while deleting a refused one’s own', async () => {
      // gtag (statistics) and gtm (marketing) both declare the Google
      // cookies: _ga, _ga_* and _gcl_au
      const cfg = configFor({
        ...SITE,
        services: {
          ...SITE.services,
          gtm: { id: 'GTM-X', cookies: ['_gtm_own'] },
          gtag: { id: 'G-X' },
        },
      })
      const p = page(await build(cfg), {
        cookies: {
          ...valid({ statistics: 1, marketing: 0 }, { v: cfg.v }),
          _ga: '1',
          _ga_X: '2',
          _gcl_au: '3',
          _gtm_own: '4',
        },
      })
      const names = [...p.jar.jar.values()].map((c) => c.name)
      expect(names).toContain('_ga')
      expect(names).toContain('_ga_X')
      expect(names).toContain('_gcl_au')
      // gtm's own, which no allowed service declares
      expect(names).not.toContain('_gtm_own')
    })

    it('withdraws a granted service whose gated scripts ran, with its category refused', () => {
      const p = page(plain, {
        cookies: {
          ...valid({ statistics: 0, marketing: 0 }, { s: { gtm: 1 } }),
          _ga: '1',
        },
      })
      p.ready()
      expect(p.live()).toContain(
        'https://www.googletagmanager.com/gtm.js?id=GTM-X',
      )
      p.win.kissConsent.show()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.reloads()).toBe(1)
      expect([...p.jar.jar.values()].map((c) => c.name)).not.toContain('_ga')
    })

    it('Reject all clears a stored grant under a refused category', () => {
      const p = page(plain, {
        cookies: valid({ statistics: 0, marketing: 0 }, { s: { youtube: 1 } }),
      })
      p.ready()
      p.win.kissConsent.show()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.stored().s).toEqual({})
      expect(p.win.kissConsent.has('youtube')).toBe(false)
    })
  })

  describe('the settings dialog', () => {
    it('opens with the stored state, and shows a grant only when there is one', () => {
      const p = page(plain, {
        cookies: valid({ statistics: 1, marketing: 0 }, { s: { youtube: 1 } }),
      })
      p.ready()
      p.win.kissConsent.show()
      const dlg = p.find('dialog')
      expect(
        [...dlg.querySelectorAll('input[data-kiss-consent-category]')].map(
          (b) => b.checked,
        ),
      ).toEqual([true, false])
      const grant = dlg.querySelector('[data-kiss-consent-grant="youtube"]')
      expect(grant.hidden).toBe(false)
      expect(grant.querySelector('input').checked).toBe(true)
    })

    it('unticking a grant and saving removes it', () => {
      const p = page(plain, {
        cookies: valid({ statistics: 1, marketing: 0 }, { s: { youtube: 1 } }),
      })
      p.ready()
      p.win.kissConsent.show()
      p.find('input[data-kiss-consent-service="youtube"]').checked = false
      p.click('[data-kiss-consent-action="save"]')
      expect(p.stored().s).toEqual({})
    })

    it('Close shuts the dialog and writes nothing', () => {
      const p = page(plain)
      p.win.kissConsent.show()
      p.click('[data-kiss-consent-action="close-dialog"]')
      expect(p.find('dialog')).toBeNull()
      expect(p.stored()).toBeNull()
    })

    it('starts every objection category ticked when there is no choice', () => {
      const p = page(withObjection)
      p.win.kissConsent.show()
      const boxes = p.doc.querySelectorAll(
        'dialog input[data-kiss-consent-category]',
      )
      expect([...boxes].map((b) => b.checked)).toEqual([true, false])
    })
  })

  describe('embeds', () => {
    it('loads nothing until asked, then one frame, once', () => {
      const p = page(plain)
      p.ready()
      expect(p.doc.querySelectorAll('iframe')).toHaveLength(0)
      p.click('[data-kiss-consent-action="load"]')
      p.click('[data-kiss-consent-action="load"]')
      expect(p.doc.querySelectorAll('iframe')).toHaveLength(1)
      expect(p.stored()).toBeNull()
    })

    it('always allow reveals every embed of the service and stores the grant, not a category choice', () => {
      const p = page(withEndpoint)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="allow"]')
      expect(p.doc.querySelectorAll('iframe')).toHaveLength(2)
      expect(p.stored()).toMatchObject({ c: null, s: { youtube: 1 } })
      expect(p.beacons).toHaveLength(1)
      expect(p.win.kissConsent.has('youtube')).toBe(true)
      expect(p.win.kissConsent.has('marketing')).toBe(false)
      // still asked, because no category was answered
      expect(p.find('[data-kiss-consent-root]')).not.toBeNull()
    })

    it('always allow also starts the service’s gated scripts on the page', () => {
      const p = page(plain, {
        extraBody:
          '<script type="text/plain" data-kiss-service="youtube" data-kiss-consent="marketing" data-src="/yt-api.js"></script>',
      })
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="allow"]')
      expect(p.live()).toContain('/yt-api.js')
    })

    it('reveals allowed embeds on load', () => {
      const p = page(plain, { cookies: valid({ statistics: 0, marketing: 1 }) })
      p.ready()
      expect(p.doc.querySelectorAll('iframe')).toHaveLength(2)
      expect(p.find('[data-kiss-consent-ui]').hidden).toBe(true)
    })
  })

  describe('a necessary service', () => {
    it('is always allowed, before any choice and after Reject all', async () => {
      const source = await build(
        configFor({
          ...SITE,
          services: {
            ...SITE.services,
            // _gcl_au is gtm's too: the necessary service keeps it
            cdn: {
              category: 'necessary',
              src: '/lib.js',
              cookies: ['cdn_s', '_gcl_au'],
            },
          },
        }),
      )
      const p = page(source, { cookies: { cdn_s: '1', _gcl_au: '2' } })
      let ran = 0
      p.win.kissConsent.when('cdn', () => ran++)
      expect(p.win.kissConsent.has('cdn')).toBe(true)
      expect(ran).toBe(1)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.win.kissConsent.has('cdn')).toBe(true)
      // its cookie is not the client's to delete
      const names = [...p.jar.jar.values()].map((c) => c.name)
      expect(names).toContain('cdn_s')
      expect(names).toContain('_gcl_au')
    })
  })

  describe('names that are also Object.prototype’s', () => {
    it('grants nothing through an inherited property', async () => {
      const cfg = configFor({
        ...SITE,
        services: {
          ...SITE.services,
          constructor: { category: 'marketing', src: '/c.js' },
        },
      })
      const p = page(await build(cfg))
      expect(p.win.kissConsent.has('constructor')).toBe(false)
      expect(p.win.kissConsent.has('tostring')).toBe(false)
      expect(p.win.kissConsent.has('hasOwnProperty')).toBe(false)
      p.win.kissConsent.mount()
      p.ready()
      p.click('[data-kiss-consent-action="reject"]')
      expect(p.win.kissConsent.has('constructor')).toBe(false)
    })
  })

  describe('the API', () => {
    it('answers has() for necessary, categories and services', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      const k = p.win.kissConsent
      expect(k.has('necessary')).toBe(true)
      expect(k.has('statistics')).toBe(true)
      expect(k.has('marketing')).toBe(false)
      expect(k.has('stats')).toBe(true)
      expect(k.has('gtm')).toBe(false)
      expect(k.has('nothing')).toBe(false)
    })

    it('hands out a frozen snapshot of the choice', () => {
      const p = page(plain, { cookies: valid({ statistics: 1, marketing: 0 }) })
      const c = p.win.kissConsent.choice
      expect(Object.isFrozen(c)).toBe(true)
      expect(c.categories).toEqual({ statistics: true, marketing: false })
      expect(c.at).toBe(NOW - DAY)
    })

    it('runs when() now when already granted, and once on the change that grants it', () => {
      const p = page(plain)
      p.win.kissConsent.mount()
      let n = 0
      p.win.kissConsent.when('stats', () => n++)
      expect(n).toBe(0)
      p.click('[data-kiss-consent-action="accept"]')
      expect(n).toBe(1)
      p.win.kissConsent.when('stats', () => n++)
      expect(n).toBe(2)
    })
  })
})
