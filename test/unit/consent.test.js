import { describe, it, expect } from 'vitest'
import {
  ADS_CMP_SIGNATURES,
  DEFAULT_GOOGLE,
  PRESETS,
  TRACKER_ORIGINS,
  bannerHash,
  bannerRegistry,
  categoriesInUse,
  clientConfig,
  consentModeDefault,
  consentModeState,
  consentReport,
  fill,
  gatingOf,
  matchesHost,
  originOf,
  purposesVersion,
  resolveConsent,
  scriptKind,
  serviceParams,
  textOf,
} from '../../lib/consent.js'
import { resolveConfig } from '../../lib/config.js'

describe('scriptKind', () => {
  // What Chromium 156 runs, measured 2026-11-03 (AIKB/upstream.md): the
  // type, or text/ plus the language, stripped of ASCII whitespace and
  // matched without case against the JavaScript MIME types; `module`
  // matched without case but not stripped.
  it.each([
    [undefined, undefined, 'classic'],
    ['', undefined, 'classic'],
    [undefined, '', 'classic'],
    ['text/javascript', undefined, 'classic'],
    [' Text/JavaScript\n', undefined, 'classic'],
    ['application/x-javascript', undefined, 'classic'],
    ['text/javascript1.5', undefined, 'classic'],
    ['text/jscript', undefined, 'classic'],
    ['text/livescript', undefined, 'classic'],
    ['text/x-ecmascript', undefined, 'classic'],
    [undefined, 'javascript', 'classic'],
    [undefined, 'JavaScript1.2', 'classic'],
    // a type attribute wins over language
    ['text/javascript', 'vbscript', 'classic'],
    ['module', undefined, 'module'],
    ['MODULE', undefined, 'module'],
    // measured, Chromium 156: `module` is not stripped of whitespace
    [' module', undefined, null],
    ['application/ld+json', undefined, null],
    ['text/plain', undefined, null],
    ['importmap', undefined, null],
    ['text/javascript; charset=utf-8', undefined, null],
    ['  ', undefined, null],
    [undefined, 'vbscript', null],
  ])('type %j, language %j → %j', (type, language, kind) => {
    expect(scriptKind(type, language)).toBe(kind)
  })
})

const minimal = () => ({ services: { gtm: { id: 'GTM-X' }, youtube: {} } })
/** @param {any} input */
const resolved = (input) => {
  const r = resolveConsent(input)
  if (!r) throw new Error('expected a resolved consent block')
  return r
}

describe('resolveConsent: off', () => {
  it.each([undefined, null, false])('%s means no consent manager', (v) => {
    expect(resolveConsent(v)).toBeNull()
  })

  it.each([true, 'yes', 1, []])('refuses %j', (v) => {
    expect(() => resolveConsent(v)).toThrow(/config\.consent must be an object/)
  })
})

describe('resolveConsent: the minimum a site writes', () => {
  const r = resolved(minimal())

  it('fills gtm from its preset, in marketing (contract Appendix A, S1b)', () => {
    const gtm = r.services.gtm
    expect(gtm.preset).toBe('gtm')
    expect(gtm.category).toBe('marketing')
    expect(gtm.src).toBe('https://www.googletagmanager.com/gtm.js?id={id}')
    expect(gtm.inline).toMatch(/gtm\.start/)
    expect(gtm.google).toBe(true)
    expect(gtm.params).toEqual({ id: 'GTM-X' })
    expect(gtm.origins).toEqual(['https://www.googletagmanager.com'])
    expect(gtm.cookies.map((c) => [c.name, c.party])).toEqual([
      ['_ga', 'first'],
      ['_ga_*', 'first'],
      ['_gcl_au', 'first'],
    ])
  })

  it('fills youtube as an embed whose storage is third-party', () => {
    const yt = r.services.youtube
    expect(yt.embed).toEqual({
      src: 'https://www.youtube-nocookie.com/embed/{id}',
      title: null,
      watch: 'https://www.youtube.com/watch?v={id}',
      ratio: '16/9',
      width: null,
      height: null,
      measure: false,
    })
    expect(yt.storage.every((s) => s.party === 'third')).toBe(true)
  })

  it('reads a storage entry as localStorage unless its kind says otherwise, and a cookie has none', () => {
    const own = resolveConsent({
      services: {
        s: {
          category: 'statistics',
          cookies: ['c'],
          storage: [
            'a',
            { name: 'b', kind: 'indexeddb' },
            { name: 'd', kind: 'session' },
          ],
        },
      },
    })
    const s = own?.services.s
    expect(s?.cookies.map((c) => c.kind)).toEqual(['cookie'])
    expect(s?.storage.map((c) => c.kind)).toEqual([
      'local',
      'indexeddb',
      'session',
    ])
    expect(() =>
      resolveConsent({
        services: {
          s: { category: 'statistics', storage: [{ name: 'b', kind: 'idb' }] },
        },
      }),
    ).toThrow(/storage\[0\]\.kind must be one of local, session, indexeddb/)
    expect(() =>
      resolveConsent({
        services: {
          s: {
            category: 'statistics',
            cookies: [{ name: 'c', kind: 'local' }],
          },
        },
      }),
    ).toThrow(/cookies\[0\]\.kind is for a storage entry/)
  })

  it('sends the client only first-party localStorage keys to delete', () => {
    const own = resolveConsent({
      services: {
        s: {
          category: 'statistics',
          storage: [
            'a',
            { name: 'b', kind: 'indexeddb' },
            { name: 'd', kind: 'session' },
          ],
        },
      },
    })
    if (!own) throw new Error('no consent')
    const sent = clientConfig(own).services.find((x) => x.name === 's')
    expect(sent.storage).toEqual(['a'])
  })

  it('takes the defaults for everything else', () => {
    expect(r.cookie).toEqual({ name: 'kiss_consent', days: 182, domain: null })
    expect(r.google.mode).toBe('basic')
    expect(r.endpoint).toBeNull()
    expect(r.ui.position).toBe('bottom')
    expect(r.ui.policy).toBe('cookies')
    expect(r.ui.partial).toBe('consent-banner')
    expect(r.ui.text.accept).toBe('Accept all')
    expect(r.ui.text.reject).toBe('Reject all')
    expect(r.inUse).toEqual(['marketing'])
    expect(r.version).toMatch(/^[0-9a-f]{12}$/)
  })

  it('reaches resolveConfig', () => {
    expect(resolveConfig({}).consent).toBeNull()
    expect(
      resolveConfig({ consent: minimal() }).consent?.services.gtm.category,
    ).toBe('marketing')
  })
})

describe('resolveConsent: services', () => {
  it('lets a site override a preset, and its own keys win', () => {
    const r = resolved({
      services: { gtm: { id: 'G', category: 'statistics', label: 'Tags' } },
    })
    expect(r.services.gtm.category).toBe('statistics')
    expect(r.services.gtm.label).toBe('Tags')
    expect(r.inUse).toEqual(['statistics'])
  })

  it('names a preset explicitly, or none with preset: false', () => {
    const r = resolved({
      services: {
        analytics: { preset: 'gtag', id: 'G-1' },
        youtube: { preset: false, category: 'marketing' },
      },
    })
    expect(r.services.analytics.src).toMatch(/gtag\/js\?id=\{id\}/)
    expect(r.services.youtube.embed).toBeNull()
    expect(r.services.youtube.preset).toBeNull()
  })

  it('requires a category when there is no preset', () => {
    expect(() => resolveConsent({ services: { chat: {} } })).toThrow(
      /services\.chat\.category is required/,
    )
  })

  it('refuses a category outside the four', () => {
    expect(() =>
      resolveConsent({ services: { chat: { category: 'ads' } } }),
    ).toThrow(/must be one of necessary, preferences, statistics, marketing/)
  })

  it('refuses an unknown preset name', () => {
    expect(() =>
      resolveConsent({
        services: { x: { preset: 'hotjar', category: 'marketing' } },
      }),
    ).toThrow(
      /preset must be false or one of gtm, gtag, youtube, vimeo, google-maps/,
    )
  })

  it.each(['Chat', 'my chat', '1chat', 'chat_widget'])(
    'refuses the service name %j',
    (name) => {
      expect(() =>
        resolveConsent({ services: { [name]: { category: 'marketing' } } }),
      ).toThrow(/is not a service name/)
    },
  )

  // kissConsent.has() takes a category or a service by one name, so a
  // service named for a category would be answered as the category: one
  // named `necessary` would run before any choice.
  it.each(['necessary', 'preferences', 'statistics', 'marketing'])(
    'refuses the service name %j, which is a category’s',
    (name) => {
      expect(() =>
        resolveConsent({
          services: { [name]: { category: 'statistics', src: '/t.js' } },
        }),
      ).toThrow(/is a category's name/)
    },
  )

  it('takes any other key as a placeholder value', () => {
    const r = resolved({
      services: {
        chat: {
          category: 'marketing',
          src: 'https://w.example/{key}.js',
          key: 'abc',
          n: 3,
        },
      },
    })
    expect(r.services.chat.params).toEqual({ key: 'abc', n: '3' })
    expect(r.services.chat.origins).toEqual(['https://w.example'])
  })

  it('names the valid keys when an extra key is not a placeholder value', () => {
    expect(() =>
      resolveConsent({
        services: {
          chat: { category: 'marketing', orgins: ['https://x.example'] },
        },
      }),
    ).toThrow(/orgins is not a setting — valid keys are preset, category/)
  })

  it('refuses origins that are not absolute URLs', () => {
    expect(() =>
      resolveConsent({
        services: { chat: { category: 'marketing', origins: ['x.example'] } },
      }),
    ).toThrow(/origins must be a list of absolute http\(s\) URLs/)
  })

  it('collects origins from src, embed.src and the declared list', () => {
    const r = resolved({
      services: {
        maps: {
          preset: 'google-maps',
          embed: { src: 'https://maps.example/embed?x=1' },
          origins: ['https://tiles.example/a/b'],
        },
      },
    })
    expect(r.services.maps.origins).toEqual([
      'https://maps.example',
      'https://tiles.example',
      'https://www.google.com',
    ])
  })

  it('marks a stored item with a domain as third-party, and lets party override it', () => {
    const r = resolved({
      services: {
        chat: {
          category: 'marketing',
          cookies: [
            'own',
            { name: 'theirs', domain: '.chat.example' },
            { name: 'sub', domain: '.site.example', party: 'first' },
          ],
        },
      },
    })
    expect(r.services.chat.cookies.map((c) => [c.name, c.party])).toEqual([
      ['own', 'first'],
      ['theirs', 'third'],
      ['sub', 'first'],
    ])
  })

  it('adds a site’s own cookies and storage to the preset’s, its own entry winning by name', () => {
    const r = resolved({
      services: {
        gtm: {
          id: 'G',
          cookies: [
            '_fbp',
            { name: '_ga', duration: '13 months', description: 'own words' },
          ],
          storage: ['_gcl_ls'],
        },
      },
    })
    expect(r.services.gtm.cookies.map((c) => [c.name, c.duration])).toEqual([
      ['_ga', '13 months'],
      ['_ga_*', '2 years'],
      ['_gcl_au', '3 months'],
      ['_fbp', ''],
    ])
    expect(r.services.gtm.storage.map((s) => s.name)).toEqual(['_gcl_ls'])
  })

  it('refuses a Google tag in an objection category', () => {
    expect(() =>
      resolveConsent({
        categories: { statistics: { mode: 'objection' } },
        services: { gtag: { id: 'G-1' } },
      }),
    ).toThrow(/Google tag cannot be in an 'objection' category/)
  })
})

// A service's `policy` becomes an href in the dialog and the cookie table
// (2026-11-04), so it is the provider's own page: an absolute http(s) URL.
describe("resolveConsent: a service's policy is an http(s) URL or null", () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/privacy/',
    'policies.google.com/privacy',
    ' https://x.example/privacy',
  ])('refuses %j', (policy) => {
    expect(() =>
      resolveConsent({ services: { chat: { category: 'marketing', policy } } }),
    ).toThrow(
      /config\.consent\.services\.chat\.policy must be an http\(s\) URL or null/,
    )
  })

  it('takes an https URL, and a preset keeps its own', () => {
    const r = resolveConsent({
      services: {
        chat: { category: 'marketing', policy: 'https://chat.example/privacy' },
        youtube: {},
      },
    })
    expect(r?.services.chat.policy).toBe('https://chat.example/privacy')
    expect(r?.services.youtube.policy).toBe(
      'https://policies.google.com/privacy',
    )
  })
})

describe('resolveConsent: refuses settings outside the contract', () => {
  it.each([
    [
      { endpont: '/x', services: {} },
      /config\.consent\.endpont is not a setting — valid keys are version, categories/,
    ],
    [
      { services: {}, categories: { ads: {} } },
      /categories\.ads is not a setting/,
    ],
    [
      { services: {}, categories: { statistics: { colour: 'x' } } },
      /statistics\.colour is not a setting/,
    ],
    [
      { services: {}, categories: { marketing: { mode: 'objection' } } },
      /only statistics may be 'objection'/,
    ],
    [
      { services: {}, categories: { statistics: { mode: 'opt-out' } } },
      /mode must be 'consent' or 'objection'/,
    ],
    [
      { services: {}, cookie: { days: 400 } },
      /days must be a whole number from 1 to 395/,
    ],
    [
      { services: {}, cookie: { days: 0 } },
      /days must be a whole number from 1 to 395/,
    ],
    [
      { services: {}, cookie: { name: 'a b' } },
      /cookie\.name must be a cookie name/,
    ],
    [{ services: {}, cookie: { path: '/' } }, /cookie\.path is not a setting/],
    // The consent log is the mechanism's own; a service that declared it
    // would have it deleted on withdrawal and listed as the service's (D8).
    [
      {
        services: {
          stats: { category: 'statistics', storage: ['kiss_consent_log'] },
        },
      },
      /services\.stats declares kiss_consent_log, the consent log's own name/,
    ],
    [
      {
        cookie: { name: 'my_c' },
        services: { stats: { category: 'statistics', cookies: ['my_c_log'] } },
      },
      /services\.stats declares my_c_log, the consent log's own name/,
    ],
    [
      { services: {}, google: { mode: 'full' } },
      /google\.mode must be 'basic' or 'advanced'/,
    ],
    [
      { services: {}, google: { map: { statistics: ['ga'] } } },
      /map\.statistics must be a list of Consent Mode types/,
    ],
    [
      { services: {}, endpoint: 'http://log.example' },
      /endpoint must be an https URL or a path starting with \//,
    ],
    [
      { services: {}, endpoint: '//log.example' },
      /endpoint must be an https URL/,
    ],
    [
      { services: {}, ui: { position: 'left' } },
      /position must be 'bottom' or 'top'/,
    ],
    [
      { services: {}, ui: { text: { acept: 'OK' } } },
      /text\.acept is not a setting — valid keys are title, body, accept/,
    ],
    [
      { services: {}, ui: { theme: { accent: 'red;}' } } },
      /theme\.accent must be a CSS value/,
    ],
    [
      { services: {}, ui: { theme: { shadow: '0' } } },
      /theme\.shadow is not a setting/,
    ],
    [{ services: {}, ui: { policy: '' } }, /policy must be a page id or null/],
    [{ services: {}, version: '' }, /version must be a non-empty string/],
  ])('%j', (input, message) => {
    expect(() => resolveConsent(input)).toThrow(message)
  })

  it('accepts theme: false, an https or rooted endpoint, and policy: null', () => {
    const r = resolved({
      services: {},
      endpoint: '/consent-log',
      ui: { theme: false, policy: null },
    })
    expect(r.ui.theme).toBe(false)
    expect(r.ui.policy).toBeNull()
    expect(
      resolved({ services: {}, endpoint: 'https://log.example/c' }).endpoint,
    ).toBe('https://log.example/c')
  })
})

describe('categoriesInUse', () => {
  it('is site-wide, in a fixed order, and skips necessary', () => {
    const r = resolved({
      services: {
        chat: { category: 'marketing' },
        geo: { category: 'preferences' },
        cdn: { category: 'necessary' },
        stats: { category: 'statistics' },
      },
    })
    expect(r.inUse).toEqual(['preferences', 'statistics', 'marketing'])
    expect(categoriesInUse(r)).toEqual(r.inUse)
  })

  it('is empty for a site with only necessary services', () => {
    expect(
      resolved({ services: { cdn: { category: 'necessary' } } }).inUse,
    ).toEqual([])
  })
})

describe('purposesVersion', () => {
  const base = () => ({
    services: {
      gtm: { id: 'GTM-X' },
      youtube: {},
      chat: {
        category: 'marketing',
        src: 'https://w.example/sdk.js',
        provider: 'Chat Co',
      },
    },
  })
  const version = (input) => resolved(input).version

  it('does not change with wording, theme, logo, position, cookie, endpoint or cookie lists', () => {
    const v = version(base())
    expect(
      version({
        ...base(),
        ui: {
          text: { title: 'Biscuits' },
          theme: { accent: '#f00' },
          logo: 'img/x.svg',
          position: 'top',
        },
        cookie: { days: 30 },
        endpoint: '/log',
      }),
    ).toBe(v)
    const more = base()
    more.services.chat.cookies = ['chat_id']
    expect(version(more)).toBe(v)
  })

  it('does not change with the order services are declared in', () => {
    const b = base()
    const reordered = {
      services: { chat: b.services.chat, youtube: {}, gtm: { id: 'GTM-X' } },
    }
    expect(version(reordered)).toBe(version(base()))
  })

  it('does not change with a placeholder value', () => {
    const b = base()
    b.services.gtm.id = 'GTM-Y'
    expect(version(b)).toBe(version(base()))
  })

  it('changes with a new service, a new origin, a provider, a category or a mode', () => {
    const v = version(base())
    const added = base()
    added.services.vimeo = {}
    expect(version(added)).not.toBe(v)
    const origin = base()
    origin.services.chat.origins = ['https://api.example']
    expect(version(origin)).not.toBe(v)
    const provider = base()
    provider.services.chat.provider = 'Other Co'
    expect(version(provider)).not.toBe(v)
    const category = base()
    category.services.chat.category = 'preferences'
    expect(version(category)).not.toBe(v)
    const stats = {
      services: { stats: { category: 'statistics', src: '/s.js' } },
    }
    expect(
      version({ ...stats, categories: { statistics: { mode: 'objection' } } }),
    ).not.toBe(version(stats))
  })

  it('ignores necessary services', () => {
    const withCdn = base()
    withCdn.services.cdn = {
      category: 'necessary',
      src: 'https://cdn.example/x.js',
    }
    expect(version(withCdn)).toBe(version(base()))
  })

  it('yields to an explicit version', () => {
    expect(resolved({ ...base(), version: '2026-11' }).version).toBe('2026-11')
    expect(purposesVersion(resolved({ ...base(), version: '2026-11' }))).toBe(
      version(base()),
    )
  })
})

describe('Consent Mode', () => {
  it('denies every mapped type by default and grants security_storage', () => {
    expect(consentModeDefault(resolved(minimal()))).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
    })
  })

  it('grants an objection category in use by default', () => {
    const r = resolved({
      categories: { statistics: { mode: 'objection' } },
      services: { stats: { category: 'statistics', src: '/s.js' } },
    })
    expect(consentModeDefault(r).analytics_storage).toBe('granted')
  })

  it('adds wait_for_update under advanced mode only (S1)', () => {
    expect(consentModeDefault(resolved(minimal()))).not.toHaveProperty(
      'wait_for_update',
    )
    expect(
      consentModeDefault(
        resolved({
          ...minimal(),
          google: { mode: 'advanced', waitForUpdate: 800 },
        }),
      ),
    ).toHaveProperty('wait_for_update', 800)
  })

  it('gives a type whose category is not offered to the category holding the Google tags', () => {
    // gtm alone is marketing: no statistics category is offered, so
    // analytics_storage rides on marketing. Accept all must grant it, or GA4
    // runs cookieless for a visitor who accepted everything (diploma-msc
    // trial, 2026-11-03: gcs=G110 after Accept all).
    const r = resolved(minimal())
    expect(r.google.map.marketing).toEqual([
      'ad_storage',
      'ad_user_data',
      'ad_personalization',
      'functionality_storage',
      'personalization_storage',
      'analytics_storage',
    ])
    expect(r.google.map.statistics).toEqual([])
    expect(r.google.map.preferences).toEqual([])
    expect(
      consentModeState({ marketing: true }, r.google.map).analytics_storage,
    ).toBe('granted')
    expect(consentModeDefault(r).analytics_storage).toBe('denied')
  })

  it('leaves the map alone when every mapped category is offered', () => {
    const r = resolved({
      services: {
        gtag: { id: 'G-1' },
        gtm: { id: 'G' },
        geo: { category: 'preferences' },
      },
    })
    expect(r.google.map.statistics).toEqual(['analytics_storage'])
    expect(r.google.map.marketing).toEqual([
      'ad_storage',
      'ad_user_data',
      'ad_personalization',
    ])
  })

  it('maps granted categories to an update', () => {
    // The default map: every category offered, nothing rebased.
    const map = /** @type {any} */ (DEFAULT_GOOGLE.map)
    expect(consentModeState({ statistics: true }, map)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
    })
  })

  it('grants a type two categories share when either is granted', () => {
    const map = {
      statistics: ['analytics_storage'],
      marketing: ['analytics_storage', 'ad_storage'],
      preferences: [],
    }
    expect(consentModeState({ statistics: true }, map).analytics_storage).toBe(
      'granted',
    )
    expect(
      consentModeState({ marketing: false, statistics: false }, map)
        .analytics_storage,
    ).toBe('denied')
  })
})

describe('placeholders', () => {
  const service = resolved(minimal()).services.gtm

  it('fills from the hash first, then the service', () => {
    expect(
      serviceParams(service, { id: 'GTM-PAGE', data: { root: {} }, n: 2 }),
    ).toEqual({
      id: 'GTM-PAGE',
      n: '2',
    })
    expect(serviceParams(service)).toEqual({ id: 'GTM-X' })
  })

  it('URL-encodes each value', () => {
    expect(fill('https://x.example/?q={q}', { q: 'a b&c' }, 'w')).toBe(
      'https://x.example/?q=a%20b%26c',
    )
  })

  it('throws, naming the helper, on a missing value', () => {
    expect(() =>
      fill('https://x.example/{id}', {}, 'consentScript "gtm"'),
    ).toThrow('consentScript "gtm": no value for {id}')
  })
})

describe('the banner hash', () => {
  it('reads visible text only', () => {
    expect(
      textOf(
        '<p class="a">Cookies &amp; you</p>\n<button data-x>Accept</button>',
      ),
    ).toBe('Cookies & you Accept')
    expect(textOf('<style>.a{}</style><p>Hi</p><script>x()</script>')).toBe(
      'Hi',
    )
  })

  it('is unchanged by markup a visitor cannot read, changed by words they can', () => {
    const a = bannerHash(
      '<div><p>Cookies?</p><button>Accept all</button></div>',
    )
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(
      bannerHash(
        '<section class="x"><p>Cookies?</p>\n  <button type="button">Accept all</button></section>',
      ),
    ).toBe(a)
    expect(
      bannerHash('<div><p>Cookies?</p><button>Accept</button></div>'),
    ).not.toBe(a)
  })
})

describe('gatingOf', () => {
  it('gates scripts and embeds, and leaves necessary and advanced Google tags plain', () => {
    const r = resolved({
      services: {
        gtm: { id: 'G' },
        youtube: {},
        cdn: { category: 'necessary' },
      },
    })
    expect(gatingOf(r.services.gtm, r)).toBe('script')
    expect(gatingOf(r.services.youtube, r)).toBe('embed')
    expect(gatingOf(r.services.cdn, r)).toBe('none')
    const adv = resolved({
      services: { gtm: { id: 'G' } },
      google: { mode: 'advanced' },
    })
    expect(gatingOf(adv.services.gtm, adv)).toBe('none')
  })
})

describe('clientConfig', () => {
  it('hands the browser first-party names only, a necessary service’s included', () => {
    const r = resolved({
      services: {
        gtm: { id: 'G' },
        vimeo: {},
        cdn: {
          category: 'necessary',
          cookies: ['cdn_s'],
        },
      },
      endpoint: '/log',
    })
    const cfg = clientConfig(r, { bannerHash: 'abc' })
    expect(cfg.services.map((s) => s.name)).toEqual(['gtm', 'vimeo', 'cdn'])
    expect(cfg.services[0].cookies).toEqual(['_ga', '_ga_*', '_gcl_au'])
    expect(cfg.services[1].cookies).toEqual([])
    // named, so has('cdn') is true; never refused, so its cookies are never
    // deleted, and listed so a refused service sharing one keeps it too
    expect(cfg.services[2]).toEqual({
      name: 'cdn',
      category: 'necessary',
      cookies: ['cdn_s'],
      storage: [],
    })
    expect(cfg.categories).toEqual([{ name: 'marketing', mode: 'consent' }])
    expect(cfg.v).toBe(r.version)
    expect(cfg.endpoint).toBe('/log')
    // No URL rides in the client config: the links are in the markup.
    expect(cfg).not.toHaveProperty('policyUrl')
    expect(cfg).not.toHaveProperty('logoUrl')
    expect(cfg.bannerHash).toBe('abc')
    expect(cfg.google.defaults.security_storage).toBe('granted')
  })
})

// The file a kiss-consent server reads to turn a record's bannerHash into the
// wording the visitor saw (spec planning/specs/2026-11-03-kiss-consent.md,
// "The banner registry file").
describe('bannerRegistry', () => {
  const consent = resolveConsent({
    endpoint: '/api/consent',
    services: {
      stats: { category: 'statistics', label: 'Visit counter' },
      youtube: {},
    },
  })

  it('lists each banner the build wrote with the text its hash was taken from, and the categories as shown', () => {
    const html = '<h2>Cookies</h2><p>We use &amp; ask.</p>'
    const hash = bannerHash(html)
    const registry = bannerRegistry({
      consent,
      hashes: [hash],
      texts: new Map([[hash, textOf(html)]]),
    })
    expect(registry).toEqual({
      format: 1,
      version: consent?.version,
      banners: [
        {
          hash,
          text: 'Cookies We use & ask.',
          categories: [
            {
              key: 'statistics',
              label: 'Statistics',
              description: consent?.categories.statistics.description,
              mode: 'consent',
            },
            {
              key: 'marketing',
              label: 'Marketing',
              description: consent?.categories.marketing.description,
              mode: 'consent',
            },
          ],
          // `provider`: the ICO asks for the controller who relies on the
          // consent by name, and a label is not always one (2026-11-04).
          services: [
            {
              name: 'stats',
              label: 'Visit counter',
              provider: 'Visit counter',
              category: 'statistics',
            },
            {
              name: 'youtube',
              label: 'YouTube',
              provider: 'Google',
              category: 'marketing',
            },
          ],
        },
      ],
    })
    // The text is exactly what was hashed, so a server can check it.
    expect(bannerHash(registry?.banners[0].text ?? '')).toBe(hash)
  })

  it('sorts banners by hash, takes only the hashes the build wrote, and leaves an unknown text null', () => {
    const registry = bannerRegistry({
      consent,
      hashes: ['bbbbbbbbbbbb', 'aaaaaaaaaaaa'],
      texts: new Map([
        ['bbbbbbbbbbbb', 'b'],
        ['cccccccccccc', 'stale, from an earlier render'],
      ]),
    })
    expect(registry?.banners.map((b) => [b.hash, b.text])).toEqual([
      ['aaaaaaaaaaaa', null],
      ['bbbbbbbbbbbb', 'b'],
    ])
  })

  it('is null without a consent manager, and without an endpoint to read it', () => {
    expect(
      bannerRegistry({ consent: null, hashes: [], texts: new Map() }),
    ).toBeNull()
    expect(
      bannerRegistry({
        consent: resolveConsent({ services: { youtube: {} } }),
        hashes: ['aaaaaaaaaaaa'],
        texts: new Map(),
      }),
    ).toBeNull()
  })
})

describe('consentReport', () => {
  const r = resolved({
    services: { gtm: { id: 'G' }, youtube: {}, cdn: { category: 'necessary' } },
  })

  it('is null without a consent manager', () => {
    expect(consentReport({ consent: null, pages: [] })).toBeNull()
  })

  it('groups pages by banner hash, maps paths through real, and lists pages without a head', () => {
    const report = consentReport({
      consent: r,
      pages: [
        {
          page: 'stage/b.html',
          consent: { head: true, banner: 'aaaaaaaaaaaa' },
        },
        {
          page: 'stage/a.html',
          consent: { head: true, banner: 'aaaaaaaaaaaa' },
        },
        {
          page: 'stage/c.html',
          consent: { head: true, banner: 'bbbbbbbbbbbb' },
        },
        { page: 'stage/d.html', consent: null },
      ],
      real: (p) => p.replace('stage/', 'public/'),
      gatedPages: ['stage/d.html', 'stage/a.html'],
    })
    expect(report?.banners).toEqual([
      { hash: 'aaaaaaaaaaaa', pages: ['public/a.html', 'public/b.html'] },
      { hash: 'bbbbbbbbbbbb', pages: ['public/c.html'] },
    ])
    expect(report?.pagesWithoutHead).toEqual(['public/d.html'])
    expect(report?.version).toBe(r.version)
    expect(report?.purposes).toBe(r.version)
    expect(report?.mode).toBe('basic')
    expect(report?.categories).toEqual([{ name: 'marketing', mode: 'consent' }])
    expect(report?.services.map((s) => [s.name, s.gated])).toEqual([
      ['cdn', 'none'],
      ['gtm', 'script'],
      ['youtube', 'embed'],
    ])
  })

  it('holds no timestamp, so two reports of one build are equal', () => {
    const one = consentReport({ consent: r, pages: [] })
    const two = consentReport({
      consent: resolved({
        services: {
          gtm: { id: 'G' },
          youtube: {},
          cdn: { category: 'necessary' },
        },
      }),
      pages: [],
    })
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })
})

describe('origins and signatures', () => {
  it('reads an origin from an absolute URL with placeholders, and nothing else', () => {
    expect(originOf('https://www.googletagmanager.com/gtm.js?id={id}')).toBe(
      'https://www.googletagmanager.com',
    )
    expect(originOf('/js/site.js')).toBeNull()
    expect(originOf(null)).toBeNull()
  })

  it('matches tracker hosts, wildcard subdomains and a path prefix', () => {
    expect(
      matchesHost('https://www.googletagmanager.com', TRACKER_ORIGINS),
    ).toBe(true)
    expect(
      matchesHost('https://stats.g.doubleclick.net/g/collect', TRACKER_ORIGINS),
    ).toBe(true)
    expect(
      matchesHost('https://www.google.com/maps/embed?pb=1', TRACKER_ORIGINS),
    ).toBe(true)
    // The fleet audit's slowest page: a bare SoundCloud player (2026-11-04).
    expect(
      matchesHost(
        'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1',
        TRACKER_ORIGINS,
      ),
    ).toBe(true)
    expect(matchesHost('https://www.google.com/search', TRACKER_ORIGINS)).toBe(
      false,
    )
    expect(matchesHost('https://cdn.jsdelivr.net/npm/x', TRACKER_ORIGINS)).toBe(
      false,
    )
    expect(matchesHost('not a url', TRACKER_ORIGINS)).toBe(false)
  })

  it('recognises the AdSense and Ad Manager loaders', () => {
    expect(
      matchesHost(
        'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
        ADS_CMP_SIGNATURES.hosts,
      ),
    ).toBe(true)
    expect(
      matchesHost(
        'https://pagead2.googlesyndication.com/ccm/collect',
        ADS_CMP_SIGNATURES.hosts,
      ),
    ).toBe(false)
    expect(
      matchesHost(
        'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
        ADS_CMP_SIGNATURES.hosts,
      ),
    ).toBe(true)
  })

  it('freezes the presets', () => {
    expect(Object.isFrozen(PRESETS)).toBe(true)
    expect(Object.isFrozen(PRESETS.gtm)).toBe(true)
  })
})
