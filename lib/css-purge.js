import fs from 'fs-extra'
import path from 'node:path'
import { Parser } from 'htmlparser2'
import { contentHash, hashedName } from './asset-manifest.js'
import { minifyText } from './asset-minify.js'
import { decodeEntities } from './links.js'
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
// except inside `[…]`, where Tailwind allows quotes and `>`
// (`before:content-['']`, `[&>svg]:size-4`), and `classTokens` trims any `:`
// it ends in: `bg-ink-900/80`, `min-h-[60vh]`, `p-1.5`, `hover:bg-brand-700`,
// `[&_p]:mb-6`. PurgeCSS's default, /[A-Za-z0-9_-]+/g, cut every one of those
// into pieces that are not the class, so each was removed from a site that
// used it (issue #78).
//
// Linear on any input, which is why it has this shape: a bracket group holds
// at most one nested group (`[&[open]]`) and never runs past whitespace or the
// next `[`, and the trailing `:` is trimmed after the match rather than refused
// inside it. The first version did both inside the pattern and took half a
// second on 20,000 `:` or `[` in a row (the review of 2026-11-08), which a
// minified bundle can hold.
const BRACKET = String.raw`\[(?:[^\]\s[]|\[[^\]\s[]*\])*\]`
const WHOLE_TOKEN = new RegExp(String.raw`(?:${BRACKET}|[^<>"'\`\s[])+`, 'g')
const PIECE = /[A-Za-z0-9_-]+/g
// An unquoted attribute (`class=bg-ink-900/80`) is one token with its name in
// front. Its value cannot hold `=`, so only the first one is a split point.
const UNQUOTED_ATTRIBUTE = /^[\w:.-]+=(.+)$/s

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
 * It is a heuristic for the classes a script names. The classes a page's
 * markup carries do not depend on it: `purgeCss` hands PurgeCSS those
 * exactly (`attributeClasses`). Three sets, joined:
 * - **The whole tokens.** These keep the classes that hold `/ [ ] . :`.
 * - **The value of an unquoted attribute** (`class=bg-ink-900/80`).
 * - **The pieces PurgeCSS's default extractor finds.** With these, nothing
 *   the old extractor kept is ever removed now: a script's `{active:true}`
 *   still keeps `.active`.
 *
 * A token holding a character reference is read again decoded: Handlebars
 * writes `{"open":"bg-ink-900/80"}` into an attribute as
 * `{&quot;open&quot;:&quot;bg-ink-900/80&quot;}`, which is one token until
 * the quotes come back.
 *
 * Extra candidates can only keep a rule that is not needed. A missing one
 * breaks a page, so the set errs towards keeping.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function classTokens(content) {
  const tokens = new Set(content.match(PIECE))
  /** @param {string} text @param {boolean} decoded */
  const read = (text, decoded) => {
    for (const match of text.match(WHOLE_TOKEN) ?? []) {
      // A loop, not /:+$/, which rescans a run of `:` from every start.
      let end = match.length
      while (end > 0 && match[end - 1] === ':') end--
      if (end === 0) continue
      const token = match.slice(0, end)
      tokens.add(token)
      const value = UNQUOTED_ATTRIBUTE.exec(token)?.[1]
      if (value) tokens.add(value)
      if (!decoded && token.includes('&')) {
        const plain = decodeEntities(token)
        if (plain !== token) {
          for (const piece of plain.match(PIECE) ?? []) tokens.add(piece)
          read(plain, true)
        }
      }
    }
  }
  read(content, false)
  return [...tokens]
}

/**
 * The classes written into the pages' `class` attributes, decoded. These are
 * the classes an element really carries, unlike `classTokens`, which is every
 * word that might be one. Parsed with htmlparser2, never matched, so
 * `class = y` in a sentence is not an attribute and `[&>svg]:size-4` is one
 * class.
 *
 * @param {string[]} html
 * @returns {string[]}
 */
export function attributeClasses(html) {
  /** @type {Set<string>} */
  const classes = new Set()
  for (const page of html) {
    const parser = new Parser({
      onopentag(_name, attribs) {
        for (const cls of (attribs.class ?? '').split(/\s+/))
          if (cls) classes.add(cls)
      },
    })
    parser.write(page)
    parser.end()
  }
  return [...classes]
}

/**
 * What `purgeCss` reads from content, remembered for one run.
 *
 * @typedef {Object} PurgeReads
 * @property {Map<string, string[]>} tokens `classTokens` per page or script
 * @property {Map<string, string[]>} classes `attributeClasses` per page
 */

/**
 * A fresh memory for one run of purges: one build's `purgeStylesheets`, or
 * one `kiss-ssg css` audit. PurgeCSS runs its extractor over every content
 * string for every stylesheet, so without it a build that purges three files
 * read every page four times. Keyed by the text, so a page is read once
 * whatever list it arrives in (the audit hands each stylesheet only the pages
 * that link it), and an edited page is simply new text. It lives as long as
 * its run, which is why it is passed in rather than kept here.
 *
 * @returns {PurgeReads}
 */
export function purgeReads() {
  return { tokens: new Map(), classes: new Map() }
}

/**
 * @template T
 * @param {Map<string, T>} cache
 * @param {string} key
 * @param {(key: string) => T} make
 * @returns {T}
 */
function remembered(cache, key, make) {
  let value = cache.get(key)
  if (value === undefined) {
    value = make(key)
    cache.set(key, value)
  }
  return value
}

// A pseudo-class or pseudo-element part of a selector (`:focus-visible`,
// `:not`, `::selection`), as PurgeCSS's `standard` safelist sees it. PurgeCSS
// 8.0.0 removes a selector made of such parts alone unless it is `:where`,
// `:is`, `:has` or `:not` (AIKB/upstream.md), though `:focus-visible { … }`
// means `*:focus-visible` and matches every element. On a1k9training that took
// every keyboard focus ring (the clean room, 2026-11-08). In `standard`, a
// matching part counts as present and every other part is still checked, so
// only a selector with no tag, class, id or attribute part is kept by it:
// `.unused:focus-visible` and `table:hover` go as before.
const PSEUDO_PART = /^::?[\w-]+$/

// The extension of the content item that carries the pages' exact classes,
// one per line, read back by an extractor that splits on newlines and does
// nothing else.
const EXACT = 'kiss-classes'

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
 * @param {{ html: string[], scripts: string[], safelist: (string|RegExp)[], reads?: PurgeReads }} content
 * `reads` from `purgeReads()`, shared by every purge of one run
 * @returns {Promise<string>}
 */
export async function purgeCss(
  css,
  { html, scripts, safelist, reads = purgeReads() },
) {
  // Loaded when a site purges, never before: `lib/config.js` imports this
  // module on every build, and PurgeCSS brings PostCSS with it.
  const { PurgeCSS } = await import('purgecss')
  const exact = new Set(
    html.flatMap((page) =>
      remembered(reads.classes, page, (p) => attributeClasses([p])),
    ),
  )
  const read = {
    classes: [...exact].join('\n'),
    /** @param {string} content */
    extract: (content) => remembered(reads.tokens, content, classTokens),
  }
  const result = await new PurgeCSS().purge({
    content: [
      ...html.map((raw) => ({ raw, extension: 'html' })),
      ...scripts.map((raw) => ({ raw, extension: 'js' })),
      // Every class an element carries, exactly as htmlparser2 read it, so a
      // class in the markup is never lost to how `classTokens` cuts text
      // (issue #78). The tokens still find the classes a script names.
      { raw: read.classes, extension: EXACT },
    ],
    css: [{ raw: css }],
    extractors: [
      {
        extractor: (/** @type {string} */ c) => c.split('\n').filter(Boolean),
        extensions: [EXACT],
      },
    ],
    defaultExtractor: read.extract,
    dynamicAttributes: DYNAMIC_ATTRIBUTES,
    // `greedy`, not PurgeCSS's `standard`: `standard` keeps a selector part
    // the safelist names but still checks the rest, so `safelist: ['btn']`
    // lost `.btn[data-size=xl]` on a page with no `data-size="xl"`. `greedy`
    // keeps any rule with a part it names, which is what "keep this class"
    // means to the person who wrote it, and keeps everything `standard`
    // would, so it is the only list.
    safelist: { standard: [PSEUDO_PART], greedy: safelist.map(greedyPattern) },
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
  const html = await Promise.all(
    [...files].map((file) => fs.readFile(file, 'utf8')),
  )
  const scripts = purge.scripts
    ? await Promise.all(
        (await buildScripts(root)).map((file) => fs.readFile(file, 'utf8')),
      )
    : []
  const reads = purgeReads()
  /** @type {PurgeResult[]} */
  const results = []
  for (const name of purge.files) {
    const from = manifest.lookup(name)
    if (!from)
      throw new Error(
        `assets.purge: ${name} is not in the build — name it as a template asks for it ({{asset "${name}"}})`,
      )
    const fromFile = path.join(root, from)
    const css = await fs.readFile(fromFile, 'utf8')
    let out = await purgeCss(css, {
      html,
      scripts,
      safelist: purge.safelist,
      reads,
    })
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
