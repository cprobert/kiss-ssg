import fs from 'node:fs'
import path from 'node:path'
import { posixPath } from './utils.js'

// The elements whose attributes name a file a browser will actually go and
// fetch. `form[action]` is in the list because a form posting at a path that
// does not exist is the same class of mistake as a dead `href`; `video`/`audio`
// carry `src` directly as well as through a nested `<source>`.
const ELEMENTS = [
  'a',
  'link',
  'script',
  'img',
  'source',
  'video',
  'audio',
  'iframe',
  'form',
]

// One tolerant pass over opening tags, not a parser: kiss has no HTML parser
// dependency and is not about to grow one for a build-time lint. `[^>]*` is the
// whole compromise — an attribute value containing a literal `>` ends the tag
// early and whatever follows it is not scanned. That is a false negative (a
// reference missed), never a false positive (a reference invented), which is
// the right way round for an advisory finding.
const TAG = new RegExp(`<(?:${ELEMENTS.join('|')})\\b([^>]*)>`, 'gi')

// Anchored on whitespace rather than `\b`, or `src` would also match the `src`
// inside `data-src` — `-` is a non-word character, so `\b` sits between them.
// `src` cannot match `srcset` because the character after it must be `=`.
const attribute = (name) =>
  new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'\`=<>]+))`,
    'i',
  )
const HREF = attribute('href')
const SRC = attribute('src')
const SRCSET = attribute('srcset')
const ACTION = attribute('action')
const PLAIN = [HREF, SRC, ACTION]

// Schemes that can never name a file in the build folder, dropped at extraction
// rather than at classification: they are not references to anything this
// engine wrote, so carrying them further only gives `classifyReference` more to
// say no to. Everything else with a scheme survives — `https:` may be this
// site's own origin, which is the whole point of finding 7.
const IGNORED_SCHEME = /^(?:data|javascript|mailto|tel):/i
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

// A deliberately small subset: `&amp;` is what Handlebars emits into a query
// string and the numeric forms are what it emits for `=` and `/` when a helper
// did not hand back a SafeString. Anything exotic is left as written — an
// undecoded entity resolves to nothing and is reported, which is a visible
// wrong answer rather than a silent one.
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex) =>
      codePoint(whole, parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (whole, dec) => codePoint(whole, Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/gi, (whole, name) =>
      name ? NAMED_ENTITIES[name.toLowerCase()] : whole,
    )
}

function codePoint(whole, value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return whole
  try {
    return String.fromCodePoint(value)
  } catch {
    return whole
  }
}

function attributeValue(match) {
  return match[1] ?? match[2] ?? match[3] ?? ''
}

// `img.jpg 640w, img@2x.jpg 2x` → `['img.jpg', 'img@2x.jpg']`. The descriptor
// is whitespace-separated from the candidate, so the first token is the URL; a
// naive split on `,` alone yields `img@2x.jpg 2x`, which resolves to nothing
// and would be reported as broken on every responsive image in the site.
function splitSrcset(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)
}

/**
 * Every reference the rendered HTML asks a browser to fetch, as written.
 *
 * @param {string} html one page's output, exactly as it was written to disk
 * @returns {string[]} sorted and deduplicated raw reference strings; empties,
 * bare `#fragment`s and the `data:`/`javascript:`/`mailto:`/`tel:` schemes are
 * dropped here, because none of them can name a file this build wrote
 */
export function extractReferences(html) {
  const text = String(html ?? '')
    // Comments first: a reference a comment carries is not one the browser
    // fetches. Production output has none (the minifier strips them), so this
    // only matters for HTML that reached here some other way.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // A script *body* is code, not markup: a string inside it that looks like
    // `src="/x"` is not a reference, and the dev livereload snippet builds its
    // own URL in JavaScript rather than carrying one in an attribute. The
    // opening tag is kept, so `<script src>` is still seen.
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
  /** @type {Set<string>} */
  const found = new Set()
  const keep = (raw) => {
    const value = decodeEntities(String(raw).trim())
    if (!value) return
    if (value.startsWith('#')) return
    if (IGNORED_SCHEME.test(value)) return
    found.add(value)
  }
  for (const tag of text.matchAll(TAG)) {
    const attrs = tag[1] ?? ''
    for (const pattern of PLAIN) {
      const match = attrs.match(pattern)
      if (match) keep(attributeValue(match))
    }
    const srcset = attrs.match(SRCSET)
    if (srcset)
      for (const candidate of splitSrcset(attributeValue(srcset)))
        keep(candidate)
  }
  // Sorted so the finding is byte-stable: two builds of the same site must
  // produce the same report, whatever order the attributes happened to be in.
  return [...found].sort()
}

function parseUrl(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function decodePath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// `path?query#fragment` → `path`. The fragment goes first: a fragment may
// itself contain a `?`, and cutting on the query first would leave half of it.
function stripQueryAndFragment(value) {
  const hash = value.indexOf('#')
  const withoutFragment = hash === -1 ? value : value.slice(0, hash)
  const query = withoutFragment.indexOf('?')
  return query === -1 ? withoutFragment : withoutFragment.slice(0, query)
}

/**
 * Whether a reference names something this build was supposed to write.
 *
 * An absolute URL on the site's own origin is **internal**: `{{canonical}}` and
 * `{{absUrl}}` emit one on every page, so treating every scheme as external
 * would miss exactly the slug rename this exists to catch.
 *
 * @param {string} ref a reference as `extractReferences` returned it
 * @param {{ siteUrl?: string|null }} [options] the site's `config.siteUrl`
 * @returns {{ kind: 'external'|'internal', path: string|null }} `path` is the
 * reference with its query and fragment removed — root-relative or relative,
 * kept as written — and `null` for anything external
 */
export function classifyReference(ref, { siteUrl } = {}) {
  const raw = String(ref ?? '').trim()
  /** @type {{ kind: 'external'|'internal', path: string|null }} */
  const external = { kind: 'external', path: null }
  // Nothing to resolve: an empty value, a bare fragment, or a query with no
  // path — all of them address the page that is already open.
  if (!raw || raw.startsWith('#') || raw.startsWith('?')) return external
  // Protocol-relative is somebody else's host by construction: it inherits the
  // scheme, never the origin.
  if (raw.startsWith('//')) return external
  if (ABSOLUTE.test(raw)) {
    const base = parseUrl(siteUrl ?? '')
    const url = parseUrl(raw)
    if (!base || !url || url.origin !== base.origin) return external
    // A `siteUrl` may carry a path prefix (`https://example.com/docs`) and may
    // or may not end in a slash; the build folder is that prefix's root.
    const prefix = base.pathname.replace(/\/+$/, '')
    let pathname = url.pathname
    if (prefix) {
      if (pathname === prefix) pathname = '/'
      else if (pathname.startsWith(`${prefix}/`))
        pathname = pathname.slice(prefix.length)
      // Same origin, outside the prefix: served by something that is not this
      // build, so this build cannot say whether it is broken.
      else return external
    }
    return { kind: 'internal', path: decodePath(pathname) }
  }
  const target = stripQueryAndFragment(raw)
  if (!target) return external
  return { kind: 'internal', path: target }
}

function buildRoot(buildDir) {
  return posixPath(String(buildDir ?? '')).replace(/\/+$/, '')
}

function buildRelative(root, target) {
  return path.posix.relative(root || '.', posixPath(String(target ?? '')))
}

/**
 * Whether an internal reference resolves to something under the build folder.
 *
 * @param {string} ref the `path` `classifyReference` returned
 * @param {Object} options
 * @param {string} options.pageBuildTo the page holding the reference, as it was
 * written — a staging path under `cleanBuild: 'atomic'` and under check mode
 * @param {string} options.buildDir the folder those pages were written into
 * @param {boolean} [options.extensionLess] `config.extensionLess`; it orders the
 * two extension-less fallbacks and nothing else — both are always tried
 * @param {(file: string) => boolean} [options.exists] injected for tests;
 * defaults to `fs.existsSync`
 * @param {Set<string>} [options.known] build-relative paths this build knows it
 * produced, whether or not they are on disk yet
 * @returns {boolean}
 */
export function resolveReference(
  ref,
  {
    pageBuildTo,
    buildDir,
    extensionLess = false,
    exists = fs.existsSync,
    known = new Set(),
  } = /** @type {any} */ ({}),
) {
  const raw = String(ref ?? '')
  if (!raw) return false
  const root = buildRoot(buildDir)
  const page = posixPath(String(pageBuildTo ?? ''))
  // Root-relative against the build folder, relative against the page's own
  // directory — exactly what a browser does with the same two shapes.
  const joined = raw.startsWith('/')
    ? `${root}/${raw.replace(/^\/+/, '')}`
    : `${path.posix.dirname(page)}/${raw}`
  const resolved = path.posix.normalize(joined)
  const rel = buildRelative(root, resolved)
  // `../../x` climbs out of the build folder. Nothing above it was published,
  // so the link is broken however real the file is on this machine.
  if (rel.startsWith('..') || path.posix.isAbsolute(rel)) return false

  /** @type {string[]} */
  const candidates = []
  const directory = rel === '' || raw.endsWith('/')
  if (directory) {
    candidates.push(rel ? `${rel}/index.html` : 'index.html')
  } else {
    candidates.push(rel)
    if (!path.posix.extname(rel))
      candidates.push(
        ...(extensionLess
          ? [`${rel}/index.html`, `${rel}.html`]
          : [`${rel}.html`, `${rel}/index.html`]),
      )
  }
  for (const candidate of candidates) {
    // `known` before the filesystem: it is the cheap half, and on a page-heavy
    // site most references are to other pages.
    if (known.has(candidate)) return true
    if (exists(root ? `${root}/${candidate}` : candidate)) return true
  }
  return false
}

/**
 * One page's output as the scan needs it: where it was written, and what it
 * referenced. `links` is `KissPage.links`, extracted at write time.
 *
 * @typedef {Object} LinkPage
 * @property {string} buildTo
 * @property {string[]} links
 */

/**
 * Resolves every internal reference in a build's own output.
 *
 * @param {Object} options
 * @param {LinkPage[]} options.pages only pages that actually wrote bytes
 * @param {string} options.buildDir the folder they were written into
 * @param {string|null} [options.siteUrl] `config.siteUrl`, for the origin test
 * @param {boolean} [options.extensionLess] `config.extensionLess`
 * @param {string[]} [options.manifestTargets] the asset manifest's **values** —
 * the names actually emitted, which under `assets.hash` are the only strings a
 * template may legitimately have written
 * @param {(file: string) => boolean} [options.exists] injected for tests
 * @returns {{ checked: number, broken: { page: string, href: string }[] }}
 * `checked` counts every reference classified internal; `broken` is sorted by
 * page, then href
 */
export function checkLinks({
  pages = [],
  buildDir,
  siteUrl = null,
  extensionLess = false,
  manifestTargets = [],
  exists = fs.existsSync,
}) {
  const root = buildRoot(buildDir)
  /** @type {Set<string>} */
  const known = new Set()
  for (const target of manifestTargets) {
    if (!target) continue
    known.add(posixPath(String(target)).replace(/^\/+/, ''))
  }
  for (const page of pages) {
    const rel = buildRelative(root, page.buildTo)
    if (rel && !rel.startsWith('..')) known.add(rel)
  }
  let checked = 0
  /** @type {{ page: string, href: string }[]} */
  const broken = []
  for (const page of pages) {
    for (const ref of page.links ?? []) {
      const { kind, path: target } = classifyReference(ref, { siteUrl })
      if (kind !== 'internal' || target === null) continue
      checked++
      const ok = resolveReference(target, {
        pageBuildTo: page.buildTo,
        buildDir,
        extensionLess,
        exists,
        known,
      })
      // The href is recorded exactly as the page wrote it, not as it resolved:
      // the whole value of the finding is being able to grep the template for
      // the string that is wrong.
      if (!ok) broken.push({ page: page.buildTo, href: ref })
    }
  }
  broken.sort(
    (a, b) => a.page.localeCompare(b.page) || a.href.localeCompare(b.href),
  )
  return { checked, broken }
}
