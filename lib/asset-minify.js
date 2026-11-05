import fs from 'fs-extra'
import path from 'node:path'
import { minify as terser } from 'terser'
import CleanCSS from 'clean-css'

// Minifies a stylesheet or script the asset copy wrote, in place, before it is
// hashed: the same two minifiers the page minifier already loads for inline
// CSS and JS (`html-minifier-terser` → terser and clean-css), so a production
// build ships its copied `.css` and `.js` the way it ships its HTML.
//
// Measured on the fleet (planning/research/2026-11-04-static-site-performance.md
// § Measured — CSS and JS): an unminified file is about 17% smaller after
// Brotli once minified, an already-minified one about 1–2%. Cheap, and never
// worse, so it is on by default and skipped where it cannot help.

const MINIFIED = /\.min\.(?:css|m?js)$/i
const SCRIPT = /\.m?js$/i
const STYLE = /\.css$/i

/**
 * Whether a copied file is one this module minifies: a `.css`, `.js` or
 * `.mjs` that is not already `*.min.*`.
 *
 * @param {string} relative the file's build-relative name
 * @returns {boolean}
 */
export function shouldMinify(relative) {
  if (MINIFIED.test(relative)) return false
  return SCRIPT.test(relative) || STYLE.test(relative)
}

/**
 * One file's bytes, minified. A script is an ES module when it is `.mjs` or
 * when terser cannot read it as a classic script, so `import`/`export` and a
 * top-level `await` survive.
 *
 * @param {string} relative the file's name, which decides CSS or JS
 * @param {string} text
 * @returns {Promise<string>}
 * @throws when the minifier cannot parse the file
 */
export async function minifyText(relative, text) {
  if (STYLE.test(relative)) {
    const out = new CleanCSS({ level: 1, returnPromise: false }).minify(text)
    if (out.errors.length > 0) throw new Error(out.errors.join('; '))
    return out.styles
  }
  const options = { compress: true, mangle: true, format: { comments: false } }
  const asModule = /\.mjs$/i.test(relative)
  try {
    return (await terser(text, { ...options, module: asModule })).code ?? text
  } catch (error) {
    if (asModule) throw error
    return (await terser(text, { ...options, module: true })).code ?? text
  }
}

/**
 * Minifies `file` in place. Never fails the build: a file the minifier cannot
 * read is left exactly as it was, and the caller is told why.
 *
 * @param {string} file the path on disk
 * @param {string} relative its build-relative name
 * @returns {Promise<{ ok: true, before: number, after: number } | { ok: false, error: string }>}
 */
export async function minifyFile(file, relative) {
  try {
    const text = await fs.readFile(file, 'utf8')
    const out = await minifyText(relative, text)
    // A minifier that grows a file (a tiny one with a licence banner) is
    // worse than none: keep the original.
    if (Buffer.byteLength(out) >= Buffer.byteLength(text))
      return { ok: true, before: text.length, after: text.length }
    await fs.writeFile(file, out)
    return {
      ok: true,
      before: Buffer.byteLength(text),
      after: Buffer.byteLength(out),
    }
  } catch (error) {
    return {
      ok: false,
      error: `${path.posix.basename(relative)}: ${/** @type {Error} */ (error).message}`,
    }
  }
}
