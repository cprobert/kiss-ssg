import { createHash } from 'node:crypto'

// The consent manager's config and every decision made from it: which
// services a site declares, what each one loads and stores, which categories
// the banner offers, the version that decides when a visitor is asked again,
// the Consent Mode state, what the browser is handed, and what the build
// report records. No markup and no browser here: `lib/consent-gate.js` writes
// the gated tags, `lib/consent-ui.js` the default banner, and
// `lib/consent-client.js` runs in the page. The contract is
// `planning/plans/2026-11-02-consent-manager.md`.

/**
 * A consent category a visitor can grant or refuse. `necessary` is not one of
 * these: it is always on, never offered and never stored.
 *
 * @typedef {'preferences'|'statistics'|'marketing'} ConsentCategoryName
 */

/**
 * How a category starts: `'consent'` is off until the visitor grants it;
 * `'objection'` is on until the visitor switches it off (UK PECR Schedule A1
 * para 5, the statistics exception), so only `statistics` may take it.
 *
 * @typedef {'consent'|'objection'} ConsentMode
 */

/**
 * @typedef {Object} ConsentCategory
 * @property {string} label
 * @property {string} description
 * @property {ConsentMode} mode
 */

/**
 * One thing a service stores: a cookie, or a `localStorage` key. Without a
 * `domain` it is the site's own (first-party): withdrawal deletes it. With one
 * it belongs to someone else's origin, which a page cannot clear, so it is
 * listed in `{{consentTable}}` and never deleted.
 *
 * @typedef {Object} ConsentStored
 * @property {string} name a trailing `*` matches any name with that prefix
 * @property {string} duration as the cookie table shows it, e.g. `'2 years'`
 * @property {string} description
 * @property {string|null} domain
 * @property {'first'|'third'} party
 */

/**
 * A declared service, resolved over its preset.
 *
 * @typedef {Object} ConsentService
 * @property {string} name
 * @property {string|null} preset the preset it was filled from
 * @property {'necessary'|ConsentCategoryName} category
 * @property {string} label
 * @property {string} provider
 * @property {string} description
 * @property {string|null} policy the provider's privacy policy URL
 * @property {string|null} src the script URL, `{param}` placeholders unfilled
 * @property {string|null} inline script run, gated, before `src`
 * @property {string|null} partial a site partial whose scripts are this service
 * @property {{ src: string|null, title: string|null, watch: string|null }|null} embed
 * @property {string[]} origins every third-party origin it loads, `src` and `embed.src` included
 * @property {ConsentStored[]} cookies
 * @property {ConsentStored[]} storage `localStorage` keys
 * @property {boolean} google a Google tag: Consent Mode governs it
 * @property {Record<string, string>} params placeholder values (`id`)
 */

/**
 * The Google Consent Mode block.
 *
 * @typedef {Object} ConsentGoogle
 * @property {'basic'|'advanced'} mode `'basic'` gates Google tags; `'advanced'` loads them ungated and lets Consent Mode alone govern them
 * @property {number} waitForUpdate milliseconds, emitted only under `'advanced'`
 * @property {boolean} adsDataRedaction
 * @property {boolean} urlPassthrough
 * @property {Record<ConsentCategoryName, string[]>} map the Consent Mode types each category grants
 */

/**
 * @typedef {Object} ConsentUi
 * @property {'bottom'|'top'} position
 * @property {string|null} logo an asset path
 * @property {string} partial the site partial that replaces the default banner, when it exists
 * @property {string|null} policy the page id the banner links for the cookie policy
 * @property {Record<string, string>} text
 * @property {Record<string, string>|false} theme
 */

/**
 * `config.consent`, resolved.
 *
 * @typedef {Object} KissConsent
 * @property {string} version decides when a visitor is asked again
 * @property {Record<ConsentCategoryName, ConsentCategory>} categories
 * @property {ConsentCategoryName[]} inUse the categories at least one service belongs to, site-wide
 * @property {Record<string, ConsentService>} services
 * @property {{ name: string, days: number, domain: string|null }} cookie
 * @property {ConsentGoogle} google
 * @property {string|null} endpoint where each choice is POSTed, or `null` for nowhere
 * @property {ConsentUi} ui
 */

/**
 * `config.consent` as a site writes it. Every key is optional but `services`;
 * the defaults are in this module. `false` (or leaving it out) means no
 * consent manager.
 *
 * @typedef {Object} KissConsentInput
 * @property {string} [version]
 * @property {Partial<Record<ConsentCategoryName, Partial<ConsentCategory>>>} [categories]
 * @property {Record<string, Record<string, any>>} [services]
 * @property {Partial<{ name: string, days: number, domain: string|null }>} [cookie]
 * @property {Partial<ConsentGoogle>} [google]
 * @property {string|null} [endpoint]
 * @property {Partial<Omit<ConsentUi, 'text'|'theme'>> & { text?: Record<string, string>, theme?: Record<string, string>|false }} [ui]
 */

/**
 * One page's consent facts, as the audit extracts them at write time.
 *
 * @typedef {Object} PageConsentFacts
 * @property {string} page the written path
 * @property {{ head: boolean, banner: string|null }|null} consent `banner` is the page's `data-kiss-consent-hash`
 */

/**
 * The report's `consent` key.
 *
 * @typedef {Object} BuildConsent
 * @property {string} version
 * @property {string} purposes `purposesVersion`, whether or not `version` was set by hand
 * @property {'basic'|'advanced'} mode
 * @property {{ hash: string, pages: string[] }[]} banners each banner text the build wrote, with its pages
 * @property {{ name: ConsentCategoryName, mode: ConsentMode }[]} categories
 * @property {{ name: string, category: string, gated: 'script'|'embed'|'none', origins: string[], cookies: string[] }[]} services
 * @property {string[]} pagesWithoutHead pages that gate a service with no `{{consentHead}}`
 */

/** @type {readonly ConsentCategoryName[]} */
export const CATEGORY_NAMES = Object.freeze([
  'preferences',
  'statistics',
  'marketing',
])

/** The Consent Mode v2 types a category may map to. */
export const CONSENT_TYPES = Object.freeze([
  'ad_storage',
  'analytics_storage',
  'ad_user_data',
  'ad_personalization',
  'functionality_storage',
  'personalization_storage',
])

export const DEFAULT_CATEGORIES = Object.freeze({
  preferences: Object.freeze({
    label: 'Preferences',
    description:
      'Remember choices you make on this site, such as your country, so you do not have to make them again.',
    mode: 'consent',
  }),
  statistics: Object.freeze({
    label: 'Statistics',
    description:
      'Count visits and see how the site is used, so we can improve it.',
    mode: 'consent',
  }),
  marketing: Object.freeze({
    label: 'Marketing',
    description:
      'Let other companies, such as advertising networks and video hosts, recognise your browser, to measure and personalise adverts and to show their content.',
    mode: 'consent',
  }),
})

export const DEFAULT_TEXT = Object.freeze({
  title: 'Cookies on this site',
  body: 'We use some cookies to make this site work. With your permission we would also like to set others: choose cookies to see what each one is for. You can change your mind at any time from the cookie settings link at the foot of every page.',
  accept: 'Accept all',
  reject: 'Reject all',
  choose: 'Choose cookies',
  save: 'Save choices',
  close: 'Close',
  settings: 'Cookie settings',
  policy: 'Cookie policy',
  confirmation: 'Your cookie choice is saved.',
  hide: 'Hide',
  necessaryLabel: 'Necessary',
  necessaryDescription:
    'Make the site work, and remember the choice you make here. They cannot be switched off.',
  embedNotice:
    'This content is hosted by {provider}, which may set cookies when it loads.',
  embedLoad: 'Load it',
  embedAllow: 'Always allow {provider}',
  embedWatch: 'Open it on {provider}',
})

export const DEFAULT_THEME = Object.freeze({
  background: '#ffffff',
  text: '#1a1a1a',
  accent: '#1d4ed8',
  accentText: '#ffffff',
  border: '#c8c8c8',
  radius: '6px',
  font: 'inherit',
})

export const DEFAULT_UI = Object.freeze({
  position: 'bottom',
  logo: null,
  partial: 'consent-banner',
  policy: 'cookies',
})

export const DEFAULT_COOKIE = Object.freeze({
  name: 'kiss_consent',
  days: 182,
  domain: null,
})

export const DEFAULT_GOOGLE = Object.freeze({
  mode: 'basic',
  waitForUpdate: 500,
  adsDataRedaction: true,
  urlPassthrough: false,
  map: Object.freeze({
    statistics: Object.freeze(['analytics_storage']),
    marketing: Object.freeze([
      'ad_storage',
      'ad_user_data',
      'ad_personalization',
    ]),
    preferences: Object.freeze([
      'functionality_storage',
      'personalization_storage',
    ]),
  }),
})

const GOOGLE_COOKIES = [
  {
    name: '_ga',
    duration: '2 years',
    description: 'Google Analytics: tells visits from one browser apart',
  },
  {
    name: '_ga_*',
    duration: '2 years',
    description: 'Google Analytics: keeps the state of a visit',
  },
  {
    name: '_gcl_au',
    duration: '3 months',
    description: 'Google Ads: links an ad click to what follows it',
  },
]

// Presets are picked by the service's name. A site's own keys win. The `gtm`
// default is `marketing`, not `statistics`: Consent Mode governs Google's own
// tags only, and in a real container a statistics-only grant loaded Bing,
// ActiveCampaign and OpenAI scripts (contract Appendix A, S1b, measured
// 2026-11-03). A site whose container gives every other tag a consent check
// may set `category: 'statistics'`.
export const PRESETS = Object.freeze({
  gtm: Object.freeze({
    category: 'marketing',
    label: 'Google Tag Manager',
    provider: 'Google',
    description:
      'Loads the analytics and advertising tags this site uses, as set up in Google Tag Manager.',
    policy: 'https://policies.google.com/privacy',
    src: 'https://www.googletagmanager.com/gtm.js?id={id}',
    inline:
      "window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
    origins: ['https://www.googletagmanager.com'],
    cookies: GOOGLE_COOKIES,
    google: true,
  }),
  gtag: Object.freeze({
    category: 'statistics',
    label: 'Google Analytics',
    provider: 'Google',
    description: 'Counts visits and how the site is used.',
    policy: 'https://policies.google.com/privacy',
    src: 'https://www.googletagmanager.com/gtag/js?id={id}',
    inline:
      "window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('js',new Date());window.gtag('config','{id}');",
    origins: ['https://www.googletagmanager.com'],
    cookies: GOOGLE_COOKIES,
    google: true,
  }),
  youtube: Object.freeze({
    category: 'marketing',
    label: 'YouTube',
    provider: 'YouTube',
    description: 'Plays videos hosted on YouTube.',
    policy: 'https://policies.google.com/privacy',
    embed: {
      src: 'https://www.youtube-nocookie.com/embed/{id}',
      title: null,
      watch: 'https://www.youtube.com/watch?v={id}',
    },
    origins: ['https://www.youtube-nocookie.com'],
    // Measured 2026-11-02 (kiss-legal-and-privacy): written as soon as the
    // privacy-enhanced player loads. In the player's own frame, so a page
    // cannot clear them.
    storage: [
      {
        name: 'yt-icons-last-purged',
        duration: 'persistent',
        description: 'YouTube player housekeeping',
        domain: 'www.youtube-nocookie.com',
      },
      {
        name: 'ytidb::LAST_RESULT_ENTRY_KEY',
        duration: 'persistent',
        description: 'YouTube player state',
        domain: 'www.youtube-nocookie.com',
      },
    ],
  }),
  vimeo: Object.freeze({
    category: 'marketing',
    label: 'Vimeo',
    provider: 'Vimeo',
    description: 'Plays videos hosted on Vimeo.',
    policy: 'https://vimeo.com/privacy',
    embed: {
      src: 'https://player.vimeo.com/video/{id}?dnt=1',
      title: null,
      watch: 'https://vimeo.com/{id}',
    },
    origins: ['https://player.vimeo.com'],
    // Measured 2026-11-02 on diploma-msc.com (planning/reviews/2026-11-02-cookiebot-baseline.md).
    cookies: [
      {
        name: 'vuid',
        duration: '13 months',
        description: 'Vimeo: tells viewers apart',
        domain: '.vimeo.com',
      },
      {
        name: 'player',
        duration: '1 year',
        description: 'Vimeo: player settings',
        domain: '.vimeo.com',
      },
    ],
  }),
  'google-maps': Object.freeze({
    category: 'marketing',
    label: 'Google Maps',
    provider: 'Google',
    description: 'Shows a map hosted by Google.',
    policy: 'https://policies.google.com/privacy',
    embed: { src: null, title: null, watch: null },
    origins: ['https://www.google.com'],
  }),
})

/**
 * Hosts whose scripts or frames store or track, for the `consent-missing`
 * finding on a site with no consent manager. A `*.` host matches any
 * subdomain; a `path` must prefix the URL's path.
 *
 * @type {readonly { host: string, path?: string }[]}
 */
export const TRACKER_ORIGINS = Object.freeze([
  { host: 'www.googletagmanager.com' },
  { host: 'www.google-analytics.com' },
  { host: 'region1.google-analytics.com' },
  { host: '*.doubleclick.net' },
  { host: 'connect.facebook.net' },
  { host: 'www.clarity.ms' },
  { host: 'bat.bing.com' },
  { host: 'static.hotjar.com' },
  { host: 'snap.licdn.com' },
  { host: 'www.redditstatic.com' },
  { host: 'www.youtube.com' },
  { host: 'www.youtube-nocookie.com' },
  { host: 'player.vimeo.com' },
  { host: 'www.google.com', path: '/maps' },
  { host: 'maps.google.com' },
  { host: 'widget.superchat.de' },
])

/**
 * What marks a page as serving Google's publisher ads, which need a
 * Google-certified CMP (research §3): a loader host, an inline call, or an
 * ad slot.
 */
export const ADS_CMP_SIGNATURES = Object.freeze({
  hosts: Object.freeze([
    { host: 'pagead2.googlesyndication.com', path: '/pagead/js' },
    { host: 'securepubads.g.doubleclick.net' },
  ]),
  inline: Object.freeze(['adsbygoogle', 'googletag.cmd']),
  attribute: 'data-ad-client',
})

const TOP_KEYS = [
  'version',
  'categories',
  'services',
  'cookie',
  'google',
  'endpoint',
  'ui',
]
const CATEGORY_KEYS = ['label', 'description', 'mode']
const SERVICE_KEYS = [
  'preset',
  'category',
  'label',
  'provider',
  'description',
  'policy',
  'src',
  'inline',
  'partial',
  'embed',
  'origins',
  'cookies',
  'storage',
  'google',
]
const EMBED_KEYS = ['src', 'title', 'watch']
const STORED_KEYS = ['name', 'duration', 'description', 'domain', 'party']
const COOKIE_KEYS = ['name', 'days', 'domain']
const GOOGLE_KEYS = [
  'mode',
  'waitForUpdate',
  'adsDataRedaction',
  'urlPassthrough',
  'map',
]
const UI_KEYS = ['position', 'logo', 'partial', 'policy', 'text', 'theme']
const SERVICE_NAME = /^[a-z][a-z0-9-]*$/
const PARAM_NAME = /^[a-zA-Z][\w-]*$/
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** @param {any} v */
const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Refuse any key outside `allowed`, naming the valid ones: inside
 * `config.consent` a typo (`endpont`) would silently mean no records.
 *
 * @param {Record<string, any>} obj
 * @param {readonly string[]} allowed
 * @param {string} where
 */
function onlyKeys(obj, allowed, where) {
  for (const key of Object.keys(obj))
    if (!allowed.includes(key))
      throw new Error(
        `${where}.${key} is not a setting — valid keys are ${allowed.join(', ')}`,
      )
}

/**
 * @param {any} v
 * @param {string} where
 * @returns {Record<string, any>}
 */
function plainObject(v, where) {
  if (!isPlainObject(v))
    throw new Error(
      `${where} must be an object (received ${JSON.stringify(v)})`,
    )
  return v
}

/**
 * @param {any} v
 * @param {string} where
 * @returns {string|null}
 */
function optionalString(v, where) {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string')
    throw new Error(`${where} must be a string (received ${JSON.stringify(v)})`)
  return v
}

/** The JavaScript MIME type essences a browser runs as a classic script. */
const JS_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
])

/**
 * How a browser runs a `<script>` with these `type` and `language` attribute
 * values (`undefined`/`null` for an absent one): as a classic script, as a
 * module, or not at all (a data block such as `application/ld+json`, a gated
 * `text/plain`). The one answer for the gate, the wiring check and the audit,
 * so none of them lets through a type the others would catch.
 *
 * The HTML spec's rule, as Chromium 156 applies it (measured 2026-11-03,
 * `AIKB/upstream.md`): an empty type, or no type and no or an empty
 * `language`, is classic; otherwise the type (or `text/` + the language) is
 * stripped of ASCII whitespace and matched without case against the
 * JavaScript MIME types. `module` is matched without case but not stripped.
 *
 * @param {string|null|undefined} type
 * @param {string|null|undefined} [language]
 * @returns {'classic'|'module'|null}
 */
export function scriptKind(type, language) {
  let string
  if (type === undefined || type === null) {
    if (language === undefined || language === null || language === '')
      return 'classic'
    string = `text/${language}`
  } else if (type === '') return 'classic'
  else string = type
  if (string.toLowerCase() === 'module') return 'module'
  const stripped = string.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
  return JS_TYPES.has(stripped.toLowerCase()) ? 'classic' : null
}

/**
 * The origin of an absolute http(s) URL, or `null` for anything else (a
 * site-relative path, a placeholder-only value). A `{param}` placeholder in
 * the query or path does not stop the origin being read.
 *
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function originOf(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Whether a URL is on one of `list`'s hosts (and under its path, when it has one).
 *
 * @param {string} url an absolute URL or a bare origin
 * @param {readonly { host: string, path?: string }[]} list
 * @returns {boolean}
 */
export function matchesHost(url, list) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  return list.some((entry) => {
    const hostOk = entry.host.startsWith('*.')
      ? host.endsWith(entry.host.slice(1))
      : host === entry.host
    return hostOk && (!entry.path || parsed.pathname.startsWith(entry.path))
  })
}

/**
 * @param {any} list
 * @param {string} where
 * @returns {ConsentStored[]}
 */
function resolveStored(list, where) {
  if (list === undefined) return []
  if (!Array.isArray(list))
    throw new Error(
      `${where} must be a list (received ${JSON.stringify(list)})`,
    )
  return list.map((entry, i) => {
    const at = `${where}[${i}]`
    const raw = typeof entry === 'string' ? { name: entry } : entry
    plainObject(raw, at)
    onlyKeys(raw, STORED_KEYS, at)
    if (typeof raw.name !== 'string' || raw.name === '')
      throw new Error(`${at}.name must be a non-empty string`)
    const domain = optionalString(raw.domain, `${at}.domain`)
    const party =
      raw.party === undefined ? (domain ? 'third' : 'first') : raw.party
    if (party !== 'first' && party !== 'third')
      throw new Error(
        `${at}.party must be 'first' or 'third' (received ${JSON.stringify(raw.party)})`,
      )
    return {
      name: raw.name,
      duration: optionalString(raw.duration, `${at}.duration`) ?? '',
      description: optionalString(raw.description, `${at}.description`) ?? '',
      domain,
      party,
    }
  })
}

/**
 * A preset's stored items, then the site's, one per name: the site's entry
 * replaces the preset's of the same name in place.
 *
 * @param {ConsentStored[]} preset
 * @param {ConsentStored[]} own
 * @returns {ConsentStored[]}
 */
function mergeStored(preset, own) {
  /** @type {Map<string, ConsentStored>} */
  const byName = new Map()
  for (const item of [...preset, ...own]) byName.set(item.name, item)
  return [...byName.values()]
}

/**
 * @param {string} name
 * @param {any} input
 * @param {readonly ConsentCategoryName[]} categoryNames
 * @returns {ConsentService}
 */
function resolveService(name, input, categoryNames) {
  const where = `config.consent.services.${name}`
  if (!SERVICE_NAME.test(name))
    throw new Error(
      `config.consent.services: ${JSON.stringify(name)} is not a service name (lowercase letters, digits and -, starting with a letter)`,
    )
  // kissConsent.has() and when() take a category or a service by one name,
  // so a service named for a category would be answered as that category: a
  // service called `necessary` would run before any choice.
  if (
    name === 'necessary' ||
    /** @type {readonly string[]} */ (categoryNames).includes(name)
  )
    throw new Error(
      `config.consent.services: ${JSON.stringify(name)} is a category's name, and kissConsent.has() would answer for the category; name the service for what it is`,
    )
  const own = plainObject(input, where)
  let presetName = null
  if (own.preset === undefined) {
    if (Object.hasOwn(PRESETS, name)) presetName = name
  } else if (own.preset !== false) {
    if (typeof own.preset !== 'string' || !Object.hasOwn(PRESETS, own.preset))
      throw new Error(
        `${where}.preset must be false or one of ${Object.keys(PRESETS).join(', ')} (received ${JSON.stringify(own.preset)})`,
      )
    presetName = own.preset
  }
  /** @type {Record<string, any>} */
  const preset = presetName
    ? /** @type {Record<string, any>} */ (PRESETS)[presetName]
    : {}

  /** @type {Record<string, string>} */
  const params = {}
  for (const [key, value] of Object.entries(own)) {
    if (SERVICE_KEYS.includes(key)) continue
    if (!PARAM_NAME.test(key))
      throw new Error(`${where}.${key} is not a setting or a parameter name`)
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new Error(
        `${where}.${key} is not a setting — valid keys are ${SERVICE_KEYS.join(', ')}; any other key is a {${key}} placeholder value and must be a string or a number (received ${JSON.stringify(value)})`,
      )
    params[key] = String(value)
  }

  const category = own.category ?? preset.category
  if (category === undefined)
    throw new Error(
      `${where}.category is required for a service with no preset — one of necessary, ${categoryNames.join(', ')}`,
    )
  if (category !== 'necessary' && !categoryNames.includes(category))
    throw new Error(
      `${where}.category must be one of necessary, ${categoryNames.join(', ')} (received ${JSON.stringify(category)})`,
    )

  let embed = null
  if (own.embed !== undefined || preset.embed) {
    const ownEmbed =
      own.embed === undefined ? {} : plainObject(own.embed, `${where}.embed`)
    onlyKeys(ownEmbed, EMBED_KEYS, `${where}.embed`)
    const merged = { ...(preset.embed || {}), ...ownEmbed }
    embed = {
      src: optionalString(merged.src, `${where}.embed.src`),
      title: optionalString(merged.title, `${where}.embed.title`),
      watch: optionalString(merged.watch, `${where}.embed.watch`),
    }
  }

  const src = optionalString(own.src ?? preset.src, `${where}.src`)
  const ownOrigins = own.origins ?? []
  if (
    !Array.isArray(ownOrigins) ||
    ownOrigins.some((o) => originOf(o) === null)
  )
    throw new Error(
      `${where}.origins must be a list of absolute http(s) URLs or origins (received ${JSON.stringify(own.origins)})`,
    )
  const origins = new Set(
    [...(preset.origins || []), ...ownOrigins].map(
      (o) => /** @type {string} */ (originOf(o)),
    ),
  )
  for (const url of [src, embed?.src]) {
    const origin = originOf(url)
    if (origin) origins.add(origin)
  }

  const google = own.google ?? preset.google ?? false
  if (typeof google !== 'boolean')
    throw new Error(
      `${where}.google must be true or false (received ${JSON.stringify(own.google)})`,
    )

  return {
    name,
    preset: presetName,
    category,
    label: optionalString(own.label ?? preset.label, `${where}.label`) ?? name,
    provider:
      optionalString(own.provider ?? preset.provider, `${where}.provider`) ??
      optionalString(own.label ?? preset.label, `${where}.label`) ??
      name,
    description:
      optionalString(
        own.description ?? preset.description,
        `${where}.description`,
      ) ?? '',
    policy: optionalString(own.policy ?? preset.policy, `${where}.policy`),
    src,
    inline: optionalString(own.inline ?? preset.inline, `${where}.inline`),
    partial: optionalString(own.partial, `${where}.partial`),
    embed,
    origins: [...origins].sort(),
    // Added to the preset's lists, as `origins` are, never replacing them: a
    // site declaring its container's `_fbp` must not silently lose the
    // preset's `_ga` (slice 6's documentation found the two disagreed). A
    // site's entry of the same name wins.
    cookies: mergeStored(
      resolveStored(preset.cookies, `${where}.cookies`),
      resolveStored(own.cookies, `${where}.cookies`),
    ),
    storage: mergeStored(
      resolveStored(preset.storage, `${where}.storage`),
      resolveStored(own.storage, `${where}.storage`),
    ),
    google,
    params,
  }
}

/**
 * @param {any} input
 * @returns {Record<ConsentCategoryName, ConsentCategory>}
 */
function resolveCategories(input) {
  const own =
    input === undefined ? {} : plainObject(input, 'config.consent.categories')
  onlyKeys(own, CATEGORY_NAMES, 'config.consent.categories')
  /** @type {Record<string, ConsentCategory>} */
  const out = {}
  for (const name of CATEGORY_NAMES) {
    const where = `config.consent.categories.${name}`
    const given = own[name] === undefined ? {} : plainObject(own[name], where)
    onlyKeys(given, CATEGORY_KEYS, where)
    /** @type {Record<string, any>} */
    const merged = { ...DEFAULT_CATEGORIES[name], ...given }
    if (merged.mode !== 'consent' && merged.mode !== 'objection')
      throw new Error(
        `${where}.mode must be 'consent' or 'objection' (received ${JSON.stringify(merged.mode)})`,
      )
    if (merged.mode === 'objection' && name !== 'statistics')
      throw new Error(
        `${where}.mode: only statistics may be 'objection' (UK PECR Schedule A1 para 5 covers statistics, not ${name})`,
      )
    out[name] = {
      label: optionalString(merged.label, `${where}.label`) ?? name,
      description:
        optionalString(merged.description, `${where}.description`) ?? '',
      mode: merged.mode,
    }
  }
  return /** @type {Record<ConsentCategoryName, ConsentCategory>} */ (out)
}

/**
 * @param {any} input
 * @returns {ConsentGoogle}
 */
function resolveGoogle(input) {
  const where = 'config.consent.google'
  const own = input === undefined ? {} : plainObject(input, where)
  onlyKeys(own, GOOGLE_KEYS, where)
  /** @type {Record<string, any>} */
  const merged = { ...DEFAULT_GOOGLE, ...own }
  if (merged.mode !== 'basic' && merged.mode !== 'advanced')
    throw new Error(
      `${where}.mode must be 'basic' or 'advanced' (received ${JSON.stringify(merged.mode)})`,
    )
  if (!Number.isInteger(merged.waitForUpdate) || merged.waitForUpdate < 0)
    throw new Error(
      `${where}.waitForUpdate must be a whole number of milliseconds (received ${JSON.stringify(merged.waitForUpdate)})`,
    )
  for (const key of /** @type {const} */ ([
    'adsDataRedaction',
    'urlPassthrough',
  ]))
    if (typeof merged[key] !== 'boolean')
      throw new Error(
        `${where}.${key} must be true or false (received ${JSON.stringify(merged[key])})`,
      )
  const mapIn =
    own.map === undefined ? {} : plainObject(own.map, `${where}.map`)
  onlyKeys(mapIn, CATEGORY_NAMES, `${where}.map`)
  /** @type {Record<string, string[]>} */
  const map = {}
  for (const name of CATEGORY_NAMES) {
    const types = mapIn[name] ?? DEFAULT_GOOGLE.map[name]
    if (!Array.isArray(types) || types.some((t) => !CONSENT_TYPES.includes(t)))
      throw new Error(
        `${where}.map.${name} must be a list of Consent Mode types — ${CONSENT_TYPES.join(', ')} (received ${JSON.stringify(types)})`,
      )
    map[name] = [...types]
  }
  return {
    mode: merged.mode,
    waitForUpdate: merged.waitForUpdate,
    adsDataRedaction: merged.adsDataRedaction,
    urlPassthrough: merged.urlPassthrough,
    map: /** @type {Record<ConsentCategoryName, string[]>} */ (map),
  }
}

/**
 * @param {any} input
 * @returns {ConsentUi}
 */
function resolveUi(input) {
  const where = 'config.consent.ui'
  const own = input === undefined ? {} : plainObject(input, where)
  onlyKeys(own, UI_KEYS, where)
  /** @type {Record<string, any>} */
  const merged = { ...DEFAULT_UI, ...own }
  if (merged.position !== 'bottom' && merged.position !== 'top')
    throw new Error(
      `${where}.position must be 'bottom' or 'top' (received ${JSON.stringify(merged.position)})`,
    )
  if (typeof merged.partial !== 'string' || merged.partial === '')
    throw new Error(
      `${where}.partial must be a partial name (received ${JSON.stringify(merged.partial)})`,
    )
  if (
    merged.policy !== null &&
    (typeof merged.policy !== 'string' || merged.policy === '')
  )
    throw new Error(
      `${where}.policy must be a page id or null (received ${JSON.stringify(merged.policy)})`,
    )
  const textIn =
    own.text === undefined ? {} : plainObject(own.text, `${where}.text`)
  onlyKeys(textIn, Object.keys(DEFAULT_TEXT), `${where}.text`)
  for (const [key, value] of Object.entries(textIn))
    if (typeof value !== 'string')
      throw new Error(
        `${where}.text.${key} must be a string (received ${JSON.stringify(value)})`,
      )
  /** @type {Record<string, string>|false} */
  let theme
  if (own.theme === false) theme = false
  else {
    const themeIn =
      own.theme === undefined ? {} : plainObject(own.theme, `${where}.theme`)
    onlyKeys(themeIn, Object.keys(DEFAULT_THEME), `${where}.theme`)
    for (const [key, value] of Object.entries(themeIn))
      if (typeof value !== 'string' || /[;{}<>]/.test(value))
        throw new Error(
          `${where}.theme.${key} must be a CSS value without ; { } < or > (received ${JSON.stringify(value)})`,
        )
    theme = { ...DEFAULT_THEME, ...themeIn }
  }
  return {
    position: merged.position,
    logo: optionalString(merged.logo, `${where}.logo`),
    partial: merged.partial,
    policy: merged.policy,
    text: { ...DEFAULT_TEXT, ...textIn },
    theme,
  }
}

/**
 * @param {any} input
 * @returns {{ name: string, days: number, domain: string|null }}
 */
function resolveCookie(input) {
  const where = 'config.consent.cookie'
  const own = input === undefined ? {} : plainObject(input, where)
  onlyKeys(own, COOKIE_KEYS, where)
  /** @type {Record<string, any>} */
  const merged = { ...DEFAULT_COOKIE, ...own }
  if (typeof merged.name !== 'string' || !COOKIE_NAME.test(merged.name))
    throw new Error(
      `${where}.name must be a cookie name (received ${JSON.stringify(merged.name)})`,
    )
  if (!Number.isInteger(merged.days) || merged.days < 1 || merged.days > 395)
    throw new Error(
      `${where}.days must be a whole number from 1 to 395 (received ${JSON.stringify(merged.days)})`,
    )
  return {
    name: merged.name,
    days: merged.days,
    domain: optionalString(merged.domain, `${where}.domain`),
  }
}

/**
 * The categories at least one declared service belongs to, `necessary`
 * aside, in `CATEGORY_NAMES` order. Decided once per site, so every page's
 * banner, dialog and cookie hold the same set.
 *
 * @param {{ services: Record<string, { category: string }> }} resolved
 * @returns {ConsentCategoryName[]}
 */
export function categoriesInUse(resolved) {
  const used = new Set(Object.values(resolved.services).map((s) => s.category))
  return CATEGORY_NAMES.filter((name) => used.has(name))
}

/**
 * The version that decides when a visitor is asked again: a hash of the
 * purposes and nothing else. It covers each category in use with its mode,
 * and each non-necessary service's name, category, provider and origins. It
 * excludes wording, theme, logo, position, cookie settings, the endpoint and
 * the cookie lists, so a colour change or a kiss upgrade that names one more
 * cookie asks nobody again (ICO: do not ask repeatedly), while a new service,
 * a new third party or a category changing mode asks everyone (ICO: ask again
 * when the purposes change). Service order in the config does not matter.
 *
 * @param {{ categories: Record<string, { mode: string }>, services: Record<string, ConsentService> }} resolved
 * @returns {string} 12 hex characters
 */
export function purposesVersion(resolved) {
  const inUse = categoriesInUse(resolved)
  const canonical = {
    categories: inUse.map((name) => [name, resolved.categories[name].mode]),
    services: Object.keys(resolved.services)
      .sort()
      .map((name) => resolved.services[name])
      .filter((s) => s.category !== 'necessary')
      .map((s) => [s.name, s.category, s.provider, [...s.origins].sort()]),
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 12)
}

/**
 * `config.consent`, resolved and checked. `undefined`, `null` and `false`
 * mean no consent manager. Every level refuses unknown keys, naming the valid
 * ones, except a service's own extra keys, which are placeholder values.
 *
 * @param {any} input
 * @returns {KissConsent|null}
 * @throws for any setting outside the contract (see the messages)
 */
export function resolveConsent(input) {
  if (input === undefined || input === null || input === false) return null
  const own = plainObject(input, 'config.consent')
  onlyKeys(own, TOP_KEYS, 'config.consent')
  const categories = resolveCategories(own.categories)
  const servicesIn =
    own.services === undefined
      ? {}
      : plainObject(own.services, 'config.consent.services')
  /** @type {Record<string, ConsentService>} */
  const services = {}
  for (const [name, service] of Object.entries(servicesIn))
    services[name] = resolveService(name, service, CATEGORY_NAMES)
  for (const service of Object.values(services))
    if (
      service.google &&
      service.category !== 'necessary' &&
      categories[service.category].mode === 'objection'
    )
      throw new Error(
        `config.consent.services.${service.name}: a Google tag cannot be in an 'objection' category — Google Analytics and Ads are not within the statistics exception, and an objection category grants analytics_storage to every Google tag on the page`,
      )
  const endpoint = optionalString(own.endpoint, 'config.consent.endpoint')
  if (
    endpoint !== null &&
    !/^https:\/\/[^/]/i.test(endpoint) &&
    !/^\/(?!\/)/.test(endpoint)
  )
    throw new Error(
      `config.consent.endpoint must be an https URL or a path starting with / (received ${JSON.stringify(endpoint)})`,
    )
  if (
    own.version !== undefined &&
    (typeof own.version !== 'string' || own.version === '')
  )
    throw new Error(
      `config.consent.version must be a non-empty string (received ${JSON.stringify(own.version)})`,
    )
  const partial = { categories, services }
  const inUse = categoriesInUse(partial)
  return {
    version: own.version ?? purposesVersion(partial),
    categories,
    inUse,
    services,
    cookie: resolveCookie(own.cookie),
    google: offeredMap(resolveGoogle(own.google), inUse, services),
    endpoint,
    ui: resolveUi(own.ui),
  }
}

/**
 * Hands the Consent Mode types of every category the site does not offer to
 * the category that holds its Google tags (the most restrictive one, when
 * they span several), so a choice the visitor can make decides every type.
 * Without it, a site whose only Google tag is `gtm` (marketing by default)
 * never granted `analytics_storage`, a statistics type: GA4 ran cookieless
 * for a visitor who accepted everything (diploma-msc trial, 2026-11-03,
 * `gcs=G110` after Accept all). A site with no Google tag keeps the map.
 *
 * @param {ConsentGoogle} google
 * @param {ConsentCategoryName[]} inUse
 * @param {Record<string, ConsentService>} services
 * @returns {ConsentGoogle}
 */
function offeredMap(google, inUse, services) {
  const holding = CATEGORY_NAMES.filter(
    (name) =>
      inUse.includes(name) &&
      Object.values(services).some((s) => s.google && s.category === name),
  )
  const target = holding[holding.length - 1]
  if (!target) return google
  /** @type {Record<string, string[]>} */
  const map = { ...google.map }
  for (const name of CATEGORY_NAMES)
    if (!inUse.includes(name)) {
      map[target] = [...new Set([...map[target], ...map[name]])]
      map[name] = []
    }
  return {
    ...google,
    map: /** @type {Record<ConsentCategoryName, string[]>} */ (map),
  }
}

/**
 * A service's placeholder values: the helper's hash over the service's own.
 * Only strings and numbers count; Handlebars' own hash entries are skipped.
 *
 * @param {ConsentService} service
 * @param {Record<string, any>} [hash]
 * @returns {Record<string, string>}
 */
export function serviceParams(service, hash = {}) {
  /** @type {Record<string, string>} */
  const out = { ...service.params }
  for (const [key, value] of Object.entries(hash))
    if (typeof value === 'string' || typeof value === 'number')
      out[key] = String(value)
  return out
}

/**
 * Fill `{param}` placeholders, URL-encoding each value.
 *
 * @param {string} template
 * @param {Record<string, string>} params
 * @param {string} where named in the error, e.g. `consentScript "gtm"`
 * @returns {string}
 * @throws if a placeholder has no value
 */
export function fill(template, params, where) {
  return template.replace(/\{([a-zA-Z][\w-]*)\}/g, (_, key) => {
    if (!Object.hasOwn(params, key))
      throw new Error(`${where}: no value for {${key}}`)
    return encodeURIComponent(params[key])
  })
}

/**
 * The Consent Mode `default` command's argument: every mapped type denied,
 * except the types of an `objection` category, which start granted;
 * `security_storage` granted; `wait_for_update` only under advanced mode
 * (in basic mode GTM loads after the choice, so nothing reads it — contract
 * Appendix A, S1).
 *
 * @param {KissConsent} resolved
 * @returns {Record<string, string|number>}
 */
export function consentModeDefault(resolved) {
  /** @type {Record<string, string|number>} */
  const out = {}
  for (const name of CATEGORY_NAMES)
    for (const type of resolved.google.map[name])
      if (out[type] !== 'granted')
        out[type] =
          resolved.inUse.includes(name) &&
          resolved.categories[name].mode === 'objection'
            ? 'granted'
            : 'denied'
  out.security_storage = 'granted'
  if (resolved.google.mode === 'advanced')
    out.wait_for_update = resolved.google.waitForUpdate
  return out
}

/**
 * The Consent Mode `update` command's argument for a set of granted
 * categories. A type two categories share is granted when either is.
 *
 * @param {Partial<Record<ConsentCategoryName, boolean>>} granted
 * @param {Record<ConsentCategoryName, string[]>} map
 * @returns {Record<string, 'granted'|'denied'>}
 */
export function consentModeState(granted, map) {
  /** @type {Record<string, 'granted'|'denied'>} */
  const out = {}
  for (const name of CATEGORY_NAMES)
    for (const type of map[name])
      if (out[type] !== 'granted')
        out[type] = granted[name] ? 'granted' : 'denied'
  return out
}

/**
 * The visible text of some HTML, normalised: tags removed, the common
 * entities decoded, whitespace collapsed. What the banner hash is taken over,
 * so markup and attribute changes that a visitor cannot read do not change it.
 *
 * @param {string} html
 * @returns {string}
 */
export function textOf(html) {
  return html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The banner hash: 12 hex characters of the sha256 of the banner's and
 * dialog's visible text. Recorded in the report and sent with each choice, so
 * a choice can be matched to the words the visitor saw.
 *
 * @param {string} html
 * @returns {string}
 */
export function bannerHash(html) {
  return createHash('sha256').update(textOf(html)).digest('hex').slice(0, 12)
}

/**
 * Whether a service is emitted gated, as a click-to-load embed, or plainly.
 *
 * @param {ConsentService} service
 * @param {KissConsent} resolved
 * @returns {'script'|'embed'|'none'}
 */
export function gatingOf(service, resolved) {
  if (service.category === 'necessary') return 'none'
  if (service.google && resolved.google.mode === 'advanced') return 'none'
  if (service.embed) return 'embed'
  return 'script'
}

/**
 * What the browser is handed, inlined into `{{consentHead}}`: only what the
 * client acts on. First-party cookie and storage names only, since nothing
 * else can be deleted.
 *
 * @param {KissConsent} resolved
 * @param {{ bannerHash?: string|null }} [extra] the banner and dialog's
 * links are in their markup, never here: the client reads no URL of its own
 * @returns {Record<string, any>}
 */
export function clientConfig(resolved, extra = {}) {
  return {
    v: resolved.version,
    cookie: resolved.cookie,
    categories: resolved.inUse.map((name) => ({
      name,
      mode: resolved.categories[name].mode,
    })),
    // Every service is named, so has('cdn') and when('cdn', …) answer for a
    // necessary one too. A necessary service is never refused, so its names
    // are never deleted; they are sent so that a refused service declaring
    // the same name does not delete it either.
    services: Object.values(resolved.services).map((s) => ({
      name: s.name,
      category: s.category,
      cookies: s.cookies.filter((c) => c.party === 'first').map((c) => c.name),
      storage: s.storage.filter((c) => c.party === 'first').map((c) => c.name),
    })),
    google: {
      mode: resolved.google.mode,
      map: resolved.google.map,
      defaults: consentModeDefault(resolved),
      adsDataRedaction: resolved.google.adsDataRedaction,
      urlPassthrough: resolved.google.urlPassthrough,
    },
    endpoint: resolved.endpoint,
    position: resolved.ui.position,
    text: {
      confirmation: resolved.ui.text.confirmation,
      hide: resolved.ui.text.hide,
    },
    bannerHash: extra.bannerHash ?? null,
  }
}

/**
 * The report's `consent` key, from the resolved config and each page's
 * write-time consent facts. `null` without a consent manager. Page paths go
 * through `real`, the staging-to-real mapping `thirdParty` uses, so a staged
 * check and a real build record the same paths.
 *
 * @param {{ consent: KissConsent|null, pages: PageConsentFacts[], real?: (p: string) => string, gatedPages?: string[] }} input
 * @returns {BuildConsent|null}
 */
export function consentReport({
  consent,
  pages,
  real = (p) => p,
  gatedPages = [],
}) {
  if (!consent) return null
  /** @type {Map<string, string[]>} */
  const banners = new Map()
  for (const { page, consent: facts } of pages) {
    if (!facts?.banner) continue
    const list = banners.get(facts.banner) ?? []
    list.push(real(page))
    banners.set(facts.banner, list)
  }
  const withHead = new Set(
    pages.filter((p) => p.consent?.head).map((p) => real(p.page)),
  )
  return {
    version: consent.version,
    purposes: purposesVersion(consent),
    mode: consent.google.mode,
    banners: [...banners]
      .map(([hash, list]) => ({ hash, pages: list.sort() }))
      .sort((a, b) => a.hash.localeCompare(b.hash)),
    categories: consent.inUse.map((name) => ({
      name,
      mode: consent.categories[name].mode,
    })),
    services: Object.keys(consent.services)
      .sort()
      .map((name) => {
        const s = consent.services[name]
        return {
          name,
          category: s.category,
          gated: gatingOf(s, consent),
          origins: s.origins,
          cookies: [...s.cookies, ...s.storage].map((c) => c.name),
        }
      }),
    pagesWithoutHead: [
      ...new Set(gatedPages.map(real).filter((p) => !withHead.has(p))),
    ].sort(),
  }
}
