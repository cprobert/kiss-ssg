import fs from 'node:fs'
import path from 'node:path'
import {
  attribute,
  classifyReference,
  decodeEntities,
  resolveTarget,
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
  ]),
)

/** @typedef {typeof CHECKS[number]} CheckId */

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
  return stripForIds(html).replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' ')
}

// The ids a fragment can land on: the same strip less `<svg>`, because an id
// inside inline SVG is in the document and a link may target it. A
// `<template>`'s content is not in the document until script puts it there.
function stripForIds(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ')
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

  /** @type {Set<string>} */
  const ids = new Set()
  for (const [, tag, attrs] of stripForIds(raw).matchAll(
    /<([a-z][^\s/>]*)([^>]*)>/gi,
  )) {
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
  for (const [, attrs] of text.matchAll(/<(?:a|area)\b([^>]*)>/gi)) {
    const href = value(attrs, HREF)
    if (href?.includes('#')) fragmentLinks.add(href)
  }
  facts.fragmentLinks = [...fragmentLinks].sort()

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
  }

  if (runs('fragment-missing'))
    checkFragments(audited, root, siteUrl, extensionLess, report)

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
  const base = posixPath(root)
  const relative = (/** @type {string} */ buildTo) => {
    const rel = path.posix.relative(base || '.', posixPath(buildTo))
    return rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel)
      ? rel
      : null
  }
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

// `null` first: the site-wide line reads before the per-page ones under it.
function compare(a, b) {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}
