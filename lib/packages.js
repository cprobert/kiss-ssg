import { createHash } from 'node:crypto'
import fs from 'fs-extra'
import path from 'node:path'
import { Parser } from 'htmlparser2'
import { browserReference, srcsetUrls } from './links.js'
import { renderManifest } from './package-manifest.js'
import { zip } from './zip.js'

/**
 * The settings of `config.packages`, resolved.
 *
 * @typedef {object} KissPackages
 * @property {'imscp' | 'scorm12' | Array<'imscp' | 'scorm12'>} format the format of each package, or several to write each package in each
 * @property {string} dir the build-relative folder the zips are written to
 * @property {((id: string, pages: PackagePageInfo[]) => string) | null} title a package's title; the first page's `title` when `null`
 * @property {string[] | null} only the package ids to write; every package when `null`
 * @property {boolean} schemas put the SCORM 1.2 schema files (`lib/schemas/scorm12`) in each SCORM 1.2 package, named in its manifest
 */

/**
 * What `config.packages.title` is given about each page of a package.
 *
 * @typedef {object} PackagePageInfo
 * @property {string} id
 * @property {string} title
 * @property {Record<string, any>} options the page's options
 * @property {any} model the page's resolved model
 */

/**
 * A reference a package cannot carry, and why.
 *
 * @typedef {object} PackageOutside
 * @property {string} page the file holding the reference, as written (a staging path under `'atomic'` and check)
 * @property {string} href the reference as the file wrote it
 * @property {string} reason `<what>: <why an LMS cannot follow it>`
 */

/**
 * One package written in one format.
 *
 * @typedef {object} PackageResult
 * @property {string} id
 * @property {'imscp' | 'scorm12'} format
 * @property {string} file the zip, as written
 * @property {string} title
 * @property {string} hash sha1 of the zip's bytes, which depend only on its files (`lib/zip.js`)
 * @property {string[]} pages the member pages, in the order the table of contents lists them, as written
 * @property {number} files the entries in the zip, `imsmanifest.xml` included
 * @property {number} bytes the zip's size, for an LMS's upload limit
 * @property {PackageOutside[]} outside sorted by page, then href
 */

/** A package id: lower-case letters, digits and single hyphens. */
export const PACKAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const FORMATS = ['imscp', 'scorm12']

// Each reason is `<what>: <why an LMS cannot follow it>`, so a summary can show the first half.
const REASONS = {
  root: 'root-relative: an LMS does not serve a package at the site root',
  above: 'above the build folder: nothing there is part of the build',
  site: 'an absolute URL to this site: an LMS serves the package somewhere else',
  folder:
    "a folder link: an LMS serves a package's files as they are, and does not open a folder's index.html",
  extensionless:
    "an extension-less link: an LMS serves a package's files as they are, and adds no .html",
  missing:
    'not written by this build: only files this build wrote are packed; a pipeline step that writes into the build folder declares the file in its outputs',
  page: 'a link to a page outside the package: the package would open it inside itself, or not at all',
  base: "an absolute base URL: the page's relative references point outside the package, so none of them is followed",
  case: 'a reference in the wrong case: an LMS server tells capitals from small letters, and would not find the file',
  sco: "a link between SCOs: in SCORM each page is its own SCO, and the link would open one inside the other; the LMS's table of contents is the navigation",
}

// The `rel` tokens of a `<link>` whose file the page needs to display.
const NEEDED_LINKS = new Set([
  'stylesheet',
  'icon',
  'apple-touch-icon',
  'preload',
  'modulepreload',
  'prefetch',
  'manifest',
])

// `@import` with or without `url()`, then `url()` itself, in document order, in any case (`@IMPORT`,
// `URL()`), as CSS reads them. A quoted value is everything between its quotes, spaces too
// (`@import "theme light.css"`), and an escaped quote does not end it (`"say \"hi\".png"`); an
// unquoted one ends at a space, a quote, a bracket or `;` that is not escaped (`url(paren\).png)`).
// An escape is read whole, as CSS reads it: hex digits and the one space that ends them belong to
// the escape (`url(images/\31 23.png)` is `images/123.png`), so that space does not end the value.
// A quoted `@import` needs no space after the keyword (`@import"x.css"`, as compressed CSS writes
// it); an unquoted one does, or `@importx` would be another at-rule.
const ESCAPE = String.raw`\\(?:[0-9a-fA-F]{1,6}[ \t\n\f]?|[\s\S])`
const CSS_REFERENCE = new RegExp(
  [
    String.raw`@import(?:\s*(?:url\(\s*)?(?:"((?:${ESCAPE}|[^"\\])*)"|'((?:${ESCAPE}|[^'\\])*)')|\s+(?:url\(\s*)?((?:${ESCAPE}|[^'"()\s;\\])+))`,
    String.raw`url\(\s*(?:"((?:${ESCAPE}|[^"\\])*)"|'((?:${ESCAPE}|[^'\\])*)'|((?:${ESCAPE}|[^'"()\s\\])*))\s*\)`,
  ].join('|'),
  'gi',
)

// A quoted string or an unquoted url() (group 1, kept), or a comment.
const CSS_COMMENT = new RegExp(
  [
    String.raw`("(?:${ESCAPE}|[^"\\\n])*"|'(?:${ESCAPE}|[^'\\\n])*'|url\(\s*(?:${ESCAPE}|[^'"()\s\\])*\s*\))`,
    String.raw`\/\*[\s\S]*?(?:\*\/|$)`,
  ].join('|'),
  'gi',
)

/**
 * A CSS value with its escapes decoded, as a browser reads it: a backslash and
 * one to six hex digits is that code point (one space after them is part of the
 * escape: `\31 23` is `123`), a backslash and a newline is nothing, and a
 * backslash and any other character is that character (`\ ` a space, `\)` a
 * bracket). A code point of 0, a surrogate or one past U+10FFFF is U+FFFD.
 *
 * @param {string} value
 * @returns {string}
 */
function cssUnescape(value) {
  return value.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n\f]?|(\r\n|[\s\S]))/g,
    (_, hex, char) => {
      if (hex === undefined) return /^(\r\n|[\n\r\f])$/.test(char) ? '' : char
      const code = parseInt(hex, 16)
      const bad =
        code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
      return String.fromCodePoint(bad ? 0xfffd : code)
    },
  )
}

/**
 * The references in a stylesheet: each `@import` and each `url()`, in
 * document order, once each. A comment (`/* … *\/`) is not read, so a
 * reference in one is neither packed nor reported; a `/*` inside a string or
 * an unquoted `url()` does not start one, as it does not for a browser. A `url(` inside a quoted
 * string (`content: "url(x)"`) is still read: rare, and harmless, since it
 * packs a file the build wrote or reports one it did not.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function extractCssReferences(css) {
  const found = new Set()
  // A comment starts only where the tokenizer would start one: strings and
  // unquoted url()s are matched first and kept, so a `/*` inside either
  // (`content: "/*"`, `url(a/*b.png)`) does not swallow the stylesheet up to
  // the next `*/`, and every reference in between with it.
  const text = String(css).replace(CSS_COMMENT, (match, kept) => kept ?? ' ')
  for (const m of text.matchAll(CSS_REFERENCE)) {
    const ref = cssUnescape(
      m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '',
    ).trim()
    if (ref) found.add(ref)
  }
  return [...found]
}

/**
 * The references in a page, split by what they are. `needs` are the files the
 * page needs to display (`src`, `srcset`, `poster`, `object[data]`, SVG
 * `use`/`image`, the stylesheets, icons and preloads of `<link>`, and every
 * `url()` and `@import` in a `<style>` element or a `style` attribute);
 * `anchors` are where it links (`<a href>`, `<area href>`). Anything else, a
 * form's `action` or a script's own imports among them, is neither. Each list
 * is in document order, once each.
 *
 * @param {string} html
 * @returns {{ needs: string[], anchors: string[], base: string | null }} `base`
 * is the first `<base href>`, against which a browser resolves every relative reference
 */
export function extractReferences(html) {
  const needs = new Set()
  const anchors = new Set()
  /** @param {string | undefined} ref */
  const need = (ref) => {
    if (ref && ref.trim()) needs.add(ref.trim())
  }
  /** @type {string | null} */
  let base = null
  let inStyle = false
  let style = ''
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === 'style') {
          inStyle = true
          style = ''
        }
        // The first <base> with an href decides, an empty one too: a browser
        // resolves an empty base to the document's own URL, and ignores every
        // later <base>.
        if (name === 'base' && base === null && attribs.href !== undefined)
          base = attribs.href.trim()
        if (name === 'link') {
          const rel = (attribs.rel ?? '').toLowerCase().split(/\s+/)
          if (rel.some((token) => NEEDED_LINKS.has(token))) need(attribs.href)
        }
        need(attribs.src)
        if (attribs.srcset) srcsetUrls(attribs.srcset).forEach(need)
        need(attribs.poster)
        if (name === 'object') need(attribs.data)
        if (name === 'use' || name === 'image')
          need(attribs.href ?? attribs['xlink:href'])
        if (attribs.style) extractCssReferences(attribs.style).forEach(need)
        if (
          (name === 'a' || name === 'area') &&
          attribs.href &&
          attribs.href.trim()
        )
          anchors.add(attribs.href.trim())
      },
      ontext(text) {
        if (inStyle) style += text
      },
      onclosetag(name) {
        if (name === 'style') {
          inStyle = false
          extractCssReferences(style).forEach(need)
        }
      },
    },
    { decodeEntities: true },
  )
  parser.write(String(html))
  parser.end()
  return { needs: [...needs], anchors: [...anchors], base }
}

/**
 * A relative URL path with each segment's percent-escapes decoded (`%20` a
 * space, `%2e%2e` a climb), as every path here is read; a segment that is not
 * valid escaping is kept as written.
 *
 * @param {string} urlPath
 * @returns {string}
 */
function decodePath(urlPath) {
  return urlPath
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

/**
 * A file in the highest folder a relative reference passes through on its way
 * from the folder `fromDir` (build-relative, `.` for the build root): `../l1/a.png`
 * from `course/l1` climbs to `course`, so `course/x`. A package must be rooted
 * at or above it, or the reference, unchanged in the zip, would climb out.
 *
 * @param {string} fromDir
 * @param {string} ref
 * @returns {string}
 */
function climbOf(fromDir, ref) {
  const parts = fromDir === '.' ? [] : fromDir.split('/')
  let low = [...parts]
  const read = browserReference(ref).split(/[?#]/)[0]
  for (const seg of decodePath(read).split('/').slice(0, -1)) {
    if (seg === '..') {
      parts.pop()
      if (parts.length < low.length) low = [...parts]
    } else if (seg && seg !== '.') parts.push(seg)
  }
  return [...low, 'x'].join('/')
}

/**
 * The build-relative file a page's references resolve from, given its
 * `<base href>`: a file in the folder the base names, resolved as a URL
 * resolves it (`../assets/` and `../assets/start.html` name `assets/`; `..`
 * and `.` name a folder too, with no slash). `from` itself for an empty base;
 * null for an absolute or root-relative base, which names nothing in the build.
 *
 * @param {string} base the `<base href>`
 * @param {string} from the page, build-relative
 * @returns {string | null}
 */
export function documentBase(base, from) {
  const raw = browserReference(base).split(/[?#]/)[0]
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('/')) return null
  if (!raw) return from
  const b = decodePath(raw)
  const folder =
    b.endsWith('/') || /(^|\/)\.\.?$/.test(b) ? b : path.posix.dirname(b)
  return path.posix.join(path.posix.dirname(from), folder, 'x')
}

// The SCORM 1.2 schema files kiss ships (lib/schemas/scorm12/NOTICE.md), read
// once, for a package under `config.packages.schemas`.
const SCHEMA_FILES = [
  'adlcp_rootv1p2.xsd',
  'imscp_rootv1p1p2.xsd',
  'ims_xml.xsd',
]
/** @type {Promise<{ name: string, bytes: Buffer }[]> | null} */
let schemaRead = null
const schemaEntries = () =>
  (schemaRead ??= Promise.all(
    SCHEMA_FILES.map(async (name) => ({
      name,
      bytes: await fs.readFile(
        new URL(`./schemas/scorm12/${name}`, import.meta.url),
      ),
    })),
  ))

/**
 * Where a reference made by the build-relative file `from` points.
 *
 * - `{ kind: 'skip' }`: nothing to follow or report (an empty value, a
 *   `#fragment`, a protocol-relative URL, or a scheme such as `https:`,
 *   `mailto:` or `data:` that is not this site).
 * - `{ kind: 'outside', reason }`: root-relative, above the build folder, a
 *   folder, or an absolute URL to this site (`siteOrigin`).
 * - `{ kind: 'path', rel }`: the build-relative path it names, `?query` and
 *   `#fragment` dropped and percent-escapes decoded.
 *
 * @param {string} ref
 * @param {string} from
 * @param {{ siteOrigin?: string | null }} [options]
 * @returns {{ kind: 'skip' } | { kind: 'outside', reason: string } | { kind: 'path', rel: string }}
 */
export function resolveReference(ref, from, { siteOrigin = null } = {}) {
  // Read as a browser reads it first: every check below, the protocol-relative
  // `//` among them, is about the reference the browser would follow.
  const value = browserReference(ref)
  if (!value || value.startsWith('#') || value.startsWith('//'))
    return { kind: 'skip' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    // The origin a browser computes, not a string prefix: `EXAMPLE.com`, a
    // default port or a query straight after the host is the same site.
    if (siteOrigin && originOf(value) === siteOrigin)
      return { kind: 'outside', reason: REASONS.site }
    return { kind: 'skip' }
  }
  const bare = value.split(/[?#]/)[0]
  if (!bare) return { kind: 'skip' }
  if (bare.startsWith('/')) return { kind: 'outside', reason: REASONS.root }
  if (bare.endsWith('/') || bare === '.' || bare === '..')
    return { kind: 'outside', reason: REASONS.folder }
  const decoded = decodePath(bare)
  const rel = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), decoded),
  )
  if (rel === '..' || rel.startsWith('../'))
    return { kind: 'outside', reason: REASONS.above }
  return { kind: 'path', rel }
}

/**
 * The deepest folder that holds every one of the build-relative `paths`: `''`
 * for the build folder itself.
 *
 * @param {string[]} paths
 * @returns {string}
 */
export function commonRoot(paths) {
  const folders = paths.map((p) => p.split('/').slice(0, -1))
  if (folders.length === 0) return ''
  const common = []
  for (let i = 0; i < folders[0].length; i++) {
    const segment = folders[0][i]
    if (folders.every((f) => f[i] === segment)) common.push(segment)
    else break
  }
  return common.join('/')
}

/**
 * Compares two registration orders (`[registration, item]`) as numbers.
 *
 * @param {number[]} a
 * @param {number[]} b
 */
const byOrder = (a, b) => a[0] - b[0] || a[1] - b[1]

/**
 * The pages of each package, in registration order, packages by id. A page is
 * a member when its `package` option is a string and it is written
 * (`generate` is not `false`).
 *
 * @param {any[]} stack stack entries, each with `page.options` and `order`
 * @returns {Map<string, any[]>}
 */
export function packageMembers(stack) {
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  for (const entry of stack) {
    const options = entry.page?.options ?? {}
    if (typeof options.package !== 'string' || options.generate === false)
      continue
    if (!groups.has(options.package)) groups.set(options.package, [])
    groups.get(options.package)?.push(entry)
  }
  for (const members of groups.values())
    members.sort((a, b) => byOrder(a.order ?? [0, 0], b.order ?? [0, 0]))
  return new Map(
    [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
}

/**
 * The origin of `config.siteUrl` (`https://e.com`), or `null` when there is
 * none or it is not a URL.
 *
 * @param {string | null} siteUrl
 * @returns {string | null}
 */
function originOf(siteUrl) {
  if (!siteUrl) return null
  try {
    return new URL(siteUrl).origin
  } catch {
    return null
  }
}

const isHtml = (rel) => /\.html?$/i.test(rel)
const isCss = (rel) => /\.css$/i.test(rel)
const posix = (p) => p.replaceAll('\\', '/')

/**
 * Works out and writes every learning package of a settled build: one zip per
 * package and format, into `config.packages.dir`. Nothing is written unless
 * every package can be: a member page with no usable `id`, one that was not
 * written, or a file named `imsmanifest.xml` at a package's root is a failure,
 * returned rather than thrown.
 *
 * @param {any[]} stack the projected stack (`stackForRecord`): each entry's `id` is `null` where it is not usable
 * @param {object} context
 * @param {KissPackages} context.packages
 * @param {string | null} [context.siteUrl]
 * @param {string} context.writeRoot the folder the build writes into (staging under `'atomic'` and check)
 * @param {(file: string) => boolean} context.written whether this build wrote a file (an absolute path)
 * @param {{ claim?: (file: string, owner: string, kind: any) => void } | null} [context.outputs]
 * @param {{ notice: (message: string) => void }} context.logger
 * @returns {Promise<{ packages: PackageResult[] | null, failures: string[] }>}
 */
export async function writePackages(
  stack,
  {
    packages: settings,
    siteUrl = null,
    writeRoot,
    written,
    outputs = null,
    logger,
  },
) {
  const root = posix(path.resolve(writeRoot))
  const groups = packageMembers(stack)
  const formats = [...new Set([settings.format].flat())]
  const only = settings.only ? new Set(settings.only) : null
  if (only) {
    for (const id of only)
      if (!groups.has(id))
        logger.notice(
          `config.packages.only names '${id}', and no page belongs to that package`,
        )
  }
  const dir = posix(path.resolve(root, settings.dir ?? 'packages'))
  if (dir !== root && !dir.startsWith(`${root}/`))
    return {
      packages: null,
      failures: [
        `config.packages.dir '${settings.dir}' is outside the build folder`,
      ],
    }
  const dirRel = path.posix.relative(root, dir)
  const siteOrigin = originOf(siteUrl)

  const relOf = (file) => path.posix.relative(root, posix(path.resolve(file)))
  // Only a file this build wrote is packed, and never anything in the packages folder.
  const isWritten = (rel) =>
    (!dirRel || (rel !== dirRel && !rel.startsWith(`${dirRel}/`))) &&
    written(path.join(root, rel))
  // Whether `rel` names the written file with its exact letters. The output
  // registry ignores case on Windows, and the disk does on macOS, so a
  // reference to `img/App.png` for `img/app.png` resolves here, though an LMS
  // server would not serve it. Each folder is listed once.
  /** @type {Map<string, Set<string>>} */
  const listings = new Map()
  const exactCase = async (rel) => {
    let dirOf = ''
    for (const segment of rel.split('/')) {
      if (!listings.has(dirOf))
        listings.set(
          dirOf,
          new Set(await fs.readdir(path.join(root, dirOf)).catch(() => [])),
        )
      if (!listings.get(dirOf)?.has(segment)) return false
      dirOf = dirOf ? `${dirOf}/${segment}` : segment
    }
    return true
  }

  /** @type {string[]} */
  const failures = []
  const plans = []
  for (const [id, members] of groups) {
    if (only && !only.has(id)) continue
    for (const m of members) {
      const where = m.page?.outputPath ? relOf(m.page.outputPath) : m.buildTo
      if (!m.id)
        failures.push(
          `${where}: a page of package '${id}' has no usable id (two pages share its default id); give it an explicit id`,
        )
      if (!m.page?.hash || !m.page?.outputPath)
        failures.push(`${where}: a page of package '${id}' was not written`)
    }
    plans.push({ id, members })
  }
  if (failures.length) return { packages: null, failures }

  // What a file references, read and parsed once however many member pages,
  // in however many packages, reach it: a shared stylesheet is walked by each.
  /** @type {Map<string, Promise<{ needs: string[], anchors: string[], base: string | null }>>} */
  const parsed = new Map()
  const referencesOf = (rel) => {
    if (!parsed.has(rel))
      parsed.set(
        rel,
        fs
          .readFile(path.join(root, rel), 'utf8')
          .then((text) =>
            isHtml(rel)
              ? extractReferences(text)
              : { needs: extractCssReferences(text), anchors: [], base: null },
          ),
      )
    return /** @type {Promise<{ needs: string[], anchors: string[], base: string | null }>} */ (
      parsed.get(rel)
    )
  }

  /** @type {PackageResult[]} */
  const results = []
  // Each zip goes to a temporary file beside its name as soon as it is made,
  // so one zip is in memory at a time, not every zip of the build. All or
  // nothing: the temporary files become the zips only when every package was
  // made, and a failure on the way, a write's included, removes every
  // temporary file and every zip this run renamed into place.
  /** @type {{ file: string, temp: string }[]} */
  const temps = []
  /** @type {string[]} */
  const promoted = []
  // A zip an earlier build left (`cleanBuild: false`) is the last good one:
  // set aside before its replacement goes in, put back if the run fails, and
  // deleted only once every replacement is in place.
  /** @type {{ file: string, backup: string }[]} */
  const backups = []
  const discard = async () => {
    await Promise.all([
      ...temps.map(({ temp }) => fs.remove(temp)),
      ...promoted.map((file) => fs.remove(file)),
    ])
    for (const { file, backup } of backups) await fs.rename(backup, file)
    // The folder the temporary files made, only if nothing else is in it.
    await fs.rmdir(dir).catch(() => {})
  }
  try {
    for (const { id, members } of plans) {
      const memberRels = members.map((m) => relOf(m.page.outputPath))
      const memberSet = new Set(memberRels)
      /** @type {Set<string>} every file of the package: the members and all they need */
      const files = new Set(memberRels)
      /** @type {string[][]} what each member needs, in the order its own walk reached it */
      const needs = memberRels.map(() => [])
      /** @type {Map<string, PackageOutside>} */
      const outside = new Map()
      const report = (from, href, reason) =>
        outside.set(`${from}\u0000${href}`, {
          page: `${root}/${from}`,
          href,
          reason,
        })
      /** @type {Map<string, PackageOutside>} links from one member page to another: a finding in SCORM alone */
      const betweenMembers = new Map()
      /** @type {Set<string>} a file in each folder a followed reference climbs to, which the root must hold */
      const climbs = new Set()

      // Each member's walk is its own, so a file two members need is listed on
      // both their resources, and is in the zip once.
      for (const [i, start] of memberRels.entries()) {
        const seen = new Set([start])
        const queue = [start]
        // A file the page needs, or a written file it links to for download:
        // packed when this build wrote it in this case, and walked when it can
        // reference more.
        const pack = async (from, href, to, at) => {
          climbs.add(climbOf(path.posix.dirname(at), href))
          if (!isWritten(to.rel)) {
            const loose =
              isWritten(`${to.rel}.html`) || isWritten(`${to.rel}/index.html`)
            report(from, href, loose ? REASONS.extensionless : REASONS.missing)
            return
          }
          if (!(await exactCase(to.rel))) {
            report(from, href, REASONS.case)
            return
          }
          if (seen.has(to.rel)) return
          seen.add(to.rel)
          files.add(to.rel)
          needs[i].push(to.rel)
          if (isHtml(to.rel) || isCss(to.rel)) queue.push(to.rel)
        }
        while (queue.length) {
          const from = /** @type {string} */ (queue.shift())
          const refs = await referencesOf(from)
          // A relative <base href> is the folder the page's references resolve from (`at`, a file in
          // it); an absolute one is a finding, and no relative reference of the page can be packed.
          let at = from
          if (refs.base) {
            const based = documentBase(refs.base, from)
            if (based === null) {
              report(from, refs.base, REASONS.base)
              continue
            }
            at = based
            climbs.add(climbOf(path.posix.dirname(from), `${refs.base}/x`))
          }
          for (const href of refs.needs) {
            const to = resolveReference(href, at, { siteOrigin })
            if (to.kind === 'skip') continue
            if (to.kind === 'outside') report(from, href, to.reason)
            else await pack(from, href, to, at)
          }
          for (const href of refs.anchors) {
            const to = resolveReference(href, at, { siteOrigin })
            if (to.kind === 'skip') continue
            if (to.kind === 'outside') report(from, href, to.reason)
            // A link to a file that is not a page (a PDF, a worksheet) is a
            // download: the package carries it.
            else if (isWritten(to.rel) && !isHtml(to.rel))
              await pack(from, href, to, at)
            else if (memberSet.has(to.rel)) {
              climbs.add(climbOf(path.posix.dirname(at), href))
              if (to.rel !== from)
                betweenMembers.set(`${from}\u0000${href}`, {
                  page: `${root}/${from}`,
                  href,
                  reason: REASONS.sco,
                })
            } else if (isWritten(to.rel))
              report(
                from,
                href,
                (await exactCase(to.rel)) ? REASONS.page : REASONS.case,
              )
            else
              report(
                from,
                href,
                isWritten(`${to.rel}.html`) || isWritten(`${to.rel}/index.html`)
                  ? REASONS.extensionless
                  : REASONS.missing,
              )
          }
        }
      }

      const base = commonRoot([...files, ...climbs])
      const nameOf = (rel) => (base ? rel.slice(base.length + 1) : rel)
      if ([...files].some((rel) => nameOf(rel) === 'imsmanifest.xml')) {
        failures.push(
          `package '${id}': a file at its root is named imsmanifest.xml, which the package's own manifest needs`,
        )
        continue
      }
      const schemaClash =
        settings.schemas &&
        formats.includes('scorm12') &&
        [...files].map(nameOf).find((name) => SCHEMA_FILES.includes(name))
      if (schemaClash) {
        failures.push(
          `package '${id}': a file at its root is named ${schemaClash}, which config.packages.schemas puts there`,
        )
        continue
      }
      const pages = members.map((m) => ({
        id: m.id,
        title: m.page.options.title ?? m.id,
        options: m.page.options,
        model: m.page.options.model,
      }))
      const title = settings.title
        ? String(settings.title(id, pages))
        : (pages[0].title ?? id)
      const manifestMembers = members.map((m, i) => ({
        id: m.id,
        title: pages[i].title,
        section: m.page.options.packageSection ?? undefined,
        href: nameOf(memberRels[i]),
        // Every file the page needs, another member page it embeds included.
        files: [
          memberRels[i],
          ...needs[i].filter((rel) => rel !== memberRels[i]),
        ].map(nameOf),
      }))
      const bytes = await Promise.all(
        [...files].map(async (rel) => ({
          name: nameOf(rel),
          bytes: await fs.readFile(path.join(root, rel)),
        })),
      )
      const sorted = (list) =>
        list.sort((a, b) =>
          a.page < b.page
            ? -1
            : a.page > b.page
              ? 1
              : a.href < b.href
                ? -1
                : a.href > b.href
                  ? 1
                  : 0,
        )

      for (const format of formats) {
        const schemas =
          format === 'scorm12' && settings.schemas ? await schemaEntries() : []
        const buf = zip([
          ...bytes,
          ...schemas,
          {
            name: 'imsmanifest.xml',
            bytes: renderManifest({
              id,
              title,
              format,
              members: manifestMembers,
              schemas: schemas.length > 0,
            }),
          },
        ])
        const file = `${dir}/${id}.${format}.zip`
        const temp = `${file}.${process.pid}.tmp`
        temps.push({ file, temp })
        await fs.outputFile(temp, buf)
        results.push({
          id,
          format,
          file,
          title,
          hash: createHash('sha1').update(buf).digest('hex'),
          pages: memberRels.map((rel) => `${root}/${rel}`),
          files: bytes.length + schemas.length + 1,
          bytes: buf.length,
          outside: sorted(
            format === 'scorm12'
              ? [...outside.values(), ...betweenMembers.values()]
              : [...outside.values()],
          ),
        })
      }
    }
    if (failures.length) {
      await discard()
      return { packages: null, failures }
    }
    for (const { file, temp } of temps) {
      if (await fs.pathExists(file)) {
        const backup = `${file}.${process.pid}.bak`
        await fs.rename(file, backup)
        backups.push({ file, backup })
      }
      await fs.rename(temp, file)
      promoted.push(file)
    }
  } catch (error) {
    await discard().catch(() => {})
    throw error
  }
  await Promise.all(backups.map(({ backup }) => fs.remove(backup)))
  for (const file of promoted) outputs?.claim?.(file, '<packages>', 'package')
  results.sort((a, b) =>
    a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format),
  )
  return { packages: results, failures }
}
