// `kiss-ssg css`: how a built site partitions its CSS, read off the files on
// disk with no browser. Which stylesheets each page links and how many pages
// share each one, what PurgeCSS could remove from each against the pages that
// link it, which inline <style> blocks repeat from page to page, which rules
// are written out in more than one stylesheet, and whether the host's
// Content-Security-Policy blocks the inline blocks the pages carry. Every
// decision is a pure function here; `auditCss` is the walk and the reads, and
// `runCss` is the whole command for `bin/kiss-ssg.js` to print.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import postcss from 'postcss'
import { purgeCss } from './css-purge.js'
import { decodeEntities } from './links.js'

export const CSS_HELP = `kiss-ssg css <build-folder> [--out <file>]

Audits how a built site partitions its CSS, from the files on disk, with no
browser: the same answer on every run over the same folder.

  <build-folder>     a site's build folder (public/ by default). Build the site
                     first: css never runs the build

Prints, for every same-origin stylesheet a page links: its Brotli size, how
many pages link it, and the share of it PurgeCSS could remove against the
pages that link it and the build's scripts. Then the inline <style> blocks
(kiss's own, data-kiss-*, are left out), and the findings:

  stylesheet-one-page          a stylesheet only one page links
  inline-style-repeated        one inline block on two or more pages
  rule-duplicated              one rule written out in two or more stylesheets
  inline-style-blocked-by-csp  the _headers Content-Security-Policy blocks the
                               inline blocks the pages carry

Options:

  --out <file>       also write the audit as JSON
  --help             this text

Exits 0 when the audit ran (the findings are advice, not a verdict), and 2 on a
usage error or a target that is not a folder.`

/** How many duplicated rules the findings list before they only count. */
export const DUPLICATE_LIMIT = 50
/** How many page paths an inline block and a finding name. */
export const PAGE_SAMPLE = 3
/** How much of an inline block a finding quotes. */
export const QUOTE_LENGTH = 60

/**
 * @typedef {Object} CssArgs
 * @property {string|null} target
 * @property {string|null} out
 * @property {boolean} help
 * @property {string|null} error a usage error
 */

/**
 * @param {string[]} [argv] everything after `css`
 * @returns {CssArgs}
 */
export function parseCssArgs(argv = []) {
  /** @type {CssArgs} */
  const parsed = { target: null, out: null, help: false, error: null }
  const fail = (message) => ({ ...parsed, error: message })
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--help' || arg === '-h') return { ...parsed, help: true }
    if (arg === '--out') {
      const value = argv[at + 1]
      if (value === undefined || value.startsWith('--'))
        return fail('--out needs a value')
      parsed.out = value
      at++
      continue
    }
    if (arg.startsWith('-')) return fail(`unknown option: ${arg}`)
    if (parsed.target !== null)
      return fail(`one build folder at a time: ${parsed.target} and ${arg}`)
    parsed.target = arg
  }
  if (parsed.target === null)
    return fail('css needs a build folder: kiss-ssg css public')
  return parsed
}

/**
 * The build folder the target names, or why it is not one.
 *
 * @param {string} target
 * @param {{ cwd: string, isDirectory: (p: string) => boolean, exists: (p: string) => boolean }} where
 * @returns {{ folder: string } | { error: string }}
 */
export function resolveCssTarget(target, { cwd, isDirectory, exists }) {
  const folder = path.resolve(cwd, target)
  if (isDirectory(folder)) return { folder }
  if (exists(folder))
    return {
      error: `${target} is not a folder. css audits a build folder and never runs the build: build the site, then name its folders.build (public/ by default): kiss-ssg css public`,
    }
  return {
    error: `${target} does not exist: name a build folder (build the site first)`,
  }
}

// Each attribute of an opening tag, as a tokenizer reads it: a name inside
// another attribute's quoted value is never taken for one, and of two
// same-named attributes the first wins, as in HTML. The same reading as
// `lib/audit.js`'s, which does not export it.
const ATTRIBUTE =
  /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** @param {string} attrs @returns {Map<string, string>} */
function attributesOf(attrs) {
  /** @type {Map<string, string>} */
  const found = new Map()
  for (const match of attrs.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase()
    if (!found.has(name))
      found.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''))
  }
  return found
}

// An opening tag's attributes, quote-aware, so a `>` inside a quoted value
// does not end the tag.
const ATTRS = `((?:[^>"']|"[^"]*"|'[^']*')*)`
// One left-to-right pass over the page, so that whatever comes first wins: a
// <style> written inside a comment, a <script> string or a <template> is
// consumed as part of that and never read as a style. A <script> and a
// <style> are raw text, so their contents can hold anything up to their own
// closing tag.
const TOKENS = new RegExp(
  [
    '<!--[\\s\\S]*?(?:-->|$)',
    `<script(?=[\\s/>])${ATTRS}>[\\s\\S]*?(?:<\\/script\\s*>|$)`,
    `<template(?=[\\s/>])${ATTRS}>[\\s\\S]*?(?:<\\/template\\s*>|$)`,
    `<style(?=[\\s/>])${ATTRS}>([\\s\\S]*?)(?:<\\/style\\s*>|$)`,
    `<link(?=[\\s/>])${ATTRS}>`,
  ].join('|'),
  'gi',
)

/**
 * The stylesheet links and the inline style blocks of one page, in document
 * order. A `<link>` counts when its `rel` tokens include `stylesheet`; a
 * `<style>` counts unless it carries a `data-kiss-` attribute (kiss's own, the
 * consent theme) or sits inside a `<template>`, a `<script>` or a comment.
 *
 * @param {string} html
 * @returns {{ links: string[], inline: string[] }} the raw `href` values
 * (entities decoded) and the raw CSS text of each block
 */
export function extractStyles(html) {
  /** @type {string[]} */
  const links = []
  /** @type {string[]} */
  const inline = []
  for (const match of html.matchAll(TOKENS)) {
    const [, , , styleAttrs, styleText, linkAttrs] = match
    if (styleAttrs !== undefined) {
      const attrs = attributesOf(styleAttrs)
      if ([...attrs.keys()].some((name) => name.startsWith('data-kiss-')))
        continue
      inline.push(styleText ?? '')
    } else if (linkAttrs !== undefined) {
      const attrs = attributesOf(linkAttrs)
      const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
      const href = (attrs.get('href') ?? '').trim()
      if (rel.includes('stylesheet') && href) links.push(href)
    }
  }
  return { links, inline }
}

// A base no real link can share an origin with, so an absolute URL on any
// real host resolves as another origin.
const BASE = 'http://kiss-css-audit.invalid/'

/**
 * Where one `href` on the page at `page` (build-relative, `blog/index.html`)
 * points, resolved the way a browser resolves it against the page's URL: a
 * root-relative or relative path is a file in the build, its query and hash
 * dropped; an `http(s):` or `//` URL is another origin's stylesheet; any
 * other scheme (`data:`) is neither.
 *
 * @param {string} href
 * @param {string} page
 * @returns {{ kind: 'local', path: string } | { kind: 'third-party', url: string } | { kind: 'skip' }}
 */
export function resolveHref(href, page) {
  let url
  try {
    url = new URL(href, `${BASE}${page.split(path.sep).join('/')}`)
  } catch {
    return { kind: 'skip' }
  }
  if (url.origin === new URL(BASE).origin) {
    let pathname = url.pathname
    try {
      pathname = decodeURIComponent(pathname)
    } catch {
      /* a malformed escape is left as written */
    }
    return { kind: 'local', path: pathname.replace(/^\/+/, '') }
  }
  if (url.protocol === 'http:' || url.protocol === 'https:')
    return { kind: 'third-party', url: url.href }
  return { kind: 'skip' }
}

/**
 * An inline block as compared across pages: whitespace collapsed to one
 * space and trimmed, so the same block indented differently is the same.
 *
 * @param {string} css
 * @returns {string}
 */
export function normaliseCss(css) {
  return css.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} text
 * @returns {string} the first 16 hex digits of its SHA-256
 */
export function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * @param {string|Buffer} bytes
 * @returns {number} its size under Brotli at quality 11
 */
export function brotliSize(bytes) {
  return zlib.brotliCompressSync(bytes, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length
}

/**
 * The directive that governs a `<style>` element in one
 * Content-Security-Policy value: `style-src-elem`, else `style-src`, else
 * `default-src` (CSP Level 3's fallback order), or `null` when the policy has
 * none of them and so does not restrict styles.
 *
 * @param {string} policy
 * @returns {string|null} the directive as written, whitespace collapsed
 */
export function styleDirective(policy) {
  /** @type {Map<string, string>} */
  const directives = new Map()
  for (const part of policy.split(';')) {
    const text = part.trim().replace(/\s+/g, ' ')
    if (!text) continue
    const name = text.split(' ')[0].toLowerCase()
    // The first of two same-named directives is the one a browser applies.
    if (!directives.has(name)) directives.set(name, text)
  }
  for (const name of ['style-src-elem', 'style-src', 'default-src'])
    if (directives.has(name)) return directives.get(name) ?? null
  return null
}

/**
 * The directives in a `_headers` file (Netlify's and Cloudflare Pages'
 * format) that block inline `<style>` blocks: every
 * `Content-Security-Policy:` line under any path, whose governing style
 * directive has no `'unsafe-inline'`. Read simply: the path a rule applies
 * to is not matched against the pages.
 *
 * @param {string} text
 * @returns {string[]} the distinct blocking directives, sorted
 */
export function inlineStyleBlockers(text) {
  const blockers = new Set()
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*Content-Security-Policy\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const directive = styleDirective(match[1])
    if (directive && !/'unsafe-inline'/i.test(directive))
      blockers.add(directive)
  }
  return [...blockers].sort()
}

/**
 * @typedef {Object} DuplicateRule
 * @property {string} selector the selector list, whitespace normalised
 * @property {string|null} context the enclosing at-rules (and, under CSS
 * nesting, rules), outermost first: `@media (min-width:600px)`
 * @property {string[]} files the stylesheets it is written in, sorted
 */

const collapse = (/** @type {string} */ text) =>
  text.replace(/\s+/g, ' ').trim()
const normaliseSelector = (/** @type {string} */ selector) =>
  collapse(selector).replace(/\s*,\s*/g, ',')
// At-rule params and declaration values as compared: also without the
// whitespace beside `,` `:` `(` `)`, so a minified copy of a rule and a
// formatted one (`(min-width:600px)`, `(min-width: 600px)`) are one rule.
// Not for selectors, where `.a :hover` and `.a:hover` differ.
const tight = (/** @type {string} */ text) =>
  collapse(text).replace(/\s*([,:()])\s*/g, '$1')

/**
 * Every rule written out in two or more different stylesheets: the same
 * selector list with the same declarations in the same order, inside the same
 * enclosing at-rules, all compared with whitespace normalised. A rule written
 * twice in one stylesheet is not a duplicate across stylesheets.
 *
 * @param {{ path: string, css: string }[]} sheets
 * @param {{ limit?: number }} [options]
 * @returns {{ total: number, listed: DuplicateRule[], errors: { path: string, message: string }[] }}
 * `listed` is the first `limit` by context, selector and files
 */
export function findDuplicateRules(sheets, { limit = DUPLICATE_LIMIT } = {}) {
  /** @type {Map<string, { selector: string, context: string|null, files: Set<string> }>} */
  const rules = new Map()
  const errors = []
  for (const sheet of sheets) {
    let root
    try {
      root = postcss.parse(sheet.css, { from: undefined })
    } catch (err) {
      errors.push({ path: sheet.path, message: err.message })
      continue
    }
    root.walkRules((rule) => {
      const declarations = (rule.nodes ?? [])
        .filter((node) => node.type === 'decl')
        .map(
          (decl) =>
            `${decl.prop.toLowerCase()}:${tight(decl.value)}${decl.important ? '!important' : ''}`,
        )
      if (declarations.length === 0) return
      // Each enclosing at-rule or rule, as shown and as compared.
      const context = []
      const contextKey = []
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule') {
          context.unshift(collapse(`@${parent.name} ${parent.params}`))
          contextKey.unshift(
            `@${parent.name.toLowerCase()} ${tight(parent.params)}`,
          )
        } else if (parent.type === 'rule') {
          context.unshift(normaliseSelector(parent.selector))
          contextKey.unshift(normaliseSelector(parent.selector))
        } else break
      }
      const selector = normaliseSelector(rule.selector)
      const key = JSON.stringify([contextKey, selector, declarations])
      const entry = rules.get(key) ?? {
        selector,
        context: context.length ? context.join(' ') : null,
        files: new Set(),
      }
      entry.files.add(sheet.path)
      rules.set(key, entry)
    })
  }
  const duplicates = [...rules.values()]
    .filter((entry) => entry.files.size >= 2)
    .map((entry) => ({
      selector: entry.selector,
      context: entry.context,
      files: [...entry.files].sort(),
    }))
    .sort(
      (a, b) =>
        compare(a.context ?? '', b.context ?? '') ||
        compare(a.selector, b.selector) ||
        compare(a.files.join('\n'), b.files.join('\n')),
    )
  return {
    total: duplicates.length,
    listed: duplicates.slice(0, limit),
    errors: errors.sort((a, b) => compare(a.path, b.path)),
  }
}

/** Code-unit order, never the locale's, so two machines sort alike. */
function compare(/** @type {string} */ a, /** @type {string} */ b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * @typedef {Object} StylesheetEntry
 * @property {string} path build-relative
 * @property {number} pages how many pages link it
 * @property {boolean} missing a page links it and the build has no such file
 * @property {number|null} bytes
 * @property {number|null} brotli
 * @property {{ bytes: number, brotli: number }|null} purged its size once
 * PurgeCSS has removed what the pages that link it and the build's scripts
 * never use
 * @property {number|null} removable the share of its Brotli size the purge
 * removes, 0 to 1, to three places
 * @property {string|null} error why it could not be purged
 */

/**
 * @typedef {Object} InlineEntry
 * @property {string} hash of the normalised block
 * @property {number} bytes of the normalised block
 * @property {number} pages how many pages carry it
 * @property {string[]} paths up to three of them, sorted
 * @property {string} text the normalised block
 */

/**
 * @typedef {Object} Finding
 * @property {'stylesheet-one-page'|'inline-style-repeated'|'rule-duplicated'|'inline-style-blocked-by-csp'} check
 * @property {string} detail
 * @property {string[]} [pages]
 * @property {string[]} [files]
 */

/**
 * The share of `before` that `after` removes, to three places.
 *
 * @param {number} before
 * @param {number} after
 * @returns {number}
 */
export function removableShare(before, after) {
  if (before <= 0) return 0
  return Math.round(((before - after) / before) * 1000) / 1000
}

/**
 * Every finding, sorted by check and then detail.
 *
 * @param {Object} input
 * @param {number} input.pages how many pages the build has
 * @param {{ path: string, pages: string[] }[]} input.stylesheets each linked
 * stylesheet and the pages that link it
 * @param {{ text: string, pages: string[] }[]} input.inline each distinct
 * inline block and the pages that carry it
 * @param {{ total: number, listed: DuplicateRule[] }} input.duplicates
 * @param {string[]} input.blockers the CSP directives that block inline blocks
 * @returns {Finding[]}
 */
export function buildFindings({
  pages,
  stylesheets,
  inline,
  duplicates,
  blockers,
}) {
  /** @type {Finding[]} */
  const findings = []
  if (pages >= 2)
    for (const sheet of stylesheets)
      if (sheet.pages.length === 1)
        findings.push({
          check: 'stylesheet-one-page',
          detail: sheet.path,
          pages: [...sheet.pages],
        })
  for (const block of inline)
    if (block.pages.length >= 2)
      findings.push({
        check: 'inline-style-repeated',
        detail: `${quote(block.text)} (${block.pages.length} pages)`,
        pages: [...block.pages].sort().slice(0, PAGE_SAMPLE),
      })
  for (const rule of duplicates.listed)
    findings.push({
      check: 'rule-duplicated',
      detail: rule.context ? `${rule.context} ${rule.selector}` : rule.selector,
      files: [...rule.files],
    })
  if (duplicates.total > duplicates.listed.length)
    findings.push({
      check: 'rule-duplicated',
      detail: `${duplicates.total} duplicated rules in all; the first ${duplicates.listed.length} are listed`,
    })
  const carriers = inline.flatMap((block) => block.pages)
  if (carriers.length > 0)
    for (const directive of blockers)
      findings.push({
        check: 'inline-style-blocked-by-csp',
        detail: directive,
        pages: [...new Set(carriers)].sort().slice(0, PAGE_SAMPLE),
      })
  return findings.sort(
    (a, b) => compare(a.check, b.check) || compare(a.detail, b.detail),
  )
}

function quote(/** @type {string} */ text) {
  return text.length > QUOTE_LENGTH ? `${text.slice(0, QUOTE_LENGTH)}…` : text
}

/**
 * @typedef {Object} CssAudit
 * @property {1} version
 * @property {number} pages
 * @property {StylesheetEntry[]} stylesheets sorted by path
 * @property {{ url: string, pages: number }[]} thirdParty sorted by URL
 * @property {InlineEntry[]} inline most pages first, then largest, then hash
 * @property {Finding[]} findings
 */

/**
 * The audit as the table on stdout.
 *
 * @param {CssAudit} audit
 * @returns {string}
 */
export function formatCssAudit(audit) {
  const lines = [
    `kiss-ssg css: ${audit.pages} page${audit.pages === 1 ? '' : 's'}, ${audit.stylesheets.length} stylesheet${audit.stylesheets.length === 1 ? '' : 's'}, ${audit.thirdParty.length} third-party`,
    '',
  ]
  if (audit.stylesheets.length) {
    const rows = audit.stylesheets.map((sheet) => [
      sheet.path,
      sheet.missing
        ? 'missing'
        : sheet.brotli === null
          ? '-'
          : (sheet.brotli / 1024).toFixed(1),
      String(sheet.pages),
      sheet.removable === null
        ? sheet.error
          ? 'error'
          : '-'
        : `${Math.round(sheet.removable * 100)}%`,
    ])
    const header = ['Stylesheet', 'KB br', 'Pages', 'Removable']
    const widths = header.map((h, at) =>
      Math.max(h.length, ...rows.map((row) => row[at].length)),
    )
    const row = (/** @type {string[]} */ cells) =>
      cells
        .map((cell, at) =>
          at === 0 ? cell.padEnd(widths[at]) : cell.padStart(widths[at]),
        )
        .join('  ')
        .trimEnd()
    lines.push(row(header), ...rows.map(row), '')
  } else lines.push('No same-origin stylesheets.', '')
  for (const party of audit.thirdParty)
    lines.push(
      `Third-party: ${party.url} (${party.pages} page${party.pages === 1 ? '' : 's'})`,
    )
  if (audit.thirdParty.length) lines.push('')
  const repeated = audit.inline.filter((block) => block.pages >= 2).length
  lines.push(
    `Inline <style> blocks: ${audit.inline.length} distinct, ${repeated} on two or more pages`,
    '',
  )
  if (audit.findings.length === 0) lines.push('Findings: none')
  else {
    lines.push(`Findings (${audit.findings.length}):`)
    for (const finding of audit.findings) {
      const where = finding.files ?? finding.pages ?? []
      lines.push(
        `  ${finding.check}  ${finding.detail}${where.length ? `  [${where.join(', ')}]` : ''}`,
      )
    }
  }
  return lines.join('\n')
}

/**
 * The build's files by kind, build-relative with `/`, sorted; `node_modules`
 * anywhere in the tree is skipped.
 *
 * @param {string} root
 * @returns {{ pages: string[], scripts: string[] }}
 */
function walkBuild(root) {
  const pages = []
  const scripts = []
  for (const entry of fs.readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue
    const rel = path
      .relative(root, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join('/')
    if (rel.split('/').includes('node_modules')) continue
    if (/\.html$/i.test(entry.name)) pages.push(rel)
    else if (/\.m?js$/i.test(entry.name)) scripts.push(rel)
  }
  return { pages: pages.sort(compare), scripts: scripts.sort(compare) }
}

/**
 * The audit of the build folder at `root`.
 *
 * @param {string} root
 * @param {{ purge?: typeof purgeCss }} [options] `purge` is injectable for tests
 * @returns {Promise<CssAudit>}
 */
export async function auditCss(root, { purge = purgeCss } = {}) {
  const walked = walkBuild(root)
  const read = (/** @type {string} */ rel) =>
    fs.readFileSync(path.join(root, rel), 'utf8')
  /** @type {Map<string, string>} */
  const html = new Map(walked.pages.map((page) => [page, read(page)]))
  const scripts = walked.scripts.map(read)

  /** @type {Map<string, Set<string>>} */
  const linkedBy = new Map()
  /** @type {Map<string, Set<string>>} */
  const thirdParty = new Map()
  /** @type {Map<string, { text: string, pages: Set<string> }>} */
  const blocks = new Map()
  const add = (
    /** @type {Map<string, Set<string>>} */ map,
    /** @type {string} */ key,
    /** @type {string} */ page,
  ) => map.set(key, (map.get(key) ?? new Set()).add(page))
  for (const [page, text] of html) {
    const { links, inline } = extractStyles(text)
    for (const href of links) {
      const target = resolveHref(href, page)
      if (target.kind === 'local') add(linkedBy, target.path, page)
      else if (target.kind === 'third-party') add(thirdParty, target.url, page)
    }
    for (const raw of inline) {
      const normal = normaliseCss(raw)
      if (!normal) continue
      const hash = hashText(normal)
      const block = blocks.get(hash) ?? { text: normal, pages: new Set() }
      block.pages.add(page)
      blocks.set(hash, block)
    }
  }

  /** @type {StylesheetEntry[]} */
  const stylesheets = []
  const sheetsForDuplicates = []
  for (const sheetPath of [...linkedBy.keys()].sort(compare)) {
    const pages = [...(linkedBy.get(sheetPath) ?? [])].sort(compare)
    const file = path.join(root, sheetPath)
    const exists = fs.existsSync(file) && fs.statSync(file).isFile()
    /** @type {StylesheetEntry} */
    const entry = {
      path: sheetPath,
      pages: pages.length,
      missing: !exists,
      bytes: null,
      brotli: null,
      purged: null,
      removable: null,
      error: null,
    }
    if (exists) {
      const css = fs.readFileSync(file, 'utf8')
      sheetsForDuplicates.push({ path: sheetPath, css })
      entry.bytes = Buffer.byteLength(css)
      entry.brotli = brotliSize(css)
      try {
        const purged = await purge(css, {
          html: pages.map((page) => html.get(page) ?? ''),
          scripts,
          safelist: [],
        })
        const purgedBrotli = brotliSize(purged)
        entry.purged = {
          bytes: Buffer.byteLength(purged),
          brotli: purgedBrotli,
        }
        entry.removable = removableShare(entry.brotli, purgedBrotli)
      } catch (err) {
        entry.error = err.message
      }
    }
    stylesheets.push(entry)
  }

  const duplicates = findDuplicateRules(sheetsForDuplicates)
  for (const { path: sheetPath, message } of duplicates.errors) {
    const entry = stylesheets.find((sheet) => sheet.path === sheetPath)
    if (entry && !entry.error) entry.error = message
  }
  const headers = path.join(root, '_headers')
  const blockers = fs.existsSync(headers)
    ? inlineStyleBlockers(fs.readFileSync(headers, 'utf8'))
    : []

  const inlineBlocks = [...blocks.entries()].map(([hash, block]) => ({
    hash,
    text: block.text,
    pages: [...block.pages].sort(compare),
  }))
  return {
    version: 1,
    pages: walked.pages.length,
    stylesheets,
    thirdParty: [...thirdParty.entries()]
      .map(([url, pages]) => ({ url, pages: pages.size }))
      .sort((a, b) => compare(a.url, b.url)),
    inline: inlineBlocks
      .map((block) => ({
        hash: block.hash,
        bytes: Buffer.byteLength(block.text),
        pages: block.pages.length,
        paths: block.pages.slice(0, PAGE_SAMPLE),
        text: block.text,
      }))
      .sort(
        (a, b) =>
          b.pages - a.pages || b.bytes - a.bytes || compare(a.hash, b.hash),
      ),
    findings: buildFindings({
      pages: walked.pages.length,
      stylesheets: stylesheets.map((sheet) => ({
        path: sheet.path,
        pages: [...(linkedBy.get(sheet.path) ?? [])].sort(compare),
      })),
      inline: inlineBlocks,
      duplicates,
      blockers,
    }),
  }
}

/**
 * The whole command: `{ code, out, err }` for `bin/kiss-ssg.js` to print.
 *
 * @param {string[]} argv everything after `css`
 * @param {{ cwd?: string, purge?: typeof purgeCss }} [options]
 * @returns {Promise<{ code: number, out: string, err: string }>}
 */
export async function runCss(argv, { cwd = process.cwd(), purge } = {}) {
  const args = parseCssArgs(argv)
  if (args.help) return { code: 0, out: CSS_HELP, err: '' }
  const usage = (/** @type {string} */ message) => ({
    code: 2,
    out: '',
    err: `kiss-ssg css: ${message}\n\n${CSS_HELP}`,
  })
  if (args.error || args.target === null)
    return usage(args.error ?? 'no target')
  const target = resolveCssTarget(args.target, {
    cwd,
    isDirectory: (p) => fs.existsSync(p) && fs.statSync(p).isDirectory(),
    exists: (p) => fs.existsSync(p),
  })
  if ('error' in target) return usage(target.error)
  const audit = await auditCss(target.folder, { purge })
  const errors = []
  let code = 0
  if (args.out) {
    const file = path.resolve(cwd, args.out)
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(audit, null, 2)}\n`)
    } catch (err) {
      errors.push(`kiss-ssg css: could not write ${args.out} (${err.message})`)
      code = 1
    }
  }
  return { code, out: formatCssAudit(audit), err: errors.join('\n') }
}
