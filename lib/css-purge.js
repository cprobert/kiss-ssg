import fs from 'fs-extra'
import path from 'node:path'
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
  const entries = await fs.promises.readdir(root, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((e) => e.isFile() && /\.m?js$/i.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
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
    safelist: { standard: safelist },
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
  const html = await Promise.all(pages.map((file) => fs.readFile(file, 'utf8')))
  const scripts = purge.scripts
    ? await Promise.all(
        (await buildScripts(root)).map((file) => fs.readFile(file, 'utf8')),
      )
    : []
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
    let out = await purgeCss(css, { html, scripts, safelist: purge.safelist })
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
