import { createHash } from 'node:crypto'
import path from 'node:path'
import { escape, globSync } from 'glob'

/** Whole-segment containment with the platform's path/case semantics.
 * @param {string} directory
 * @returns {(file: string) => boolean}
 */
export const isInside = (directory) => {
  const root = path.resolve(directory)
  return (file) => {
    const relative = path.relative(root, path.resolve(file))
    return (
      relative === '' ||
      (relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    )
  }
}

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
// URL has to survive) and it keeps a trailing slash by default: a trailing
// `index` segment becomes one, because `courses/index.html` is served at
// `/courses/` on Netlify and the bare `/courses` answers 301 — a canonical URL
// must be the URL that returns 200.
//
// **Which URL returns 200 is the host's policy, not a universal**, which is why
// the collapse is a parameter rather than a constant. Measured, 2026-09-16:
// Netlify (a1k9training.co.uk) serves `/courses/` and 301s `/courses`; Firebase
// Hosting with `cleanUrls` + `trailingSlash: false` (learna.ac.uk) does the
// exact reverse. They agree on file pages and contradict each other here, so
// the default stays Netlify's — every URL in a1k9training's live sitemap
// returns 200 under it — and `config.links.trailingSlash: false` says the
// other. Unverified for Cloudflare Pages, GitHub Pages and nginx: check before
// claiming either way.
/**
 * @param {string} siteUrl
 * @param {string} [urlPath]
 * @param {Object} [options]
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`: keep
 * the directory index's trailing `/` (the default, what Netlify serves), or
 * drop it (what Firebase with `trailingSlash: false` serves)
 * @returns {string} the two joined by exactly one `/`, repeated slashes
 * collapsed, a trailing `index` segment replaced by a trailing `/` (or by
 * nothing) and an explicit trailing `/` preserved; an empty path gives
 * `siteUrl` with one trailing slash whatever the policy
 */
export function toAbsoluteUrl(siteUrl, urlPath, { trailingSlash = true } = {}) {
  const base = String(siteUrl).replace(/\/+$/, '')
  const relative = String(urlPath ?? '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    // `$1` keeps the separator and so the trailing slash; `''` eats it. The
    // home page is the one URL both policies agree on: its whole path is the
    // `index` segment, so either replacement empties it and the join below
    // returns `${base}/` — a site root is never `https://site`.
    .replace(/(^|\/)index(\.[^./]*)?$/, trailingSlash ? '$1' : '')
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

// The path a static host actually serves a page at, and the only derivation of
// it: `/` + the page's build-relative URL, with a trailing `index.html`
// collapsed to a trailing `/` — or to nothing, under the same
// `config.links.trailingSlash` policy `toAbsoluteUrl` takes. **The two must be
// given the same policy.** This is what `{{link}}` renders as an href and that
// is what `{{canonical}}` advertises; split them and a page is linked at
// `/courses/` while claiming `/courses` as canonical, so every internal click
// takes the redirect the setting exists to avoid. Deliberately *not* `toCanonicalPath` —
// `about.html` is served at `/about.html`, not at the pretty `/about`, unless
// the site is extension-less, in which case the two coincide. And deliberately
// not `toAbsoluteUrl` over a page URL: that strips a trailing `index` segment
// with *any* extension, which would serve `data/index.json` at `/data/`, a
// directory that holds no `index.html`. Only `index.html` collapses here.
/**
 * @param {unknown} pageURL a page's build-relative URL, e.g. `courses/index.html`
 * @param {Object} [options]
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`, the
 * same policy `toAbsoluteUrl` takes — the two must agree or a page is linked
 * at one URL and canonicalised at another
 * @returns {string} the root-relative path the host serves it at: `/`,
 * `/about.html`, `/about/` (or `/about`), `/courses/` (or `/courses`),
 * `/data/index.json`
 */
export function servedPathFor(pageURL, { trailingSlash = true } = {}) {
  const relative = String(pageURL)
    .replace(/^\/+/, '')
    .replace(/(^|\/)index\.html$/, trailingSlash ? '$1' : '')
  return `/${relative}`
}

// The one page's file as a reference from the other's: no host in it at all,
// so nothing collapses (`index.html` stays) and no policy applies. It is what
// `{{link}}` renders on a page of a learning package, which an LMS serves from
// wherever it unpacks it, file by file. Not `servedPathFor` made relative: a
// folder link is the very thing an LMS does not resolve.
/**
 * @param {string} fromPageURL the linking page's build-relative URL
 * @param {string} toPageURL the linked page's build-relative URL
 * @returns {string} e.g. `tab-2.html`, `../l2/index.html`; a page linking
 * itself gets its own file name
 */
export function relativePathFor(fromPageURL, toPageURL) {
  const from = String(fromPageURL).replace(/^\/+/, '')
  const to = String(toPageURL).replace(/^\/+/, '')
  return path.posix.relative(path.posix.dirname(from), to)
}

/**
 * @param {unknown} input
 * @returns {string} MD5 hex digest of the string, or of its JSON if it is not one
 */
export function hashId(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return createHash('md5').update(text).digest('hex')
}

// Engine-internal: not on the default `utils` object.
/**
 * The word every redacted value is replaced with: a model URL's query values
 * (`redactUrl`) and `fetch.headers` values (`lib/config.js`,
 * `redactFetchHeaders`).
 */
export const REDACTED = '[redacted]'

// The one test of whether a page's `model` is fetched from a URL, made by
// `resolveModel` (which fetches it), `classifyModel` in `lib/aikb.js` (which
// records it) and `registerPage` (which logs it). Engine-internal: not on the
// default `utils` object.
/**
 * Whether a model is a URL kiss fetches.
 *
 * @param {unknown} model a page's `model`, as the author wrote it
 * @returns {boolean} true for a string that begins `http` (so `https://…`,
 * and also any other string with that prefix), false for anything else
 */
export function isUrlModel(model) {
  return typeof model === 'string' && model.startsWith('http')
}

// The one spelling of a model URL anywhere kiss records or prints it — the
// knowledge base, a log line, an error message — as distinct from fetching it,
// which always uses the URL as written. A token in a query string would
// otherwise land in a committed `AIKB/` folder and on stderr. Every value is
// redacted because kiss cannot know which one is the secret, and a rule that
// guesses is a deny-list. Engine-internal: not on the default `utils` object.
/**
 * A URL as kiss shows it, never as it fetches it.
 *
 * @param {unknown} url a model URL, as the author wrote it
 * @returns {string} the URL with no `user:pass@` and no fragment, and each
 * query parameter's name kept and its value replaced by `[redacted]`
 * (`?access_token=[redacted]&type=[redacted]`); a parameter with no `=` is
 * itself a value and becomes `[redacted]`, and an empty query is dropped.
 * Scheme, host, port and path are kept, in the form the WHATWG URL parser
 * gives them (host lowercased, a default port dropped, the path
 * percent-encoded). A string the parser rejects, or one whose scheme is not
 * `http:` or `https:`, goes by its last `@`: when
 * that `@` comes after the string's first `?` or `#`, only the scheme is
 * kept (`https://[redacted]`); otherwise everything between the scheme and
 * that `@` is dropped, the rest is cut at its first `?` or `#`, and given
 * `?[redacted]` when what was cut began with `?`. The scheme is kept with
 * the slashes or backslashes that follow it, as written.
 */
export function redactUrl(url) {
  const text = String(url)
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    parsed = null
  }
  // Only an http(s) URL is split the way its author meant. The parser reads
  // any other scheme without an authority, so `httpx:user:pass@host` parses
  // with the credentials as its path: it is treated as a string that does not
  // parse, and goes by its last `@`.
  if (parsed && parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    parsed = null
  if (parsed) {
    const query = parsed.search
      .slice(1)
      .split('&')
      .filter(Boolean)
      .map((part) =>
        part.includes('=')
          ? `${part.slice(0, part.indexOf('='))}=${REDACTED}`
          : REDACTED,
      )
    parsed.username = ''
    parsed.password = ''
    parsed.hash = ''
    parsed.search = ''
    const base = parsed.href.replace(/[?#]$/, '')
    return query.length ? `${base}?${query.join('&')}` : base
  }
  // A string the parser rejects cannot be split into credentials, path and
  // query: a password may hold a raw `/`, `?`, `#` or `@`. So the rule goes by
  // where its last `@` sits. The scheme is kept with whatever slashes follow
  // it, because the parser starts an authority after `http:`, `http:/` and
  // `http:\\` alike.
  const scheme = /^(?:[a-z][a-z0-9+.-]*:[/\\]*)?/i.exec(text)?.[0] ?? ''
  const cut = text.search(/[?#]/)
  const at = text.lastIndexOf('@')
  // An `@` past the first `?` or `#` may end a password that holds one, or
  // sit in a query value: nothing after the scheme can be shown as safe.
  if (at !== -1 && cut !== -1 && at > cut) return `${scheme}${REDACTED}`
  const head = cut === -1 ? text : text.slice(0, cut)
  // Otherwise everything from the scheme to the last `@` is the credentials.
  const bare = at === -1 ? head : `${scheme}${head.slice(at + 1)}`
  return cut !== -1 && text[cut] === '?' ? `${bare}?${REDACTED}` : bare
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
  servedPathFor,
  relativePathFor,
}
export default utils
