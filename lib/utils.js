import { createHash } from 'node:crypto'
import { escape, globSync } from 'glob'

export function trimLines(lines) {
  let text = ''
  lines.split('\n').forEach((line) => {
    text = text + line.trim() + '\n'
  })
  return text
}

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

export function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function trimPath(path) {
  if (path.startsWith('/')) path = path.substring(1)
  if (path.endsWith('/')) path = path.substring(0, path.length - 1)
  return path
}

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
export function globFiles(dir, pattern) {
  return globSync(`${escape(posixPath(dir))}/${pattern}`)
    .map(posixPath)
    .sort()
}

// Both sides of an `isActive` comparison, a `{{canonical}}` URL and a sitemap
// `<loc>` reduce to the same key — no leading or trailing slash, no file
// extension, no trailing `index` segment — so `/about`, `/about/` and
// `about/index.html` are one page whether or not `extensionLess` is on, and the
// home page is the empty string.
export function toURLKey(value) {
  let key = String(value).replace(/^\/+/, '').replace(/\/+$/, '')
  const lastSegment = key.slice(key.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) key = key.slice(0, key.lastIndexOf('.'))
  return key.replace(/(^|\/)index$/, '')
}

// The one join behind every absolute URL kiss emits — sitemap.xml's `<loc>` and
// the `canonical`/`absUrl` helpers — so a page's canonical URL and its sitemap
// entry cannot disagree. Unlike `toURLKey` it keeps a file extension (an asset
// URL has to survive), collapsing only a trailing `index` segment.
export function toAbsoluteUrl(siteUrl, urlPath) {
  const base = String(siteUrl).replace(/\/+$/, '')
  const relative = String(urlPath ?? '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/(^|\/)index(\.[^./]*)?$/, '')
  return relative ? `${base}/${relative}` : `${base}/`
}

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
}
export default utils
