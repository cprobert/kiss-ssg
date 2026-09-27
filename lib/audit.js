import fs from 'node:fs'
import { attribute, decodeEntities } from './links.js'

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
  }

  for (const [, attrs] of text.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = tokens(attrs, REL)
    if (facts.canonical === null && rel.includes('canonical'))
      facts.canonical = value(attrs, HREF) ?? ''
    // A token, not a substring: `apple-touch-icon` is not a favicon.
    if (rel.includes('icon')) facts.icon = true
  }

  for (const [, attrs] of text.matchAll(/<img\b([^>]*)>/gi))
    if (!ALT.test(attrs)) facts.imgMissingAlt.push(value(attrs, SRC) ?? '')

  // `\b` after the digit keeps `<header>` out: `h` is followed by `e`, not 1–6.
  for (const [, level] of text.matchAll(/<h([1-6])\b[^>]*>/gi))
    facts.headings.push(Number(level))

  return facts
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
function isOwnScript(rel) {
  if (!/\.js$/i.test(rel) || /\.min\.js$/i.test(rel)) return false
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
 * @returns {AuditResult}
 */
export function auditBuild({
  pages = [],
  buildDir,
  siteUrl = null,
  ignore = [],
  ownsFolder = true,
  debugWritten = false,
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
  }

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

// `null` first: the site-wide line reads before the per-page ones under it.
function compare(a, b) {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}
