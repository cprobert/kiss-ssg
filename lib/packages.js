import { createHash } from 'node:crypto'
import fs from 'fs-extra'
import path from 'node:path'
import { Parser } from 'htmlparser2'
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
  missing: 'not written by this build: only files this build wrote are packed',
  page: 'a link to a page outside the package: the package would open it inside itself, or not at all',
  base: "an absolute base URL: the page's relative references point outside the package, so none of them is followed",
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
// `URL()`), as CSS reads them. A quoted value is
// everything between its quotes, spaces too (`@import "theme light.css"`); an unquoted one ends at a
// space, a quote, `)` or `;`.
const CSS_REFERENCE =
  /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^'")\s;]+))|url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]*?))\s*\)/gi

/**
 * The references in a stylesheet: each `@import` and each `url()`, in
 * document order, once each.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function extractCssReferences(css) {
  const found = new Set()
  for (const m of String(css).matchAll(CSS_REFERENCE)) {
    const ref = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim()
    if (ref) found.add(ref)
  }
  return [...found]
}

/**
 * The URLs of a `srcset`: the first token of each comma-separated candidate.
 *
 * @param {string} srcset
 * @returns {string[]}
 */
const srcsetUrls = (srcset) =>
  srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)

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
        if (name === 'base' && base === null && attribs.href?.trim())
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
  const b = String(base).split(/[?#]/)[0]
  if (/^[a-z][a-z0-9+.-]*:/i.test(b) || b.startsWith('/')) return null
  if (!b) return from
  const folder =
    b.endsWith('/') || /(^|\/)\.\.?$/.test(b) ? b : path.posix.dirname(b)
  return path.posix.join(path.posix.dirname(from), folder, 'x')
}

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
  const value = String(ref).trim()
  if (!value || value.startsWith('#') || value.startsWith('//'))
    return { kind: 'skip' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (
      siteOrigin &&
      (value === siteOrigin || value.startsWith(`${siteOrigin}/`))
    )
      return { kind: 'outside', reason: REASONS.site }
    return { kind: 'skip' }
  }
  const bare = value.split(/[?#]/)[0]
  if (!bare) return { kind: 'skip' }
  if (bare.startsWith('/')) return { kind: 'outside', reason: REASONS.root }
  if (bare.endsWith('/') || bare === '.' || bare === '..')
    return { kind: 'outside', reason: REASONS.folder }
  const decoded = bare
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
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

  /** @type {PackageResult[]} */
  const results = []
  /** @type {{ file: string, buf: Buffer }[]} each zip, written only when every package was made */
  const zips = []
  for (const { id, members } of plans) {
    const memberRels = members.map((m) => relOf(m.page.outputPath))
    const memberSet = new Set(memberRels)
    /** @type {Map<string, number>} each file, and the member whose walk reached it first */
    const files = new Map(memberRels.map((rel, i) => [rel, i]))
    /** @type {Map<string, PackageOutside>} */
    const outside = new Map()
    const report = (from, href, reason) =>
      outside.set(`${from}\u0000${href}`, {
        page: `${root}/${from}`,
        href,
        reason,
      })
    /** @type {PackageOutside[]} links from one member page to another: a finding in SCORM alone */
    const betweenMembers = []

    for (const [i, start] of memberRels.entries()) {
      const queue = [start]
      while (queue.length) {
        const from = /** @type {string} */ (queue.shift())
        const text = await fs.readFile(path.join(root, from), 'utf8')
        const refs = isHtml(from)
          ? extractReferences(text)
          : { needs: extractCssReferences(text), anchors: [], base: null }
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
        }
        for (const href of refs.needs) {
          const to = resolveReference(href, at, { siteOrigin })
          if (to.kind === 'skip') continue
          if (to.kind === 'outside') {
            report(from, href, to.reason)
            continue
          }
          if (!isWritten(to.rel)) {
            const loose =
              isWritten(`${to.rel}.html`) || isWritten(`${to.rel}/index.html`)
            report(from, href, loose ? REASONS.extensionless : REASONS.missing)
            continue
          }
          if (files.has(to.rel)) continue
          files.set(to.rel, i)
          if (isHtml(to.rel) || isCss(to.rel)) queue.push(to.rel)
        }
        for (const href of refs.anchors) {
          const to = resolveReference(href, at, { siteOrigin })
          if (to.kind === 'skip') continue
          if (to.kind === 'outside') report(from, href, to.reason)
          else if (memberSet.has(to.rel)) {
            if (to.rel !== from)
              betweenMembers.push({
                page: `${root}/${from}`,
                href,
                reason: REASONS.sco,
              })
          } else if (isWritten(to.rel)) report(from, href, REASONS.page)
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

    const base = commonRoot([...files.keys()])
    const nameOf = (rel) => (base ? rel.slice(base.length + 1) : rel)
    if ([...files.keys()].some((rel) => nameOf(rel) === 'imsmanifest.xml')) {
      failures.push(
        `package '${id}': a file at its root is named imsmanifest.xml, which the package's own manifest needs`,
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
      href: nameOf(memberRels[i]),
      files: [
        memberRels[i],
        ...[...files]
          .filter(([rel, by]) => by === i && !memberSet.has(rel))
          .map(([rel]) => rel),
      ].map(nameOf),
    }))
    const bytes = await Promise.all(
      [...files.keys()].map(async (rel) => ({
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
      const buf = zip([
        ...bytes,
        {
          name: 'imsmanifest.xml',
          bytes: renderManifest({
            id,
            title,
            format,
            members: manifestMembers,
          }),
        },
      ])
      const file = `${dir}/${id}.${format}.zip`
      zips.push({ file, buf })
      results.push({
        id,
        format,
        file,
        title,
        hash: createHash('sha1').update(buf).digest('hex'),
        pages: memberRels.map((rel) => `${root}/${rel}`),
        files: bytes.length + 1,
        outside: sorted(
          format === 'scorm12'
            ? [...outside.values(), ...betweenMembers]
            : [...outside.values()],
        ),
      })
    }
  }
  // All or nothing: no zip is written until every package has been made.
  if (failures.length) return { packages: null, failures }
  for (const { file, buf } of zips) {
    const temp = `${file}.${process.pid}.tmp`
    await fs.outputFile(temp, buf)
    await fs.rename(temp, file)
    outputs?.claim?.(file, '<packages>', 'package')
  }
  results.sort((a, b) =>
    a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format),
  )
  return { packages: results, failures }
}
