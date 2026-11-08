import fs from 'fs-extra'
import path from 'node:path'
import { Parser } from 'htmlparser2'
import { contentHash, hashedName } from './asset-manifest.js'
import { minifyText } from './asset-minify.js'
import { posixPath } from './utils.js'

// Removes the CSS no written page uses from the stylesheets a site names in
// `assets.purge.files`, with PurgeCSS, against the HTML this build actually
// wrote: every class a page really carries, whether it came from a template,
// a model, a helper or a partial. The site's own scripts are scanned too, for
// the classes they add at run time, and `safelist` keeps the rest.
//
// It runs at the settle, once every page is written, and before the cache
// headers, so a hashed stylesheet is re-hashed for its purged bytes and every
// page that linked the old name is rewritten to the new one. The decisions
// are here; `lib/build-finish.js` decides when, and the pages rewrite their
// own bytes (`KissPage.replaceInOutput`).

/**
 * The purge block (`config.assets.purge`), resolved.
 *
 * @typedef {Object} KissPurge
 * @property {string[]} files the stylesheets to purge, by the path a template
 * asks for (`css/bootstrap.css`)
 * @property {(string|RegExp)[]} [safelist] selectors PurgeCSS always keeps:
 * the classes a script adds that no file spells out (default none)
 * @property {boolean} [scripts] also scan the build's `.js` files for class
 * names (default `true`)
 */

/**
 * One stylesheet purged.
 *
 * @typedef {Object} PurgeResult
 * @property {string} name the path a template asks for
 * @property {string} from the build-relative output before the purge
 * @property {string} to the build-relative output after it (the same when
 * the build does not hash)
 * @property {number} before bytes
 * @property {number} after bytes
 */

/**
 * `assets.purge` as given, checked and filled in. `null` (the default) and
 * `false` purge nothing.
 *
 * @param {*} purge
 * @returns {KissPurge|null}
 * @throws if it is not `null`, `false` or an object with a non-empty `files`
 * list of strings, if `safelist` is not a list of strings and RegExps, or if
 * `scripts` is not a boolean
 */
export function resolvePurge(purge) {
  if (purge === undefined || purge === null || purge === false) return null
  if (typeof purge !== 'object' || Array.isArray(purge))
    throw new Error(
      `config.assets.purge must be null, false or { files: [...], safelist: [...] } (received ${JSON.stringify(purge)})`,
    )
  const { files, safelist = [], scripts = true } = purge
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((f) => typeof f === 'string' && f !== '')
  )
    throw new Error(
      `config.assets.purge.files must be a non-empty list of stylesheet paths, as a template asks for them ('css/bootstrap.css') (received ${JSON.stringify(files)})`,
    )
  if (
    !Array.isArray(safelist) ||
    !safelist.every((s) => typeof s === 'string' || s instanceof RegExp)
  )
    throw new Error(
      'config.assets.purge.safelist must be a list of class names and regular expressions',
    )
  if (typeof scripts !== 'boolean')
    throw new Error(
      `config.assets.purge.scripts must be true or false (received ${JSON.stringify(scripts)})`,
    )
  return {
    files: files.map((f) => posixPath(f).replace(/^\/+/, '')),
    safelist: [...safelist],
    scripts,
  }
}

/**
 * The build's `.js` files, for the class names a script adds.
 *
 * @param {string} root
 * @returns {Promise<string[]>} absolute paths
 */
async function buildScripts(root) {
  return buildFiles(root, /\.m?js$/i)
}

/**
 * Every file under the build folder whose name matches.
 *
 * @param {string} root
 * @param {RegExp} pattern
 * @returns {Promise<string[]>}
 */
async function buildFiles(root, pattern) {
  const entries = await fs.promises.readdir(root, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((e) => e.isFile() && pattern.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
}

// A class token runs to the next whitespace, quote, backtick or angle bracket,
// and does not end in `:` (Tailwind's own rule): `bg-ink-900/80`,
// `min-h-[60vh]`, `p-1.5`, `hover:bg-brand-700`, `[&_p]:mb-6`. PurgeCSS's
// default, /[A-Za-z0-9_-]+/g, cut every one of those into pieces that are not
// the class, so each was removed from a site that used it (issue #78).
const WHOLE_TOKEN = /[^<>"'`\s]*[^<>"'`\s:]/g
const PIECE = /[A-Za-z0-9_-]+/g

// Attributes a script changes after the page loads, so their value in the
// written markup says nothing about the values a rule will meet. PurgeCSS
// already keeps `value`, `checked`, `selected` and `open` this way. These
// join them: the ARIA states, plus the HTML attributes scripts toggle. Without
// them, a disclosure button written `aria-expanded="false"` lost its
// `aria-expanded:rotate-180` rule (`[aria-expanded=true]`), because `true`
// appeared nowhere in the content.
export const DYNAMIC_ATTRIBUTES = [
  'aria-busy',
  'aria-checked',
  'aria-current',
  'aria-disabled',
  'aria-expanded',
  'aria-hidden',
  'aria-invalid',
  'aria-pressed',
  'aria-selected',
  'disabled',
  'hidden',
  'inert',
]

/**
 * Every candidate class name in a page or a script, for PurgeCSS.
 *
 * Three sets, joined:
 * - **The whole tokens.** These keep the classes that hold `/ [ ] . :`.
 * - **What follows each `=` in a token.** An unquoted attribute
 *   (`class=bg-ink-900/80`) is one token with its name in front.
 * - **The pieces PurgeCSS's default extractor finds.** With these, nothing
 *   the old extractor kept is ever removed now: a script's
 *   `{active:true}` still keeps `.active`.
 *
 * Extra candidates can only keep a rule that is not needed. A missing one
 * breaks a page, so the set errs towards keeping.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function classTokens(content) {
  const tokens = new Set(content.match(PIECE))
  for (const token of content.match(WHOLE_TOKEN) ?? []) {
    tokens.add(token)
    // `class="[&amp;_p]:mb-6"` is the class `[&_p]:mb-6` to a browser.
    if (token.includes('&')) tokens.add(decodeEntities(token))
    let at = token.indexOf('=')
    while (at !== -1) {
      if (at + 1 < token.length) tokens.add(token.slice(at + 1))
      at = token.indexOf('=', at + 1)
    }
  }
  return [...tokens]
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * The character references an attribute value can carry, decoded: the five
 * named ones and every numeric one. Enough for a class name; anything else
 * is left as written.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] !== '#') return NAMED_ENTITIES[ref.toLowerCase()] ?? whole
    const code =
      ref[1] === 'x' || ref[1] === 'X'
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/**
 * The classes written into `class` attributes, decoded, each with its first
 * page. These are classes an element really carries, unlike `classTokens`,
 * which is every word that might be one. Parsed, not matched, so `class = y`
 * in a sentence is not an attribute.
 *
 * @param {{ page: string, html: string }[]} pages
 * @returns {Map<string, string>} class → the first page that uses it
 */
export function pageClasses(pages) {
  /** @type {Map<string, string>} */
  const used = new Map()
  for (const { page, html } of pages) {
    const parser = new Parser({
      onopentag(_name, attribs) {
        for (const cls of (attribs.class ?? '').split(/\s+/))
          if (cls && !used.has(cls)) used.set(cls, page)
      },
    })
    parser.write(html)
    parser.end()
  }
  return used
}

/**
 * The class names in one selector, unescaped. Strings and attribute
 * selectors are skipped, so `[href$=".pdf"]` names no class.
 *
 * @param {string} selector
 * @returns {string[]}
 */
export function selectorClasses(selector) {
  const classes = []
  let i = 0
  const n = selector.length
  // One identifier from `i`, CSS escapes decoded (`\/`, `\[`, `\31 `).
  const ident = () => {
    let out = ''
    while (i < n) {
      const c = selector[i]
      if (c === '\\') {
        const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(selector.slice(i + 1))
        if (hex) {
          out += String.fromCodePoint(parseInt(hex[0].trim(), 16))
          i += 1 + hex[0].length
        } else {
          out += selector[i + 1] ?? ''
          i += 2
        }
      } else if (/[\w-]/.test(c) || c.charCodeAt(0) > 0x7f) {
        out += c
        i++
      } else break
    }
    return out
  }
  while (i < n) {
    const c = selector[i]
    if (c === '\\') i += 2
    else if (c === '"' || c === "'") {
      i++
      while (i < n && selector[i] !== c) i += selector[i] === '\\' ? 2 : 1
      i++
    } else if (c === '[') {
      i++
      while (i < n && selector[i] !== ']') {
        if (selector[i] === '"' || selector[i] === "'") {
          const q = selector[i++]
          while (i < n && selector[i] !== q) i += selector[i] === '\\' ? 2 : 1
        }
        i += selector[i] === '\\' ? 2 : 1
      }
      i++
    } else if (c === '.') {
      i++
      const name = ident()
      if (name) classes.push(name)
    } else i++
  }
  return classes
}

/**
 * Every selector in a stylesheet, each with its classes. Keyframe stops are
 * not selectors, so `@keyframes` is skipped.
 *
 * @param {string} css
 * @returns {Promise<string[][]>} one list of classes per selector
 */
async function stylesheetSelectors(css) {
  // Loaded when a site purges, like PurgeCSS below, for the same reason.
  const { default: postcss } = await import('postcss')
  /** @type {string[][]} */
  const out = []
  postcss.parse(css).walkRules((rule) => {
    const parent = rule.parent
    if (
      parent?.type === 'atrule' &&
      /keyframes$/i.test(/** @type {import('postcss').AtRule} */ (parent).name)
    )
      return
    for (const selector of rule.selectors) out.push(selectorClasses(selector))
  })
  return out
}

/**
 * A class a page carries whose every rule the purge removed.
 *
 * @typedef {Object} PurgeLoss
 * @property {string} class the class, as the page writes it
 * @property {string} page the first page that carries it
 */

/**
 * The classes the purge took from the pages that carry them: a class written
 * in a page's `class` attribute, for which the stylesheet had at least one
 * selector the pages could match, and the purged stylesheet has no selector
 * at all. "Could match" means every class in that selector appears somewhere
 * in the content, so `.card .title` on a site with no `.card` was rightly
 * removed and is not a loss. A class that keeps any rule is not one either:
 * a framework component whose unused variants were removed is the purge
 * working.
 *
 * @param {Object} input
 * @param {string} input.before the stylesheet before the purge
 * @param {string} input.after the stylesheet after it
 * @param {Map<string, string>} input.used from `pageClasses`
 * @param {Set<string>} input.tokens `classTokens` over every page and script
 * @returns {Promise<PurgeLoss[]>}
 */
export async function purgeLosses({ before, after, used, tokens }) {
  const kept = new Set((await stylesheetSelectors(after)).flat())
  const matchable = new Set()
  for (const classes of await stylesheetSelectors(before))
    if (classes.every((cls) => tokens.has(cls)))
      for (const cls of classes) matchable.add(cls)
  /** @type {PurgeLoss[]} */
  const losses = []
  for (const [cls, page] of used)
    if (matchable.has(cls) && !kept.has(cls)) losses.push({ class: cls, page })
  return losses
}

/**
 * A safelist entry as a PurgeCSS `greedy` pattern: a RegExp as given, a
 * string as the exact name.
 *
 * @param {string|RegExp} entry
 * @returns {RegExp}
 */
function greedyPattern(entry) {
  if (entry instanceof RegExp) return entry
  return new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

/**
 * Purge one stylesheet's CSS against the given HTML and scripts.
 *
 * @param {string} css
 * @param {{ html: string[], scripts: string[], safelist: (string|RegExp)[] }} content
 * @returns {Promise<string>}
 */
export async function purgeCss(css, { html, scripts, safelist }) {
  // Loaded when a site purges, never before: `lib/config.js` imports this
  // module on every build, and PurgeCSS brings PostCSS with it.
  const { PurgeCSS } = await import('purgecss')
  const result = await new PurgeCSS().purge({
    content: [
      ...html.map((raw) => ({ raw, extension: 'html' })),
      ...scripts.map((raw) => ({ raw, extension: 'js' })),
    ],
    css: [{ raw: css }],
    defaultExtractor: classTokens,
    dynamicAttributes: DYNAMIC_ATTRIBUTES,
    // `standard` keeps a selector part the safelist names, but still checks
    // the rest, so `safelist: ['btn']` lost `.btn[data-size=xl]` on a page
    // with no `data-size="xl"`. `greedy` keeps any rule with a part it names,
    // which is what "keep this class" means to the person who wrote it.
    safelist: { standard: safelist, greedy: safelist.map(greedyPattern) },
  })
  return result[0]?.css ?? css
}

/**
 * Purge every stylesheet `purge.files` names, in the build at `root`.
 * Writes the purged bytes, re-hashed under `hash`, and moves the manifest's
 * name to the new output. It does not touch a page: the caller rewrites each
 * page from `from` to `to`.
 *
 * @param {Object} input
 * @param {KissPurge} input.purge
 * @param {string} input.root where the build is being written
 * @param {{ lookup(name: string): string|null, retarget(name: string, output: string): void }} input.manifest
 * @param {string[]} input.pages the written HTML pages, absolute paths
 * @param {boolean} input.hash `assets.hash`
 * @param {boolean} input.minify `assets.minify`
 * @param {{ owner(file: string): string|null, release(file: string, owner: string): void, claim(file: string, owner: string, kind?: any): void }} [input.outputs]
 * @returns {Promise<PurgeResult[]>}
 * @throws when a named stylesheet is not in the build, or PurgeCSS fails
 */
export async function purgeStylesheets({
  purge,
  root,
  manifest,
  pages,
  hash,
  minify,
  outputs = undefined,
}) {
  // The rendered pages, and every other .html file in the build: one copied
  // from the assets folder, or kept from an earlier build under
  // `cleanBuild: false`, uses the stylesheet too, and its classes were purged
  // when only the rendered pages were read (Codex at the close, 2026-11-05).
  const files = new Set([
    ...pages.map((file) => path.resolve(file)),
    ...(await buildFiles(root, /\.html?$/i)).map((file) => path.resolve(file)),
  ])
  const pageList = await Promise.all(
    [...files].map(async (file) => ({
      page: posixPath(path.relative(root, file)),
      html: await fs.readFile(file, 'utf8'),
    })),
  )
  const html = pageList.map((p) => p.html)
  const scripts = purge.scripts
    ? await Promise.all(
        (await buildScripts(root)).map((file) => fs.readFile(file, 'utf8')),
      )
    : []
  const used = pageClasses(pageList)
  const tokens = new Set([...html, ...scripts].flatMap(classTokens))

  // Every stylesheet is purged and checked before any is written, so a purge
  // that would break a page leaves the build's stylesheets as they were.
  const purged = []
  /** @type {string[]} */
  const lost = []
  for (const name of purge.files) {
    const from = manifest.lookup(name)
    if (!from)
      throw new Error(
        `assets.purge: ${name} is not in the build — name it as a template asks for it ({{asset "${name}"}})`,
      )
    const fromFile = path.join(root, from)
    const css = await fs.readFile(fromFile, 'utf8')
    const out = await purgeCss(css, { html, scripts, safelist: purge.safelist })
    for (const loss of await purgeLosses({
      before: css,
      after: out,
      used,
      tokens,
    }))
      lost.push(`${loss.class} (${name}, used on ${loss.page})`)
    purged.push({ name, from, fromFile, css, out })
  }
  if (lost.length > 0) {
    const shown = lost.slice(0, 10)
    throw new Error(
      `assets.purge removed every rule for ${lost.length} class${lost.length === 1 ? '' : 'es'} the pages use, so they would lose their styles: ` +
        `${shown.join('; ')}${lost.length > shown.length ? `; and ${lost.length - shown.length} more` : ''}. ` +
        'Keep each with assets.purge.safelist (a string, or a RegExp for a family). ' +
        'If the class is written in the page as it is, kiss read it wrongly: report it with `npx kiss-ssg issue`.',
    )
  }

  /** @type {PurgeResult[]} */
  const results = []
  for (const { name, from, fromFile, css, out: purgedCss } of purged) {
    let out = purgedCss
    if (minify) out = await minifyText(name, out).catch(() => out)
    const renamed = hash && from !== name
    const to = renamed ? hashedName(name, contentHash(out)) : from
    const toFile = path.join(root, to)
    await fs.outputFile(toFile, out)
    if (to !== from) {
      const owner = outputs?.owner(fromFile) ?? null
      await fs.remove(fromFile)
      if (outputs && owner) {
        outputs.release(fromFile, owner)
        outputs.claim(toFile, owner, 'asset')
      }
      manifest.retarget(name, to)
    }
    results.push({
      name,
      from,
      to,
      before: Buffer.byteLength(css),
      after: Buffer.byteLength(out),
    })
  }
  return results
}
