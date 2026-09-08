import { createHash } from 'node:crypto'
import { escape, globSync } from 'glob'

/**
 * @param {string} lines
 * @returns {string} every line trimmed, rejoined with `\n` and newline-terminated
 */
export function trimLines(lines) {
  let text = ''
  lines.split('\n').forEach((line) => {
    text = text + line.trim() + '\n'
  })
  return text
}

/**
 * The whole naming contract for a page's output path: stable, and collision-free
 * per distinct input.
 *
 * @param {unknown} slug
 * @returns {string} lowercase `a-z0-9` and `-`, accented Latin transliterated; a
 * short stable hash (`p-9736ca69`) when the input has no Latin decomposition at
 * all, and `''` for an empty or whitespace-only input
 */
export function toSlug(slug) {
  const text = String(slug)
  const normalised = text
    // NFKD splits an accented letter into its base letter plus a combining
    // mark, so stripping the marks transliterates it instead of dropping it.
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (normalised) return normalised
  // A script with no Latin decomposition (CJK, Hangul, Cyrillic) leaves
  // nothing behind: without a distinct fallback every such page slugs to the
  // same value and all but one are lost to the duplicate-buildTo check.
  if (!text.trim()) return ''
  return 'p-' + createHash('sha1').update(text).digest('hex').slice(0, 8)
}

/**
 * @param {string} str
 * @returns {string} each space-separated word capitalised
 */
export function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * @param {string} path
 * @returns {string} the path without a leading or trailing `/`
 */
export function trimPath(path) {
  if (path.startsWith('/')) path = path.substring(1)
  if (path.endsWith('/')) path = path.substring(0, path.length - 1)
  return path
}

/**
 * @param {string} path
 * @returns {string} each `/`-separated segment through `toSlug`; a falsy path is
 * returned as it came
 */
export function sanitizePath(path) {
  if (!path) return path
  return trimPath(path)
    .split('/')
    .map((segment) => toSlug(segment).trim())
    .join('/')
}

// glob v9+ strips a leading `./` from the paths it returns, while every
// `config.folders.*` default carries one — so a caller slicing the folder off a
// result would slice the wrong number of characters. Normalising both sides
// through this is what keeps that arithmetic honest.
/**
 * @param {string} path
 * @returns {string} the path with `\` as `/` and a leading `./` stripped
 */
export function posixPath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

// Takes the directory separately from the pattern so the directory can be
// escaped: a project path with a glob metacharacter in it (`site[old]`) is a
// literal folder name, not a pattern, and unescaped it matches nothing while
// the build still reports success.
// glob v7 returned results sorted; v9+ returns them in filesystem walk order,
// which would make page order, partial registration order and sitemap order
// depend on the machine. Sorting here keeps a build deterministic.
/**
 * @param {string} dir a literal directory, glob-escaped before matching
 * @param {string} pattern the glob to match under it
 * @returns {string[]} matching paths, posix-normalised and sorted
 */
export function globFiles(dir, pattern) {
  return globSync(`${escape(posixPath(dir))}/${pattern}`)
    .map(posixPath)
    .sort()
}

// Page identity, and only that: both sides of an `isActive` comparison reduce
// to the same key — no leading or trailing slash, no file extension, no
// trailing `index` segment — so `/about`, `/about/` and `about/index.html` are
// one page whether or not `extensionLess` is on, and the home page is the empty
// string. An emitted URL is *not* built from this — see `toCanonicalPath`.
/**
 * @param {unknown} value a URL or a build path
 * @returns {string} the page-identity key: no leading or trailing `/`, no file
 * extension, no trailing `index` segment; the home page is `''`
 */
export function toURLKey(value) {
  let key = String(value).replace(/^\/+/, '').replace(/\/+$/, '')
  const lastSegment = key.slice(key.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) key = key.slice(0, key.lastIndexOf('.'))
  return key.replace(/(^|\/)index$/, '')
}

// The one join behind every absolute URL kiss emits — sitemap.xml's `<loc>` and
// the `canonical`/`absUrl` helpers — so a page's canonical URL and its sitemap
// entry cannot disagree. Unlike `toURLKey` it keeps a file extension (an asset
// URL has to survive) and it keeps a trailing slash: a trailing `index` segment
// becomes one, because `courses/index.html` is served at `/courses/` and a host
// answers the bare `/courses` with a 301 — a canonical URL must be the URL that
// returns 200.
/**
 * @param {string} siteUrl
 * @param {string} [urlPath]
 * @returns {string} the two joined by exactly one `/`, repeated slashes
 * collapsed, a trailing `index` segment replaced by a trailing `/` and an
 * explicit trailing `/` preserved; an empty path gives `siteUrl` with one
 * trailing slash
 */
export function toAbsoluteUrl(siteUrl, urlPath) {
  const base = String(siteUrl).replace(/\/+$/, '')
  const relative = String(urlPath ?? '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/(^|\/)index(\.[^./]*)?$/, '$1')
  return relative ? `${base}/${relative}` : `${base}/`
}

// What `canonical` and the sitemap hand `toAbsoluteUrl`. It is deliberately not
// `toURLKey`: the key drops the trailing `index` segment outright, which is how
// a directory index used to canonicalise to the redirecting `/courses`. Dropping
// only the extension leaves the `index` in place for `toAbsoluteUrl` to turn
// into the trailing slash the host actually serves.
/**
 * @param {unknown} pageURL a page's build-relative URL, e.g. `courses/index.html`
 * @returns {string} the same path with the last segment's file extension
 * removed; every other character, `index` segment and slash left alone
 */
export function toCanonicalPath(pageURL) {
  const path = String(pageURL)
  const lastSlash = path.lastIndexOf('/')
  if (!path.slice(lastSlash + 1).includes('.')) return path
  return path.slice(0, path.lastIndexOf('.'))
}

/**
 * @param {unknown} input
 * @returns {string} MD5 hex digest of the string, or of its JSON if it is not one
 */
export function hashId(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return createHash('md5').update(text).digest('hex')
}

const utils = {
  trimLines,
  toSlug,
  toTitleCase,
  trimPath,
  sanitizePath,
  posixPath,
  globFiles,
  hashId,
  toURLKey,
  toAbsoluteUrl,
  toCanonicalPath,
}
export default utils
