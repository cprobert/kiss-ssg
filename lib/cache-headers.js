import fs from 'fs-extra'
import path from 'node:path'
import { HASH_LENGTH, isHashable } from './asset-manifest.js'
import { posixPath } from './utils.js'

// Cache headers for the files kiss content-hashed: their bytes are their name,
// so a host can keep them for a year and never be wrong. Everything else is
// left to the host's default, because the right lifetime of an unhashed file
// is the owner's call, and HTML is left alone on every host: a page answers at
// several URLs (`/about`, `/about.html`, `/courses/index.html`), so a rule
// written for one of them misses the others.
//
// Pure functions plus one writer, like `lib/redirects.js`, whose shape this
// follows on purpose: a host-neutral list (`cache-headers.json`), then one
// encoding per format.

/** The value every hashed file is served with. */
export const IMMUTABLE = 'public, max-age=31536000, immutable'

/** How many hex characters the consent client's name carries. */
export const CONSENT_HASH_LENGTH = 10

/**
 * The block kiss appends to a `_headers` the site keeps in its assets. Between
 * these two lines is kiss's; everything else is the site's, kept byte for
 * byte.
 */
export const BLOCK_START =
  '# kiss-ssg: cache headers for hashed files (generated, do not edit)'
export const BLOCK_END = '# kiss-ssg: end of cache headers'

/**
 * One cache-header rule: an exact path (Netlify, Cloudflare Pages) or a
 * pattern (Firebase), and the headers it sets.
 *
 * @typedef {Object} CacheHeaderRule
 * @property {string} [path] a build-relative URL path, `/`-rooted
 * @property {string} [regex] an RE2 pattern over the request path (Firebase)
 * @property {Record<string, string>} headers
 */

/**
 * @typedef {Object} CacheHeadersWriteResult
 * @property {'none'|'written'} status `none` when there is no hashed file:
 * nothing is written, not even the list
 * @property {CacheHeaderRule[]} rules the exact-path rules, the list
 * `cache-headers.json` carries
 * @property {string[]} files every path written, `cache-headers.json` first
 * @property {string[]} formats the formats that ran, `'custom'` for a function
 * @property {boolean} unset hashed files exist and no format was chosen, by
 * `host` or by `cacheHeaders.format`
 * @property {boolean} merged a `_headers` the site keeps was appended to
 * @property {string[]} lookalikes unhashed files the Firebase pattern also
 * matches, which a host would cache for a year
 * @property {string[]} uncovered the hosts that have no cache-header
 * encoding yet (`vercel`)
 */

// The image extensions are `{{image}}`'s variants (`img/hero-960.<hash>.avif`).
const FIREBASE_HASHED = `^/(?:.*/)?[^/]+\\.[0-9a-f]{${HASH_LENGTH}}\\.(?:css|js|avif|webp|jpg|png)$`
const FIREBASE_CONSENT = `^/(?:.*/)?kiss-consent\\.[0-9a-f]{${CONSENT_HASH_LENGTH}}\\.js$`

/**
 * The build-relative paths of every file kiss content-hashed that is in the
 * build folder: the asset manifest's renamed `.css`/`.js` entries, and the
 * consent client when there is one, and `{{image}}`'s variants. A file that is
 * not on disk under the build folder (a copy into a folder outside it, a
 * variant whose encode failed) is left out, because no host serves it from
 * here.
 *
 * @param {{ manifest: Record<string, string>, consentClient?: string|null, images?: string[], root: string }} input
 * `manifest` is `assetManifest.toObject()`; `images` the variants' build-relative
 * paths; `root` is where the build is being written (the staging folder under
 * `'atomic'`)
 * @returns {string[]} `/`-rooted, sorted, without duplicates
 */
export function hashedFiles({
  manifest,
  consentClient = null,
  images = [],
  root,
}) {
  const names = Object.entries(manifest)
    .filter(([name, output]) => isHashable(name) && name !== output)
    .map(([, output]) => output)
  if (consentClient) names.push(consentClient)
  names.push(...images)
  const found = new Set()
  for (const name of names) {
    const rel = posixPath(name).replace(/^\/+/, '')
    // A path with whitespace would write more than one line of `_headers`.
    if (/\s/.test(rel) || rel.startsWith('..')) continue
    if (!fs.existsSync(path.join(root, rel))) continue
    found.add(`/${rel}`)
  }
  return [...found].sort()
}

/**
 * @param {string[]} files from `hashedFiles`
 * @returns {CacheHeaderRule[]}
 */
export function cacheHeaderRules(files) {
  return files.map((file) => ({
    path: file,
    headers: { 'Cache-Control': IMMUTABLE },
  }))
}

/**
 * The host-neutral list: `{ version, rules }`, sorted and newline-terminated,
 * so two identical builds write identical bytes.
 *
 * @param {CacheHeaderRule[]} rules
 * @returns {string}
 */
export function renderCacheHeadersJson(rules) {
  return `${JSON.stringify({ version: 1, rules }, null, 2)}\n`
}

/**
 * kiss's block for a `_headers` file (Netlify and Cloudflare Pages): one path
 * per hashed file, its header indented below it, between the two marker lines.
 *
 * @param {CacheHeaderRule[]} rules
 * @returns {string}
 */
export function renderHeadersBlock(rules) {
  const lines = [BLOCK_START]
  for (const rule of rules) {
    lines.push(rule.path)
    for (const [key, value] of Object.entries(rule.headers))
      lines.push(`  ${key}: ${value}`)
  }
  lines.push(BLOCK_END)
  return `${lines.join('\n')}\n`
}

/**
 * The site's own `_headers` with kiss's block appended. A block an earlier
 * build left (under `cleanBuild: false`) is replaced, never repeated. With no
 * site file, kiss's block is the whole file. `markers` names the block's two
 * lines, so the security headers (`lib/security-headers.js`) keep a block of
 * their own beside this one.
 *
 * @param {string|null} existing the site's file, or `null` when it has none
 * @param {string} block from `renderHeadersBlock`
 * @param {{ start: string, end: string }} [markers]
 * @returns {string}
 */
export function mergeHeadersFile(
  existing,
  block,
  markers = { start: BLOCK_START, end: BLOCK_END },
) {
  if (existing === null) return block
  let site = existing
  const start = site.indexOf(markers.start)
  if (start !== -1) {
    const end = site.indexOf(markers.end, start)
    const after = end === -1 ? site.length : end + markers.end.length
    site = site.slice(0, start) + site.slice(after).replace(/^\r?\n/, '')
  }
  if (site.length === 0) return block
  const separator = site.endsWith('\n') ? '\n' : '\n\n'
  return `${site}${separator}${block}`
}

/**
 * The Firebase fragment: patterns, never paths, because a person merges it
 * into `firebase.json` once and a hashed name changes on every edit. One
 * pattern for kiss's hash shape, one for the consent client when the site has
 * one.
 *
 * @param {{ consent: boolean }} options
 * @returns {string}
 */
export function renderFirebaseCacheHeaders({ consent }) {
  const value = [{ key: 'Cache-Control', value: IMMUTABLE }]
  const headers = [{ regex: FIREBASE_HASHED, headers: value }]
  if (consent) headers.push({ regex: FIREBASE_CONSENT, headers: value })
  return `${JSON.stringify({ headers }, null, 2)}\n`
}

/**
 * The files in the build folder that the Firebase pattern matches but kiss did
 * not hash: a host would cache each for a year, with no way to change it.
 *
 * @param {string[]} built every file under the build folder, `/`-rooted
 * @param {string[]} hashed from `hashedFiles`
 * @returns {string[]} sorted
 */
export function firebaseLookalikes(built, hashed) {
  const hashedSet = new Set(hashed)
  const pattern = new RegExp(FIREBASE_HASHED)
  return built.filter((file) => pattern.test(file) && !hashedSet.has(file))
}

// The file each built-in format writes, and how. The single table of which
// cache-header formats exist: `lib/config.js` derives its accepted names from
// it, so a name cannot be accepted there and dispatch to nothing here.
export const CACHE_HEADER_FORMATS = Object.freeze({
  netlify: { file: '_headers', kind: 'headers-file' },
  cloudflare: { file: '_headers', kind: 'headers-file' },
  firebase: { file: 'cache-headers.firebase.json', kind: 'firebase' },
})

/**
 * The formats to run, as a list: `[]` for `undefined`, `null` and `'none'`; a
 * bare name or function as a list of one; duplicates collapsed, so `netlify`
 * and `cloudflare` together write `_headers` once.
 *
 * @param {*} format `config.cacheHeaders.format`
 * @returns {Array<string|Function>}
 */
export function resolveCacheHeaderFormats(format) {
  if (format === undefined || format === null) return []
  const list = Array.isArray(format) ? format : [format]
  const out = []
  const files = new Set()
  for (const entry of list) {
    if (entry === 'none') continue
    if (typeof entry === 'function') {
      if (!out.includes(entry)) out.push(entry)
      continue
    }
    const file = CACHE_HEADER_FORMATS[entry]?.file
    if (file && files.has(file)) continue
    if (file) files.add(file)
    if (!out.includes(entry)) out.push(entry)
  }
  return out
}

async function listBuild(root) {
  const entries = await fs.promises.readdir(root, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        `/${posixPath(path.relative(root, path.join(entry.parentPath, entry.name)))}`,
    )
    .sort()
}

/**
 * Write the cache-header files for this build into `root`.
 *
 * @param {Object} input
 * @param {import('./config.js').KissConfig} input.config
 * @param {string} input.root where the build is being written
 * @param {Record<string, string>} input.manifest `assetManifest.toObject()`
 * @param {string|null} [input.consentClient] the consent client's name
 * @param {string[]} [input.images] `{{image}}`'s variants, build-relative
 * @param {{ kind(file: string): string|null, claim(file: string, owner: string): void }} [input.outputs]
 * @returns {Promise<CacheHeadersWriteResult>}
 */
export async function writeCacheHeaders({
  config,
  root,
  manifest,
  consentClient = null,
  images = [],
  outputs = undefined,
}) {
  const files = hashedFiles({ manifest, consentClient, images, root })
  const rules = cacheHeaderRules(files)
  const hosts = config.host ?? []
  const uncovered = hosts.filter((host) => HOST_NO_CACHE_HEADERS.has(host))
  const result = {
    status: /** @type {'none'|'written'} */ ('none'),
    rules,
    files: /** @type {string[]} */ ([]),
    formats: /** @type {string[]} */ ([]),
    unset: false,
    merged: false,
    lookalikes: /** @type {string[]} */ ([]),
    uncovered,
  }
  const chosen = config.cacheHeaders?.format
  const formats = resolveCacheHeaderFormats(chosen)
  if (rules.length === 0) return result
  result.status = 'written'
  result.unset = (chosen === undefined || chosen === null) && hosts.length === 0

  const json = path.join(root, 'cache-headers.json')
  await fs.outputFile(json, renderCacheHeadersJson(rules))
  outputs?.claim(json, 'cache headers')
  result.files.push(json)

  for (const format of formats) {
    if (typeof format === 'function') {
      const returned = await format(rules, { buildDir: root, config })
      for (const { file, contents } of normaliseWriterOutput(returned, root)) {
        await fs.outputFile(file, contents)
        outputs?.claim(file, 'cache headers')
        result.files.push(file)
      }
      result.formats.push('custom')
      continue
    }
    const spec = CACHE_HEADER_FORMATS[format]
    const file = path.join(root, spec.file)
    if (spec.kind === 'headers-file') {
      const site =
        outputs?.kind(file) === 'asset' && fs.existsSync(file)
          ? await fs.readFile(file, 'utf8')
          : null
      await fs.outputFile(
        file,
        mergeHeadersFile(site, renderHeadersBlock(rules)),
      )
      // A merged file stays the asset copy's: the site's lines are in it, and
      // claiming it as generated would report a collision that did not lose
      // anything.
      if (site === null) outputs?.claim(file, 'cache headers')
      else result.merged = true
    } else {
      await fs.outputFile(
        file,
        renderFirebaseCacheHeaders({ consent: Boolean(consentClient) }),
      )
      outputs?.claim(file, 'cache headers')
      result.lookalikes = firebaseLookalikes(await listBuild(root), files)
    }
    result.files.push(file)
    result.formats.push(format)
  }
  return result
}

// The hosts kiss has no cache-header encoding for yet. Not `github-pages`,
// whose headers cannot be configured at all: that one is a fact, not a gap.
const HOST_NO_CACHE_HEADERS = new Set(['vercel'])

/**
 * A custom writer's return value as `[{ file, contents }]`, `file` resolved
 * under the build folder. An absolute path, or one climbing out, throws.
 *
 * @param {*} returned
 * @param {string} root
 * @returns {{ file: string, contents: string }[]}
 */
function normaliseWriterOutput(returned, root) {
  if (!returned) return []
  const list = Array.isArray(returned) ? returned : [returned]
  return list.map((entry) => {
    if (!entry || typeof entry.file !== 'string')
      throw new Error(
        'config.cacheHeaders.format writer returned an entry with no `file`',
      )
    if (typeof entry.contents !== 'string')
      throw new Error(
        `config.cacheHeaders.format writer returned a non-string \`contents\` for ${entry.file}`,
      )
    if (path.isAbsolute(entry.file))
      throw new Error(
        `config.cacheHeaders.format writer returned an absolute path (${entry.file}); paths are relative to the build folder`,
      )
    const file = path.resolve(root, entry.file)
    if (path.relative(root, file).startsWith('..'))
      throw new Error(
        `config.cacheHeaders.format writer returned a path outside the build folder (${entry.file})`,
      )
    return { file, contents: entry.contents }
  })
}
