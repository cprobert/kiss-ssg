import fs from 'node:fs'
import path from 'node:path'
import {
  attribute,
  browserReference,
  classifyReference,
  decodeEntities,
  resolveTarget,
  srcsetUrls,
} from './links.js'
import { posixPath } from './utils.js'

/**
 * Every check the audit can run, in the order findings are reported. These ids
 * are public vocabulary: `config.audit.ignore`, the report's `check` field and
 * the summary lines all use them, so renaming one is a breaking change.
 */
export const CHECKS = Object.freeze(
  /** @type {const} */ ([
    'title-missing',
    'title-duplicate',
    'description-missing',
    'description-duplicate',
    'og-image-missing',
    'og-image-relative',
    'canonical-missing',
    'img-alt-missing',
    'h1-count',
    'heading-skip',
    'viewport-zoom-lock',
    'href-hash',
    'fragment-missing',
    'favicon-missing',
    'not-found-missing',
    'site-url-local',
    'debug-dump',
    'stray-file',
    'console-log',
    // Appended, never slotted in: the order is public, and these three are
    // the privacy review's (`kiss-legal-and-privacy`).
    'privacy-link-missing',
    'placeholder-left',
    'checkbox-prechecked',
  ]),
)

/** @typedef {typeof CHECKS[number]} CheckId */

/**
 * The words that make a pre-ticked checkbox a consent to marketing:
 * `checkbox-prechecked` fires when a checked box's label contains one, matched
 * whole-word and case-insensitively, so "renews" never matches "news". A space
 * also matches a hyphen ("third-party"). "Updates" is deliberately absent: it
 * catches service updates, which are not marketing (2026-11-02 critique).
 */
export const MARKETING_WORDS = Object.freeze([
  'offer',
  'offers',
  'news',
  'newsletter',
  'newsletters',
  'marketing',
  'promotion',
  'promotions',
  'promotional',
  'partner',
  'partners',
  'third party',
  'third parties',
])

const MARKETING = new RegExp(
  `\\b(?:${MARKETING_WORDS.map((word) => word.replace(/ /g, '[\\s-]+')).join('|')})\\b`,
  'i',
)

/**
 * What a page fetches from an absolute origin, and as what.
 *
 * - `script`, `iframe`, `form-action`: the element's `src` or `action`
 * - `img`: an `<img>` `src`/`srcset`, a `<source srcset>`, a `<video poster>`
 * - `media`: a `<video>`/`<audio>` `src`, a `<source src>`
 * - `stylesheet`, `preconnect`, `dns-prefetch`: a `<link>` with that rel token
 * - `preload`, or `preload:<as>` when the link says what it preloads
 *   (`preload:font`)
 *
 * @typedef {Object} PageOrigin
 * @property {string} origin `https://fonts.gstatic.com` — scheme, host and any
 * port, as WHATWG `URL` gives it; a protocol-relative `//host` reads as https
 * @property {string} kind
 */

/**
 * One field of a form, as written.
 *
 * @typedef {Object} FormField
 * @property {string} type `input`'s `type` lowercased (`text` when absent),
 * or `select` / `textarea`
 * @property {string|null} name
 * @property {string|null} autocomplete
 */

/**
 * One `<form>` and the fields inside it.
 *
 * @typedef {Object} PageForm
 * @property {string|null} action
 * @property {string|null} honeypot the form's `netlify-honeypot` attribute:
 * the name of the field that is a trap for bots, not a question
 * @property {FormField[]} fields every `input`, `select` and `textarea`
 * between the form's tags, in document order
 */

/**
 * What one written page says about itself, extracted at write time from the
 * same minified bytes `KissPage.links` comes from.
 *
 * @typedef {Object} PageFacts
 * @property {boolean} html the output is an HTML document: an `.html`/`.htm`
 * path whose bytes carry `<html` or `<body`. Nothing else is audited as a page
 * @property {string|null} title the first `<title>`'s text, decoded and
 * whitespace-collapsed; `''` when present and empty
 * @property {string|null} description `<meta name="description">`'s content
 * @property {string|null} ogImage `og:image`'s content, via `property=` or `name=`
 * @property {string|null} canonical `<link rel="canonical">`'s href
 * @property {boolean} icon any `<link>` whose rel tokens include `icon`
 * @property {string[]} imgMissingAlt the src of each `<img>` with no `alt`
 * attribute at all (`alt=""` is present); `''` for an image with no src
 * @property {number[]} headings heading levels 1–6, in document order
 * @property {string[]} viewports the content of every `<meta name="viewport">`,
 * in document order
 * @property {boolean} base the page carries a `<base href>`, so a bare
 * `#fragment` on it resolves against that URL rather than the page
 * @property {string[]} ids every `id`, and every `<a name>`, a fragment could
 * land on — inline `<svg>` included, `<template>` content not — decoded,
 * sorted and deduplicated
 * @property {string[]} fragmentLinks every `<a>`/`<area>` `href` that carries a
 * `#`, decoded, sorted and deduplicated
 * @property {PageOrigin[]} origins every absolute `http(s)` or `//host`
 * origin a `script`, `iframe`, `img`, `source`, `video`, `audio`, `form` or
 * `<link rel=stylesheet|preload|preconnect|dns-prefetch>` names, sorted by
 * origin then kind. Never an `<a>`, and never `rel=canonical`/`alternate`:
 * a browser fetches nothing from those. Whether one is third-party depends
 * on `siteUrl`, so it is decided later (`thirdPartyOrigins`)
 * @property {PageForm[]} forms every `<form>`, in document order
 * @property {string[]} anchors every `<a>`/`<area>` `href` a reader can follow
 * (not a bare `#fragment`, not `mailto:`/`tel:`/`javascript:`/`data:`),
 * decoded, sorted and deduplicated
 * @property {string[]} placeholders the text of every `<mark>`, then every
 * `[to confirm…` outside one — unfinished copy a person has to replace
 * @property {string[]} prechecked the label text of every `<input
 * type="checkbox" checked>`, from `for`/`id`, a wrapping `<label>`,
 * `aria-label` and `aria-labelledby`, joined; `''` for an unlabelled one
 */

/**
 * @typedef {Object} AuditFinding
 * @property {CheckId} check
 * @property {string|null} page the page's `buildTo`, the walked file, or
 * `null` for a finding about the whole site
 * @property {string|null} detail the value that tripped the check, when one
 * helps find it in a template
 */

/**
 * @typedef {Object} AuditResult
 * @property {number} checked HTML pages audited
 * @property {CheckId[]} ignored the ignore list, deduplicated and sorted
 * @property {CheckId[]} skipped checks not run because the build does not own
 * its folder, in `CHECKS` order
 * @property {AuditFinding[]} findings sorted by check (in `CHECKS` order), then
 * page, then detail
 */

/**
 * One written page as the audit needs it.
 *
 * @typedef {Object} AuditPage
 * @property {string} buildTo where it was written
 * @property {PageFacts|null} facts `KissPage.audit`
 * @property {boolean} [canonicalElsewhere] the page names another URL as its
 * canonical, so it is a copy and a duplicate title there is expected
 * @property {string|null} [siteUrl] the page's own merged `siteUrl`
 * @property {string|null} [id] the page's identity, so the privacy page can be
 * found by its id
 */

// The three checks that read the whole build folder rather than this build's
// pages. Under `cleanBuild: false` that folder is shared with earlier builds
// and sibling instances, so what they find there is not this build's doing.
const WALK_CHECKS = Object.freeze(
  /** @type {CheckId[]} */ (['not-found-missing', 'stray-file', 'console-log']),
)

// The same compromise as `lib/links.js`: tolerant regexes over opening tags,
// with `[^>]*` ending a tag at the first `>`.
const REL = attribute('rel')
const HREF = attribute('href')
const SRC = attribute('src')
const NAME = attribute('name')
const PROPERTY = attribute('property')
const CONTENT = attribute('content')
const ID = attribute('id')
// `alt` is a presence test, not a value: `<img alt>` is a valid empty alt, so
// the attribute may stand alone, with no `=` after it.
const ALT = /(?:^|\s)alt(?:\s*=|\s|\/|$)/i

function value(attrs, pattern) {
  const match = attrs.match(pattern)
  if (!match) return null
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim()
}

function tokens(attrs, pattern) {
  return (value(attrs, pattern) ?? '').toLowerCase().split(/\s+/)
}

// Everything `extractReferences` strips, plus `<template>` and `<svg>` bodies.
// Links can afford a stray match (it adds one reference to resolve); a count
// check cannot, because an extra `<h1>` in a script string or an icon's
// `<title>` is a finding invented out of nothing. The whole element goes,
// opening tag included: nothing the audit reads lives on those tags.
function strip(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' ')
}

// The text of an opening tag's attributes, read quote-aware: a `>` inside a
// quoted value (`x-show="count > 0"`, `onclick="if(a>b)…"`) does not end the
// tag. `[^>]*`, the compromise `lib/links.js` makes, misses whatever follows
// such a value. There that is a reference missed, the safe direction; for the
// fragment checks it is the unsafe one, because a missed id is a link reported
// as broken and a misread link is a finding (2026-10-21 review).
const ATTRS = `((?:"[^"]*"|'[^']*'|[^>"'])*)`
// A tag name ends at whitespace, `/` or `>`: `\b` would also stop at the `-`
// of a custom element, reading `<a-entity>` as an `<a>`.
const TAG_END = '(?=[\\s/>])'

// The ids a fragment can land on: the same strip less `<svg>`, because an id
// inside inline SVG is in the document and a link may target it. A
// `<script>`, `<style>` or `<template>` keeps its opening tag, which is in the
// document and may carry an id; only what is inside it goes, since a script's
// strings and a template's content are not elements a link can land on.
function stripForIds(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      new RegExp(
        `(<(script|style|template)${TAG_END}${ATTRS}>)[\\s\\S]*?<\\/\\2\\s*>`,
        'gi',
      ),
      '$1',
    )
}

const ID_TAGS = new RegExp(`<([a-z][^\\s/>"']*)${ATTRS}>`, 'gi')
const LINK_TAGS = new RegExp(`<(?:a|area)${TAG_END}${ATTRS}>`, 'gi')

// The privacy facts, read quote-aware like the fragment checks: each one is a
// finding when misread, and a `>` inside an Alpine or onclick value is common
// in exactly the forms these read.
const SRCSET = attribute('srcset')
const ACTION = attribute('action')
const POSTER = attribute('poster')
const AS = attribute('as')
const TYPE = attribute('type')
const FOR = attribute('for')
const AUTOCOMPLETE = attribute('autocomplete')
const ARIA_LABEL = attribute('aria-label')
const ARIA_LABELLEDBY = attribute('aria-labelledby')
const HONEYPOT = attribute('netlify-honeypot')
// A presence test on quote-blanked attributes, as `ALT` is: `data-checked`
// and `aria-checked` start with something other than whitespace, and a
// `checked` inside another attribute's value has been blanked away.
const CHECKED = /(?:^|\s)checked(?:\s*=|\s|\/|$)/i
const FETCH_TAGS = new RegExp(
  `<(script|iframe|img|source|video|audio|form|link)${TAG_END}${ATTRS}>`,
  'gi',
)
const FORM_TAGS = new RegExp(
  `<(/?)(form|input|select|textarea)${TAG_END}${ATTRS}>`,
  'gi',
)
const INPUT_TAGS = new RegExp(`<input${TAG_END}${ATTRS}>`, 'gi')
const LABELS = new RegExp(
  `<label${TAG_END}${ATTRS}>([\\s\\S]*?)<\\/label\\s*>`,
  'gi',
)
// An unclosed `<mark>` still counts: its text runs to the end, and is capped.
const MARKS = new RegExp(
  `<mark${TAG_END}${ATTRS}>([\\s\\S]*?)(?:<\\/mark\\s*>|$)`,
  'gi',
)
// The bracketed form only. The bare phrase "to confirm" is ordinary prose
// ("we will email you to confirm your booking") and appeared twelve times in
// the fleet's sources (2026-11-02 critique); `[to confirm` is the placeholder
// shape `kiss-legal-and-privacy` tells authors to write.
const TO_CONFIRM = /\[\s*to confirm[^\]<]{0,80}\]?/gi
// A `<code>` or `<pre>` element whole: documentation quoting the marker.
const QUOTED_CODE = /<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const NOT_FOLLOWED = /^(?:data|javascript|mailto|tel):/i
const DETAIL_MAX = 80

const blankQuotes = (attrs) => attrs.replace(/"[^"]*"|'[^']*'/g, '""')

// An element's text: tags out, the entity subset decoded, whitespace
// collapsed.
const textOf = (html) =>
  decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

const capped = (text) =>
  text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text

// The origin an absolute `http(s)` or protocol-relative reference fetches
// from, as a browser on an https page reads it; `null` for a relative path,
// which can only be the site's own, and for every other scheme.
function originOf(raw) {
  if (!raw) return null
  const ref = browserReference(raw)
  const absolute = ref.startsWith('//')
    ? `https:${ref}`
    : /^https?:/i.test(ref)
      ? ref
      : null
  if (!absolute) return null
  try {
    const url = new URL(absolute)
    return url.hostname ? url.origin : null
  } catch {
    return null
  }
}

// The text of the first element carrying `id`, for `aria-labelledby`.
function textOfId(html, id) {
  for (const match of html.matchAll(ID_TAGS)) {
    if (value(match[2], ID) !== id) continue
    const rest = html.slice((match.index ?? 0) + match[0].length)
    const tag = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const close = rest.search(new RegExp(`<\\/${tag}\\s*>`, 'i'))
    return textOf(close === -1 ? rest.slice(0, 200) : rest.slice(0, close))
  }
  return ''
}

/** @param {string} raw @returns {PageOrigin[]} */
function extractOrigins(raw) {
  /** @type {Map<string, PageOrigin>} */
  const found = new Map()
  const add = (/** @type {string|null} */ ref, /** @type {string} */ kind) => {
    const origin = originOf(ref)
    if (origin) found.set(`${origin} ${kind}`, { origin, kind })
  }
  const srcset = (attrs, kind) => {
    for (const url of srcsetUrls(value(attrs, SRCSET) ?? '')) add(url, kind)
  }
  for (const [, tag, attrs] of raw.matchAll(FETCH_TAGS)) {
    const name = tag.toLowerCase()
    if (name === 'script' || name === 'iframe') add(value(attrs, SRC), name)
    else if (name === 'img') {
      add(value(attrs, SRC), 'img')
      srcset(attrs, 'img')
    } else if (name === 'source') {
      add(value(attrs, SRC), 'media')
      srcset(attrs, 'img')
    } else if (name === 'video' || name === 'audio') {
      add(value(attrs, SRC), 'media')
      add(value(attrs, POSTER), 'img')
    } else if (name === 'form') add(value(attrs, ACTION), 'form-action')
    else {
      // `<link>`: only the rels a browser fetches or connects for. Never
      // `canonical` or `alternate`, which are statements about a URL.
      const rel = tokens(attrs, REL)
      const href = value(attrs, HREF)
      for (const kind of ['stylesheet', 'preconnect', 'dns-prefetch'])
        if (rel.includes(kind)) add(href, kind)
      if (rel.includes('preload')) {
        const as = value(attrs, AS)?.toLowerCase()
        add(href, as ? `preload:${as}` : 'preload')
      }
    }
  }
  return [...found.values()].sort(
    (a, b) => a.origin.localeCompare(b.origin) || a.kind.localeCompare(b.kind),
  )
}

/** @param {string} text @returns {PageForm[]} */
function extractForms(text) {
  /** @type {PageForm[]} */
  const forms = []
  /** @type {PageForm|null} */
  let form = null
  for (const [, close, tag, attrs] of text.matchAll(FORM_TAGS)) {
    const name = tag.toLowerCase()
    if (name === 'form') {
      form = close
        ? null
        : {
            action: value(attrs, ACTION),
            honeypot: value(attrs, HONEYPOT) || null,
            fields: [],
          }
      if (form) forms.push(form)
      continue
    }
    // A field outside every form (or tied to one by `form=`) is not read:
    // the check is about what a form sends.
    if (close || !form) continue
    form.fields.push({
      type:
        name === 'input' ? (value(attrs, TYPE) || 'text').toLowerCase() : name,
      name: value(attrs, NAME) || null,
      autocomplete: value(attrs, AUTOCOMPLETE) || null,
    })
  }
  return forms
}

/** @param {string} text @returns {string[]} */
function extractPrechecked(text) {
  const labels = [...text.matchAll(LABELS)].map((match) => ({
    for: value(match[1], FOR),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    text: textOf(match[2]),
  }))
  /** @type {string[]} */
  const prechecked = []
  for (const match of text.matchAll(INPUT_TAGS)) {
    const attrs = match[1]
    if (value(attrs, TYPE)?.toLowerCase() !== 'checkbox') continue
    if (!CHECKED.test(blankQuotes(attrs))) continue
    const at = match.index ?? 0
    const id = value(attrs, ID)
    const parts = [
      value(attrs, ARIA_LABEL) ?? '',
      ...(value(attrs, ARIA_LABELLEDBY) ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((ref) => textOfId(text, ref)),
      ...labels
        .filter(
          (label) =>
            (id && label.for === id) || (label.start < at && at < label.end),
        )
        .map((label) => label.text),
    ].filter(Boolean)
    prechecked.push([...new Set(parts)].join(' '))
  }
  return prechecked
}

/** @param {string} text @returns {string[]} */
function extractPlaceholders(text) {
  /** @type {string[]} */
  const placeholders = []
  for (const match of text.matchAll(MARKS))
    placeholders.push(capped(textOf(match[2])))
  // Outside a `<mark>` only, so `<mark>[to confirm: x]</mark>` is one
  // placeholder rather than two; and outside `<code>` and `<pre>`, where the
  // marker is being quoted, not left blank (kiss's own guide page for this
  // check fired on itself, 2026-11-02).
  const prose = text.replace(MARKS, ' ').replace(QUOTED_CODE, ' ')
  for (const [found] of prose.matchAll(TO_CONFIRM))
    placeholders.push(capped(textOf(found)))
  return placeholders
}

/**
 * The launch-readiness facts one page's output carries.
 *
 * @param {string} html one page's output, exactly as it was written to disk
 * @param {string} outputPath where it was written; its extension decides first
 * whether this is a page at all — a file extension is a statement about
 * processing, so a `.json` that happens to hold markup is still data
 * @returns {PageFacts}
 */
export function extractPageFacts(html, outputPath) {
  /** @type {PageFacts} */
  const facts = {
    html: false,
    title: null,
    description: null,
    ogImage: null,
    canonical: null,
    icon: false,
    imgMissingAlt: [],
    headings: [],
    viewports: [],
    base: false,
    ids: [],
    fragmentLinks: [],
    origins: [],
    forms: [],
    anchors: [],
    placeholders: [],
    prechecked: [],
  }
  const raw = String(html ?? '')
  if (!/\.html?$/i.test(String(outputPath ?? ''))) return facts
  if (!/<(?:html|body)\b/i.test(raw)) return facts
  facts.html = true

  const text = strip(raw)
  const title = text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  if (title) facts.title = decodeEntities(title[1]).replace(/\s+/g, ' ').trim()

  for (const [, attrs] of text.matchAll(/<meta\b([^>]*)>/gi)) {
    const name = value(attrs, NAME)?.toLowerCase()
    const property = value(attrs, PROPERTY)?.toLowerCase()
    if (facts.description === null && name === 'description')
      facts.description = value(attrs, CONTENT) ?? ''
    // `name="og:image"` is not what the Open Graph protocol says, and every
    // scraper that matters reads it anyway: reporting it missing would send an
    // author to fix something that works.
    if (
      facts.ogImage === null &&
      (property === 'og:image' || name === 'og:image')
    )
      facts.ogImage = value(attrs, CONTENT) ?? ''
    // All of them, not the first: which one a browser applies is not
    // something this repo has measured, so the check reads every one.
    if (name === 'viewport') facts.viewports.push(value(attrs, CONTENT) ?? '')
  }

  for (const [, attrs] of text.matchAll(/<base\b([^>]*)>/gi))
    if (value(attrs, HREF) !== null) facts.base = true

  for (const [, attrs] of text.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = tokens(attrs, REL)
    if (facts.canonical === null && rel.includes('canonical'))
      facts.canonical = value(attrs, HREF) ?? ''
    // A token, not a substring: `apple-touch-icon` is not a favicon.
    if (rel.includes('icon')) facts.icon = true
  }

  // Quoted values are blanked before the presence test, so `alt` inside
  // another attribute's value (`title="An alt caption"`) is not read as the
  // attribute; `alt=""` keeps its `alt=` and still counts as present.
  for (const [, attrs] of text.matchAll(/<img\b([^>]*)>/gi))
    if (!ALT.test(attrs.replace(/"[^"]*"|'[^']*'/g, '""')))
      facts.imgMissingAlt.push(value(attrs, SRC) ?? '')

  // `\b` after the digit keeps `<header>` out: `h` is followed by `e`, not 1–6.
  for (const [, level] of text.matchAll(/<h([1-6])\b[^>]*>/gi))
    facts.headings.push(Number(level))

  // Opening tags kept, element contents of script/style/template gone: the
  // reading both the ids and the fetched origins need, since a `<script src>`
  // is on its opening tag and a template's content is not fetched.
  const tagsOnly = stripForIds(raw)
  /** @type {Set<string>} */
  const ids = new Set()
  for (const [, tag, attrs] of tagsOnly.matchAll(ID_TAGS)) {
    const id = value(attrs, ID)
    if (id) ids.add(id)
    // The older spelling of a fragment target, which the HTML spec still
    // honours for `<a>` — and which converted v1 sites still carry.
    if (tag.toLowerCase() === 'a') {
      const legacy = value(attrs, NAME)
      if (legacy) ids.add(legacy)
    }
  }
  facts.ids = [...ids].sort()

  /** @type {Set<string>} */
  const fragmentLinks = new Set()
  /** @type {Set<string>} */
  const anchors = new Set()
  for (const [, attrs] of text.matchAll(LINK_TAGS)) {
    const href = value(attrs, HREF)
    if (href?.includes('#')) fragmentLinks.add(href)
    if (href && !href.startsWith('#') && !NOT_FOLLOWED.test(href))
      anchors.add(href)
  }
  facts.fragmentLinks = [...fragmentLinks].sort()
  facts.anchors = [...anchors].sort()

  facts.origins = extractOrigins(tagsOnly)
  facts.forms = extractForms(text)
  facts.placeholders = extractPlaceholders(text)
  facts.prechecked = extractPrechecked(text)

  return facts
}

// `user-scalable=no`, or a `maximum-scale` that stops short of the 200% WCAG
// 1.4.4 asks a page to allow. The content is a list of `key=value` pairs that
// browsers accept separated by commas, semicolons or whitespace.
function locksZoom(content) {
  const pairs = String(content)
    .toLowerCase()
    .replace(/\s*=\s*/g, '=')
    .split(/[\s,;]+/)
    .map((pair) => pair.split('='))
  for (const [key, setting = ''] of pairs) {
    if (key === 'user-scalable' && (setting === 'no' || setting === '0'))
      return true
    if (key === 'maximum-scale') {
      const scale = Number(setting)
      if (setting !== '' && Number.isFinite(scale) && scale < 2) return true
    }
  }
  return false
}

function decodeFragment(fragment) {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

// The hostnames a site never publishes under: loopback, the reserved TLDs of
// RFC 2606 and 6761 that cannot resolve publicly, and the two preview-deploy
// shapes that do resolve but are not the site. `.example` is reserved too and
// deliberately absent — it is the documentation domain every shipped example
// uses, so flagging it would put a finding on every example build.
const LOCAL_SUFFIXES = ['.localhost', '.local', '.test', '.invalid']
const PREVIEW_HOSTS = [
  /^deploy-preview-\d+--.+\.netlify\.app$/,
  /^.+-git-.+\.vercel\.app$/,
]

function isLocalSiteUrl(siteUrl) {
  if (typeof siteUrl !== 'string' || !siteUrl) return false
  let hostname
  try {
    hostname = new URL(siteUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  if (['localhost', '0.0.0.0', '[::1]'].includes(hostname)) return true
  if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true
  if (LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true
  return PREVIEW_HOSTS.some((pattern) => pattern.test(hostname))
}

// Every file under `root`, as posix paths relative to it, in a stable order.
// Joined by hand with `/` rather than `path.join`: the report's staging-prefix
// strip only recognises `/`, and a Windows separator would leak the staging
// folder's name into the finding.
function walk(root) {
  /** @type {string[]} */
  const files = []
  const visit = (rel) => {
    let entries
    try {
      entries = fs.readdirSync(rel ? `${root}/${rel}` : root, {
        withFileTypes: true,
      })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) files.push(child)
    }
  }
  visit('')
  return files.sort()
}

// Dotfiles a host is meant to receive. `.well-known/` is exempt as a whole,
// because what lives there is named by other people's specifications.
const DOTFILES_WANTED = new Set(['.nojekyll', '.htaccess'])
const STRAY_SUFFIX = /(?:\.map|\.log|\.bak|\.swp|~)$/i

function isStray(rel) {
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  if (base === 'Thumbs.db') return true
  if (STRAY_SUFFIX.test(base)) return true
  if (!base.startsWith('.')) return false
  if (rel.startsWith('.well-known/') || rel.includes('/.well-known/'))
    return false
  return !DOTFILES_WANTED.has(base)
}

// A bundle's author chose to ship its own logging; a minified or vendored file
// is not one the site's author wrote, and flagging it sends them to edit a
// dependency.
// `assets.hash` puts the content hash before the extension, so a hashed
// `lib.min.js` is on disk as `lib.min.a1b2c3d4.js` by the time this runs.
const MINIFIED = /\.min(?:\.[0-9a-f]+)?\.js$/i

function isOwnScript(rel) {
  if (!/\.js$/i.test(rel) || MINIFIED.test(rel)) return false
  return !/(?:^|\/)(?:vendor|node_modules)\//.test(rel)
}

function countOf(text, needle) {
  let count = 0
  for (
    let at = text.indexOf(needle);
    at !== -1;
    at = text.indexOf(needle, at + 1)
  )
    count++
  return count
}

// A file the walk listed and cannot now read (removed mid-walk, locked on
// Windows) has nothing in it to report; the audit is advisory and never fails.
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

const blank = (value) => value === null || value === undefined || value === ''

/**
 * Decides every launch-readiness finding for one settled build.
 *
 * @param {Object} options
 * @param {AuditPage[]} options.pages the pages that wrote bytes
 * @param {string} options.buildDir the folder they were written into —
 * `_writeRoot`, which is the staging folder under `'atomic'` and under check
 * @param {string|null} [options.siteUrl] the instance's `config.siteUrl`
 * @param {readonly string[]} [options.ignore] checks not to run
 * @param {boolean} [options.ownsFolder] `config.cleanBuild !== false`; when
 * false the three folder-walk checks are skipped and listed in `skipped`
 * @param {boolean} [options.debugWritten] `viewStats()` wrote `debug.json`
 * @param {boolean} [options.extensionLess] `config.extensionLess`, for
 * resolving a cross-page fragment the way the link scan resolves its path
 * @param {string|null} [options.privacyPage] `config.audit.privacyPage`: the
 * id of the privacy page, when it is not the convention (id `privacy`, else
 * `privacy.html` or `privacy/index.html`)
 * @returns {AuditResult}
 */
export function auditBuild({
  pages = [],
  buildDir,
  siteUrl = null,
  ignore = [],
  ownsFolder = true,
  debugWritten = false,
  extensionLess = false,
  privacyPage = null,
}) {
  // As given, bar a trailing separator: `reportedPath` maps a finding out of
  // staging by matching this exact string plus `/`, so rewriting a Windows
  // root's `\` would leak the staging folder's name into the report. Only what
  // the walk appends is joined with `/`.
  const root = String(buildDir ?? '').replace(/[\\/]+$/, '')
  const ignored = /** @type {CheckId[]} */ ([...new Set(ignore)].sort())
  const skipped = ownsFolder
    ? []
    : WALK_CHECKS.filter((check) => !ignored.includes(check))
  const runs = (/** @type {CheckId} */ check) =>
    !ignored.includes(check) && !skipped.includes(check)

  /** @type {AuditFinding[]} */
  const findings = []
  const report = (
    /** @type {CheckId} */ check,
    /** @type {string|null} */ page = null,
    /** @type {string|null} */ detail = null,
  ) => {
    if (runs(check)) findings.push({ check, page, detail })
  }

  const audited = pages.filter((page) => page.facts?.html === true)
  for (const { buildTo, facts, siteUrl: pageSiteUrl } of audited) {
    if (blank(facts.title)) report('title-missing', buildTo)
    if (blank(facts.description)) report('description-missing', buildTo)
    if (blank(facts.ogImage)) report('og-image-missing', buildTo)
    // Scrapers fetch `og:image` as given and never resolve it against the page.
    else if (!/^https?:\/\/[^/]/i.test(facts.ogImage))
      report('og-image-relative', buildTo, facts.ogImage)
    if (pageSiteUrl && blank(facts.canonical))
      report('canonical-missing', buildTo)
    for (const src of facts.imgMissingAlt)
      report('img-alt-missing', buildTo, src)
    const h1 = facts.headings.filter((level) => level === 1).length
    if (h1 !== 1) report('h1-count', buildTo, String(h1))
    for (let i = 1; i < facts.headings.length; i++) {
      const [before, level] = [facts.headings[i - 1], facts.headings[i]]
      if (level > before + 1) {
        report('heading-skip', buildTo, `h${before} -> h${level}`)
        break
      }
    }
    // `?? []` throughout: facts parked by an engine from before these fields
    // existed have none, and none is the honest reading.
    for (const content of new Set(facts.viewports ?? []))
      if (locksZoom(content)) report('viewport-zoom-lock', buildTo, content)
    if ((facts.fragmentLinks ?? []).includes('#'))
      report('href-hash', buildTo, '#')
    for (const text of facts.placeholders ?? [])
      report('placeholder-left', buildTo, text)
    for (const label of facts.prechecked ?? [])
      if (MARKETING.test(label)) report('checkbox-prechecked', buildTo, label)
  }

  if (runs('fragment-missing'))
    checkFragments(audited, root, siteUrl, extensionLess, report)
  if (runs('privacy-link-missing'))
    checkPrivacyLinks(
      audited,
      root,
      siteUrl,
      extensionLess,
      privacyPage,
      report,
    )

  // A page that names another URL as its canonical is declaring itself a copy;
  // it is left out of the comparison and every other check still runs on it.
  const originals = audited.filter((page) => !page.canonicalElsewhere)
  for (const [check, field] of /** @type {const} */ ([
    ['title-duplicate', 'title'],
    ['description-duplicate', 'description'],
  ])) {
    /** @type {Map<string, string[]>} */
    const byValue = new Map()
    for (const { buildTo, facts } of originals) {
      const text = facts[field]
      if (blank(text)) continue
      byValue.set(text, [...(byValue.get(text) ?? []), buildTo])
    }
    for (const [text, where] of byValue)
      if (where.length > 1) for (const page of where) report(check, page, text)
  }

  // A build with no HTML in it (a feed-only or JSON-only instance) has nothing
  // to be missing a favicon or a 404 page from.
  if (audited.length > 0) {
    if (!audited.some((page) => page.facts.icon))
      if (!fs.existsSync(`${root}/favicon.ico`)) report('favicon-missing')
    if (runs('not-found-missing') && !fs.existsSync(`${root}/404.html`))
      report(
        'not-found-missing',
        null,
        // `extensionLess` writes a `404` view here, and no host serves it.
        fs.existsSync(`${root}/404/index.html`)
          ? '404/index.html exists — hosts serve /404.html'
          : null,
      )
  }

  if (isLocalSiteUrl(siteUrl)) report('site-url-local', null, siteUrl)
  // A page's own override is only its own finding when it differs from the
  // instance's; otherwise the site-wide line has already said it.
  for (const { buildTo, siteUrl: pageSiteUrl } of pages)
    if (pageSiteUrl !== siteUrl && isLocalSiteUrl(pageSiteUrl))
      report('site-url-local', buildTo, pageSiteUrl)

  // From state, not disk: `viewStats()` does not await its write, so a check
  // for the file here would race it.
  if (debugWritten) report('debug-dump', `${root}/debug.json`)

  if (runs('stray-file') || runs('console-log'))
    for (const rel of walk(root)) {
      const file = `${root}/${rel}`
      if (isStray(rel)) report('stray-file', file)
      if (runs('console-log') && isOwnScript(rel)) {
        const count = countOf(readText(file), 'console.log(')
        if (count > 0) report('console-log', file, String(count))
      }
    }

  const order = (/** @type {CheckId} */ check) => CHECKS.indexOf(check)
  findings.sort(
    (a, b) =>
      order(a.check) - order(b.check) ||
      compare(a.page, b.page) ||
      compare(a.detail, b.detail),
  )
  return { checked: audited.length, ignored, skipped, findings }
}

// Every `#fragment` a page links to, against the ids of the page it lands on.
// Only pages this build wrote have ids to compare with, so a fragment on
// anything else — an asset, a page another instance or an earlier build
// wrote, another origin — is not this check's to judge, and is skipped.
/**
 * @param {AuditPage[]} audited
 * @param {string} root
 * @param {string|null} siteUrl
 * @param {boolean} extensionLess
 * @param {(check: CheckId, page?: string|null, detail?: string|null) => void} report
 */
function checkFragments(audited, root, siteUrl, extensionLess, report) {
  const relative = relativeTo(root)
  /** @type {Map<string, Set<string>>} */
  const idsByPage = new Map()
  for (const { buildTo, facts } of audited) {
    const rel = relative(buildTo)
    if (rel) idsByPage.set(rel, new Set(facts.ids ?? []))
  }
  const known = new Set(idsByPage.keys())

  for (const { buildTo, facts } of audited) {
    // `<base href>` moves what `#x` resolves against, and that resolution is
    // the browser's, not something this check should guess at.
    if (facts.base) continue
    const self = relative(buildTo)
    for (const href of facts.fragmentLinks ?? []) {
      if (href === '#') continue
      const hash = href.indexOf('#')
      // A text directive (`:~:text=…`) is an instruction to the browser, not
      // part of the fragment it scrolls to.
      const fragment = href.slice(hash + 1).split(':~:')[0]
      if (fragment === '') continue
      // `#/settings` and `#!/inbox` are a client-side router's routes, and
      // `#!` a script hook: none of them is an element to scroll to.
      if (fragment.startsWith('/') || fragment.startsWith('!')) continue
      const before = href.slice(0, hash)
      /** @type {string|null} */
      let target = self
      if (before !== '' && !before.startsWith('?')) {
        const { kind, path: ref } = classifyReference(before, { siteUrl })
        if (kind !== 'internal' || ref === null) continue
        target = resolveTarget(ref, {
          pageBuildTo: buildTo,
          buildDir: root,
          extensionLess,
          known,
          // Only the pages it has ids for: a file on disk that is not one of
          // them has nothing to check the fragment against.
          exists: () => false,
        })
      }
      const ids = target === null ? undefined : idsByPage.get(target)
      if (!ids) continue
      if (ids.has(fragment) || ids.has(decodeFragment(fragment))) continue
      // The HTML spec scrolls to the top for `#top` when no element claims it.
      if (fragment.toLowerCase() === 'top') continue
      report('fragment-missing', buildTo, href)
    }
  }
}

// A page's path relative to the build folder, `null` for one outside it.
function relativeTo(root) {
  const base = posixPath(root)
  return (/** @type {string} */ buildTo) => {
    const rel = path.posix.relative(base || '.', posixPath(buildTo))
    return rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel)
      ? rel
      : null
  }
}

// The field names that ask for an email address or a phone number when the
// `type` does not say so (`<input type="text" name="email">`).
const CONTACT_NAMES = new Set(['email', 'e-mail', 'tel', 'phone', 'telephone'])
// Input types that never carry what a person typed.
const NOT_TYPED = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
])

/**
 * The field that makes a form collect personal contact details, or `null`.
 * A hidden field is the site's own value, and a honeypot (`bot-field`, or the
 * field the form's `netlify-honeypot` names) is a trap no person fills in.
 *
 * @param {PageForm} form
 * @returns {string|null} the field's name, or its type when it has none
 */
function contactField(form) {
  for (const field of form.fields ?? []) {
    if (NOT_TYPED.has(field.type)) continue
    const name = field.name?.toLowerCase() ?? null
    if (name === 'bot-field') continue
    if (form.honeypot && field.name === form.honeypot) continue
    const autocomplete = (field.autocomplete ?? '').toLowerCase().split(/\s+/)
    if (
      field.type === 'email' ||
      field.type === 'tel' ||
      (name !== null && CONTACT_NAMES.has(name)) ||
      autocomplete.includes('email') ||
      autocomplete.some((token) => token.startsWith('tel'))
    )
      return field.name ?? field.type
  }
  return null
}

const PRIVACY_PATHS = ['privacy.html', 'privacy/index.html']

// A page whose form asks for an email address or a phone number, and which
// links nowhere a reader can learn what happens to them. "The privacy page"
// is a page this build wrote, found by id, then by path; a link counts only
// when it resolves to that page the way the link scan resolves any link.
// Link text is never read, and an external href never counts: a privacy
// notice on another site is not this site's.
/**
 * @param {AuditPage[]} audited
 * @param {string} root
 * @param {string|null} siteUrl
 * @param {boolean} extensionLess
 * @param {string|null} privacyPage
 * @param {(check: CheckId, page?: string|null, detail?: string|null) => void} report
 */
function checkPrivacyLinks(
  audited,
  root,
  siteUrl,
  extensionLess,
  privacyPage,
  report,
) {
  const relative = relativeTo(root)
  const known = new Set(
    audited.map((page) => relative(page.buildTo)).filter((rel) => rel !== null),
  )
  const byId = audited.find((page) => page.id === (privacyPage ?? 'privacy'))
  /** @type {string|null} */
  let privacy = byId ? relative(byId.buildTo) : null
  if (privacyPage !== null && privacy === null)
    // Said once, about the whole site, and never thrown: the config is
    // valid, it names a page this build did not write (a typo, or a page
    // that failed or moved), and the audit is advisory.
    report(
      'privacy-link-missing',
      null,
      `audit.privacyPage "${privacyPage}" names no page this build wrote`,
    )
  if (privacyPage === null && privacy === null)
    privacy = PRIVACY_PATHS.find((rel) => known.has(rel)) ?? null

  let collecting = 0
  for (const { buildTo, facts, siteUrl: pageSiteUrl } of audited) {
    const field = (facts.forms ?? [])
      .map(contactField)
      .find((found) => found !== null)
    if (field === undefined) continue
    collecting++
    const self = relative(buildTo)
    if (privacy !== null && self === privacy) continue
    // A `<base href>` moves every relative link to somewhere the build cannot
    // see, so a link here could be reported missing when a browser follows it
    // to the privacy page, or pass when it leaves the site. Said nothing about,
    // as the fragment check does (a Codex review, 2026-11-02).
    if (facts.base) continue
    const linked =
      privacy !== null &&
      (facts.anchors ?? []).some((href) => {
        const { kind, path: ref } = classifyReference(href, {
          siteUrl: pageSiteUrl ?? siteUrl,
        })
        if (kind !== 'internal' || ref === null) return false
        const target = resolveTarget(ref, {
          pageBuildTo: buildTo,
          buildDir: root,
          extensionLess,
          known,
          exists: () => false,
        })
        return target === privacy
      })
    if (!linked) report('privacy-link-missing', buildTo, field)
  }
  if (collecting > 0 && privacy === null && privacyPage === null)
    report(
      'privacy-link-missing',
      null,
      'no privacy page: no page has the id "privacy" or is privacy.html or privacy/index.html',
    )
}

/**
 * What the build fetches from origins other than the site's own, per page.
 * A fact, not a finding: the privacy review's inventory starts here.
 *
 * @typedef {Object} ThirdPartyOrigins
 * @property {string|null} siteUrl the `siteUrl` first-party was decided
 * against; `null` when it is unset or local, and then every absolute origin
 * is listed, because which of them is the site's own cannot be told
 * @property {{ page: string, origins: { origin: string, kinds: string[] }[] }[]} pages
 * the pages that fetch from one, sorted by page; origins sorted, kinds sorted
 * @property {string[]} origins every third-party origin, distinct and sorted
 */

// The host a site is served under, `www.` and all, compared without it: an
// apex site linking its own `www.` subdomain is still linking itself.
const bareHost = (host) => host.toLowerCase().replace(/^www\./, '')

/**
 * The third-party origins the build's pages fetch from. First-party is a
 * relative URL (never recorded) or an absolute one whose host equals
 * `siteUrl`'s, with a leading `www.` dropped on both sides — the host, not
 * the origin, so `http:` and a port do not make the site's own assets
 * someone else's.
 *
 * @param {Object} options
 * @param {{ buildTo: string, facts: PageFacts|null }[]} options.pages
 * @param {string|null} [options.siteUrl] `config.siteUrl`
 * @returns {ThirdPartyOrigins|null} `null` when no page wrote HTML facts
 */
export function thirdPartyOrigins({ pages = [], siteUrl = null }) {
  const html = pages.filter((page) => page.facts?.html === true)
  if (html.length === 0) return null
  /** @type {string|null} */
  let own = null
  if (typeof siteUrl === 'string' && siteUrl && !isLocalSiteUrl(siteUrl))
    try {
      own = bareHost(new URL(siteUrl).hostname) || null
    } catch {
      own = null
    }
  const thirdParty = (/** @type {string} */ origin) =>
    own === null || bareHost(new URL(origin).hostname) !== own
  /** @type {Set<string>} */
  const all = new Set()
  const listed = []
  for (const { buildTo, facts } of html) {
    /** @type {Map<string, Set<string>>} */
    const kinds = new Map()
    for (const { origin, kind } of facts.origins ?? []) {
      if (!thirdParty(origin)) continue
      kinds.set(origin, (kinds.get(origin) ?? new Set()).add(kind))
      all.add(origin)
    }
    if (kinds.size === 0) continue
    listed.push({
      page: buildTo,
      origins: [...kinds.keys()].sort().map((origin) => ({
        origin,
        kinds: [...(kinds.get(origin) ?? [])].sort(),
      })),
    })
  }
  listed.sort((a, b) => a.page.localeCompare(b.page))
  return {
    siteUrl: own === null ? null : siteUrl,
    pages: listed,
    origins: [...all].sort(),
  }
}

// `null` first: the site-wide line reads before the per-page ones under it.
function compare(a, b) {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}
